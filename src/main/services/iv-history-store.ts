// [US-121] SQL and row mapping for iv30_reading / iv30_gap. No arithmetic and no market-data
// knowledge: readings arrive fully computed from core/iv30.ts and leave as plain rows.
import type Database from 'better-sqlite3'
import { IV30_METHOD, type Iv30GapReason, type Iv30Inputs, type Iv30Reading } from '../core/iv30'

export type PersistIvHistoryInput = {
  ticker: string
  attemptedAt: Date
  readings: ReadonlyArray<{ reading: Iv30Reading; observedAt: string }>
  gaps: ReadonlyArray<{ session: string; reason: Iv30GapReason }>
}

export type Iv30ReadingRow = {
  underlying: string
  session: string
  engine_version: number
  iv30: string
  underlying_vwap: string
  expiration_tier: 'weekly' | 'monthly'
  near_expiration: string
  near_strike: string
  near_call_vwap: string
  near_call_trades: number
  near_put_vwap: string
  near_put_trades: number
  far_expiration: string | null
  far_strike: string | null
  far_call_vwap: string | null
  far_call_trades: number | null
  far_put_vwap: string | null
  far_put_trades: number | null
  rate: string
  dividend_yield: string
}

export type AnchorRow = { session: string; iv30: string; observed_at: string }

const ATTEMPTED_SESSIONS_QUERY = `
  SELECT session FROM iv30_reading WHERE underlying = ? AND method = ?
  UNION
  SELECT session FROM iv30_gap WHERE underlying = ? AND method = ?
`

const UPSERT_READING = `
  INSERT INTO iv30_reading (
    underlying, session, method, engine_version, observed_at, iv30, underlying_vwap,
    expiration_tier, near_expiration, near_strike, near_call_vwap, near_call_trades,
    near_put_vwap, near_put_trades, far_expiration, far_strike, far_call_vwap,
    far_call_trades, far_put_vwap, far_put_trades, rate, dividend_yield
  ) VALUES (
    @underlying, @session, @method, @engineVersion, @observedAt, @iv30, @underlyingVwap,
    @tier, @nearExpiration, @nearStrike, @nearCallVwap, @nearCallTrades,
    @nearPutVwap, @nearPutTrades, @farExpiration, @farStrike, @farCallVwap,
    @farCallTrades, @farPutVwap, @farPutTrades, @rate, @dividendYield
  )
  ON CONFLICT (underlying, session, method) DO UPDATE SET
    engine_version = excluded.engine_version,
    observed_at = excluded.observed_at,
    iv30 = excluded.iv30,
    underlying_vwap = excluded.underlying_vwap,
    expiration_tier = excluded.expiration_tier,
    near_expiration = excluded.near_expiration,
    near_strike = excluded.near_strike,
    near_call_vwap = excluded.near_call_vwap,
    near_call_trades = excluded.near_call_trades,
    near_put_vwap = excluded.near_put_vwap,
    near_put_trades = excluded.near_put_trades,
    far_expiration = excluded.far_expiration,
    far_strike = excluded.far_strike,
    far_call_vwap = excluded.far_call_vwap,
    far_call_trades = excluded.far_call_trades,
    far_put_vwap = excluded.far_put_vwap,
    far_put_trades = excluded.far_put_trades,
    rate = excluded.rate,
    dividend_yield = excluded.dividend_yield
`

const DELETE_GAP = `DELETE FROM iv30_gap WHERE underlying = ? AND session = ? AND method = ?`

const UPSERT_GAP = `
  INSERT INTO iv30_gap (underlying, session, method, reason, attempted_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT (underlying, session, method) DO UPDATE SET
    reason = excluded.reason,
    attempted_at = excluded.attempted_at
`

const RECOMPUTE_ROWS_QUERY = `
  SELECT * FROM iv30_reading
  WHERE method = @method
    AND (@ticker IS NULL OR underlying = @ticker)
    AND (@force = 1 OR engine_version < @engineVersion)
  ORDER BY underlying, session
`

const UPDATE_IV30 = `
  UPDATE iv30_reading SET iv30 = ?, engine_version = ?
  WHERE underlying = ? AND session = ? AND method = ?
`

const ANCHOR_QUERY = `
  SELECT session, iv30, observed_at FROM iv30_reading
  WHERE underlying = ? AND method = ?
  ORDER BY session DESC
  LIMIT 1
`

const WINDOW_QUERY = `
  SELECT session, iv30 FROM iv30_reading
  WHERE underlying = ? AND session >= ? AND session <= ? AND method = ?
`

/** Sessions that already hold a reading or a gap for the ticker. */
export function selectAttemptedSessions(db: Database.Database, ticker: string): Set<string> {
  const rows = db
    .prepare(ATTEMPTED_SESSIONS_QUERY)
    .all(ticker, IV30_METHOD, ticker, IV30_METHOD) as Array<{ session: string }>
  return new Set(rows.map((row) => row.session))
}

/** Named parameters for UPSERT_READING — SQL scalars keyed by `@name`. */
type SqlParams = Record<string, string | number | null>

