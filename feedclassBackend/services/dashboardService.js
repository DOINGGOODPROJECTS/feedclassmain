const { getPool } = require("../db/pool");

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function currentDate() {
  return new Date().toISOString().slice(0, 10);
}

function startOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function monthKey(date) {
  return date.toISOString().slice(0, 7);
}

function monthLabel(date) {
  return date.toLocaleString("en-US", { month: "short" });
}

function weekLabel(date) {
  return date.toLocaleString("en-US", { month: "short", day: "numeric" });
}

function buildRecentMonths(count) {
  const now = new Date();
  const months = [];

  for (let index = count - 1; index >= 0; index -= 1) {
    months.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1)));
  }

  return months;
}

function buildRecentWeeks(count) {
  const now = new Date();
  const weeks = [];

  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - index * 7);
    weeks.push(date);
  }

  return weeks;
}

async function getDonorDashboardSnapshot() {
  const pool = getPool();
  const recentMonths = buildRecentMonths(6);
  const monthCutoff = monthKey(recentMonths[0]);

  const [
    [mealsRows],
    [childrenRows],
    [fundsRows],
    [supplierCostRows],
    [mealTrendRows],
    [fundsTrendRows],
    [invoiceTrendRows],
    [schoolSupportRows],
  ] = await Promise.all([
    pool.query("SELECT COUNT(*) AS total FROM meal_serves"),
    pool.query("SELECT COUNT(DISTINCT child_id) AS total FROM meal_serves"),
    pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM transactions
       WHERE type = 'SUBSCRIPTION_PURCHASE'`
    ),
    pool.query("SELECT COALESCE(SUM(amount), 0) AS total FROM supplier_invoices"),
    pool.query(
      `SELECT DATE_FORMAT(serve_date, '%Y-%m') AS bucket, COUNT(*) AS total
       FROM meal_serves
       WHERE DATE_FORMAT(serve_date, '%Y-%m') >= ?
       GROUP BY DATE_FORMAT(serve_date, '%Y-%m')
       ORDER BY bucket ASC`,
      [monthCutoff]
    ),
    pool.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') AS bucket, COALESCE(SUM(amount), 0) AS total
       FROM transactions
       WHERE type = 'SUBSCRIPTION_PURCHASE'
         AND DATE_FORMAT(created_at, '%Y-%m') >= ?
       GROUP BY DATE_FORMAT(created_at, '%Y-%m')
       ORDER BY bucket ASC`,
      [monthCutoff]
    ),
    pool.query(
      `SELECT month AS bucket, COALESCE(SUM(amount), 0) AS total
       FROM supplier_invoices
       WHERE month >= ?
       GROUP BY month
       ORDER BY bucket ASC`,
      [monthCutoff]
    ),
    pool.query(
      `SELECT DATE_FORMAT(serve_date, '%Y-%m') AS bucket, COUNT(DISTINCT school_id) AS total
       FROM meal_serves
       WHERE DATE_FORMAT(serve_date, '%Y-%m') >= ?
       GROUP BY DATE_FORMAT(serve_date, '%Y-%m')
       ORDER BY bucket ASC`,
      [monthCutoff]
    ),
  ]);

  const totalMeals = toNumber(mealsRows[0]?.total);
  const totalChildren = toNumber(childrenRows[0]?.total);
  const fundsReceived = toNumber(fundsRows[0]?.total);
  const supplierCost = toNumber(supplierCostRows[0]?.total);
  const costPerMeal = totalMeals > 0 ? supplierCost / totalMeals : 0;

  const mealTrendMap = new Map(mealTrendRows.map((row) => [row.bucket, toNumber(row.total)]));
  const fundsTrendMap = new Map(fundsTrendRows.map((row) => [row.bucket, toNumber(row.total)]));
  const invoiceTrendMap = new Map(invoiceTrendRows.map((row) => [row.bucket, toNumber(row.total)]));
  const schoolSupportMap = new Map(schoolSupportRows.map((row) => [row.bucket, toNumber(row.total)]));

  const trends = recentMonths.map((date) => {
    const key = monthKey(date);
    const monthMeals = mealTrendMap.get(key) || 0;
    const monthSupplierCost = invoiceTrendMap.get(key) || 0;
    return {
      label: monthLabel(date),
      mealsServed: monthMeals,
      fundsReceived: fundsTrendMap.get(key) || 0,
      costPerMeal: monthMeals > 0 ? Number((monthSupplierCost / monthMeals).toFixed(2)) : 0,
      schoolsSupported: schoolSupportMap.get(key) || 0,
    };
  });

  return {
    totalMeals,
    totalChildren,
    fundsReceived,
    costPerMeal,
    trends,
  };
}

