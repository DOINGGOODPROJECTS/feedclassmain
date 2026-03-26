const crypto = require("crypto");
const { getPool } = require("../db/pool");

const OUTBOX_COLUMNS = {
  message_type:
    "ALTER TABLE message_outbox ADD COLUMN message_type VARCHAR(120) NOT NULL DEFAULT 'GENERIC' AFTER guardian_id",
  fallback_channel:
    "ALTER TABLE message_outbox ADD COLUMN fallback_channel ENUM('SMS', 'WHATSAPP', 'EMAIL') NULL AFTER channel",
  attempts:
    "ALTER TABLE message_outbox ADD COLUMN attempts INT NOT NULL DEFAULT 0 AFTER status",
  max_attempts:
    "ALTER TABLE message_outbox ADD COLUMN max_attempts INT NOT NULL DEFAULT 3 AFTER attempts",
  next_attempt_at:
    "ALTER TABLE message_outbox ADD COLUMN next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER max_attempts",
  last_attempted_at:
    "ALTER TABLE message_outbox ADD COLUMN last_attempted_at DATETIME NULL AFTER next_attempt_at",
  last_error:
    "ALTER TABLE message_outbox ADD COLUMN last_error TEXT NULL AFTER last_attempted_at",
  metadata_json:
    "ALTER TABLE message_outbox ADD COLUMN metadata_json JSON NULL AFTER payload",
  provider_channel:
    "ALTER TABLE message_outbox ADD COLUMN provider_channel ENUM('SMS', 'WHATSAPP', 'EMAIL') NULL AFTER provider_reference",
};

const MESSAGE_LOG_COLUMNS = {
  channel:
    "ALTER TABLE message_logs ADD COLUMN channel ENUM('SMS', 'WHATSAPP', 'EMAIL') NULL AFTER status",
  provider_reference:
    "ALTER TABLE message_logs ADD COLUMN provider_reference VARCHAR(120) NULL AFTER channel",
};
let ensuredSchemaPromise = null;

function shouldRecoverStatusSchema(error) {
  const message = String(error?.message || "");
  return message.includes("Data truncated for column 'status'");
}

async function resetAndEnsureMessageSchema() {
  ensuredSchemaPromise = null;
  await ensureMessageSchemaReady();
}

async function withSchemaRecovery(operation) {
  try {
    return await operation();
  } catch (error) {
    if (!shouldRecoverStatusSchema(error)) {
      throw error;
    }

    await resetAndEnsureMessageSchema();
    return operation();
  }
}

function toMysqlDateTime(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 19).replace("T", " ");
}

async function hasColumn(tableName, columnName) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND column_name = ?
     LIMIT 1`,
    [tableName, columnName]
  );
  return rows.length > 0;
}

async function ensureMessageSchema() {
  const pool = getPool();

  for (const [columnName, alterSql] of Object.entries(OUTBOX_COLUMNS)) {
    if (!(await hasColumn("message_outbox", columnName))) {
      await pool.query(alterSql);
    }
  }

  for (const [columnName, alterSql] of Object.entries(MESSAGE_LOG_COLUMNS)) {
    if (!(await hasColumn("message_logs", columnName))) {
      await pool.query(alterSql);
    }
  }

  await pool.query(
    "ALTER TABLE message_outbox MODIFY status ENUM('PENDING', 'PROCESSING', 'RETRY', 'SENT', 'FAILED') NOT NULL DEFAULT 'PENDING'"
  );
  await pool.query(
    "ALTER TABLE message_logs MODIFY status ENUM('PENDING', 'QUEUED', 'PROCESSING', 'RETRY', 'SENT', 'FAILED') NOT NULL"
  );
  await pool.query("UPDATE message_logs SET status = 'QUEUED' WHERE status = 'PENDING'");
  await pool.query(
    "ALTER TABLE message_logs MODIFY status ENUM('QUEUED', 'PROCESSING', 'RETRY', 'SENT', 'FAILED') NOT NULL"
  );
}

async function ensureMessageSchemaReady() {
  if (!ensuredSchemaPromise) {
    ensuredSchemaPromise = ensureMessageSchema().catch((error) => {
      ensuredSchemaPromise = null;
      throw error;
    });
  }
  await ensuredSchemaPromise;
}

async function createMessageLog({
  outboxId,
  status,
  detail,
  channel = null,
  providerReference = null,
  createdAt = new Date(),
}) {
  await ensureMessageSchemaReady();
  const pool = getPool();
  await withSchemaRecovery(() =>
    pool.execute(
      `INSERT INTO message_logs
        (id, outbox_id, status, channel, provider_reference, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        outboxId || null,
        status,
        channel,
        providerReference,
        detail,
        toMysqlDateTime(createdAt),
      ]
    )
  );
}

