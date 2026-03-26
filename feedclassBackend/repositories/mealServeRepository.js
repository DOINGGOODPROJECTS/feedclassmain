const { getPool } = require("../db/pool");

async function listForBatch({ schoolId, serveDate }) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT id, child_id, school_id, meal_type, serve_date, created_at, is_grace, meal_scan_id
     FROM meal_serves
     WHERE school_id = ? AND serve_date = ?
     ORDER BY created_at ASC, id ASC`,
    [schoolId, serveDate]
  );

  return rows;
}

async function findById(id) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT id, child_id, school_id, meal_type, serve_date, created_at, is_grace, meal_scan_id
     FROM meal_serves
     WHERE id = ?
     LIMIT 1`,
    [id]
  );

  return rows[0] || null;
}

module.exports = {
  listForBatch,
  findById,
};