async function getDashboardSnapshot() {
  const pool = getPool();
  const month = currentMonth();
  const today = currentDate();

  const [
    [mealsTodayRows],
    [graceMealsTodayRows],
    [mealsMonthRows],
    [activeSubscriptionRows],
    [expiringSoonRows],
    [graceActiveRows],
    [revenueMonthRows],
    [supplierCostMonthRows],
    [mealTrendRows],
    [renewalTrendRows],
    [costTrendMealRows],
    [costTrendInvoiceRows],
    [paymentTrendRows],
  ] = await Promise.all([
    pool.query("SELECT COUNT(*) AS count FROM meal_serves WHERE serve_date = ?", [today]),
    pool.query("SELECT COUNT(*) AS count FROM meal_serves WHERE serve_date = ? AND is_grace = TRUE", [today]),
    pool.query("SELECT COUNT(*) AS count FROM meal_serves WHERE serve_date >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)"),
    pool.query("SELECT COUNT(*) AS count FROM child_subscriptions WHERE status = 'ACTIVE'"),
    pool.query(
      "SELECT COUNT(*) AS count FROM child_subscriptions WHERE status = 'ACTIVE' AND end_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 10 DAY)"
    ),
    pool.query(
      "SELECT COUNT(*) AS count FROM grace_periods WHERE start_date BETWEEN DATE_SUB(CURDATE(), INTERVAL 6 DAY) AND CURDATE() AND days_used < 7"
    ),
    pool.query(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE type = 'SUBSCRIPTION_PURCHASE' AND DATE_FORMAT(created_at, '%Y-%m') = ?",
      [month]
    ),
    pool.query("SELECT COALESCE(SUM(amount), 0) AS total FROM supplier_invoices WHERE month = ?", [month]),
    pool.query(
      "SELECT DATE_SUB(serve_date, INTERVAL WEEKDAY(serve_date) DAY) AS bucket, COUNT(*) AS total FROM meal_serves WHERE serve_date >= DATE_SUB(CURDATE(), INTERVAL 41 DAY) GROUP BY DATE_SUB(serve_date, INTERVAL WEEKDAY(serve_date) DAY) ORDER BY bucket ASC"
    ),
    pool.query(
      "SELECT DATE_FORMAT(created_at, '%Y-%m') AS bucket, COUNT(*) AS total FROM transactions WHERE type = 'SUBSCRIPTION_PURCHASE' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 5 MONTH) GROUP BY DATE_FORMAT(created_at, '%Y-%m') ORDER BY bucket ASC"
    ),
    pool.query(
      "SELECT DATE_FORMAT(serve_date, '%Y-%m') AS bucket, COUNT(*) AS total FROM meal_serves WHERE serve_date >= DATE_SUB(CURDATE(), INTERVAL 5 MONTH) GROUP BY DATE_FORMAT(serve_date, '%Y-%m') ORDER BY bucket ASC"
    ),
    pool.query(
      "SELECT month AS bucket, COALESCE(SUM(amount), 0) AS total FROM supplier_invoices WHERE STR_TO_DATE(CONCAT(month, '-01'), '%Y-%m-%d') >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 5 MONTH) GROUP BY month ORDER BY bucket ASC"
    ),
    pool.query(
      "SELECT DATE_FORMAT(created_at, '%Y-%m') AS bucket, COUNT(*) AS total, SUM(CASE WHEN status = 'PAID' THEN 1 ELSE 0 END) AS paid FROM payment_intents WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 5 MONTH) GROUP BY DATE_FORMAT(created_at, '%Y-%m') ORDER BY bucket ASC"
    ),
  ]);

  const mealsToday = toNumber(mealsTodayRows[0]?.count);
  const graceMealsToday = toNumber(graceMealsTodayRows[0]?.count);
  const mealsMonth = toNumber(mealsMonthRows[0]?.count);
  const activeSubscriptions = toNumber(activeSubscriptionRows[0]?.count);
  const expiringSoon = toNumber(expiringSoonRows[0]?.count);
  const graceActive = toNumber(graceActiveRows[0]?.count);
  const revenueMonth = toNumber(revenueMonthRows[0]?.total);
  const supplierCostMonth = toNumber(supplierCostMonthRows[0]?.total);
  const costPerMeal = mealsMonth > 0 ? supplierCostMonth / mealsMonth : 0;

  const mealTrendMap = new Map(
    mealTrendRows.map((row) => [new Date(row.bucket).toISOString().slice(0, 10), toNumber(row.total)])
  );
  const renewalTrendMap = new Map(renewalTrendRows.map((row) => [row.bucket, toNumber(row.total)]));
  const mealMonthMap = new Map(costTrendMealRows.map((row) => [row.bucket, toNumber(row.total)]));
  const invoiceMonthMap = new Map(costTrendInvoiceRows.map((row) => [row.bucket, toNumber(row.total)]));
  const paymentTrendMap = new Map(
    paymentTrendRows.map((row) => [
      row.bucket,
      {
        total: toNumber(row.total),
        paid: toNumber(row.paid),
      },
    ])
  );

  const mealUtilizationTrend = buildRecentWeeks(6).map((date) => {
    const weekStart = new Date(date);
    weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));
    const key = weekStart.toISOString().slice(0, 10);
    return {
      label: weekLabel(weekStart),
      value: mealTrendMap.get(key) || 0,
    };
  });

  const recentMonths = buildRecentMonths(6);

  const subscriptionRenewalsTrend = recentMonths.map((date) => {
    const key = monthKey(date);
    return {
      label: monthLabel(date),
      value: renewalTrendMap.get(key) || 0,
    };
  });

  const costPerMealTrend = recentMonths.map((date) => {
    const key = monthKey(date);
    const meals = mealMonthMap.get(key) || 0;
    const costs = invoiceMonthMap.get(key) || 0;
    return {
      label: monthLabel(date),
      value: meals > 0 ? Number((costs / meals).toFixed(2)) : 0,
    };
  });

  const paymentSuccessRateTrend = recentMonths.map((date) => {
    const key = monthKey(date);
    const totals = paymentTrendMap.get(key) || { total: 0, paid: 0 };
    return {
      label: monthLabel(date),
      value: totals.total > 0 ? Math.round((totals.paid / totals.total) * 100) : 0,
    };
  });

  return {
    mealsToday,
    graceMealsToday,
    mealsMonth,
    activeSubscriptions,
    expiringSoon,
    graceActive,
    revenueMonth,
    supplierCostMonth,
    costPerMeal,
    trends: {
      mealUtilization: mealUtilizationTrend,
      subscriptionRenewals: subscriptionRenewalsTrend,
      costPerMeal: costPerMealTrend,
      paymentSuccessRate: paymentSuccessRateTrend,
    },
  };
}

