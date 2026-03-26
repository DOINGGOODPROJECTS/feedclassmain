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

async function listAll({ schoolId } = {}) {
  const pool = getPool();
  const params = [];
  const filters = [];

  if (schoolId) {
    filters.push("school_id = ?");
    params.push(schoolId);
  }

  const [rows] = await pool.execute(
    `SELECT id, school_id, name, grade, active, created_at, updated_at
     FROM classes
     ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
     ORDER BY name ASC`,
    params
  );

  return rows;
}

async function createClassRecord(entry) {
  const pool = getPool();
  await pool.execute(
    `INSERT INTO classes
      (id, school_id, name, grade, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.id,
      entry.schoolId,
      entry.name,
      entry.grade || null,
      entry.active,
      toMysqlDateTime(entry.createdAt),
      toMysqlDateTime(entry.updatedAt),
    ]
  );
}

async function updateClassRecord(entry) {
  const pool = getPool();
  await pool.execute(
    `UPDATE classes
     SET name = ?, grade = ?, active = ?, updated_at = ?
     WHERE id = ?`,
    [entry.name, entry.grade || null, entry.active, toMysqlDateTime(entry.updatedAt), entry.id]
  );
}

module.exports = {
  listAll,
  createClassRecord,
  updateClassRecord,
};
