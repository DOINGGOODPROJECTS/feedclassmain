const crypto = require("crypto");
const paymentIntentRepository = require("../repositories/paymentIntentRepository");
const planRepository = require("../repositories/planRepository");
const { getState, getUserRole } = require("../lib/state");
const { appendActivityLog } = require("./auditService");
const messagingService = require("./messagingService");

function assertPaymentAccess(actor, child) {
  const role = getUserRole(actor.id);
  if (role === "ADMIN") {
    return;
  }
  if (role === "SUPERVISOR" && actor.assignedSchoolId === child.schoolId) {
    return;
  }
  throw new Error("You can only manage payments for your assigned school");
}

function getChildOrThrow(childId) {
  const child = getState().children.find((entry) => entry.id === childId);
  if (!child) {
    throw new Error("Child not found");
  }
  return child;
}

function getGuardianForChildOrThrow(childId) {
  const guardian = getState().guardians.find((entry) => entry.childId === childId);
  if (!guardian) {
    throw new Error("Guardian not found");
  }
  return guardian;
}

function getChildDisplayName(child) {
  return child.fullName || child.full_name || child.studentId || child.student_id || "Child";
}

function buildPaymentReference() {
  return `INV-${Math.floor(100000 + Math.random() * 900000)}`;
}

function sanitizePaymentIntent(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    child_id: row.child_id,
    plan_id: row.plan_id,
    plan_name: row.plan_name || null,
    amount: Number(row.amount || 0),
    reference: row.reference,
    status: row.status,
    payment_url: row.payment_url,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

async function getPublicPaymentIntentDetails(intentId) {
  const intent = await paymentIntentRepository.getById(intentId);
  if (!intent) {
    return null;
  }

  const child = getState().children.find((entry) => entry.id === intent.child_id) || null;
  const guardian = child ? getState().guardians.find((entry) => entry.childId === child.id) || null : null;
  const plan = await planRepository.getById(intent.plan_id);

  return {
    intent: sanitizePaymentIntent(intent),
    child: child
      ? {
          id: child.id,
          studentId: child.studentId,
          fullName: child.fullName,
        }
      : null,
    guardian: guardian
      ? {
          id: guardian.id,
          name: guardian.name,
          phone: guardian.phone,
        }
      : null,
    plan: plan
      ? {
          id: plan.id,
          name: plan.name,
          mealType: plan.meal_type,
          mealsPerCycle: Number(plan.meals_per_cycle || 0),
          price: Number(plan.price || 0),
        }
      : null,
  };
}

async function listPaymentIntents(actor, filters = {}) {
  if (getUserRole(actor.id) === "SUPERVISOR") {
    filters = { ...filters, schoolId: actor.assignedSchoolId };
  }
  const rows = await paymentIntentRepository.listAll(filters);
  return rows.map(sanitizePaymentIntent);
}

async function createPaymentIntent(actor, input) {
  const childId = String(input.childId || input.child_id || "").trim();
  const planId = String(input.planId || input.plan_id || "").trim();
  if (!childId || !planId) {
    throw new Error("childId and planId are required");
  }

  const child = getChildOrThrow(childId);
  assertPaymentAccess(actor, child);

  const plan = await planRepository.getById(planId);
  if (!plan) {
    throw new Error("Plan not found");
  }
  if (!plan.active) {
    throw new Error("Inactive plans cannot be purchased");
  }

  const existingPending = await paymentIntentRepository.findPendingForChildPlan(child.id, plan.id);
  if (existingPending) {
    return sanitizePaymentIntent(existingPending);
  }

  const intentId = crypto.randomUUID();
  const intent = {
    id: intentId,
    childId: child.id,
    planId: plan.id,
    amount: Number(plan.price || 0),
    reference: buildPaymentReference(),
    status: "PENDING",
    paymentUrl: `${messagingService.getPaymentBaseUrl()}/${intentId}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await paymentIntentRepository.createPaymentIntentRecord(intent);
  const created = await paymentIntentRepository.getById(intent.id);

  appendActivityLog(actor.id, {
    entityType: "payment_intent",
    entityId: intent.id,
    action: "payment_intent.create",
    detail: `Created payment intent for ${child.studentId}`,
    before: null,
    after: sanitizePaymentIntent(created),
    metadata: {
      childId: child.id,
      planId: plan.id,
    },
  });

  return sanitizePaymentIntent(created);
}

async function sendPaymentLink(actor, intentId) {
  const intent = await paymentIntentRepository.getById(intentId);
  if (!intent) {
    throw new Error("Payment intent not found");
  }

  const child = getChildOrThrow(intent.child_id);
  assertPaymentAccess(actor, child);
  const guardian = getGuardianForChildOrThrow(child.id);
  const plan = await planRepository.getById(intent.plan_id);
  const result = await messagingService.queuePaymentLinkMessage(actor, intent);
  const delivery = result.delivery || null;

  if (!delivery) {
    throw new Error("Unable to queue payment message");
  }

  if (delivery.status === "SKIPPED") {
    throw new Error(delivery.reason || "Payment link delivery was skipped");
  }

  if (delivery.status === "RETRY") {
    throw new Error(delivery.error || "Payment link delivery failed and has been queued for retry");
  }

  if (delivery.status !== "SENT") {
    throw new Error(delivery.error || "Payment link delivery failed");
  }

  return {
    intent: sanitizePaymentIntent(intent),
    channel: delivery.channel || result.outbox.provider_channel || result.outbox.channel,
    recipient: guardian.phone,
    providerReference: delivery.providerReference || null,
    outboxId: result.outbox.id,
    queued: true,
    fallbackFrom: delivery.fallbackFrom || null,
    deliveryStatus: delivery.status,
  };
}

async function markPaymentIntentPaid(actor, intentId) {
  const intent = await paymentIntentRepository.getById(intentId);
  if (!intent) {
    throw new Error("Payment intent not found");
  }

  const child = getChildOrThrow(intent.child_id);
  assertPaymentAccess(actor, child);

  await paymentIntentRepository.updatePaymentIntentStatus(intent.id, "PAID");
  const updated = await paymentIntentRepository.getById(intent.id);
  const delivery = await messagingService.queuePaymentSuccessMessage(actor, updated);

  appendActivityLog(actor.id, {
    entityType: "payment_intent",
    entityId: intent.id,
    action: "payment_intent.mark_paid",
    detail: `Marked payment intent ${intent.reference} as paid`,
    before: sanitizePaymentIntent(intent),
    after: sanitizePaymentIntent(updated),
    metadata: {
      childId: child.id,
      outboxId: delivery.outbox.id,
    },
  });

  return {
    intent: sanitizePaymentIntent(updated),
    notification: {
      outboxId: delivery.outbox.id,
      deliveryStatus: delivery.delivery?.status || "QUEUED",
      channel: delivery.delivery?.channel || delivery.outbox.channel,
      providerReference: delivery.delivery?.providerReference || null,
    },
  };
}

module.exports = {
  listPaymentIntents,
  createPaymentIntent,
  sendPaymentLink,
  getPublicPaymentIntentDetails,
  markPaymentIntentPaid,
};
