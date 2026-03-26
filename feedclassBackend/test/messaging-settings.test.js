const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getCadenceWindowMs,
  shouldRunReminderCycle,
} = require("../services/messagingSettingsService");

test("messaging settings expose the expected reminder windows", () => {
  assert.equal(getCadenceWindowMs("DAILY"), 24 * 60 * 60 * 1000);
  assert.equal(getCadenceWindowMs("WEEKLY"), 7 * 24 * 60 * 60 * 1000);
  assert.equal(getCadenceWindowMs("MONTHLY"), 30 * 24 * 60 * 60 * 1000);
});

test("reminder cycle runs immediately when there is no prior run", () => {
  assert.equal(
    shouldRunReminderCycle({ schedule: "WEEKLY", lastRunAt: null }, new Date("2026-03-13T12:00:00.000Z")),
    true
  );
});

test("reminder cycle respects daily, weekly, and monthly cadence windows", () => {
  const now = new Date("2026-03-13T12:00:00.000Z");

  assert.equal(
    shouldRunReminderCycle({ schedule: "DAILY", lastRunAt: "2026-03-12T11:00:00.000Z" }, now),
    true
  );
  assert.equal(
    shouldRunReminderCycle({ schedule: "DAILY", lastRunAt: "2026-03-13T01:00:00.000Z" }, now),
    false
  );
  assert.equal(
    shouldRunReminderCycle({ schedule: "WEEKLY", lastRunAt: "2026-03-05T11:00:00.000Z" }, now),
    true
  );
  assert.equal(
    shouldRunReminderCycle({ schedule: "WEEKLY", lastRunAt: "2026-03-10T11:00:00.000Z" }, now),
    false
  );
  assert.equal(
    shouldRunReminderCycle({ schedule: "MONTHLY", lastRunAt: "2026-02-10T11:00:00.000Z" }, now),
    true
  );
  assert.equal(
    shouldRunReminderCycle({ schedule: "MONTHLY", lastRunAt: "2026-03-01T11:00:00.000Z" }, now),
    false
  );
});
