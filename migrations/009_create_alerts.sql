CREATE TABLE alerts (
  id                TEXT PRIMARY KEY,
  position_id       TEXT NOT NULL REFERENCES positions(id),
  rule_code         TEXT NOT NULL,
  urgency           TEXT NOT NULL,
  summary           TEXT NOT NULL,
  quick_action      TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'open',
  triggered_at      TEXT NOT NULL,
  last_evaluated_at TEXT NOT NULL,
  resolved_at       TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

-- At most one OPEN alert per (position, rule); historical resolved/dismissed
-- rows for the same pair are allowed (audit trail + re-firing after resolve).
CREATE UNIQUE INDEX idx_alerts_open_unique
  ON alerts (position_id, rule_code) WHERE status = 'open';

-- Open management-queue read path (US-51 will consume this).
CREATE INDEX idx_alerts_status_urgency
  ON alerts (status, urgency);
