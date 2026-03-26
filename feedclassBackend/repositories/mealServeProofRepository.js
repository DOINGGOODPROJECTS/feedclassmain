const { getPool } = require("../db/pool");

let ensuredSchemaPromise = null;

async function ensureMealServeProofSchema() {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS meal_serve_proofs (
      meal_serve_id CHAR(36) NOT NULL,
      batch_anchor_id BIGINT UNSIGNED DEFAULT NULL,
      school_id CHAR(36) NOT NULL,
      serve_date DATE NOT NULL,
      leaf_hash CHAR(66) NOT NULL,
      leaf_index INT UNSIGNED NOT NULL,
      merkle_proof_json JSON NOT NULL,
      batch_root CHAR(66) DEFAULT NULL,
      tx_hash CHAR(66) DEFAULT NULL,
      confirmation_status ENUM('UNANCHORED', 'PENDING', 'SUBMITTED', 'CONFIRMED', 'FAILED') NOT NULL DEFAULT 'UNANCHORED',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (meal_serve_id),
      KEY idx_meal_serve_proofs_batch_anchor_id (batch_anchor_id),
      KEY idx_meal_serve_proofs_school_date (school_id, serve_date),
      KEY idx_meal_serve_proofs_confirmation_status (confirmation_status),
      CONSTRAINT fk_meal_serve_proofs_meal_serve
        FOREIGN KEY (meal_serve_id) REFERENCES meal_serves(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
      CONSTRAINT fk_meal_serve_proofs_batch_anchor
        FOREIGN KEY (batch_anchor_id) REFERENCES meal_batch_anchors(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function ensureMealServeProofSchemaReady() {
  if (!ensuredSchemaPromise) {
    ensuredSchemaPromise = ensureMealServeProofSchema().catch((error) => {
      ensuredSchemaPromise = null;
      throw error;
    });
  }

  await ensuredSchemaPromise;
}

async function upsertProofs(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return;
  }

  await ensureMealServeProofSchemaReady();
  const pool = getPool();

  for (const record of records) {
    await pool.execute(
      `INSERT INTO meal_serve_proofs
        (meal_serve_id, batch_anchor_id, school_id, serve_date, leaf_hash, leaf_index, merkle_proof_json, batch_root, tx_hash, confirmation_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         batch_anchor_id = VALUES(batch_anchor_id),
         school_id = VALUES(school_id),
         serve_date = VALUES(serve_date),
         leaf_hash = VALUES(leaf_hash),
         leaf_index = VALUES(leaf_index),
         merkle_proof_json = VALUES(merkle_proof_json),
         batch_root = VALUES(batch_root),
         tx_hash = VALUES(tx_hash),
         confirmation_status = VALUES(confirmation_status),
         updated_at = CURRENT_TIMESTAMP`,
      [
        record.mealServeId,
        record.batchAnchorId || null,
        record.schoolId,
        record.serveDate,
        record.leafHash,
        record.leafIndex,
        JSON.stringify(record.merkleProof || []),
        record.batchRoot || null,
        record.txHash || null,
        record.confirmationStatus || "UNANCHORED",
      ]
    );
  }
}

async function findByMealServeId(mealServeId) {
  await ensureMealServeProofSchemaReady();
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT meal_serve_id,
            batch_anchor_id,
            school_id,
            serve_date,
            leaf_hash,
            leaf_index,
            merkle_proof_json,
            batch_root,
            tx_hash,
            confirmation_status,
            created_at,
            updated_at
     FROM meal_serve_proofs
     WHERE meal_serve_id = ?
     LIMIT 1`,
    [mealServeId]
  );

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    ...row,
    merkle_proof: typeof row.merkle_proof_json === "string" ? JSON.parse(row.merkle_proof_json) : row.merkle_proof_json,
  };
}

module.exports = {
  ensureMealServeProofSchema,
  upsertProofs,
  findByMealServeId,
};
