const crypto = require("crypto");
const { getPool } = require("../db/pool");

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 10);
}

function startOfUtcDay(value = new Date()) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addUtcDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function monthKey(date) {
  return date.toISOString().slice(0, 7);
}

function monthLabel(date) {
  return date.toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
}

function resolveScope(actor, inputSchoolId, { allowDonor = false } = {}) {
  if (actor.role === "ADMIN") {
    return { schoolId: inputSchoolId || null };
  }

  if (actor.role === "SUPERVISOR") {
    const scopedSchoolId = actor.assignedSchoolId || inputSchoolId || null;
    if (!scopedSchoolId) {
      throw new Error("school_id is required");
    }
    return { schoolId: scopedSchoolId };
  }

  if (allowDonor && actor.role === "DONOR_READONLY") {
    return { schoolId: null };
  }

  throw new Error("Insufficient permissions.");
}

async function getSchoolLabel(schoolId) {
  if (!schoolId) {
    return "All schools";
  }

  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT name
     FROM schools
     WHERE id = ?
     LIMIT 1`,
    [schoolId]
  );

  return rows[0]?.name || "Selected school";
}

async function persistAlertIfMissingToday({ severity, message }) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT id
     FROM anomaly_alerts
     WHERE message = ?
       AND DATE(created_at) = CURDATE()
     LIMIT 1`,
    [message]
  );

  if (rows[0]?.id) {
    return rows[0].id;
  }

  const id = crypto.randomUUID();
  await pool.execute(
    `INSERT INTO anomaly_alerts (id, severity, message, created_at)
     VALUES (?, ?, ?, NOW())`,
    [id, severity, message]
  );
  return id;
}

async function persistWeeklyReport({ title, summary, weekStart }) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT id, title, summary, created_at
     FROM ai_reports
     WHERE title = ?
       AND DATE(created_at) >= ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [title, formatDate(weekStart)]
  );

  if (rows[0]) {
    return rows[0];
  }

  const id = crypto.randomUUID();
  await pool.execute(
    `INSERT INTO ai_reports (id, title, summary, created_at)
     VALUES (?, ?, ?, NOW())`,
    [id, title, summary]
  );

  return {
    id,
    title,
    summary,
    created_at: new Date().toISOString(),
  };
}

async function getDailyMealSeries({ schoolId, startDate, endDate }) {
  const pool = getPool();
  const params = [formatDate(startDate), formatDate(endDate)];
  let schoolClause = "";

  if (schoolId) {
    schoolClause = " AND school_id = ? ";
    params.push(schoolId);
  }

  const [rows] = await pool.execute(
    `SELECT serve_date AS bucket, COUNT(*) AS total
     FROM meal_serves
     WHERE serve_date BETWEEN ? AND ? ${schoolClause}
     GROUP BY serve_date
     ORDER BY bucket ASC`,
    params
  );

  return new Map(rows.map((row) => [formatDate(row.bucket), toNumber(row.total)]));
}

async function getMealForecast(actor, schoolId) {
  const scope = resolveScope(actor, schoolId);
  const scopeLabel = await getSchoolLabel(scope.schoolId);

  const today = startOfUtcDay(new Date());
  const historyStart = addUtcDays(today, -13);
  const historyMap = await getDailyMealSeries({
    schoolId: scope.schoolId,
    startDate: historyStart,
    endDate: today,
  });

  const history = [];
  const rollingValues = [];

  for (let index = 0; index < 14; index += 1) {
    const date = addUtcDays(historyStart, index);
    const value = historyMap.get(formatDate(date)) || 0;
    history.push({
      date: formatDate(date),
      meals: value,
    });
    rollingValues.push(value);
  }

  const forecast = [];
  for (let dayOffset = 1; dayOffset <= 7; dayOffset += 1) {
    const date = addUtcDays(today, dayOffset);
    const window = rollingValues.slice(-7);
    const baseline = window.length > 0 ? window.reduce((sum, value) => sum + value, 0) / window.length : 0;
    const predictedMeals = Math.max(0, Math.round(baseline));

    forecast.push({
      date: formatDate(date),
      baseline: Number(baseline.toFixed(2)),
      predictedMeals,
    });
    rollingValues.push(predictedMeals);
  }

  return {
    generatedAt: new Date().toISOString(),
    scope: {
      school_id: scope.schoolId,
      school_name: scopeLabel,
    },
    history: history.slice(-7),
    forecast,
  };
}