async function createOutboxMessage({
  childId,
  guardianId,
  messageType = "GENERIC",
  channel,
  fallbackChannel = null,
  recipient,
  payload,
  metadata = null,
  maxAttempts = 3,
  nextAttemptAt = new Date(),
}) {
  await ensureMessageSchemaReady();
  const pool = getPool();
  const id = crypto.randomUUID();

  await withSchemaRecovery(() =>
    pool.execute(
      `INSERT INTO message_outbox
        (id, child_id, guardian_id, message_type, channel, fallback_channel, recipient, status, attempts, max_attempts, next_attempt_at, last_attempted_at, last_error, payload, metadata_json, provider_reference, provider_channel, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, ?, ?, NULL, NULL, ?, ?, NULL, NULL, NOW(), NOW())`,
      [
        id,
        childId || null,
        guardianId || null,
        messageType,
        channel,
        fallbackChannel,
        recipient,
        Number(maxAttempts || 3),
        toMysqlDateTime(nextAttemptAt),
        payload,
        metadata ? JSON.stringify(metadata) : null,
      ]
    )
  );

  await createMessageLog({
    outboxId: id,
    status: "QUEUED",
    channel,
    detail: `Queued ${messageType} message for ${recipient}`,
  });

  return getOutboxById(id);
}

function mapOutboxRow(row) {
  if (!row) {
    return null;
  }

  let metadata = null;
  if (row.metadata_json) {
    try {
      metadata = typeof row.metadata_json === "string" ? JSON.parse(row.metadata_json) : row.metadata_json;
    } catch {
      metadata = null;
    }
  }

  return {
    ...row,
    attempts: Number(row.attempts || 0),
    max_attempts: Number(row.max_attempts || 0),
    metadata,
  };
}

async function getOutboxById(id) {
  await ensureMessageSchemaReady();
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT id,
            child_id,
            guardian_id,
            message_type,
            channel,
            fallback_channel,
            recipient,
            status,
            attempts,
            max_attempts,
            next_attempt_at,
            last_attempted_at,
            last_error,
            payload,
            metadata_json,
            provider_reference,
            provider_channel,
            created_at,
            updated_at
     FROM message_outbox
     WHERE id = ?
     LIMIT 1`,
    [id]
  );

  return mapOutboxRow(rows[0] || null);
}

async function listDueMessages(limit = 20) {
  await ensureMessageSchemaReady();
  const pool = getPool();
  const safeLimit = Math.max(1, Math.min(Number(limit || 20), 100));
  const [rows] = await pool.query(
    `SELECT id,
            child_id,
            guardian_id,
            message_type,
            channel,
            fallback_channel,
            recipient,
            status,
            attempts,
            max_attempts,
            next_attempt_at,
            last_attempted_at,
            last_error,
            payload,
            metadata_json,
            provider_reference,
            provider_channel,
            created_at,
            updated_at
     FROM message_outbox
     WHERE status IN ('PENDING', 'RETRY')
       AND next_attempt_at <= NOW()
     ORDER BY next_attempt_at ASC, created_at ASC
     LIMIT ${safeLimit}`
  );

  return rows.map(mapOutboxRow);
}

async function claimOutboxMessage(outboxId) {
  await ensureMessageSchemaReady();
  const pool = getPool();
  const [result] = await withSchemaRecovery(() =>
    pool.execute(
      `UPDATE message_outbox
       SET status = 'PROCESSING',
           attempts = attempts + 1,
           last_attempted_at = NOW(),
           updated_at = NOW()
       WHERE id = ?
         AND status IN ('PENDING', 'RETRY')
         AND next_attempt_at <= NOW()`,
      [outboxId]
    )
  );

  if (!result.affectedRows) {
    return null;
  }

  const outbox = await getOutboxById(outboxId);
  await createMessageLog({
    outboxId,
    status: "PROCESSING",
    channel: outbox?.channel || null,
    detail: `Processing ${outbox?.message_type || "message"} attempt ${outbox?.attempts || 0}`,
  });

  return outbox;
}

async function markOutboxSent(outboxId, providerReference, providerChannel, detail) {
  await ensureMessageSchemaReady();
  const pool = getPool();
  await withSchemaRecovery(() =>
    pool.execute(
      `UPDATE message_outbox
       SET status = 'SENT',
           provider_reference = ?,
           provider_channel = ?,
           last_error = NULL,
           updated_at = NOW()
       WHERE id = ?`,
      [providerReference || null, providerChannel || null, outboxId]
    )
  );

  await createMessageLog({
    outboxId,
    status: "SENT",
    channel: providerChannel || null,
    providerReference,
    detail,
  });
}

async function markOutboxRetry(outboxId, providerChannel, detail, errorMessage, nextAttemptAt) {
  await ensureMessageSchemaReady();
  const pool = getPool();
  await withSchemaRecovery(() =>
    pool.execute(
      `UPDATE message_outbox
       SET status = 'RETRY',
           provider_channel = ?,
           last_error = ?,
           next_attempt_at = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [providerChannel || null, errorMessage || null, toMysqlDateTime(nextAttemptAt), outboxId]
    )
  );

  await createMessageLog({
    outboxId,
    status: "RETRY",
    channel: providerChannel || null,
    detail,
  });
}

