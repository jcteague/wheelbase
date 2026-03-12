CREATE TABLE positions (
  id             TEXT PRIMARY KEY,
  ticker         TEXT NOT NULL,
  strategy_type  TEXT NOT NULL,
  status         TEXT NOT NULL,
  phase          TEXT NOT NULL,
  opened_date    TEXT NOT NULL,
  closed_date    TEXT,
  account_id     TEXT,
  notes          TEXT,
  thesis         TEXT,
  tags           TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE INDEX idx_positions_status_phase ON positions (status, phase);
CREATE INDEX idx_positions_ticker ON positions (ticker);

CREATE TABLE legs (
  id                    TEXT PRIMARY KEY,
  position_id           TEXT NOT NULL REFERENCES positions(id),
  leg_role              TEXT NOT NULL,
  action                TEXT NOT NULL,
  option_type           TEXT NOT NULL,
  strike                TEXT NOT NULL,
  expiration            TEXT NOT NULL,
  contracts             INTEGER NOT NULL,
  premium_per_contract  TEXT NOT NULL,
  fill_price            TEXT,
  fill_date             TEXT,
  order_id              TEXT,
  roll_chain_id         TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE INDEX idx_legs_position_fill_date ON legs (position_id, fill_date);

CREATE TABLE cost_basis_snapshots (
  id                      TEXT PRIMARY KEY,
  position_id             TEXT NOT NULL REFERENCES positions(id),
  basis_per_share         TEXT NOT NULL,
  total_premium_collected TEXT NOT NULL,
  final_pnl               TEXT,
  annualized_return       TEXT,
  snapshot_at             TEXT NOT NULL,
  created_at              TEXT NOT NULL
);