async function buildMealSpikeAlert({ schoolId, scopeLabel, today }) {
  const historyStart = addUtcDays(today, -7);
  const mealMap = await getDailyMealSeries({
    schoolId,
    startDate: historyStart,
    endDate: today,
  });

  const todayKey = formatDate(today);
  const todayMeals = mealMap.get(todayKey) || 0;
  const previousDays = [];

  for (let index = 1; index <= 7; index += 1) {
    previousDays.push(mealMap.get(formatDate(addUtcDays(today, -index))) || 0);
  }

  const baseline = previousDays.length > 0 ? previousDays.reduce((sum, value) => sum + value, 0) / previousDays.length : 0;
  if (todayMeals < 10 || todayMeals <= baseline * 1.35) {
    return null;
  }

  const overage = baseline > 0 ? todayMeals / baseline : todayMeals;
  const severity = overage >= 1.75 ? "HIGH" : "MEDIUM";
  const title = "Meal spike vs baseline";
  const message = `${scopeLabel} served ${todayMeals} meals today versus a 7-day baseline of ${baseline.toFixed(
    1
  )}.`;
  const id = await persistAlertIfMissingToday({ severity, message });

  return {
    id,
    severity,
    type: "MEAL_SPIKE",
    title,
    message,
    metric_value: todayMeals,
    baseline_value: Number(baseline.toFixed(2)),
    created_at: new Date().toISOString(),
  };
}

async function buildNoSubscriptionAlert({ schoolId, scopeLabel, today }) {
  const pool = getPool();
  const params = [formatDate(addUtcDays(today, -6)), formatDate(today)];
  let schoolClause = "";

  if (schoolId) {
    schoolClause = " AND school_id = ? ";
    params.push(schoolId);
  }

  const [rows] = await pool.execute(
    `SELECT service_date AS bucket, COUNT(*) AS total
     FROM meal_scans
     WHERE outcome = 'BLOCKED'
       AND reason IN ('No active subscription', 'Subscription expired', 'Subscription cancelled', 'Subscription paused')
       AND service_date BETWEEN ? AND ? ${schoolClause}
     GROUP BY service_date
     ORDER BY bucket ASC`,
    params
  );

  const totals = new Map(rows.map((row) => [formatDate(row.bucket), toNumber(row.total)]));
  const todayCount = totals.get(formatDate(today)) || 0;
  const priorValues = [];

  for (let index = 1; index <= 6; index += 1) {
    priorValues.push(totals.get(formatDate(addUtcDays(today, -index))) || 0);
  }

  const baseline = priorValues.length > 0 ? priorValues.reduce((sum, value) => sum + value, 0) / priorValues.length : 0;
  if (todayCount < 3 && todayCount <= baseline * 1.5) {
    return null;
  }

  const severity = todayCount >= 8 || todayCount >= baseline * 2 ? "HIGH" : "MEDIUM";
  const title = "High no-subscription scan attempts";
  const message = `${scopeLabel} recorded ${todayCount} blocked scan attempts today from children without meal entitlement versus a recent baseline of ${baseline.toFixed(
    1
  )}.`;
  const id = await persistAlertIfMissingToday({ severity, message });

  return {
    id,
    severity,
    type: "NO_SUBSCRIPTION_SPIKE",
    title,
    message,
    metric_value: todayCount,
    baseline_value: Number(baseline.toFixed(2)),
    created_at: new Date().toISOString(),
  };
}

