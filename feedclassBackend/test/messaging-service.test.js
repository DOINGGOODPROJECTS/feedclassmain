const test = require("node:test");
const assert = require("node:assert/strict");

const { resetState, getState, getUserByEmail } = require("../lib/state");
const messageRepository = require("../repositories/messageRepository");
const childSubscriptionRepository = require("../repositories/childSubscriptionRepository");
const planRepository = require("../repositories/planRepository");
const smsService = require("../services/smsService");
const {
  processOutboxMessage,
  getMessagesHealth,
  enqueueSubscriptionExpiryReminders,
  queueSubscriptionActivatedMessage,
} = require("../services/messagingService");

test.beforeEach(() => {
  resetState();
});

test("processOutboxMessage sends through SMS and marks the outbox sent", async () => {
  const originalClaim = messageRepository.claimOutboxMessage;
  const originalMarkSent = messageRepository.markOutboxSent;
  const originalMarkRetry = messageRepository.markOutboxRetry;
  const originalMarkFailed = messageRepository.markOutboxFailed;
  const originalSendSms = smsService.sendSms;
  let sentPayload = null;
  let retryCalled = false;
  let failedCalled = false;

  messageRepository.claimOutboxMessage = async () => ({
    id: "outbox-1",
    message_type: "PAYMENT_LINK",
    channel: "SMS",
    fallback_channel: null,
    recipient: "+2250502273642",
    payload: "Test payment link",
    attempts: 1,
    max_attempts: 3,
  });
  messageRepository.markOutboxSent = async (outboxId, providerReference, providerChannel, detail) => {
    sentPayload = { outboxId, providerReference, providerChannel, detail };
  };
  messageRepository.markOutboxRetry = async () => {
    retryCalled = true;
  };
  messageRepository.markOutboxFailed = async () => {
    failedCalled = true;
  };
  smsService.sendSms = async () => ({
    providerReference: "sms-123",
    status: "SENT",
  });

  try {
    const result = await processOutboxMessage("outbox-1");
    assert.equal(result.status, "SENT");
    assert.equal(result.channel, "SMS");
    assert.equal(sentPayload.outboxId, "outbox-1");
    assert.equal(sentPayload.providerChannel, "SMS");
    assert.equal(retryCalled, false);
    assert.equal(failedCalled, false);
  } finally {
    messageRepository.claimOutboxMessage = originalClaim;
    messageRepository.markOutboxSent = originalMarkSent;
    messageRepository.markOutboxRetry = originalMarkRetry;
    messageRepository.markOutboxFailed = originalMarkFailed;
    smsService.sendSms = originalSendSms;
  }
});

test("getMessagesHealth reports provider configuration and queue counts", async () => {
  const originalSummary = messageRepository.getMessageHealthSummary;
  const originalSmsConfigured = smsService.isSmsConfigured;
  const originalSmsProvider = smsService.getSmsProvider;

  messageRepository.getMessageHealthSummary = async () => ({
    outbox: { PENDING: 2, RETRY: 1, SENT: 4 },
    recentLogs: { SENT: 4, RETRY: 1 },
    dueNow: 3,
  });
  smsService.isSmsConfigured = () => true;
  smsService.getSmsProvider = () => "TWILIO";

  try {
    const result = await getMessagesHealth();
    assert.equal(result.queue.PENDING, 2);
    assert.equal(result.providers.sms.provider, "TWILIO");
    assert.equal(result.providers.sms.configured, true);
    assert.equal(result.dueNow, 3);
  } finally {
    messageRepository.getMessageHealthSummary = originalSummary;
    smsService.isSmsConfigured = originalSmsConfigured;
    smsService.getSmsProvider = originalSmsProvider;
  }
});

test("enqueueSubscriptionExpiryReminders queues T-3 reminders and respects guardian opt-out", async () => {
  const admin = getUserByEmail("admin@feedclass.test");
  const originalListExpiring = childSubscriptionRepository.listExpiringSubscriptions;
  const originalHasRecent = messageRepository.hasRecentMessageForChild;
  const originalCreateOutbox = messageRepository.createOutboxMessage;
  const originalGetPlan = planRepository.getById;
  let queued = 0;

  getState().guardians.find((entry) => entry.childId === "ch2").notificationsOptOut = true;

  childSubscriptionRepository.listExpiringSubscriptions = async () => ([
    {
      child_id: "ch1",
      plan_id: "plan-1",
      plan_name: "Lunch Gold",
      status: "ACTIVE",
      start_date: "2026-03-01",
      end_date: "2026-03-15",
      meals_remaining: 3,
      meal_type: "LUNCH",
      guardian_id: "g1",
      guardian_name: "Ruth Mensah",
      guardian_phone: "+233-555-181-222",
      notifications_opt_out: 0,
    },
    {
      child_id: "ch2",
      plan_id: "plan-1",
      plan_name: "Lunch Gold",
      status: "ACTIVE",
      start_date: "2026-03-01",
      end_date: "2026-03-15",
      meals_remaining: 3,
      meal_type: "LUNCH",
      guardian_id: "g2",
      guardian_name: "Kwame Boateng",
      guardian_phone: "+233-555-373-991",
      notifications_opt_out: 1,
    },
  ]);
  messageRepository.hasRecentMessageForChild = async () => false;
  messageRepository.createOutboxMessage = async () => {
    queued += 1;
    return { id: `outbox-${queued}`, channel: "SMS" };
  };
  planRepository.getById = async () => ({ id: "plan-1", name: "Lunch Gold" });

  try {
    const result = await enqueueSubscriptionExpiryReminders(admin, {
      asOfDate: "2026-03-12",
      daysAhead: 3,
    });
    assert.equal(result.queuedCount, 1);
    assert.equal(result.skippedCount, 1);
    assert.equal(queued, 1);
  } finally {
    childSubscriptionRepository.listExpiringSubscriptions = originalListExpiring;
    messageRepository.hasRecentMessageForChild = originalHasRecent;
    messageRepository.createOutboxMessage = originalCreateOutbox;
    planRepository.getById = originalGetPlan;
  }
});

test("queueSubscriptionActivatedMessage skips when school messaging is disabled", async () => {
  const admin = getUserByEmail("admin@feedclass.test");
  const originalCreateOutbox = messageRepository.createOutboxMessage;
  getState().schools.find((entry) => entry.id === "s1").messagingEnabled = false;
  let queued = false;

  messageRepository.createOutboxMessage = async () => {
    queued = true;
    return { id: "outbox-1" };
  };

  try {
    const result = await queueSubscriptionActivatedMessage(admin, "ch1", {
      planId: "plan-1",
      planName: "Lunch Gold",
      endDate: "2026-04-10",
    });
    assert.equal(result.skipped, true);
    assert.equal(result.reason, "School messaging disabled");
    assert.equal(queued, false);
  } finally {
    messageRepository.createOutboxMessage = originalCreateOutbox;
  }
});
