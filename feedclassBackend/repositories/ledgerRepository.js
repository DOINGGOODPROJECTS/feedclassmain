const { getPool } = require("../db/pool");

let ensuredLedgerSchemaPromise = null;

function isTriggerPrivilegeError(error) {
  const message = String(error?.message || "");
  return (
    message.includes("You do not have the SUPER privilege") ||
    message.includes("log_bin_trust_function_creators")
  );
}

async function ensureLedgerSchema() {
  const pool = getPool();

  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions (created_at)`
  ).catch(() => null);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_transactions_child_date ON transactions (child_id, created_at)`
  ).catch(() => null);

  try {
    await pool.query("DROP TRIGGER IF EXISTS trg_transactions_prevent_update");
    await pool.query("DROP TRIGGER IF EXISTS trg_transactions_prevent_delete");

    await pool.query(`
      CREATE TRIGGER trg_transactions_prevent_update
      BEFORE UPDATE ON transactions
      FOR EACH ROW
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'transactions ledger is append-only; updates are not allowed'
    `);

    await pool.query(`
      CREATE TRIGGER trg_transactions_prevent_delete
      BEFORE DELETE ON transactions
      FOR EACH ROW
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'transactions ledger is append-only; deletes are not allowed'
    `);
  } catch (error) {
    if (!isTriggerPrivilegeError(error)) {
      throw error;
    }

    console.warn(
      "Ledger trigger bootstrap skipped because the database user lacks trigger privileges. Append-only enforcement remains application-level until DB privileges are updated."
    );
  }
}

async function ensureLedgerSchemaReady() {
  if (!ensuredLedgerSchemaPromise) {
    ensuredLedgerSchemaPromise = ensureLedgerSchema().catch((error) => {
      ensuredLedgerSchemaPromise = null;
      throw error;
    });
  }

  await ensuredLedgerSchemaPromise;
}

function buildWhere(filters = {}) {
  const conditions = [];
  const values = [];

  if (filters.childId) {
    conditions.push("t.child_id = ?");
    values.push(filters.childId);
  }

  if (filters.schoolId) {
    conditions.push("c.school_id = ?");
    values.push(filters.schoolId);
  }

  if (filters.type) {
    conditions.push("t.type = ?");
    values.push(filters.type);
  }

  if (filters.dateFrom) {
    conditions.push("DATE(t.created_at) >= ?");
    values.push(filters.dateFrom);
  }

  if (filters.dateTo) {
    conditions.push("DATE(t.created_at) <= ?");
    values.push(filters.dateTo);
  }

  return {
    whereClause: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    values,
  };
}

async function listTransactions(filters = {}) {
  await ensureLedgerSchemaReady();
  const pool = getPool();
  const { whereClause, values } = buildWhere(filters);

  const [rows] = await pool.query(
    `SELECT
       t.id,
       t.child_id,
       c.student_id,
       c.full_name AS child_name,
       c.school_id,
       s.name AS school_name,
       c.class_id,
       cl.name AS class_name,
       t.payment_intent_id,
       t.type,
       t.amount,
       t.metadata_json,
       t.created_at
     FROM transactions t
     INNER JOIN children c ON c.id = t.child_id
     LEFT JOIN schools s ON s.id = c.school_id
     LEFT JOIN classes cl ON cl.id = c.class_id
     ${whereClause}
     ORDER BY t.created_at DESC`,
    values
  );

  return rows;
}

async function getAggregates(filters = {}) {
  await ensureLedgerSchemaReady();
  const pool = getPool();
  const { whereClause, values } = buildWhere(filters);

  const [rows] = await pool.query(
    `SELECT
       t.type,
       COUNT(*) AS total_count,
       COALESCE(SUM(t.amount), 0) AS total_amount
     FROM transactions t
     INNER JOIN children c ON c.id = t.child_id
     ${whereClause}
     GROUP BY t.type
     ORDER BY t.type ASC`,
    values
  );

  return rows;
}

module.exports = {
  ensureLedgerSchemaReady,
  listTransactions,
  getAggregates,
};