async function buildPaymentsMismatchAlert({ schoolId, scopeLabel, today }) {
  const pool = getPool();
  const recentMonths = [];

  for (let index = 3; index >= 0; index -= 1) {
    recentMonths.push(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - index, 1)));
  }

  const cutoffMonth = monthKey(recentMonths[0]);
  const params = [cutoffMonth];
  let schoolClause = "";

  if (schoolId) {
    schoolClause = " AND c.school_id = ? ";
    params.push(schoolId);
  }

  const [paymentRows] = await pool.execute(
    `SELECT DATE_FORMAT(t.created_at, '%Y-%m') AS bucket, COALESCE(SUM(t.amount), 0) AS total
     FROM transactions t
     INNER JOIN children c ON c.id = t.child_id
     WHERE t.type = 'SUBSCRIPTION_PURCHASE'
       AND DATE_FORMAT(t.created_at, '%Y-%m') >= ? ${schoolClause}
     GROUP BY DATE_FORMAT(t.created_at, '%Y-%m')
     ORDER BY bucket ASC`,
    params
  );

  const [mealRows] = await pool.execute(
    `SELECT DATE_FORMAT(ms.serve_date, '%Y-%m') AS bucket, COUNT(*) AS total
     FROM meal_serves ms
     WHERE DATE_FORMAT(ms.serve_date, '%Y-%m') >= ? ${schoolId ? " AND ms.school_id = ? " : ""}
     GROUP BY DATE_FORMAT(ms.serve_date, '%Y-%m')
     ORDER BY bucket ASC`,
    params
  );

  const paymentMap = new Map(paymentRows.map((row) => [row.bucket, toNumber(row.total)]));
  const mealMap = new Map(mealRows.map((row) => [row.bucket, toNumber(row.total)]));
  const currentKey = monthKey(recentMonths[recentMonths.length - 1]);
  const currentMeals = mealMap.get(currentKey) || 0;
  const currentRevenue = paymentMap.get(currentKey) || 0;

  const baselineRatios = recentMonths
    .slice(0, -1)
    .map((date) => {
      const key = monthKey(date);
      const meals = mealMap.get(key) || 0;
      const revenue = paymentMap.get(key) || 0;
      return meals > 0 ? revenue / meals : 0;
    })
    .filter((value) => value > 0);

  const baselineRatio =
    baselineRatios.length > 0 ? baselineRatios.reduce((sum, value) => sum + value, 0) / baselineRatios.length : 0;
  const currentRatio = currentMeals > 0 ? currentRevenue / currentMeals : 0;

  if (currentMeals < 10 || baselineRatio <= 0 || currentRatio >= baselineRatio * 0.7) {
    return null;
  }

  const severity = currentRatio < baselineRatio * 0.5 ? "HIGH" : "MEDIUM";
  const title = "Payments vs meals mismatch";
  const message = `${scopeLabel} is tracking ${currentMeals} served meals this month while subscription revenue per meal is below baseline (${currentRatio.toFixed(
    2
  )} vs ${baselineRatio.toFixed(2)}).`;
  const id = await persistAlertIfMissingToday({ severity, message });

  return {
    id,
    severity,
    type: "PAYMENTS_MEALS_MISMATCH",
    title,
    message,
    metric_value: Number(currentRatio.toFixed(2)),
    baseline_value: Number(baselineRatio.toFixed(2)),
    created_at: new Date().toISOString(),
  };
}

async function getAiAlerts(actor, schoolId) {
  const scope = resolveScope(actor, schoolId);
  const scopeLabel = await getSchoolLabel(scope.schoolId);
  const today = startOfUtcDay(new Date());

  const alerts = (
    await Promise.all([
      buildMealSpikeAlert({ schoolId: scope.schoolId, scopeLabel, today }),
      buildNoSubscriptionAlert({ schoolId: scope.schoolId, scopeLabel, today }),
      buildPaymentsMismatchAlert({ schoolId: scope.schoolId, scopeLabel, today }),
    ])
  ).filter(Boolean);

  return {
    generatedAt: new Date().toISOString(),
    scope: {
      school_id: scope.schoolId,
      school_name: scopeLabel,
    },
    alerts,
  };
}

