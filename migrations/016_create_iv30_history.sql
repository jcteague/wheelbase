-- [US-121] iv30_reading / iv30_gap — our own daily IV30 history, replacing the Barchart scrape.
--
-- Inputs are stored, metrics are derived. Each reading row keeps the exact option pair,
-- VWAPs, trade counts, rate and dividend yield that produced its iv30, so a later engine
-- fix recomputes history from these columns (rows behind IV30_ENGINE_VERSION) without
-- re-fetching bars. IV rank / percentile / 52-week range are never stored: they are
-- computed at read time from the window of readings, so they cannot drift from it.
--
-- iv30_gap records sessions the engine attempted and could not read, so "no reading"
-- is distinguishable from "never tried" and the collector does not re-fetch them forever.
-- A later reading for the same key replaces its gap row.
--
-- method is part of both keys so a future input method (e.g. minute bars) is a new
-- value, not a schema change.
CREATE TABLE iv30_reading (
  underlying       TEXT    NOT NULL,             -- upper-cased ticker
  session          TEXT    NOT NULL,             -- 'YYYY-MM-DD', the Eastern session day
  method           TEXT    NOT NULL DEFAULT 'daily_vwap',
  engine_version   INTEGER NOT NULL,             -- IV30_ENGINE_VERSION that produced iv30
  observed_at      TEXT    NOT NULL,             -- ISO instant of the session's close
  iv30             TEXT    NOT NULL,
  underlying_vwap  TEXT    NOT NULL,
  expiration_tier  TEXT    NOT NULL CHECK (expiration_tier IN ('weekly', 'monthly')),
  near_expiration  TEXT    NOT NULL,
  near_strike      TEXT    NOT NULL,
  near_call_vwap   TEXT    NOT NULL,
  near_call_trades INTEGER NOT NULL,
  near_put_vwap    TEXT    NOT NULL,
  near_put_trades  INTEGER NOT NULL,
  far_expiration   TEXT,                         -- far_* all NULL when one expiration was used
  far_strike       TEXT,
  far_call_vwap    TEXT,
  far_call_trades  INTEGER,
  far_put_vwap     TEXT,
  far_put_trades   INTEGER,
  rate             TEXT    NOT NULL,
  dividend_yield   TEXT    NOT NULL,
  PRIMARY KEY (underlying, session, method)
);

CREATE INDEX idx_iv30_reading_underlying_session_desc
  ON iv30_reading (underlying, session DESC);

CREATE TABLE iv30_gap (
  underlying   TEXT NOT NULL,
  session      TEXT NOT NULL,
  method       TEXT NOT NULL DEFAULT 'daily_vwap',
  reason       TEXT NOT NULL CHECK (reason IN ('no_underlying_bar', 'no_tradeable_pair')),
  attempted_at TEXT NOT NULL,                    -- ISO instant of the run
  PRIMARY KEY (underlying, session, method)
);

-- Barchart's rank is a different quantity from ours and nothing reads it after US-121.
-- Dropping the table drops idx_ivr_snapshot_underlying_observed_at_desc with it.
DROP TABLE ivr_snapshot;
