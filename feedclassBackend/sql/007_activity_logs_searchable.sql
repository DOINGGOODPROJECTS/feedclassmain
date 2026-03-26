ALTER TABLE activity_logs
  ADD COLUMN IF NOT EXISTS entity_type VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS entity_id CHAR(36) NULL,
  ADD COLUMN IF NOT EXISTS before_json JSON NULL,
  ADD COLUMN IF NOT EXISTS after_json JSON NULL,
  ADD COLUMN IF NOT EXISTS metadata_json JSON NULL;

CREATE INDEX IF NOT EXISTS idx_activity_logs_actor_user_id ON activity_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity_type ON activity_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at);