async function getWeeklyExecutiveReport(actor, schoolId) {
  const scope = resolveScope(actor, schoolId, { allowDonor: true });
  const scopeLabel = await getSchoolLabel(scope.schoolId);
  const pool = getPool();
  const today = startOfUtcDay(new Date());
  const weekStart = addUtcDays(today, -6);
  const prevWeekStart = addUtcDays(weekStart, -7);
  const prevWeekEnd = addUtcDays(weekStart, -1);
  const scopeParams = [];
  const schoolClauseMeals = scope.schoolId ? " AND school_id = ? " : "";
  const schoolClauseChildren = scope.schoolId ? " AND c.school_id = ? " : "";
  if (scope.schoolId) {
    scopeParams.push(scope.schoolId);
  }

  const [
    [mealsRows],
    [childrenRows],
    [fundsRows],
    [supplierRows],
    [failedRows],
    [duplicateRows],
    [schoolRows],
    [previousMealsRows],
  ] = await Promise.all([
    pool.execute(
      `SELECT COUNT(*) AS total
       FROM meal_serves
       WHERE serve_date BETWEEN ? AND ? ${schoolClauseMeals}`,
      [formatDate(weekStart), formatDate(today), ...scopeParams]
    ),
    pool.execute(
      `SELECT COUNT(DISTINCT child_id) AS total
       FROM meal_serves
       WHERE serve_date BETWEEN ? AND ? ${schoolClauseMeals}`,
      [formatDate(weekStart), formatDate(today), ...scopeParams]
    ),
    pool.execute(
      `SELECT COALESCE(SUM(t.amount), 0) AS total
       FROM transactions t
       INNER JOIN children c ON c.id = t.child_id
       WHERE t.type = 'SUBSCRIPTION_PURCHASE'
         AND DATE(t.created_at) BETWEEN ? AND ? ${schoolClauseChildren}`,
      [formatDate(weekStart), formatDate(today), ...scopeParams]
    ),
    pool.execute(
      `SELECT COALESCE(SUM(si.amount), 0) AS total
       FROM supplier_invoices si
       WHERE si.month BETWEEN ? AND ? ${scope.schoolId ? " AND si.school_id = ? " : ""}`,
      [monthKey(weekStart), monthKey(today), ...scopeParams]
    ),
    pool.execute(
      `SELECT COUNT(*) AS total
       FROM meal_scans
       WHERE outcome = 'BLOCKED'
         AND service_date BETWEEN ? AND ?
         AND reason IN ('No active subscription', 'Subscription expired', 'Subscription cancelled', 'Subscription paused')
         ${scope.schoolId ? " AND school_id = ? " : ""}`,
      [formatDate(weekStart), formatDate(today), ...scopeParams]
    ),
    pool.execute(
      `SELECT COUNT(*) AS total
       FROM meal_scans
       WHERE outcome = 'DUPLICATE'
         AND service_date BETWEEN ? AND ?
         ${scope.schoolId ? " AND school_id = ? " : ""}`,
      [formatDate(weekStart), formatDate(today), ...scopeParams]
    ),
    pool.execute(
      `SELECT COUNT(DISTINCT school_id) AS total
       FROM meal_serves
       WHERE serve_date BETWEEN ? AND ? ${schoolClauseMeals}`,
      [formatDate(weekStart), formatDate(today), ...scopeParams]
    ),
    pool.execute(
      `SELECT COUNT(*) AS total
       FROM meal_serves
       WHERE serve_date BETWEEN ? AND ? ${schoolClauseMeals}`,
      [formatDate(prevWeekStart), formatDate(prevWeekEnd), ...scopeParams]
    ),
  ]);

  const totalMeals = toNumber(mealsRows[0]?.total);
  const childrenReached = toNumber(childrenRows[0]?.total);
  const fundsReceived = toNumber(fundsRows[0]?.total);
  const supplierCost = toNumber(supplierRows[0]?.total);
  const blockedNoSubscription = toNumber(failedRows[0]?.total);
  const duplicateScans = toNumber(duplicateRows[0]?.total);
  const schoolsSupported = toNumber(schoolRows[0]?.total);
  const previousMeals = toNumber(previousMealsRows[0]?.total);
  const mealsDelta = previousMeals > 0 ? ((totalMeals - previousMeals) / previousMeals) * 100 : 0;
  const costPerMeal = totalMeals > 0 ? supplierCost / totalMeals : 0;

  const highlights = [
    `${totalMeals} meals served in the last 7 days`,
    `${childrenReached} children reached`,
    `${blockedNoSubscription} blocked scans tied to missing entitlement`,
    `${duplicateScans} duplicate scan attempts`,
  ];

  const summaryParts = [
    `${scopeLabel} delivered ${totalMeals} meals across the last 7 days${schoolsSupported > 0 && !scope.schoolId ? `, spanning ${schoolsSupported} schools` : ""}.`,
    `${childrenReached} children were reached and aggregate subscription revenue totaled $${fundsReceived.toLocaleString("en-US")}.`,
    `Supplier cost per meal is $${costPerMeal.toFixed(2)} based on $${supplierCost.toLocaleString("en-US")} of recorded supplier cost.`,
    `Blocked no-subscription scan attempts were ${blockedNoSubscription} and duplicate scans were ${duplicateScans}.`,
    previousMeals > 0
      ? `Weekly meal volume changed ${mealsDelta >= 0 ? "up" : "down"} ${Math.abs(mealsDelta).toFixed(
          1
        )}% versus the prior 7-day period.`
      : "No prior-week meal baseline is available yet.",
  ];

  const title = `${scope.schoolId ? `${scopeLabel} ` : ""}Weekly executive summary`;
  const summary = summaryParts.join(" ");
  const stored = await persistWeeklyReport({ title, summary, weekStart });

  return {
    id: stored.id,
    title,
    summary,
    created_at: stored.created_at,
    window_start: formatDate(weekStart),
    window_end: formatDate(today),
    highlights,
    scope: {
      school_id: scope.schoolId,
      school_name: scopeLabel,
    },
  };
}

module.exports = {
  getMealForecast,
  getAiAlerts,
  getWeeklyExecutiveReport,
};
