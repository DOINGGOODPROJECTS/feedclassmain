const crypto = require("crypto");
const { getPool } = require("../db/pool");

let ensuredSchemaPromise = null;
let cachedHasDueDateColumn = null;

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

function toMysqlDate(value) {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

async function ensureSchema() {
  const pool = getPool();
  await pool.query(
    `ALTER TABLE supplier_invoices
     ADD COLUMN IF NOT EXISTS due_date DATE NULL AFTER amount`
  ).catch(() => null);
}

async function hasDueDateColumn() {
  if (cachedHasDueDateColumn !== null) {
    return cachedHasDueDateColumn;
  }

  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'supplier_invoices'
       AND column_name = 'due_date'
     LIMIT 1`
  );

  cachedHasDueDateColumn = rows.length > 0;
  return cachedHasDueDateColumn;
}

async function ensureSchemaReady() {
  if (!ensuredSchemaPromise) {
    ensuredSchemaPromise = ensureSchema().catch((error) => {
      ensuredSchemaPromise = null;
      throw error;
    });
  }
  await ensuredSchemaPromise;
}

async function listAll(filters = {}) {
  await ensureSchemaReady();
  const pool = getPool();
  const dueDateExists = await hasDueDateColumn();
  const values = [];
  const conditions = [];

  if (filters.schoolId) {
    conditions.push("si.school_id = ?");
    values.push(filters.schoolId);
  }
  if (filters.month) {
    conditions.push("si.month = ?");
    values.push(filters.month);
  }
  if (filters.status) {
    conditions.push("si.status = ?");
    values.push(filters.status);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [rows] = await pool.query(
    `SELECT si.id,
            si.supplier_id,
            s.name AS supplier_name,
            si.school_id,
            sch.name AS school_name,
            si.month,
            si.amount,
            ${dueDateExists ? "si.due_date" : "NULL AS due_date"},
            si.status,
            si.created_at,
            si.updated_at,
            COALESCE(SUM(sp.amount), 0) AS paid_amount,
            MAX(sp.paid_at) AS last_paid_at
     FROM supplier_invoices si
     INNER JOIN suppliers s ON s.id = si.supplier_id
     INNER JOIN schools sch ON sch.id = si.school_id
     LEFT JOIN supplier_payments sp ON sp.invoice_id = si.id
     ${whereClause}
     GROUP BY si.id, s.name, sch.name
     ORDER BY si.month DESC, si.created_at DESC`,
    values
  );

  return rows;
}

async function getById(id) {
  const rows = await listAll();
  return rows.find((row) => row.id === id) || null;
}

async function create(record) {
  await ensureSchemaReady();
  const pool = getPool();
  const dueDateExists = await hasDueDateColumn();
  const id = record.id || crypto.randomUUID();
  if (dueDateExists) {
    await pool.execute(
      `INSERT INTO supplier_invoices
        (id, supplier_id, school_id, month, amount, due_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, record.supplierId, record.schoolId, record.month, record.amount, toMysqlDate(record.dueDate), record.status]
    );
  } else {
    await pool.execute(
      `INSERT INTO supplier_invoices
        (id, supplier_id, school_id, month, amount, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, record.supplierId, record.schoolId, record.month, record.amount, record.status]
    );
  }

  return getById(id);
}

async function markPaid(invoiceId, payment = {}) {
  await ensureSchemaReady();
  const pool = getPool();
  const existing = await getById(invoiceId);
  if (!existing) {
    return null;
  }

  const paymentId = crypto.randomUUID();
  const amount = Number(payment.amount ?? existing.amount);
  const paidAt = payment.paidAt || new Date();
  await pool.execute(
    `INSERT INTO supplier_payments
      (id, supplier_id, invoice_id, amount, paid_at)
     VALUES (?, ?, ?, ?, ?)`,
    [paymentId, existing.supplier_id, invoiceId, amount, toMysqlDateTime(paidAt)]
  );

  await pool.execute(
    `UPDATE supplier_invoices
     SET status = 'PAID', updated_at = NOW()
     WHERE id = ?`,
    [invoiceId]
  );

  return getById(invoiceId);
}

async function getCostPerMeal({ schoolId, month }) {
  await ensureSchemaReady();
  const pool = getPool();
  const invoiceParams = [];
  const invoiceFilters = [];
  const mealParams = [];
  const mealFilters = [];

  if (schoolId) {
    invoiceFilters.push("school_id = ?");
    invoiceParams.push(schoolId);
    mealFilters.push("school_id = ?");
    mealParams.push(schoolId);
  }
  if (month) {
    invoiceFilters.push("month = ?");
    invoiceParams.push(month);
    mealFilters.push("DATE_FORMAT(serve_date, '%Y-%m') = ?");
    mealParams.push(month);
  }

  const [invoiceRows] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM supplier_invoices
     ${invoiceFilters.length ? `WHERE ${invoiceFilters.join(" AND ")}` : ""}`,
    invoiceParams
  );

  const [mealRows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM meal_serves
     ${mealFilters.length ? `WHERE ${mealFilters.join(" AND ")}` : ""}`,
    mealParams
  );

  const supplierCost = Number(invoiceRows[0]?.total || 0);
  const mealsServed = Number(mealRows[0]?.total || 0);
  return {
    supplierCost,
    mealsServed,
    costPerMeal: mealsServed > 0 ? supplierCost / mealsServed : 0,
  };
}

module.exports = {
  ensureSchemaReady,
  listAll,
  getById,
  create,
  markPaid,
  getCostPerMeal,
};
