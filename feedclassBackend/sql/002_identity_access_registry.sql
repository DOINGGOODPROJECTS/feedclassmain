CREATE TABLE IF NOT EXISTS roles (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(64) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_school_id VARCHAR(64) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id CHAR(36) NOT NULL,
  role_id CHAR(36) NOT NULL,
  PRIMARY KEY (user_id, role_id),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles(id)
);

CREATE TABLE IF NOT EXISTS login_logs (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NULL,
  email VARCHAR(190) NULL,
  success BOOLEAN NOT NULL,
  reason VARCHAR(120) NULL,
  ip_address VARCHAR(120) NULL,
  user_agent VARCHAR(255) NULL,
  created_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id CHAR(36) PRIMARY KEY,
  actor_user_id CHAR(36) NOT NULL,
  target_user_id CHAR(36) NULL,
  action VARCHAR(120) NOT NULL,
  detail TEXT NULL,
  created_at DATETIME NOT NULL
);
