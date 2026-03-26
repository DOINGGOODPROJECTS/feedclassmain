const test = require("node:test");
const assert = require("node:assert/strict");

const { resetState, getState, getUserByEmail } = require("../lib/state");
const planRepository = require("../repositories/planRepository");
const childSubscriptionRepository = require("../repositories/childSubscriptionRepository");
const poolModule = require("../db/pool");
const messagingService = require("../services/messagingService");
const {
  getChildSubscription,
  renewChildSubscription,
  manuallyAttachSubscription,
  cancelChildSubscription,
  expireSubscriptions,
} = require("../services/childSubscriptionService");

test.beforeEach(() => {
  resetState();
});

test("getChildSubscription falls back to grace period when no paid subscription exists", async () => {
  const supervisor = getUserByEmail("supervisor@feedclass.test");
  const originalGet = childSubscriptionRepository.getChildSubscription;

  childSubscriptionRepository.getChildSubscription = async () => null;

  try {
    const subscription = await getChildSubscription(supervisor, "ch2");

    assert.equal(subscription.status, "GRACE_PERIOD");
    assert.equal(subscription.childId, "ch2");
    assert.equal(subscription.mealsRemaining, 0);
    assert.equal(subscription.planId, null);
  } finally {
    childSubscriptionRepository.getChildSubscription = originalGet;
  }
});

test("renewChildSubscription resets the cycle and updates child state", async () => {
  const admin = getUserByEmail("admin@feedclass.test");
  const originalGetPlan = planRepository.getById;
  const originalUpsert = childSubscriptionRepository.upsertChildSubscription;
  const originalGetSubscription = childSubscriptionRepository.getChildSubscription;
  const originalQueueActivated = messagingService.queueSubscriptionActivatedMessage;
  let persisted = null;

  planRepository.getById = async () => ({
    id: "plan-1",
    name: "Lunch Gold",
    meal_type: "LUNCH",
    meals_per_cycle: 18,
    price: 99,
    active: true,
  });
  childSubscriptionRepository.upsertChildSubscription = async (record) => {
    persisted = record;
  };
  childSubscriptionRepository.getChildSubscription = async (childId) => ({
    child_id: childId,
    plan_id: "plan-1",
    plan_name: "Lunch Gold",
    status: "ACTIVE",
    start_date: "2026-03-11",
    end_date: "2026-04-10",
    meals_remaining: 18,
    meal_type: "LUNCH",
    cancelled_at: null,
    cancellation_reason: null,
    plan_price: 99,
    plan_active: 1,
  });
  messagingService.queueSubscriptionActivatedMessage = async () => ({ id: "outbox-1" });

  try {
    const renewed = await renewChildSubscription(admin, "ch2", {
      planId: "plan-1",
      startDate: "2026-03-11",
    });

    assert.equal(persisted.status, "ACTIVE");
    assert.equal(persisted.mealsRemaining, 18);
    assert.equal(persisted.childStatus, "ACTIVE");
    assert.equal(getState().children.find((entry) => entry.id === "ch2").subscriptionStatus, "ACTIVE");
    assert.equal(renewed.status, "ACTIVE");
    assert.equal(renewed.mealType, "LUNCH");
  } finally {
    planRepository.getById = originalGetPlan;
    childSubscriptionRepository.upsertChildSubscription = originalUpsert;
    childSubscriptionRepository.getChildSubscription = originalGetSubscription;
    messagingService.queueSubscriptionActivatedMessage = originalQueueActivated;
  }
});

test("cancelChildSubscription applies early cancellation and returns the child to grace period", async () => {
  const admin = getUserByEmail("admin@feedclass.test");
  const originalUpsert = childSubscriptionRepository.upsertChildSubscription;
  const originalGetSubscription = childSubscriptionRepository.getChildSubscription;
  let persisted = null;
  let status = "ACTIVE";

  childSubscriptionRepository.getChildSubscription = async () => ({
    child_id: "ch1",
    plan_id: "plan-1",
    plan_name: "Lunch Gold",
    status,
    start_date: "2026-03-01",
    end_date: "2026-03-31",
    meals_remaining: status === "CANCELLED" ? 0 : 9,
    meal_type: "LUNCH",
    cancelled_at: status === "CANCELLED" ? "2026-03-11T00:00:00.000Z" : null,
    cancellation_reason: status === "CANCELLED" ? "Guardian requested cancellation" : null,
    plan_price: 99,
    plan_active: 1,
  });
  childSubscriptionRepository.upsertChildSubscription = async (record) => {
    persisted = record;
    status = record.status;
  };

  try {
    const cancelled = await cancelChildSubscription(admin, "ch1", {
      effectiveDate: "2026-03-11",
      reason: "Guardian requested cancellation",
    });

    assert.equal(persisted.status, "GRACE_PERIOD");
    assert.equal(persisted.mealsRemaining, 0);
    assert.equal(persisted.childStatus, "GRACE_PERIOD");
    assert.equal(cancelled.status, "GRACE_PERIOD");
    assert.equal(getState().children.find((entry) => entry.id === "ch1").subscriptionStatus, "GRACE_PERIOD");
  } finally {
    childSubscriptionRepository.upsertChildSubscription = originalUpsert;
    childSubscriptionRepository.getChildSubscription = originalGetSubscription;
  }
});

