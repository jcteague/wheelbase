CREATE TABLE ivr_snapshot (
  underlying  TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  ivr         TEXT NOT NULL,
  ivp         TEXT,
  iv30        TEXT,
  source      TEXT NOT NULL DEFAULT 'barchart',
  PRIMARY KEY (underlying, observed_at)
);

CREATE INDEX idx_ivr_snapshot_underlying_observed_at_desc
  ON ivr_snapshot (underlying, observed_at DESC);
