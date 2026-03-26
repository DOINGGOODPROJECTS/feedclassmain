const crypto = require("crypto");
const { getPool } = require("../db/pool");

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

async function listAll(filters = {}) {
  const pool = getPool();
  const values = [];
  const conditions = [];

  if (filters.schoolId) {
    conditions.push("c.school_id = ?");
    values.push(filters.schoolId);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [rows] = await pool.query(
    `SELECT pi.id,
            pi.child_id,
            pi.plan_id,
            sp.name AS plan_name,
            pi.amount,
            pi.reference,
            pi.status,
            pi.payment_url,
            pi.created_at,
            pi.updated_at
     FROM payment_intents pi
     INNER JOIN children c ON c.id = pi.child_id
     LEFT JOIN subscription_plans sp ON sp.id = pi.plan_id
     ${whereClause}
     ORDER BY pi.created_at DESC`,
    values
  );

  return rows;
}

async function getById(id) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT pi.id, pi.child_id, pi.plan_id, sp.name AS plan_name, pi.amount, pi.reference, pi.status, pi.payment_url, pi.created_at, pi.updated_at
     FROM payment_intents
     LEFT JOIN subscription_plans sp ON sp.id = payment_intents.plan_id
     WHERE payment_intents.id = ?
     LIMIT 1`,
    [id]
  );

  return rows[0] || null;
}

async function findPendingForChildPlan(childId, planId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT pi.id, pi.child_id, pi.plan_id, sp.name AS plan_name, pi.amount, pi.reference, pi.status, pi.payment_url, pi.created_at, pi.updated_at
     FROM payment_intents
     LEFT JOIN subscription_plans sp ON sp.id = payment_intents.plan_id
     WHERE payment_intents.child_id = ?
       AND payment_intents.plan_id = ?
       AND payment_intents.status = 'PENDING'
     ORDER BY payment_intents.created_at DESC
     LIMIT 1`,
    [childId, planId]
  );

  return rows[0] || null;
}

async function createPaymentIntentRecord(intent) {
  const pool = getPool();
  await pool.execute(
    `INSERT INTO payment_intents
      (id, child_id, plan_id, amount, reference, status, payment_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      intent.id || crypto.randomUUID(),
      intent.childId,
      intent.planId,
      intent.amount,
      intent.reference,
      intent.status || "PENDING",
      intent.paymentUrl,
      toMysqlDateTime(intent.createdAt || new Date()),
      toMysqlDateTime(intent.updatedAt || new Date()),
    ]
  );
}

async function updatePaymentIntentStatus(id, status) {
  const pool = getPool();
  await pool.execute(
    `UPDATE payment_intents
     SET status = ?,
         updated_at = NOW()
     WHERE id = ?`,
    [status, id]
  );
}

async function listPendingReminderCandidates() {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT pi.id,
            pi.child_id,
            pi.plan_id,
            sp.name AS plan_name,
            pi.amount,
            pi.reference,
            pi.status,
            pi.payment_url,
            pi.created_at,
            pi.updated_at,
            g.id AS guardian_id,
            g.name AS guardian_name,
            g.phone AS guardian_phone,
            g.notifications_opt_out,
            c.student_id,
            c.full_name
     FROM payment_intents pi
     INNER JOIN children c ON c.id = pi.child_id
     LEFT JOIN subscription_plans sp ON sp.id = pi.plan_id
     LEFT JOIN guardians g ON g.child_id = c.id
     WHERE pi.status = 'PENDING'
     ORDER BY pi.created_at ASC`
  );

  return rows;
}

module.exports = {
  listAll,
  getById,
  findPendingForChildPlan,
  createPaymentIntentRecord,
  updatePaymentIntentStatus,
  listPendingReminderCandidates,
};