test("manuallyAttachSubscription is admin-only, requires reason, and writes a ledger transaction", async () => {
  const admin = getUserByEmail("admin@feedclass.test");
  const supervisor = getUserByEmail("supervisor@feedclass.test");
  const originalGetPlan = planRepository.getById;
  const originalUpsert = childSubscriptionRepository.upsertChildSubscription;
  const originalGetSubscription = childSubscriptionRepository.getChildSubscription;
  const originalGetPool = poolModule.getPool;
  let persisted = null;
  let transactionInsert = null;

  planRepository.getById = async () => ({
    id: "plan-1",
    name: "Lunch Gold",
    meal_type: "LUNCH",
    meals_per_cycle: 18,
    price: 99,
    active: true,
  });
  childSubscriptionRepository.upsertChildSubscription = async (record) => {
    persisted = record;
  };
  childSubscriptionRepository.getChildSubscription = async (childId) => ({
    child_id: childId,
    plan_id: "plan-1",
    plan_name: "Lunch Gold",
    status: "ACTIVE",
    start_date: "2026-03-11",
    end_date: "2026-04-10",
    meals_remaining: 18,
    meal_type: "LUNCH",
    cancelled_at: null,
    cancellation_reason: null,
    plan_price: 99,
    plan_active: 1,
  });
  poolModule.getPool = () => ({
    execute: async (sql, params) => {
      if (sql.includes("INSERT INTO transactions")) {
        transactionInsert = { sql, params };
      }
      return [[], []];
    },
  });

  try {
    await assert.rejects(
      () => manuallyAttachSubscription(supervisor, "ch2", { planId: "plan-1", reason: "Pilot" }),
      /Only platform admin/
    );
    await assert.rejects(
      () => manuallyAttachSubscription(admin, "ch2", { planId: "plan-1" }),
      /reason is required/
    );

    const subscription = await manuallyAttachSubscription(admin, "ch2", {
      planId: "plan-1",
      reason: "Offline cash conversion",
      startDate: "2026-03-11",
    });

    assert.equal(persisted.status, "ACTIVE");
    assert.equal(persisted.childStatus, "ACTIVE");
    assert.equal(getState().children.find((entry) => entry.id === "ch2").subscriptionStatus, "ACTIVE");
    assert.equal(subscription.status, "ACTIVE");
    assert.ok(transactionInsert);
    assert.equal(transactionInsert.params[2], 99);
    assert.match(transactionInsert.params[3], /Offline cash conversion/);
    assert.equal(getState().activityLogs.at(-1).action, "subscription.manual_attach");
    assert.equal(getState().activityLogs.at(-1).metadata.reason, "Offline cash conversion");
  } finally {
    planRepository.getById = originalGetPlan;
    childSubscriptionRepository.upsertChildSubscription = originalUpsert;
    childSubscriptionRepository.getChildSubscription = originalGetSubscription;
    poolModule.getPool = originalGetPool;
  }
});

test("expireSubscriptions marks due active subscriptions as expired", async () => {
  const admin = getUserByEmail("admin@feedclass.test");
  const originalExpire = childSubscriptionRepository.expireDueSubscriptions;
  const originalGetSubscription = childSubscriptionRepository.getChildSubscription;
  const originalQueueExpired = messagingService.queueSubscriptionExpiredMessage;

  getState().children.find((entry) => entry.id === "ch1").subscriptionStatus = "ACTIVE";
  childSubscriptionRepository.expireDueSubscriptions = async () => ["ch1"];
  childSubscriptionRepository.getChildSubscription = async () => ({
    child_id: "ch1",
    plan_id: "plan-1",
    plan_name: "Lunch Gold",
    status: "EXPIRED",
    start_date: "2026-03-01",
    end_date: "2026-03-10",
    meals_remaining: 0,
    meal_type: "LUNCH",
    cancelled_at: null,
    cancellation_reason: null,
    plan_price: 99,
    plan_active: 1,
  });
  messagingService.queueSubscriptionExpiredMessage = async () => ({ id: "outbox-2" });

  try {
    const result = await expireSubscriptions(admin, { asOfDate: "2026-03-11" });

    assert.equal(result.expiredCount, 1);
    assert.deepEqual(result.childIds, ["ch1"]);
    assert.equal(getState().children.find((entry) => entry.id === "ch1").subscriptionStatus, "EXPIRED");
  } finally {
    childSubscriptionRepository.expireDueSubscriptions = originalExpire;
    childSubscriptionRepository.getChildSubscription = originalGetSubscription;
    messagingService.queueSubscriptionExpiredMessage = originalQueueExpired;
  }
});
