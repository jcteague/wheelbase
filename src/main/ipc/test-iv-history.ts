// Dev-only IPC channels for programming the fake provider's IV series, reading the persisted
// IV30 history back, and observing bar and calendar requests in e2e tests. Registered only
// when NODE_ENV === 'test'. Contract: plans/us-121/contracts/test-iv-history.md.
import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { setFakeNow } from '../integrations/fake-clock'
import {
  dailyBarRequests,
  marketCalendarFetchCount,
  setFakeIvSeries,
  type FakeIvSeriesFixture
} from '../integrations/fake-market-data'
import { recomputeIvHistory } from '../services/iv-history'

type Iv30CorruptPayload = { ticker: string; session: string; iv30: string }

function isFixture(value: unknown): value is FakeIvSeriesFixture {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function registerTestIvHistoryIpc(db: Database.Database): void {
  ipcMain.handle('_test:iv-series-set', (_, fixture: unknown) => {
    if (!isFixture(fixture)) return { ok: false, error: 'IV series fixture must be an object' }
    setFakeIvSeries(fixture)
    return { ok: true }
  })

  ipcMain.handle('_test:ivr-set-now', (_, nowIso: unknown) => {
    if (typeof nowIso !== 'string' || Number.isNaN(new Date(nowIso).getTime())) {
      return { ok: false, error: 'Fake clock must be a valid ISO timestamp' }
    }
    setFakeNow(nowIso)
    return { ok: true }
  })

  ipcMain.handle('_test:iv30-history', () =>
    db.prepare('SELECT * FROM iv30_reading ORDER BY underlying, session').all()
  )

  ipcMain.handle('_test:iv30-gaps', () =>
    db
      .prepare(
        `SELECT underlying, session, method, reason, attempted_at
         FROM iv30_gap
         ORDER BY underlying, session`
      )
      .all()
  )

  ipcMain.handle('_test:daily-bar-requests', () => dailyBarRequests())

  ipcMain.handle('_test:iv-history-recompute', (_, opts?: { force?: boolean }) =>
    recomputeIvHistory(db, { force: opts?.force === true })
  )

  // Simulates a defective engine's output: the value changes and the row is stamped behind
  // every real engine version, so the next recompute rewrites it from its stored inputs.
  ipcMain.handle('_test:iv30-corrupt', (_, { ticker, session, iv30 }: Iv30CorruptPayload) => {
    db.prepare(
      `UPDATE iv30_reading SET iv30 = ?, engine_version = 0
       WHERE underlying = ? AND session = ?`
    ).run(iv30, ticker.toUpperCase(), session)
    return { ok: true }
  })

  ipcMain.handle(
    '_test:table-exists',
    (_, name: string) =>
      db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !==
      undefined
  )

  // [US-116] Whether the calendar was fetched, and how often, is the only observable
  // difference between a bench that refreshed it and one that skipped the refresh.
  ipcMain.handle('_test:trading-session-count', () => {
    const row = db.prepare('SELECT COUNT(*) AS count FROM trading_session').get() as {
      count: number
    }
    return row.count
  })

  ipcMain.handle('_test:market-calendar-fetch-count', () => marketCalendarFetchCount())
}
