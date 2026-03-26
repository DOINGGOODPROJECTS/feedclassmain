const { getPool } = require("../db/pool");

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

async function listAll() {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, name, meal_type, meals_per_cycle, price, active, effective_start_date, effective_end_date, created_at, updated_at
     FROM subscription_plans
     ORDER BY created_at DESC`
  );

  return rows;
}

async function getById(id) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT id, name, meal_type, meals_per_cycle, price, active, effective_start_date, effective_end_date, created_at, updated_at
     FROM subscription_plans
     WHERE id = ?
     LIMIT 1`,
    [id]
  );

  return rows[0] || null;
}

async function createPlanRecord(plan) {
  const pool = getPool();
  await pool.execute(
    `INSERT INTO subscription_plans
      (id, name, meal_type, meals_per_cycle, price, active, effective_start_date, effective_end_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      plan.id,
      plan.name,
      plan.mealType,
      plan.mealsPerCycle,
      plan.price,
      plan.active,
      toMysqlDate(plan.effectiveStartDate),
      toMysqlDate(plan.effectiveEndDate),
      toMysqlDateTime(plan.createdAt),
      toMysqlDateTime(plan.updatedAt),
    ]
  );
}

async function updatePlanRecord(plan) {
  const pool = getPool();
  await pool.execute(
    `UPDATE subscription_plans
     SET name = ?,
         meal_type = ?,
         meals_per_cycle = ?,
         price = ?,
         active = ?,
         effective_start_date = ?,
         effective_end_date = ?,
         updated_at = ?
     WHERE id = ?`,
    [
      plan.name,
      plan.mealType,
      plan.mealsPerCycle,
      plan.price,
      plan.active,
      toMysqlDate(plan.effectiveStartDate),
      toMysqlDate(plan.effectiveEndDate),
      toMysqlDateTime(plan.updatedAt),
      plan.id,
    ]
  );
}

async function deletePlanRecord(id) {
  const pool = getPool();
  const [result] = await pool.execute(
    `DELETE FROM subscription_plans
     WHERE id = ?`,
    [id]
  );

  return result.affectedRows > 0;
}

module.exports = {
  getById,
  listAll,
  createPlanRecord,
  updatePlanRecord,
  deletePlanRecord,
};
