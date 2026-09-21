# Contract: dev-only `_test:iv-*` channels (NODE_ENV === 'test')

## Purpose

Program the fake market-data provider's IV series, read the persisted IV30 history back, and
observe bar requests — the offline seam that replaces `_test:ivr-set-outcomes` /
`_test:ivr-fetch-log`. `_test:ivr-set-now` (the shared fake clock) is retained unchanged.

## Request / Response

```typescript
// The fixture the fake prices bars from — one flat vol surface per session.
type FakeIvSessionSpec =
  | number                                  // target IV30 for the session, e.g. 0.2475
  | {
      iv: number
      untraded?: Array<{ strike: number; type: 'call' | 'put' }>  // these legs get no bar that session
      tradeCount?: number                   // n on every leg this session (0 → no bars at all)
      weeklyTradeCount?: number             // n on non-third-Friday expirations (0 → weeklies absent → monthly tier)
    }
type FakeIvSeries = {
  price: number                             // underlying daily VWAP (default for every session)
  tradeCount?: number                       // default 100
  weeklyTradeCount?: number
  latencyMs?: number                        // delay every bar response for this ticker
  failWith?: 'network_error' | 'rate_limited' | 'unknown'   // throw MarketDataError on this ticker's option bars
  sessions: Record<string, FakeIvSessionSpec>               // 'YYYY-MM-DD' → spec; absent session → no bars
}
type FakeIvSeriesFixture = Record<string, FakeIvSeries>     // ticker → series

// Boot-time: env WHEELBASE_FAKE_IV_SERIES = JSON.stringify(FakeIvSeriesFixture)

'_test:iv-series-set'          (fixture: FakeIvSeriesFixture) → { ok: true }        // replaces the fixture and resets the request log
'_test:iv30-history'           () → Array<Iv30ReadingRow>     // every iv30_reading row, ORDER BY underlying, session
'_test:iv30-gaps'              () → Array<{ underlying; session; method; reason; attempted_at }>
'_test:daily-bar-requests'     () → Array<{ kind: 'option' | 'stock'; underlying: string; start: string; end: string | null }>
'_test:iv-history-recompute'   (opts?: { force?: boolean }) → { recomputed: number; unrecomputable: number }
'_test:iv30-corrupt'           ({ ticker; session; iv30: string }) → { ok: true }    // overwrites iv30 and sets engine_version = 0 — simulates a defective engine's output
'_test:table-exists'           (name: string) → boolean                            // SELECT 1 FROM sqlite_master WHERE type='table' AND name=?
'_test:ivr-set-now'            (nowIso: string) → { ok: boolean; error?: string }    // unchanged
```

`Iv30ReadingRow` is the raw table row (snake_case columns as in `data-model.md`).

## Fake pricing rule

For a requested OCC symbol `(underlying U, expiration E, strike K, type)` and each fixture session
`S` in `[start, end ?? ∞]` with `E > S`: `T = daysToExpiry(S, E) / 365`, `price =
blackScholesPrice({ type, spot: series.price, strike: K, yearsToExpiry: T, rate: 0.045,
dividendYield: 0, volatility: spec.iv })`, `vwap = close = price`, `tradeCount` per the spec
(third-Friday expirations use `tradeCount`, others `weeklyTradeCount ?? tradeCount`). A leg in
`untraded`, or a `tradeCount` of 0, yields no bar. `getStockDailyBars` returns one bar per fixture
session with `vwap = close = series.price`, `volume = 1_000_000`, `tradeCount = 10_000`.

## Error codes

Dev-only channels return plain objects, not the `{ ok, errors }` envelope, matching the existing
`_test:*` handlers. `_test:iv-series-set` returns `{ ok: false, error }` on unparseable input.

## Source

- Handlers: `src/main/ipc/test-ivr.ts` (renamed to `test-iv-history.ts`)
- Fake: `src/main/integrations/fake-market-data.ts`, `src/main/integrations/fake-clock.ts`
- Preload: `src/preload/index.ts` (`testIvSeriesSet`, `testIv30History`, `testIv30Gaps`, `testDailyBarRequests`, `testIvHistoryRecompute`, `testIv30Corrupt`, `testTableExists`)
- E2E helpers: `e2e/ivr-helpers.ts`
