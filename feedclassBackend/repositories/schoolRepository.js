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

async function listAll() {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, code, name, address, contact_name, contact_email, contact_phone, timezone, messaging_enabled, active, deleted_at, created_at, updated_at
     FROM schools
     WHERE deleted_at IS NULL
     ORDER BY name ASC`
  );

  return rows;
}

async function createSchoolRecord(school) {
  const pool = getPool();
  await pool.execute(
    `INSERT INTO schools
      (id, code, name, address, contact_name, contact_email, contact_phone, timezone, messaging_enabled, active, deleted_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      school.id,
      school.code,
      school.name,
      school.address,
      school.contactName || null,
      school.contactEmail || null,
      school.contactPhone || null,
      school.timezone,
      school.messagingEnabled !== false,
      school.active,
      toMysqlDateTime(school.deletedAt),
      toMysqlDateTime(school.createdAt),
      toMysqlDateTime(school.updatedAt),
    ]
  );
}

async function updateSchoolRecord(school) {
  const pool = getPool();
  await pool.execute(
    `UPDATE schools
     SET code = ?,
         name = ?,
         address = ?,
         contact_name = ?,
         contact_email = ?,
         contact_phone = ?,
         timezone = ?,
         messaging_enabled = ?,
         active = ?,
         deleted_at = ?,
         updated_at = ?
     WHERE id = ?`,
    [
      school.code,
      school.name,
      school.address,
      school.contactName || null,
      school.contactEmail || null,
      school.contactPhone || null,
      school.timezone,
      school.messagingEnabled !== false,
      school.active,
      toMysqlDateTime(school.deletedAt),
      toMysqlDateTime(school.updatedAt),
      school.id,
    ]
  );
}

module.exports = {
  listAll,
  createSchoolRecord,
  updateSchoolRecord,
};
