CREATE INDEX IF NOT EXISTS weight_logs_user_logged_at_idx ON weight_logs(user_id, logged_at DESC);
