-- Consolidated FeedClass MySQL schema.
-- This file is intended for clean environment bootstrap and combines:
-- 1. Existing backend SQL migrations
-- 2. Runtime entities currently modeled only in memory
-- 3. Additional product entities used by the frontend mock domain
-- 4. The standalone QR scanner API badge lookup table

CREATE TABLE IF NOT EXISTS roles (
  id CHAR(36) NOT NULL,
  name VARCHAR(64) NOT NULL,
  permissions_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS schools (
  id CHAR(36) NOT NULL,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(160) NOT NULL,
  location VARCHAR(190) NULL,
  address TEXT NOT NULL,
  contact_name VARCHAR(120) NULL,
  contact_email VARCHAR(190) NULL,
  contact_phone VARCHAR(64) NULL,
  timezone VARCHAR(64) NOT NULL,
  messaging_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_schools_code (code),
  KEY idx_schools_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_school_id CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_assigned_school_id (assigned_school_id),
  CONSTRAINT fk_users_assigned_school
    FOREIGN KEY (assigned_school_id) REFERENCES schools(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_roles (
  user_id CHAR(36) NOT NULL,
  role_id CHAR(36) NOT NULL,
  PRIMARY KEY (user_id, role_id),
  KEY idx_user_roles_role_id (role_id),
  CONSTRAINT fk_user_roles_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_user_roles_role
    FOREIGN KEY (role_id) REFERENCES roles(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  refresh_token_hash CHAR(64) NOT NULL,
  user_agent VARCHAR(255) NULL,
  ip_address VARCHAR(120) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  last_rotated_at DATETIME NULL,
  revoked_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sessions_refresh_token_hash (refresh_token_hash),
  KEY idx_sessions_user_id (user_id),
  KEY idx_sessions_expires_at (expires_at),
  CONSTRAINT fk_sessions_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS school_staff (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NULL,
  school_id CHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  role VARCHAR(64) NOT NULL,
  access_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_school_staff_email (email),
  UNIQUE KEY uq_school_staff_user_id (user_id),
  KEY idx_school_staff_school_id (school_id),
  CONSTRAINT fk_school_staff_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT fk_school_staff_school
    FOREIGN KEY (school_id) REFERENCES schools(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS classes (
  id CHAR(36) NOT NULL,
  school_id CHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  grade VARCHAR(64) NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_classes_school_name (school_id, name),
  KEY idx_classes_school_id (school_id),
  CONSTRAINT fk_classes_school
    FOREIGN KEY (school_id) REFERENCES schools(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS children (
  id CHAR(36) NOT NULL,
  school_id CHAR(36) NOT NULL,
  class_id CHAR(36) NOT NULL,
  student_id VARCHAR(64) NOT NULL,
  full_name VARCHAR(160) NOT NULL,
  profile_image_url LONGTEXT NULL,
  subscription_status ENUM('ACTIVE', 'EXPIRED', 'CANCELLED', 'PAUSED', 'NONE', 'GRACE_PERIOD') NOT NULL DEFAULT 'NONE',
  grace_period_ends_at DATETIME NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_children_student_id (student_id),
  KEY idx_children_school_id (school_id),
  KEY idx_children_class_id (class_id),
  KEY idx_children_subscription_status (subscription_status),
  CONSTRAINT fk_children_school
    FOREIGN KEY (school_id) REFERENCES schools(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_children_class
    FOREIGN KEY (class_id) REFERENCES classes(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS guardians (
  id CHAR(36) NOT NULL,
  child_id CHAR(36) NOT NULL,
  name VARCHAR(160) NOT NULL,
  phone VARCHAR(60) NOT NULL,
  preferred_channel ENUM('SMS', 'WHATSAPP', 'EMAIL') NOT NULL DEFAULT 'SMS',
  notifications_opt_out BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_guardians_child_id (child_id),
  KEY idx_guardians_phone (phone),
  CONSTRAINT fk_guardians_child
    FOREIGN KEY (child_id) REFERENCES children(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS child_qr (
  child_id CHAR(36) NOT NULL,
  qr_payload VARCHAR(190) NOT NULL,
  qr_image_url TEXT NULL,
  verification_link TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (child_id),
  UNIQUE KEY uq_child_qr_payload (qr_payload),
  CONSTRAINT fk_child_qr_child
    FOREIGN KEY (child_id) REFERENCES children(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS enrollment_history (
  id CHAR(36) NOT NULL,
  child_id CHAR(36) NOT NULL,
  school_id CHAR(36) NOT NULL,
  class_id CHAR(36) NOT NULL,
  change_type VARCHAR(40) NOT NULL,
  actor_user_id CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_enrollment_history_child_id (child_id),
  KEY idx_enrollment_history_school_id (school_id),
  KEY idx_enrollment_history_class_id (class_id),
  KEY idx_enrollment_history_actor_user_id (actor_user_id),
  CONSTRAINT fk_enrollment_history_child
    FOREIGN KEY (child_id) REFERENCES children(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_enrollment_history_school
    FOREIGN KEY (school_id) REFERENCES schools(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_enrollment_history_class
    FOREIGN KEY (class_id) REFERENCES classes(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_enrollment_history_actor_user
    FOREIGN KEY (actor_user_id) REFERENCES users(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS child_import_reports (
  id CHAR(36) NOT NULL,
  status VARCHAR(40) NOT NULL,
  processed_count INT NOT NULL DEFAULT 0,
  created_count INT NOT NULL DEFAULT 0,
  updated_count INT NOT NULL DEFAULT 0,
  rejected_count INT NOT NULL DEFAULT 0,
  report_json JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_child_import_reports_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subscription_plans (
  id CHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  meal_type ENUM('BREAKFAST', 'LUNCH', 'DINNER') NOT NULL,
  meals_per_cycle INT NOT NULL,
  price DECIMAL(12, 2) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  effective_start_date DATE NULL,
  effective_end_date DATE NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_subscription_plans_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS child_subscriptions (
  child_id CHAR(36) NOT NULL,
  plan_id CHAR(36) NOT NULL,
  status ENUM('ACTIVE', 'EXPIRED', 'CANCELLED', 'PAUSED', 'NONE', 'GRACE_PERIOD') NOT NULL DEFAULT 'NONE',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  meals_remaining INT NOT NULL DEFAULT 0,
  meal_type ENUM('BREAKFAST', 'LUNCH', 'DINNER') NOT NULL DEFAULT 'LUNCH',
  cancelled_at DATETIME NULL,
  cancellation_reason VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (child_id),
  KEY idx_child_subscriptions_plan_id (plan_id),
  KEY idx_child_subscriptions_status (status),
  CONSTRAINT fk_child_subscriptions_child
    FOREIGN KEY (child_id) REFERENCES children(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_child_subscriptions_plan
    FOREIGN KEY (plan_id) REFERENCES subscription_plans(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS grace_periods (
  child_id CHAR(36) NOT NULL,
  start_date DATE NOT NULL,
  days_used INT NOT NULL DEFAULT 0,
  last_served_date DATE NULL,
  notified BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (child_id),
  CONSTRAINT fk_grace_periods_child
    FOREIGN KEY (child_id) REFERENCES children(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_intents (
  id CHAR(36) NOT NULL,
  child_id CHAR(36) NOT NULL,
  plan_id CHAR(36) NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  reference VARCHAR(80) NOT NULL,
  status ENUM('PENDING', 'PAID', 'FAILED') NOT NULL DEFAULT 'PENDING',
  payment_url TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_intents_reference (reference),
  KEY idx_payment_intents_child_id (child_id),
  KEY idx_payment_intents_plan_id (plan_id),
  KEY idx_payment_intents_status (status),
  CONSTRAINT fk_payment_intents_child
    FOREIGN KEY (child_id) REFERENCES children(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_payment_intents_plan
    FOREIGN KEY (plan_id) REFERENCES subscription_plans(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_events (
  id CHAR(36) NOT NULL,
  external_tx_id VARCHAR(120) NOT NULL,
  intent_id CHAR(36) NOT NULL,
  status ENUM('PENDING', 'PAID', 'FAILED') NOT NULL,
  payload_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_events_external_tx_id (external_tx_id),
  KEY idx_payment_events_intent_id (intent_id),
  CONSTRAINT fk_payment_events_intent
    FOREIGN KEY (intent_id) REFERENCES payment_intents(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS transactions (
  id CHAR(36) NOT NULL,
  child_id CHAR(36) NOT NULL,
  payment_intent_id CHAR(36) NULL,
  type ENUM('SUBSCRIPTION_PURCHASE', 'DEBIT_MEAL', 'GRACE_MEAL', 'ADJUSTMENT') NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  metadata_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_transactions_child_id (child_id),
  KEY idx_transactions_payment_intent_id (payment_intent_id),
  KEY idx_transactions_type (type),
  CONSTRAINT fk_transactions_child
    FOREIGN KEY (child_id) REFERENCES children(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_transactions_payment_intent
    FOREIGN KEY (payment_intent_id) REFERENCES payment_intents(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS meal_scans (
  id CHAR(36) NOT NULL,
  child_id CHAR(36) NOT NULL,
  school_id CHAR(36) NOT NULL,
  class_id CHAR(36) NOT NULL,
  operator_user_id CHAR(36) NOT NULL,
  qr_payload VARCHAR(190) NOT NULL,
  meal_type ENUM('BREAKFAST', 'LUNCH', 'DINNER') NOT NULL DEFAULT 'LUNCH',
  service_date DATE NOT NULL,
  served_at DATETIME NOT NULL,
  outcome ENUM('APPROVED', 'BLOCKED', 'DUPLICATE') NOT NULL,
  reason VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_meal_scans_child_id (child_id),
  KEY idx_meal_scans_school_id (school_id),
  KEY idx_meal_scans_operator_user_id (operator_user_id),
  KEY idx_meal_scans_service_date (service_date),
  KEY idx_meal_scans_outcome (outcome),
  CONSTRAINT fk_meal_scans_child
    FOREIGN KEY (child_id) REFERENCES children(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_meal_scans_school
    FOREIGN KEY (school_id) REFERENCES schools(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_meal_scans_class
    FOREIGN KEY (class_id) REFERENCES classes(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_meal_scans_operator_user
    FOREIGN KEY (operator_user_id) REFERENCES users(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS meal_serves (
  id CHAR(36) NOT NULL,
  child_id CHAR(36) NOT NULL,
  school_id CHAR(36) NOT NULL,
  meal_type ENUM('BREAKFAST', 'LUNCH', 'DINNER') NOT NULL,
  serve_date DATE NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_grace BOOLEAN NOT NULL DEFAULT FALSE,
  meal_scan_id CHAR(36) NULL,
  PRIMARY KEY (id),
  KEY idx_meal_serves_child_id (child_id),
  KEY idx_meal_serves_school_id (school_id),
  KEY idx_meal_serves_serve_date (serve_date),
  UNIQUE KEY uq_meal_serves_scan_id (meal_scan_id),
  CONSTRAINT fk_meal_serves_child
    FOREIGN KEY (child_id) REFERENCES children(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_meal_serves_school
    FOREIGN KEY (school_id) REFERENCES schools(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_meal_serves_scan
    FOREIGN KEY (meal_scan_id) REFERENCES meal_scans(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS validation_logs (
  id CHAR(36) NOT NULL,
  child_id CHAR(36) NULL,
  school_id CHAR(36) NOT NULL,
  qr_payload VARCHAR(190) NOT NULL,
  result ENUM('SUCCESS', 'FAILED') NOT NULL,
  reason_code ENUM(
    'NO_SUBSCRIPTION',
    'EXPIRED',
    'ALREADY_SERVED',
    'WRONG_SCHOOL',
    'INACTIVE_CHILD',
    'INSUFFICIENT_MEALS',
    'GRACE_EXPIRED',
    'OK'
  ) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_validation_logs_child_id (child_id),
  KEY idx_validation_logs_school_id (school_id),
  KEY idx_validation_logs_created_at (created_at),
  CONSTRAINT fk_validation_logs_child
    FOREIGN KEY (child_id) REFERENCES children(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT fk_validation_logs_school
    FOREIGN KEY (school_id) REFERENCES schools(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS login_logs (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NULL,
  email VARCHAR(190) NULL,
  success BOOLEAN NOT NULL,
  reason VARCHAR(120) NULL,
  ip_address VARCHAR(120) NULL,
  user_agent VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_login_logs_user_id (user_id),
  KEY idx_login_logs_created_at (created_at),
  CONSTRAINT fk_login_logs_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS activity_logs (
  id CHAR(36) NOT NULL,
  actor_user_id CHAR(36) NULL,
  target_user_id CHAR(36) NULL,
  entity_type VARCHAR(120) NULL,
  entity_id CHAR(36) NULL,
  action VARCHAR(120) NULL,
  detail TEXT NULL,
  type VARCHAR(120) NULL,
  message TEXT NULL,
  before_json JSON NULL,
  after_json JSON NULL,
  metadata_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_activity_logs_actor_user_id (actor_user_id),
  KEY idx_activity_logs_target_user_id (target_user_id),
  KEY idx_activity_logs_entity_type (entity_type),
  KEY idx_activity_logs_entity_id (entity_id),
  KEY idx_activity_logs_created_at (created_at),
  CONSTRAINT fk_activity_logs_actor_user
    FOREIGN KEY (actor_user_id) REFERENCES users(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT fk_activity_logs_target_user
    FOREIGN KEY (target_user_id) REFERENCES users(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS message_outbox (
  id CHAR(36) NOT NULL,
  child_id CHAR(36) NULL,
  guardian_id CHAR(36) NULL,
  message_type VARCHAR(120) NOT NULL DEFAULT 'GENERIC',
  channel ENUM('SMS', 'WHATSAPP', 'EMAIL') NOT NULL,
  fallback_channel ENUM('SMS', 'WHATSAPP', 'EMAIL') NULL,
  recipient VARCHAR(190) NOT NULL,
  status ENUM('PENDING', 'PROCESSING', 'RETRY', 'SENT', 'FAILED') NOT NULL DEFAULT 'PENDING',
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_attempted_at DATETIME NULL,
  last_error TEXT NULL,
  payload TEXT NOT NULL,
  metadata_json JSON NULL,
  provider_reference VARCHAR(120) NULL,
  provider_channel ENUM('SMS', 'WHATSAPP', 'EMAIL') NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_message_outbox_child_id (child_id),
  KEY idx_message_outbox_guardian_id (guardian_id),
  KEY idx_message_outbox_status (status),
  KEY idx_message_outbox_message_type (message_type),
  KEY idx_message_outbox_next_attempt_at (next_attempt_at),
  CONSTRAINT fk_message_outbox_child
    FOREIGN KEY (child_id) REFERENCES children(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT fk_message_outbox_guardian
    FOREIGN KEY (guardian_id) REFERENCES guardians(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS message_logs (
  id CHAR(36) NOT NULL,
  outbox_id CHAR(36) NULL,
  status ENUM('QUEUED', 'PROCESSING', 'RETRY', 'SENT', 'FAILED') NOT NULL,
  channel ENUM('SMS', 'WHATSAPP', 'EMAIL') NULL,
  provider_reference VARCHAR(120) NULL,
  detail TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_message_logs_outbox_id (outbox_id),
  KEY idx_message_logs_created_at (created_at),
  CONSTRAINT fk_message_logs_outbox
    FOREIGN KEY (outbox_id) REFERENCES message_outbox(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS suppliers (
  id CHAR(36) NOT NULL,
  name VARCHAR(160) NOT NULL,
  contact VARCHAR(160) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_suppliers_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS supplier_invoices (
  id CHAR(36) NOT NULL,
  supplier_id CHAR(36) NOT NULL,
  school_id CHAR(36) NOT NULL,
  month CHAR(7) NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  status ENUM('PAID', 'DUE') NOT NULL DEFAULT 'DUE',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_supplier_invoices_supplier_school_month (supplier_id, school_id, month),
  KEY idx_supplier_invoices_school_id (school_id),
  KEY idx_supplier_invoices_status (status),
  CONSTRAINT fk_supplier_invoices_supplier
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_supplier_invoices_school
    FOREIGN KEY (school_id) REFERENCES schools(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS supplier_payments (
  id CHAR(36) NOT NULL,
  supplier_id CHAR(36) NOT NULL,
  invoice_id CHAR(36) NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  paid_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_supplier_payments_supplier_id (supplier_id),
  KEY idx_supplier_payments_invoice_id (invoice_id),
  CONSTRAINT fk_supplier_payments_supplier
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_supplier_payments_invoice
    FOREIGN KEY (invoice_id) REFERENCES supplier_invoices(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS anomaly_alerts (
  id CHAR(36) NOT NULL,
  severity ENUM('LOW', 'MEDIUM', 'HIGH') NOT NULL,
  message TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_anomaly_alerts_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_reports (
  id CHAR(36) NOT NULL,
  title VARCHAR(190) NOT NULL,
  summary TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ai_reports_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS meal_batch_anchors (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id CHAR(36) NOT NULL,
  serve_date DATE NOT NULL,
  batch_version INT UNSIGNED NOT NULL DEFAULT 1,
  meal_count INT UNSIGNED NOT NULL,
  merkle_root CHAR(66) NOT NULL,
  tx_hash CHAR(66) DEFAULT NULL,
  block_number BIGINT UNSIGNED DEFAULT NULL,
  network VARCHAR(64) NOT NULL,
  contract_address CHAR(42) NOT NULL,
  status ENUM('PENDING', 'SUBMITTED', 'CONFIRMED', 'FAILED') NOT NULL DEFAULT 'PENDING',
  failure_reason TEXT DEFAULT NULL,
  retry_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  confirmed_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_meal_batch_anchor (school_id, serve_date, batch_version),
  KEY idx_meal_batch_anchor_status (status),
  KEY idx_meal_batch_anchor_date (serve_date),
  CONSTRAINT fk_meal_batch_anchors_school
    FOREIGN KEY (school_id) REFERENCES schools(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS badges (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  qr_code VARCHAR(190) NOT NULL,
  name VARCHAR(160) NOT NULL,
  status VARCHAR(40) NOT NULL,
  role VARCHAR(64) NULL,
  child_id CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_badges_qr_code (qr_code),
  KEY idx_badges_child_id (child_id),
  CONSTRAINT fk_badges_child
    FOREIGN KEY (child_id) REFERENCES children(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
