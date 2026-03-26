const crypto = require("crypto");
const { getPool } = require("../db/pool");

async function listAll() {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, name, contact, active, created_at, updated_at
     FROM suppliers
     ORDER BY name ASC`
  );

  return rows;
}

async function getById(id) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT id, name, contact, active, created_at, updated_at
     FROM suppliers
     WHERE id = ?
     LIMIT 1`,
    [id]
  );

  return rows[0] || null;
}

async function create(record) {
  const pool = getPool();
  const id = record.id || crypto.randomUUID();

  await pool.execute(
    `INSERT INTO suppliers
      (id, name, contact, active)
     VALUES (?, ?, ?, ?)`,
    [id, record.name, record.contact, record.active]
  );

  return getById(id);
}

async function update(id, updates) {
  const pool = getPool();
  await pool.execute(
    `UPDATE suppliers
     SET name = ?, contact = ?, active = ?, updated_at = NOW()
     WHERE id = ?`,
    [updates.name, updates.contact, updates.active, id]
  );

  return getById(id);
}

module.exports = {
  listAll,
  getById,
  create,
  update,
};
