-- [US-70] earnings_date — the persisted earnings-calendar store. One row per
-- ticker, overwritten on each successful fetch; no history (unlike ivr_snapshot).
-- next_earnings NULL means "checked, nothing scheduled through checked_through",
-- which is positive knowledge. A failed fetch is never written.
CREATE TABLE earnings_date (
  ticker          TEXT PRIMARY KEY,
  next_earnings   TEXT,                             -- 'YYYY-MM-DD'; NULL = checked, nothing scheduled
  checked_through TEXT NOT NULL,                    -- 'YYYY-MM-DD', the `to` bound of the request that produced this row
  checked_at      TEXT NOT NULL,                    -- ISO timestamp of that request
  source          TEXT NOT NULL DEFAULT 'finnhub'
);
