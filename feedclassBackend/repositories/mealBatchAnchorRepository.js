const { getPool } = require("../db/pool");

async function createPendingAnchor(input) {
  const pool = getPool();
  const [result] = await pool.execute(
    `INSERT INTO meal_batch_anchors
      (school_id, serve_date, batch_version, meal_count, merkle_root, network, contract_address, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
    [
      input.schoolId,
      input.serveDate,
      input.batchVersion || 1,
      input.mealCount,
      input.merkleRoot,
      input.network,
      input.contractAddress,
    ]
  );

  return findById(result.insertId);
}

async function markSubmitted(id, txHash) {
  const pool = getPool();
  await pool.execute(
    `UPDATE meal_batch_anchors
     SET tx_hash = ?, status = 'SUBMITTED', updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [txHash, id]
  );
  return findById(id);
}

async function markConfirmed(id, blockNumber, confirmedAt = new Date()) {
  const pool = getPool();
  await pool.execute(
    `UPDATE meal_batch_anchors
     SET block_number = ?, status = 'CONFIRMED', confirmed_at = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [blockNumber, confirmedAt, id]
  );
  return findById(id);
}

async function markFailed(id, failureReason) {
  const pool = getPool();
  await pool.execute(
    `UPDATE meal_batch_anchors
     SET status = 'FAILED', failure_reason = ?, retry_count = retry_count + 1, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [failureReason, id]
  );
  return findById(id);
}

async function findByUniqueBatch({ schoolId, serveDate, batchVersion = 1 }) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT *
     FROM meal_batch_anchors
     WHERE school_id = ? AND serve_date = ? AND batch_version = ?
     LIMIT 1`,
    [schoolId, serveDate, batchVersion]
  );

  return rows[0] || null;
}

async function findLatestForBatch({ schoolId, serveDate }) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT *
     FROM meal_batch_anchors
     WHERE school_id = ? AND serve_date = ?
     ORDER BY batch_version DESC, id DESC
     LIMIT 1`,
    [schoolId, serveDate]
  );

  return rows[0] || null;
}

async function findById(id) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT *
     FROM meal_batch_anchors
     WHERE id = ?
     LIMIT 1`,
    [id]
  );

  return rows[0] || null;
}

module.exports = {
  createPendingAnchor,
  markSubmitted,
  markConfirmed,
  markFailed,
  findByUniqueBatch,
  findLatestForBatch,
  findById,
};
