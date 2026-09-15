# Quickstart: US-100 — Collect IVR on watchlist add and outside market hours

## Prerequisites

- `pnpm install` done; `better-sqlite3` built for the right ABI (see below).
- No migration, seed data or new environment variable is required. Barchart needs no credentials;
  the e2e suite never touches it (`WHEELBASE_FAKE_IVR` swaps in the fake scraper).

## Unit + integration tests (Vitest)

```bash
pnpm rebuild better-sqlite3          # system-Node ABI — only after an electron-rebuild
pnpm test -- src/main/services/ivr-collector.test.ts \
             src/main/services/ivr-on-demand.test.ts \
             src/main/services/polling-scheduler.test.ts \
             src/main/services/watchlist.test.ts \
             src/main/services/positions.test.ts \
             src/main/core/trading-calendar.test.ts \
             src/main/ipc/watchlist.test.ts \
             src/main/ipc/positions.test.ts \
             src/main/ipc/test-ivr.test.ts \
             src/main/index.test.ts \
             src/renderer/src/hooks/useIvrSnapshotUpdates.test.ts
pnpm test                            # whole suite must stay green
```

Passing criteria: every file above green; no test in `ivr-collector.test.ts` still asserts a
fetch-instant `observed_at` (they assert the session `closeAt`).

## E2E (Playwright `_electron`)

```bash
npx electron-rebuild -f -w better-sqlite3    # Electron ABI — required after any `pnpm test`
pnpm test:e2e -- e2e/ivr-on-demand.spec.ts   # the 13 US-100 ACs, one verbatim-named test each
pnpm test:e2e -- e2e/ivr-collector.spec.ts e2e/ivr-watchlist-collection.spec.ts \
                 e2e/ivr-staleness.spec.ts e2e/market-facts-without-broker.spec.ts \
                 e2e/watchlist-bench.spec.ts e2e/polling-scheduler.spec.ts
pnpm test:e2e                                # full suite
```

Passing criteria: all 13 tests in `e2e/ivr-on-demand.spec.ts` pass; the three rewritten
weekend/holiday tests in `ivr-collector.spec.ts` now drive the **scheduled** trigger and still
report `market_closed`; the staleness tiers in `ivr-staleness.spec.ts` are unchanged (the stamp is
derived from the programmed observation, so fixture ages do not move).

`pnpm` does not run `pretest*` scripts here, so switch ABIs by hand when alternating between
`pnpm test` and `pnpm test:e2e`. A `waiting for event 'window'` timeout means the Electron rebuild
was skipped.

## Manual check (optional)

```bash
pnpm dev
```

1. Settings → Market Data → **Refresh IVR now** on a weekend: the summary reports saved rows, not
   "market closed".
2. Watchlist → add a ticker: the row appears at once; its IV rank fills in within a couple of
   seconds without reloading (push event). A ticker Barchart does not cover stays `n/a`.
3. Hover the IV cell: the tooltip's observed day is the most recent trading day, not today.

## Post-change checklist

```bash
pnpm test && pnpm lint && pnpm typecheck && pnpm format
```

Then `/update-spec us-100` once the story completes.
