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
);