async function markOutboxFailed(outboxId, providerChannel, detail, errorMessage) {
  await ensureMessageSchemaReady();
  const pool = getPool();
  await withSchemaRecovery(() =>
    pool.execute(
      `UPDATE message_outbox
       SET status = 'FAILED',
           provider_channel = ?,
           last_error = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [providerChannel || null, errorMessage || null, outboxId]
    )
  );

  await createMessageLog({
    outboxId,
    status: "FAILED",
    channel: providerChannel || null,
    detail,
  });
}

async function getMessageHealthSummary() {
  await ensureMessageSchemaReady();
  const pool = getPool();
  const [statusRows] = await pool.query(
    `SELECT status, COUNT(*) AS total
     FROM message_outbox
     GROUP BY status`
  );
  const [logRows] = await pool.query(
    `SELECT status, COUNT(*) AS total
     FROM message_logs
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
     GROUP BY status`
  );
  const [dueRows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM message_outbox
     WHERE status IN ('PENDING', 'RETRY')
       AND next_attempt_at <= NOW()`
  );

  return {
    outbox: statusRows.reduce((accumulator, row) => {
      accumulator[row.status] = Number(row.total || 0);
      return accumulator;
    }, {}),
    recentLogs: logRows.reduce((accumulator, row) => {
      accumulator[row.status] = Number(row.total || 0);
      return accumulator;
    }, {}),
    dueNow: Number(dueRows[0]?.total || 0),
  };
}

async function hasRecentMessageForIntent(messageType, intentId, dayString) {
  await ensureMessageSchemaReady();
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT 1
     FROM message_outbox
     WHERE message_type = ?
       AND JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.intentId')) = ?
       AND DATE(created_at) = ?
     LIMIT 1`,
    [messageType, intentId, dayString]
  );
  return rows.length > 0;
}

async function hasRecentMessageForChild(messageType, childId, dayString) {
  await ensureMessageSchemaReady();
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT 1
     FROM message_outbox
     WHERE message_type = ?
       AND child_id = ?
       AND DATE(created_at) = ?
     LIMIT 1`,
    [messageType, childId, dayString]
  );
  return rows.length > 0;
}

module.exports = {
  ensureMessageSchema,
  createOutboxMessage,
  createMessageLog,
  getOutboxById,
  listDueMessages,
  claimOutboxMessage,
  markOutboxSent,
  markOutboxRetry,
  markOutboxFailed,
  getMessageHealthSummary,
  hasRecentMessageForIntent,
  hasRecentMessageForChild,
};
