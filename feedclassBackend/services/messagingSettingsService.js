const { getPool } = require("../db/pool");

const REMINDER_SCHEDULES = ["DAILY", "WEEKLY", "MONTHLY"];
const SETTINGS_KEY = "sms_reminder_schedule";
const LAST_RUN_KEY = "sms_reminder_last_run_at";

function normalizeSchedule(value) {
  const normalized = String(value || "DAILY").trim().toUpperCase();
  return REMINDER_SCHEDULES.includes(normalized) ? normalized : "DAILY";
}

function getCadenceWindowMs(schedule) {
  switch (normalizeSchedule(schedule)) {
    case "MONTHLY":
      return 30 * 24 * 60 * 60 * 1000;
    case "WEEKLY":
      return 7 * 24 * 60 * 60 * 1000;
    case "DAILY":
    default:
      return 24 * 60 * 60 * 1000;
  }
}

function shouldRunReminderCycle(settings, now = new Date()) {
  if (!settings?.lastRunAt) {
    return true;
  }

  const lastRunAt = new Date(settings.lastRunAt);
  if (Number.isNaN(lastRunAt.getTime())) {
    return true;
  }

  return now.getTime() - lastRunAt.getTime() >= getCadenceWindowMs(settings.schedule);
}

async function ensurePlatformSettingsTable() {
  const pool = getPool();
  await pool.query(
    `CREATE TABLE IF NOT EXISTS platform_settings (
      setting_key VARCHAR(120) NOT NULL PRIMARY KEY,
      setting_value TEXT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`
  );
}

async function getSettingValue(key) {
  await ensurePlatformSettingsTable();
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT setting_value
     FROM platform_settings
     WHERE setting_key = ?
     LIMIT 1`,
    [key]
  );
  return rows[0]?.setting_value || null;
}

async function setSettingValue(key, value) {
  await ensurePlatformSettingsTable();
  const pool = getPool();
  await pool.execute(
    `INSERT INTO platform_settings (setting_key, setting_value, updated_at)
     VALUES (?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       setting_value = VALUES(setting_value),
       updated_at = NOW()`,
    [key, value]
  );
}

async function getMessagingSettings() {
  const [scheduleValue, lastRunValue] = await Promise.all([
    getSettingValue(SETTINGS_KEY),
    getSettingValue(LAST_RUN_KEY),
  ]);

  return {
    schedule: normalizeSchedule(scheduleValue),
    lastRunAt: lastRunValue ? new Date(lastRunValue).toISOString() : null,
    scheduleOptions: REMINDER_SCHEDULES,
  };
}

async function updateMessagingSettings(input = {}) {
  const schedule = normalizeSchedule(input.smsReminderSchedule || input.schedule);
  await setSettingValue(SETTINGS_KEY, schedule);
  return getMessagingSettings();
}

async function markReminderCycleRun(ranAt = new Date()) {
  await setSettingValue(LAST_RUN_KEY, new Date(ranAt).toISOString());
}

module.exports = {
  REMINDER_SCHEDULES,
  getCadenceWindowMs,
  shouldRunReminderCycle,
  getMessagingSettings,
  updateMessagingSettings,
  markReminderCycleRun,
};
