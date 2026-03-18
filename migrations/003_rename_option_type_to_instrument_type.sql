CREATE TABLE legs_new (
  id                    TEXT PRIMARY KEY,
  position_id           TEXT NOT NULL REFERENCES positions(id),
  leg_role              TEXT NOT NULL,
  action                TEXT NOT NULL,
  instrument_type       TEXT NOT NULL CHECK (instrument_type IN ('PUT', 'CALL', 'STOCK')),
  strike                TEXT NOT NULL,
  expiration            TEXT NOT NULL,
  contracts             INTEGER NOT NULL,
  premium_per_contract  TEXT NOT NULL,
  fill_price            TEXT,
  fill_date             TEXT NOT NULL,
  order_id              TEXT,
  roll_chain_id         TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

INSERT INTO legs_new (
  id,
  position_id,
  leg_role,
  action,
  instrument_type,
  strike,
  expiration,
  contracts,
  premium_per_contract,
  fill_price,
  fill_date,
  order_id,
  roll_chain_id,
  created_at,
  updated_at
)
SELECT
  id,
  position_id,
  leg_role,
  action,
  option_type,
  strike,
  expiration,
  contracts,
  premium_per_contract,
  fill_price,
  fill_date,
  order_id,
  roll_chain_id,
  created_at,
  updated_at
FROM legs;

DROP TABLE legs;

ALTER TABLE legs_new RENAME TO legs;

CREATE INDEX idx_legs_position_fill_date ON legs (position_id, fill_date);
CREATE INDEX idx_legs_position_role_date
  ON legs (position_id, leg_role, fill_date DESC, created_at DESC);
