CREATE TABLE watchlist (
  ticker             TEXT PRIMARY KEY,
  notes              TEXT,
  own_below_price    TEXT,
  ivr_trigger        INTEGER,
  post_earnings_only INTEGER NOT NULL DEFAULT 0,
  core_holding       INTEGER NOT NULL DEFAULT 0,
  added_at           TEXT NOT NULL
);

CREATE INDEX idx_watchlist_added_at_desc ON watchlist (added_at DESC);
