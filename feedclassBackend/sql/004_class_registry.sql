CREATE TABLE IF NOT EXISTS classes (
  id CHAR(36) PRIMARY KEY,
  school_id CHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_classes_school FOREIGN KEY (school_id) REFERENCES schools(id),
  CONSTRAINT uq_classes_school_name UNIQUE (school_id, name)
);