function readingParams(ticker: string, reading: Iv30Reading, observedAt: string): SqlParams {
  const { near, far } = reading
  return {
    underlying: ticker,
    session: reading.session,
    method: IV30_METHOD,
    engineVersion: reading.engineVersion,
    observedAt,
    iv30: reading.iv30,
    underlyingVwap: reading.underlyingVwap,
    tier: reading.tier,
    nearExpiration: near.expiration,
    nearStrike: near.strike,
    nearCallVwap: near.callVwap,
    nearCallTrades: near.callTrades,
    nearPutVwap: near.putVwap,
    nearPutTrades: near.putTrades,
    farExpiration: far?.expiration ?? null,
    farStrike: far?.strike ?? null,
    farCallVwap: far?.callVwap ?? null,
    farCallTrades: far?.callTrades ?? null,
    farPutVwap: far?.putVwap ?? null,
    farPutTrades: far?.putTrades ?? null,
    rate: reading.rate,
    dividendYield: reading.dividendYield
  }
}

/** One transaction: readings replace any gap for their session; gaps are upserted. */
export function persistIvHistory(db: Database.Database, input: PersistIvHistoryInput): void {
  const ticker = input.ticker.toUpperCase()
  const attemptedAt = input.attemptedAt.toISOString()
  const upsertReading = db.prepare(UPSERT_READING)
  const deleteGap = db.prepare(DELETE_GAP)
  const upsertGap = db.prepare(UPSERT_GAP)

  db.transaction(() => {
    input.readings.forEach(({ reading, observedAt }) => {
      deleteGap.run(ticker, reading.session, IV30_METHOD)
      upsertReading.run(readingParams(ticker, reading, observedAt))
    })
    input.gaps.forEach(({ session, reason }) => {
      upsertGap.run(ticker, session, IV30_METHOD, reason, attemptedAt)
    })
  })()
}

export function selectRecomputeRows(
  db: Database.Database,
  opts: { ticker: string | null; force: boolean; engineVersion: number }
): Iv30ReadingRow[] {
  return db.prepare(RECOMPUTE_ROWS_QUERY).all({
    method: IV30_METHOD,
    ticker: opts.ticker,
    force: opts.force ? 1 : 0,
    engineVersion: opts.engineVersion
  }) as Iv30ReadingRow[]
}

export function updateIv30Values(
  db: Database.Database,
  updates: ReadonlyArray<{ row: Iv30ReadingRow; iv30: string; engineVersion: number }>
): void {
  const update = db.prepare(UPDATE_IV30)
  db.transaction(() => {
    updates.forEach(({ row, iv30, engineVersion }) => {
      update.run(iv30, engineVersion, row.underlying, row.session, IV30_METHOD)
    })
  })()
}

/** The engine inputs a stored row holds; null when its far_* columns are only partly set (the
 *  writer sets all six or none), which no inputs can faithfully describe. */
export function inputsOf(row: Iv30ReadingRow): Iv30Inputs | null {
  const {
    far_expiration: expiration,
    far_strike: strike,
    far_call_vwap: callVwap,
    far_call_trades: callTrades,
    far_put_vwap: putVwap,
    far_put_trades: putTrades
  } = row
  const farColumns = [expiration, strike, callVwap, callTrades, putVwap, putTrades]
  if (farColumns.some((c) => c === null) && farColumns.some((c) => c !== null)) return null
  const far =
    expiration === null ||
    strike === null ||
    callVwap === null ||
    callTrades === null ||
    putVwap === null ||
    putTrades === null
      ? null
      : { expiration, strike, callVwap, callTrades, putVwap, putTrades }
  return {
    session: row.session,
    underlyingVwap: row.underlying_vwap,
    tier: row.expiration_tier,
    near: {
      expiration: row.near_expiration,
      strike: row.near_strike,
      callVwap: row.near_call_vwap,
      callTrades: row.near_call_trades,
      putVwap: row.near_put_vwap,
      putTrades: row.near_put_trades
    },
    far,
    rate: row.rate,
    dividendYield: row.dividend_yield
  }
}

const ANY_GAP_QUERY = `SELECT 1 FROM iv30_gap WHERE underlying = ? AND method = ? LIMIT 1`

/** True when a collection attempted this ticker and recorded at least one gap. */
export function hasAnyGap(db: Database.Database, ticker: string): boolean {
  return db.prepare(ANY_GAP_QUERY).get(ticker, IV30_METHOD) !== undefined
}

export function selectAnchor(db: Database.Database, ticker: string): AnchorRow | undefined {
  return db.prepare(ANCHOR_QUERY).get(ticker, IV30_METHOD) as AnchorRow | undefined
}

/** session → iv30 for readings in `[from, to]`. */
export function selectReadingsBetween(
  db: Database.Database,
  ticker: string,
  from: string,
  to: string
): Map<string, string> {
  const rows = db.prepare(WINDOW_QUERY).all(ticker, from, to, IV30_METHOD) as Array<{
    session: string
    iv30: string
  }>
  return new Map(rows.map((row) => [row.session, row.iv30]))
}
