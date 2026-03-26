CREATE TABLE IF NOT EXISTS child_qr (
  child_id CHAR(36) PRIMARY KEY,
  qr_payload VARCHAR(190) NOT NULL UNIQUE,
  qr_image_url TEXT NULL,
  created_at DATETIME NOT NULL
);
