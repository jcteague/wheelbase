CREATE TABLE IF NOT EXISTS pending_assignments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  position_id     TEXT NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  leg_id          TEXT NOT NULL REFERENCES legs(id) ON DELETE CASCADE,
  activity_id     TEXT NOT NULL UNIQUE,
  broker_symbol   TEXT NOT NULL,
  qty             INTEGER NOT NULL,
  transaction_time TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'dismissed')),
  detected_at     TEXT NOT NULL DEFAULT (datetime('now')),
  confirmed_at    TEXT,
  dismissed_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_pending_assignments_status ON pending_assignments(status);
CREATE INDEX IF NOT EXISTS idx_pending_assignments_position ON pending_assignments(position_id);
