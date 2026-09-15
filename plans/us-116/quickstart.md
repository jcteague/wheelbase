# Quickstart: US-116

## Setup

No migration, no seed data, no new dependency. If the worktree has not run tests since an Electron build:

```bash
npx electron-rebuild -f -w better-sqlite3   # for pnpm dev / pnpm build / e2e
pnpm rebuild better-sqlite3                 # for pnpm test (Vitest, system Node)
```

Order matters — see CLAUDE.md. Running `pnpm test` after an e2e run, or vice versa, without the matching rebuild produces an ABI mismatch that surfaces in e2e as a `waiting for event 'window'` timeout.

## Running this story's tests

```bash
# Unit + integration, scoped while iterating
pnpm vitest run src/main/integrations/alpaca-market-data.test.ts
pnpm vitest run src/main/integrations/market-data-provider.test.ts src/main/integrations/broker-provider.test.ts
pnpm vitest run src/main/integrations/fake-market-data.test.ts src/main/integrations/fake-broker.test.ts
pnpm vitest run src/main/services/trading-calendar-store.test.ts
pnpm vitest run src/main/services/watchlist-snapshot.test.ts src/main/services/screener.test.ts
pnpm vitest run src/main/services/polling-scheduler.test.ts src/main/services/ivr-collector.test.ts
pnpm vitest run src/main/ipc/market-data.test.ts src/main/ipc/broker.test.ts
pnpm vitest run src/renderer/src/hooks/useMarketStatusDisplay.test.ts src/renderer/src/api/market-data.test.ts

# Everything
pnpm test
```

## E2E

```bash
pnpm test:e2e -- e2e/market-facts-without-broker.spec.ts   # this story's new spec
pnpm test:e2e -- e2e/ivr-staleness.spec.ts                 # US-98 suite, re-seamed onto the fake market-data provider
pnpm test:e2e -- e2e/provider-split.spec.ts                # the port boundary itself
pnpm test:e2e                                             # full suite before calling it done
```

## Manual check (the bug this story fixes)

```bash
pnpm dev
```

1. Settings → save Alpaca paper credentials. Do **not** wait for the nightly IVR job.
2. Open the Watchlist page with at least one entry that has an `ivr_snapshot` row.
3. Expect: the market-status pill resolves (LIVE / EXT / CLOSED), the IV rank renders with its freshness ring, and the log shows `Trading calendar refreshed` — **not** `Trading calendar has never been fetched; IVR freshness is unavailable`.
4. Reload the page. Expect no second `Trading calendar refreshed` — the 7-day throttle skips it.

```bash
# Confirm the cache filled without the nightly job ever firing
sqlite3 "$WHEELBASE_DB_PATH" 'SELECT COUNT(*), MIN(date), MAX(date) FROM trading_session;'
```

## Passing criteria

- `pnpm test` green, `pnpm lint` clean, `pnpm typecheck` clean, `pnpm format` applied
- `pnpm test:e2e` green, including every AC-named case in `e2e/market-facts-without-broker.spec.ts`
- `grep -rn "getMarketCalendar\|getMarketStatus" src/main/integrations/broker-provider.ts` returns nothing
- `grep -rn "broker:market-status" src e2e` returns nothing
