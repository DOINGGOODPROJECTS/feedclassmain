CREATE TABLE IF NOT EXISTS guardians (
  id CHAR(36) PRIMARY KEY,
  child_id CHAR(36) NOT NULL,
  name VARCHAR(160) NOT NULL,
  phone VARCHAR(60) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT uq_guardians_child UNIQUE (child_id)
);

CREATE TABLE IF NOT EXISTS enrollment_history (
  id CHAR(36) PRIMARY KEY,
  child_id CHAR(36) NOT NULL,
  school_id CHAR(36) NOT NULL,
  class_id CHAR(36) NOT NULL,
  change_type VARCHAR(40) NOT NULL,
  actor_user_id CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS child_import_reports (
  id CHAR(36) PRIMARY KEY,
  status VARCHAR(40) NOT NULL,
  processed_count INT NOT NULL,
  created_count INT NOT NULL,
  updated_count INT NOT NULL,
  rejected_count INT NOT NULL,
  report_json JSON NOT NULL,
  created_at DATETIME NOT NULL
);
