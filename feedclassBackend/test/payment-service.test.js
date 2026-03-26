const test = require("node:test");
const assert = require("node:assert/strict");

const { resetState, getUserByEmail } = require("../lib/state");
const paymentIntentRepository = require("../repositories/paymentIntentRepository");
const planRepository = require("../repositories/planRepository");
const messagingService = require("../services/messagingService");
const { createPaymentIntent, sendPaymentLink, markPaymentIntentPaid } = require("../services/paymentService");

test.beforeEach(() => {
  resetState();
});

test("createPaymentIntent creates a pending intent from the selected plan", async () => {
  const admin = getUserByEmail("admin@feedclass.test");
  const originalGetPlan = planRepository.getById;
  const originalFindPending = paymentIntentRepository.findPendingForChildPlan;
  const originalCreate = paymentIntentRepository.createPaymentIntentRecord;
  const originalGetById = paymentIntentRepository.getById;
  let created = null;

  planRepository.getById = async () => ({
    id: "plan-1",
    name: "Lunch Plan",
    meal_type: "LUNCH",
    meals_per_cycle: 20,
    price: 42,
    active: true,
  });
  paymentIntentRepository.findPendingForChildPlan = async () => null;
  paymentIntentRepository.createPaymentIntentRecord = async (record) => {
    created = record;
  };
  paymentIntentRepository.getById = async (id) => ({
    id,
    child_id: "ch1",
    plan_id: "plan-1",
    amount: 42,
    reference: created.reference,
    status: "PENDING",
    payment_url: created.paymentUrl,
    created_at: created.createdAt,
  });

  try {
    const intent = await createPaymentIntent(admin, { childId: "ch1", planId: "plan-1" });

    assert.equal(intent.child_id, "ch1");
    assert.equal(intent.plan_id, "plan-1");
    assert.equal(intent.amount, 42);
    assert.equal(intent.status, "PENDING");
  } finally {
    planRepository.getById = originalGetPlan;
    paymentIntentRepository.findPendingForChildPlan = originalFindPending;
    paymentIntentRepository.createPaymentIntentRecord = originalCreate;
    paymentIntentRepository.getById = originalGetById;
  }
});

test("sendPaymentLink queues the message and returns the delivery result", async () => {
  const admin = getUserByEmail("admin@feedclass.test");
  const originalGetIntent = paymentIntentRepository.getById;
  const originalGetPlan = planRepository.getById;
  const originalQueuePaymentLink = messagingService.queuePaymentLinkMessage;

  paymentIntentRepository.getById = async () => ({
    id: "pi-1",
    child_id: "ch1",
    plan_id: "plan-1",
    amount: 42,
    reference: "INV-123456",
    status: "PENDING",
    payment_url: "http://localhost:3000/pay/pi-1",
    created_at: new Date().toISOString(),
  });
  planRepository.getById = async () => ({ id: "plan-1", name: "Lunch Plan", active: true });
  messagingService.queuePaymentLinkMessage = async () => ({
    outbox: { id: "outbox-1", channel: "SMS" },
    delivery: {
      status: "SENT",
      channel: "SMS",
      providerReference: "sms-123",
    },
  });

  try {
    const result = await sendPaymentLink(admin, "pi-1");

    assert.equal(result.channel, "SMS");
    assert.equal(result.providerReference, "sms-123");
    assert.equal(result.outboxId, "outbox-1");
  } finally {
    paymentIntentRepository.getById = originalGetIntent;
    planRepository.getById = originalGetPlan;
    messagingService.queuePaymentLinkMessage = originalQueuePaymentLink;
  }
});

test("markPaymentIntentPaid updates the intent and queues a confirmation message", async () => {
  const admin = getUserByEmail("admin@feedclass.test");
  const originalGetIntent = paymentIntentRepository.getById;
  const originalUpdateStatus = paymentIntentRepository.updatePaymentIntentStatus;
  const originalQueueSuccess = messagingService.queuePaymentSuccessMessage;
  let updatedStatus = null;

  paymentIntentRepository.getById = async (id) => ({
    id,
    child_id: "ch1",
    plan_id: "plan-1",
    amount: 42,
    reference: "INV-123456",
    status: updatedStatus || "PENDING",
    payment_url: "http://localhost:3000/pay/pi-1",
    created_at: new Date().toISOString(),
  });
  paymentIntentRepository.updatePaymentIntentStatus = async (_id, status) => {
    updatedStatus = status;
  };
  messagingService.queuePaymentSuccessMessage = async () => ({
    outbox: { id: "outbox-2", channel: "SMS" },
    delivery: {
      status: "SENT",
      channel: "SMS",
      providerReference: "sms-456",
    },
  });

  try {
    const result = await markPaymentIntentPaid(admin, "pi-1");
    assert.equal(result.intent.status, "PAID");
    assert.equal(result.notification.outboxId, "outbox-2");
    assert.equal(result.notification.channel, "SMS");
  } finally {
    paymentIntentRepository.getById = originalGetIntent;
    paymentIntentRepository.updatePaymentIntentStatus = originalUpdateStatus;
    messagingService.queuePaymentSuccessMessage = originalQueueSuccess;
  }
});
