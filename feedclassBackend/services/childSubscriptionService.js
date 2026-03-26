const planRepository = require("../repositories/planRepository");
const childSubscriptionRepository = require("../repositories/childSubscriptionRepository");
const poolModule = require("../db/pool");
const { getState, getUserRole } = require("../lib/state");
const { appendActivityLog } = require("./auditService");
const messagingService = require("./messagingService");

const CYCLE_DAYS = 30;

function findChildOrThrow(childId) {
  const child = getState().children.find((entry) => entry.id === childId);
  if (!child) {
    throw new Error("Child not found");
  }
  return child;
}

function assertSubscriptionAccess(actor, child) {
  const role = getUserRole(actor.id);
  if (role === "ADMIN") {
    return;
  }
  if (role === "SUPERVISOR" && actor.assignedSchoolId === child.schoolId) {
    return;
  }
  throw new Error("You can only manage subscriptions for your assigned school");
}

function assertAdminOnly(actor) {
  if (getUserRole(actor.id) !== "ADMIN") {
    throw new Error("Only platform admin can manually attach subscriptions");
  }
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

function formatDateTime(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 19).replace("T", " ");
}

function addDays(startDate, days) {
  const next = new Date(startDate);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

async function createSubscriptionPurchaseTransaction({
  childId,
  amount,
  planId,
  planName,
  reason,
  actorUserId,
  createdAt = new Date(),
}) {
  const pool = poolModule.getPool();
  await pool.execute(
    `INSERT INTO transactions
      (id, child_id, payment_intent_id, type, amount, metadata_json, created_at)
     VALUES (?, ?, NULL, 'SUBSCRIPTION_PURCHASE', ?, ?, ?)`,
    [
      require("crypto").randomUUID(),
      childId,
      Number(amount || 0),
      JSON.stringify({
        source: "MANUAL_ATTACH",
        planId,
        planName,
        reason,
        actorUserId,
      }),
      formatDateTime(createdAt),
    ]
  );
}

function normalizeSubscriptionStatus(row, asOfDate) {
  if (!row) {
    return null;
  }

  const today = formatDate(asOfDate);
  if (row.status === "ACTIVE" && row.end_date && row.end_date < today) {
    return {
      ...row,
      status: "EXPIRED",
      meals_remaining: 0,
    };
  }

  return row;
}

function sanitizeSubscription(row) {
  if (!row) {
    return null;
  }

  return {
    childId: row.child_id,
    planId: row.plan_id || null,
    planName: row.plan_name || null,
    status: row.status,
    startDate: formatDate(row.start_date),
    endDate: formatDate(row.end_date),
    mealsRemaining: Number(row.meals_remaining || 0),
    mealType: row.meal_type || null,
    cancelledAt: formatDateTime(row.cancelled_at),
    cancellationReason: row.cancellation_reason || null,
    planPrice: row.plan_price !== undefined && row.plan_price !== null ? Number(row.plan_price) : null,
    planActive: row.plan_active !== undefined ? Boolean(row.plan_active) : null,
  };
}

async function getChildSubscription(actor, childId, options = {}) {
  const child = findChildOrThrow(childId);
  assertSubscriptionAccess(actor, child);

  const stored = await childSubscriptionRepository.getChildSubscription(childId);
  const normalized = normalizeSubscriptionStatus(stored, options.asOfDate || new Date());

  if (normalized) {
    return sanitizeSubscription(normalized);
  }

  if (child.subscriptionStatus === "GRACE_PERIOD") {
    return {
      childId: child.id,
      planId: null,
      planName: null,
      status: "GRACE_PERIOD",
      startDate: formatDate(child.createdAt),
      endDate: formatDate(child.gracePeriodEndsAt),
      mealsRemaining: 0,
      mealType: null,
      cancelledAt: null,
      cancellationReason: null,
      planPrice: null,
      planActive: null,
    };
  }

  return null;
}

async function renewChildSubscription(actor, childId, input = {}) {
  const child = findChildOrThrow(childId);
  assertSubscriptionAccess(actor, child);

  const planId = String(input.planId || input.plan_id || "").trim();
  if (!planId) {
    throw new Error("planId is required");
  }

  const plan = await planRepository.getById(planId);
  if (!plan) {
    throw new Error("Plan not found");
  }
  if (!plan.active) {
    throw new Error("Inactive plans cannot be purchased");
  }

  const startDate = input.startDate || input.start_date || new Date();
  const normalizedStartDate = new Date(startDate);
  if (Number.isNaN(normalizedStartDate.getTime())) {
    throw new Error("Invalid subscription start date");
  }

  const endDate = input.endDate || input.end_date || addDays(normalizedStartDate, CYCLE_DAYS);
  const normalizedEndDate = new Date(endDate);
  if (Number.isNaN(normalizedEndDate.getTime())) {
    throw new Error("Invalid subscription end date");
  }
  if (normalizedEndDate < normalizedStartDate) {
    throw new Error("Subscription end date must be after the start date");
  }

  await childSubscriptionRepository.upsertChildSubscription({
    childId: child.id,
    planId: plan.id,
    status: "ACTIVE",
    startDate: normalizedStartDate,
    endDate: normalizedEndDate,
    mealsRemaining: Number(plan.meals_per_cycle || 0),
    mealType: plan.meal_type,
    cancelledAt: null,
    cancellationReason: null,
    childStatus: "ACTIVE",
    gracePeriodEndsAt: null,
  });

  child.subscriptionStatus = "ACTIVE";
  child.gracePeriodEndsAt = null;
  child.updatedAt = new Date().toISOString();

  const subscription = await getChildSubscription(actor, child.id);
  await messagingService.queueSubscriptionActivatedMessage(actor, child.id, subscription);
  appendActivityLog(actor.id, {
    entityType: "child_subscription",
    entityId: child.id,
    action: "subscription.renew",
    detail: `Renewed subscription for ${child.studentId} with plan ${plan.name}`,
    before: null,
    after: subscription,
    metadata: {
      childId: child.id,
      planId: plan.id,
    },
  });

  return subscription;
}

async function manuallyAttachSubscription(actor, childId, input = {}) {
  const child = findChildOrThrow(childId);
  assertAdminOnly(actor);
  assertSubscriptionAccess(actor, child);

  const reason = String(input.reason || input.reason_note || input.reasonNote || "").trim();
  if (!reason) {
    throw new Error("reason is required");
  }

  const planId = String(input.planId || input.plan_id || "").trim();
  if (!planId) {
    throw new Error("planId is required");
  }

  const plan = await planRepository.getById(planId);
  if (!plan) {
    throw new Error("Plan not found");
  }
  if (!plan.active) {
    throw new Error("Inactive plans cannot be purchased");
  }

  const startDate = input.startDate || input.start_date || new Date();
  const normalizedStartDate = new Date(startDate);
  if (Number.isNaN(normalizedStartDate.getTime())) {
    throw new Error("Invalid subscription start date");
  }

  const endDate = input.endDate || input.end_date || addDays(normalizedStartDate, CYCLE_DAYS);
  const normalizedEndDate = new Date(endDate);
  if (Number.isNaN(normalizedEndDate.getTime())) {
    throw new Error("Invalid subscription end date");
  }
  if (normalizedEndDate < normalizedStartDate) {
    throw new Error("Subscription end date must be after the start date");
  }

  const existing = await childSubscriptionRepository.getChildSubscription(childId);

  await childSubscriptionRepository.upsertChildSubscription({
    childId: child.id,
    planId: plan.id,
    status: "ACTIVE",
    startDate: normalizedStartDate,
    endDate: normalizedEndDate,
    mealsRemaining: Number(plan.meals_per_cycle || 0),
    mealType: plan.meal_type,
    cancelledAt: null,
    cancellationReason: null,
    childStatus: "ACTIVE",
    gracePeriodEndsAt: null,
  });

  child.subscriptionStatus = "ACTIVE";
  child.gracePeriodEndsAt = null;
  child.updatedAt = new Date().toISOString();

  await createSubscriptionPurchaseTransaction({
    childId: child.id,
    amount: Number(plan.price || 0),
    planId: plan.id,
    planName: plan.name,
    reason,
    actorUserId: actor.id,
    createdAt: normalizedStartDate,
  });

  const subscription = await getChildSubscription(actor, child.id);
  appendActivityLog(actor.id, {
    entityType: "child_subscription",
    entityId: child.id,
    action: "subscription.manual_attach",
    detail: `Manually attached subscription for ${child.studentId} with plan ${plan.name}`,
    before: sanitizeSubscription(existing),
    after: subscription,
    metadata: {
      childId: child.id,
      planId: plan.id,
      reason,
      source: "MANUAL_ATTACH",
    },
  });

  return subscription;
}

async function cancelChildSubscription(actor, childId, input = {}) {
  const child = findChildOrThrow(childId);
  assertSubscriptionAccess(actor, child);

  const existing = await childSubscriptionRepository.getChildSubscription(childId);
  if (!existing) {
    throw new Error("Subscription not found");
  }
  if (existing.status === "CANCELLED") {
    return sanitizeSubscription(existing);
  }

  const effectiveDate = new Date(input.effectiveDate || input.effective_date || new Date());
  if (Number.isNaN(effectiveDate.getTime())) {
    throw new Error("Invalid cancellation date");
  }
  const nextStatus = String(input.nextStatus || input.next_status || "").trim().toUpperCase();
  const restoreGrace = nextStatus ? nextStatus === "GRACE_PERIOD" : true;
  const childStatus = restoreGrace ? "GRACE_PERIOD" : "CANCELLED";
  const gracePeriodEndsAt = restoreGrace ? addDays(effectiveDate, 7) : null;

  const currentEndDate = new Date(existing.end_date);
  const resultingEndDate = effectiveDate < currentEndDate ? effectiveDate : currentEndDate;
  const cancellationReason = String(input.reason || input.cancellation_reason || "").trim() || null;
  const cancelledAt = new Date();

  await childSubscriptionRepository.upsertChildSubscription({
    childId: child.id,
    planId: existing.plan_id,
    status: childStatus,
    startDate: existing.start_date,
    endDate: resultingEndDate,
    mealsRemaining: 0,
    mealType: existing.meal_type || "LUNCH",
    cancelledAt,
    cancellationReason,
    childStatus,
    gracePeriodEndsAt,
  });

  child.subscriptionStatus = childStatus;
  child.gracePeriodEndsAt = gracePeriodEndsAt ? gracePeriodEndsAt.toISOString() : null;
  child.updatedAt = cancelledAt.toISOString();

  const subscription = await getChildSubscription(actor, child.id);
  appendActivityLog(actor.id, {
    entityType: "child_subscription",
    entityId: child.id,
    action: "subscription.cancel",
    detail: `Cancelled subscription for ${child.studentId}`,
    before: sanitizeSubscription(existing),
    after: subscription,
    metadata: {
      childId: child.id,
      reason: cancellationReason,
    },
  });

  return subscription;
}

async function expireSubscriptions(actor, options = {}) {
  const asOfDate = options.asOfDate || new Date();
  const expiredChildIds = await childSubscriptionRepository.expireDueSubscriptions(asOfDate);

  if (expiredChildIds.length > 0) {
    const expiredAt = new Date().toISOString();
    getState().children.forEach((child) => {
      if (expiredChildIds.includes(child.id)) {
        child.subscriptionStatus = "EXPIRED";
        child.gracePeriodEndsAt = null;
        child.updatedAt = expiredAt;
      }
    });

    for (const childId of expiredChildIds) {
      const subscription = await getChildSubscription(actor, childId, { asOfDate });
      await messagingService.queueSubscriptionExpiredMessage(actor, childId, subscription);
    }
  }

  appendActivityLog(actor.id, {
    entityType: "subscription_job",
    entityId: `expire-${formatDate(asOfDate)}`,
    action: "subscription.expire",
    detail: `Expired ${expiredChildIds.length} child subscriptions`,
    before: null,
    after: {
      expiredCount: expiredChildIds.length,
      childIds: expiredChildIds,
      asOfDate: formatDate(asOfDate),
    },
    metadata: {
      asOfDate: formatDate(asOfDate),
    },
  });

  return {
    expiredCount: expiredChildIds.length,
    childIds: expiredChildIds,
    asOfDate: formatDate(asOfDate),
  };
}

async function resetChildMealServiceForTest(actor, childId, input = {}) {
  const child = findChildOrThrow(childId);
  assertAdminOnly(actor);
  assertSubscriptionAccess(actor, child);

  const serviceDate = formatDate(input.serviceDate || input.service_date || new Date());
  if (!serviceDate) {
    throw new Error("Invalid service date");
  }

  const mealType = String(input.mealType || input.meal_type || "").trim().toUpperCase() || null;
  const pool = poolModule.getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const params = [child.id, serviceDate];
    let mealTypeClause = "";
    if (mealType) {
      mealTypeClause = " AND ms.meal_type = ? ";
      params.push(mealType);
    }

    const [rows] = await connection.execute(
      `SELECT
         ms.id AS meal_scan_id,
         ms.meal_type,
         srv.id AS meal_serve_id,
         COALESCE(srv.is_grace, 0) AS is_grace
       FROM meal_scans ms
       LEFT JOIN meal_serves srv ON srv.meal_scan_id = ms.id
       WHERE ms.child_id = ?
         AND ms.service_date = ?
         AND ms.outcome = 'APPROVED'
         ${mealTypeClause}
       ORDER BY ms.served_at DESC, ms.id DESC`,
      params
    );

    if (rows.length === 0) {
      await connection.commit();
      return {
        resetCount: 0,
        restoredMeals: 0,
        serviceDate,
        mealType,
        subscription: await getChildSubscription(actor, child.id),
      };
    }

    const scanIds = rows.map((row) => row.meal_scan_id).filter(Boolean);
    const mealServeIds = rows.map((row) => row.meal_serve_id).filter(Boolean);
    const restoredMeals = rows.filter((row) => !Boolean(Number(row.is_grace)) && row.meal_serve_id).length;
    const existing = await childSubscriptionRepository.getChildSubscription(childId);

    if (mealServeIds.length > 0) {
      await connection.execute(
        `DELETE FROM meal_serve_proofs
         WHERE meal_serve_id IN (${mealServeIds.map(() => "?").join(", ")})`,
        mealServeIds
      );

      await connection.execute(
        `DELETE FROM meal_serves
         WHERE id IN (${mealServeIds.map(() => "?").join(", ")})`,
        mealServeIds
      );
    }

    if (scanIds.length > 0) {
      await connection.execute(
        `DELETE FROM transactions
         WHERE child_id = ?
           AND type IN ('DEBIT_MEAL', 'GRACE_MEAL')
           AND (
             JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.mealScanId')) IN (${scanIds.map(() => "?").join(", ")})
             ${mealServeIds.length > 0 ? `OR JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.mealServeId')) IN (${mealServeIds.map(() => "?").join(", ")})` : ""}
           )`,
        [child.id, ...scanIds, ...mealServeIds]
      );

      await connection.execute(
        `DELETE FROM meal_scans
         WHERE id IN (${scanIds.map(() => "?").join(", ")})`,
        scanIds
      );
    }

    if (existing && existing.status === "ACTIVE" && restoredMeals > 0) {
      await childSubscriptionRepository.upsertChildSubscription({
        childId: child.id,
        planId: existing.plan_id,
        status: existing.status,
        startDate: existing.start_date,
        endDate: existing.end_date,
        mealsRemaining: Number(existing.meals_remaining || 0) + restoredMeals,
        mealType: existing.meal_type || "LUNCH",
        cancelledAt: existing.cancelled_at,
        cancellationReason: existing.cancellation_reason,
        childStatus: child.subscriptionStatus || "ACTIVE",
        gracePeriodEndsAt: child.gracePeriodEndsAt || null,
      });
    }

    await connection.commit();

    const subscription = await getChildSubscription(actor, child.id);
    appendActivityLog(actor.id, {
      entityType: "meal_service_reset",
      entityId: `${child.id}:${serviceDate}:${mealType || "ALL"}`,
      action: "meal_service.reset_test",
      detail: `Reset ${rows.length} approved meal scan(s) for ${child.studentId} on ${serviceDate}`,
      before: {
        serviceDate,
        mealType,
        resetCount: rows.length,
      },
      after: {
        serviceDate,
        mealType,
        resetCount: 0,
        restoredMeals,
      },
      metadata: {
        childId: child.id,
        serviceDate,
        mealType,
        restoredMeals,
        resetMealScanIds: scanIds,
        resetMealServeIds: mealServeIds,
        temporary: true,
      },
    });

    return {
      resetCount: rows.length,
      restoredMeals,
      serviceDate,
      mealType,
      subscription,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  sanitizeSubscription,
  getChildSubscription,
  renewChildSubscription,
  manuallyAttachSubscription,
  cancelChildSubscription,
  expireSubscriptions,
  resetChildMealServiceForTest,
};
