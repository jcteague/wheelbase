ALTER TABLE alerts
  ADD COLUMN dismissed_at TEXT;

-- At most one currently-DISMISSED alert per (position, rule); historical
-- dismissed rows that have since resolved are allowed (audit trail).
CREATE UNIQUE INDEX idx_alerts_dismissed_unique
  ON alerts (position_id, rule_code) WHERE status = 'dismissed';