async function getSchoolDashboardSnapshot({ schoolId, role, assignedSchoolId, asOfDate }) {
  const pool = getPool();
  const effectiveSchoolId = role === "ADMIN" ? schoolId || assignedSchoolId || null : assignedSchoolId || schoolId || null;

  if (!effectiveSchoolId) {
    throw new Error("school_id is required");
  }

  const today = asOfDate ? new Date(asOfDate) : new Date();
  if (Number.isNaN(today.getTime())) {
    throw new Error("Invalid as_of_date");
  }

  const serviceDate = today.toISOString().slice(0, 10);

  const [
    [schoolRows],
    [mealSummaryRows],
    [failedScanRows],
    [missingSubscriptionRows],
    [paymentFollowUpRows],
    [successfulScanRows],
  ] = await Promise.all([
    pool.execute(
      `SELECT id, name
       FROM schools
       WHERE id = ?
       LIMIT 1`,
      [effectiveSchoolId]
    ),
    pool.execute(
      `SELECT
         cl.id AS class_id,
         cl.name AS class_name,
         COUNT(ms.id) AS total
       FROM classes cl
       LEFT JOIN meal_serves ms
         ON ms.school_id = cl.school_id
        AND ms.serve_date = ?
        AND ms.child_id IN (
          SELECT id FROM children WHERE class_id = cl.id
        )
       WHERE cl.school_id = ?
       GROUP BY cl.id, cl.name
       ORDER BY cl.name ASC`,
      [serviceDate, effectiveSchoolId]
    ),
    pool.execute(
      `SELECT
         ms.id,
         ms.child_id,
         c.student_id,
         c.full_name AS child_name,
         cl.name AS class_name,
         ms.reason,
         ms.meal_type,
         ms.created_at
       FROM meal_scans ms
       LEFT JOIN children c ON c.id = ms.child_id
       LEFT JOIN classes cl ON cl.id = ms.class_id
       WHERE ms.school_id = ?
         AND ms.outcome IN ('BLOCKED', 'DUPLICATE')
         AND ms.service_date = ?
       ORDER BY ms.created_at DESC
       LIMIT 10`,
      [effectiveSchoolId, serviceDate]
    ),
    pool.execute(
      `SELECT
         c.id AS child_id,
         c.student_id,
         c.full_name AS child_name,
         cl.name AS class_name,
         g.name AS guardian_name,
         g.phone AS guardian_phone,
         COALESCE(cs.status, c.subscription_status, 'NONE') AS subscription_status
       FROM children c
       LEFT JOIN classes cl ON cl.id = c.class_id
       LEFT JOIN guardians g ON g.child_id = c.id
       LEFT JOIN child_subscriptions cs ON cs.child_id = c.id
       WHERE c.school_id = ?
         AND c.active = TRUE
         AND (
           cs.child_id IS NULL
           OR COALESCE(cs.status, c.subscription_status, 'NONE') IN ('NONE', 'EXPIRED', 'CANCELLED')
         )
       ORDER BY c.full_name ASC`,
      [effectiveSchoolId]
    ),
    pool.execute(
      `SELECT
         pi.id,
         pi.reference,
         pi.status,
         pi.payment_url,
         pi.created_at,
         c.id AS child_id,
         c.student_id,
         c.full_name AS child_name,
         cl.name AS class_name,
         g.name AS guardian_name,
         g.phone AS guardian_phone
       FROM payment_intents pi
       INNER JOIN children c ON c.id = pi.child_id
       LEFT JOIN classes cl ON cl.id = c.class_id
       LEFT JOIN guardians g ON g.child_id = c.id
       WHERE c.school_id = ?
         AND pi.status = 'PENDING'
       ORDER BY pi.created_at DESC
       LIMIT 10`,
      [effectiveSchoolId]
    ),
    pool.execute(
      `SELECT
         ms.id,
         ms.child_id,
         c.student_id,
         c.full_name AS child_name,
         cl.name AS class_name,
         ms.meal_type,
         ms.served_at
       FROM meal_scans ms
       LEFT JOIN children c ON c.id = ms.child_id
       LEFT JOIN classes cl ON cl.id = ms.class_id
       WHERE ms.school_id = ?
         AND ms.outcome = 'APPROVED'
         AND COALESCE(ms.served_at, ms.created_at) >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 24 HOUR)
       ORDER BY COALESCE(ms.served_at, ms.created_at) DESC
       LIMIT 10`,
      [effectiveSchoolId]
    ),
  ]);

  return {
    school: schoolRows[0] || { id: effectiveSchoolId, name: "Assigned school" },
    serviceDate,
    mealsServedToday: mealSummaryRows.reduce((sum, row) => sum + toNumber(row.total), 0),
    mealsByClass: mealSummaryRows.map((row) => ({
      class_id: row.class_id,
      class_name: row.class_name,
      total: toNumber(row.total),
    })),
    failedScans: failedScanRows.map((row) => ({
      id: row.id,
      child_id: row.child_id,
      student_id: row.student_id || null,
      child_name: row.child_name || "Unknown child",
      class_name: row.class_name || null,
      meal_type: row.meal_type || null,
      reason: row.reason || "Unknown failure",
      created_at: row.created_at,
    })),
    childrenMissingSubscriptions: missingSubscriptionRows.map((row) => ({
      child_id: row.child_id,
      student_id: row.student_id,
      child_name: row.child_name,
      class_name: row.class_name || null,
      guardian_name: row.guardian_name || null,
      guardian_phone: row.guardian_phone || null,
      subscription_status: row.subscription_status || "NONE",
    })),
    paymentFollowUps: paymentFollowUpRows.map((row) => ({
      id: row.id,
      reference: row.reference,
      status: row.status,
      payment_url: row.payment_url,
      created_at: row.created_at,
      child_id: row.child_id,
      student_id: row.student_id,
      child_name: row.child_name,
      class_name: row.class_name || null,
      guardian_name: row.guardian_name || null,
      guardian_phone: row.guardian_phone || null,
    })),
    successfulScans24h: successfulScanRows.map((row) => ({
      id: row.id,
      child_id: row.child_id,
      student_id: row.student_id || null,
      child_name: row.child_name || "Unknown child",
      class_name: row.class_name || null,
      meal_type: row.meal_type || null,
      created_at: row.served_at,
    })),
  };
}

module.exports = {
  getDonorDashboardSnapshot,
  getDashboardSnapshot,
  getSchoolDashboardSnapshot,
};
