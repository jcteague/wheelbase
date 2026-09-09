-- [US-98] trading_session — the cached exchange calendar behind IVR freshness.
--
-- One row per calendar day in the range we have fetched, NOT one per trading day:
-- a NULL close_at records "we asked, the exchange was closed". Storing closures
-- explicitly is what lets coverage be derived as MIN(date)..MAX(date), so a day we
-- never fetched reads as unknown instead of silently as a closure.
--
-- close_at is the instant the session ended, resolved from the exchange's Eastern
-- wall-clock close at fetch time, so an early close is just an earlier instant.
CREATE TABLE trading_session (
  date     TEXT PRIMARY KEY,             -- 'YYYY-MM-DD', the Eastern calendar day
  close_at TEXT,                         -- ISO instant of the close; NULL = closed
  source   TEXT NOT NULL DEFAULT 'alpaca'
);
