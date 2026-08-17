# Quickstart: US-70

## Setup

One new migration (`013_create_earnings_date.sql`), no seed data, no new
dependencies. The migration runs automatically on app start via
`src/main/db/migrate.ts`; integration tests build the schema from `migrations/`
the same way the other service tests do, so there is no manual step.

To confirm the table exists after a dev run:

```bash
sqlite3 "$(ls -t ~/Library/Application\ Support/*/wheelbase.db 2>/dev/null | head -1)" \
  ".schema earnings_date"
```

For unit and integration tests, **no Finnhub API key is required** — `global.fetch`
is stubbed (see the shipped `src/main/integrations/finnhub-earnings.test.ts` for
the `fetchOk` helper pattern) and the service tests inject a fake fetcher.

Only the optional live smoke check at the bottom needs a real key:

```bash
# .env at the repo root — already present if US-56 was set up locally
MAIN_VITE_FINNHUB_API_KEY=<key>
```

If `better-sqlite3` was last built for Electron, rebuild for system Node before
running Vitest:

```bash
pnpm rebuild better-sqlite3
```

## Run the tests

```bash
# Fast loop while working an area
pnpm vitest run src/main/integrations/finnhub-earnings.test.ts
pnpm vitest run src/main/services/earnings-dates.test.ts
pnpm vitest run src/main/core/screener.test.ts
pnpm vitest run src/main/services/screener.test.ts
pnpm vitest run src/renderer/src/components/ScreenerResultsTable.test.tsx

# Full gate
pnpm test
pnpm lint
pnpm typecheck
pnpm format
```

**Watch for regressions in US-56.** The feed's return type changes, so these must
stay green without their assertions being weakened:

```bash
pnpm vitest run src/main/services/evaluate-alerts.test.ts
pnpm vitest run src/main/services/evaluate-alerts.e2e.test.ts
```

## E2E

```bash
pnpm test:e2e
```

If the Electron app hangs on `waiting for event 'window'`, the native module is
built for the wrong ABI — rebuild and retry:

```bash
npx electron-rebuild -f -w better-sqlite3
pnpm test:e2e
```

## Passing criteria

- All ten ACs from `docs/epics/08-stories/US-70-earnings-in-window-warning.md`
  have a named e2e test whose title mirrors the scenario name.
- `pnpm test`, `pnpm lint`, `pnpm typecheck` all clean.
- No occurrence of `earningsFlagged` remains anywhere in `src/`.
- `src/main/core/screener.ts` still imports nothing from `integrations/`, `db/`,
  or `logger` — the engine stays pure.

## Live smoke check (once, before merge)

Confirms Finnhub's free tier actually returns events ~50 days out. A wrong answer
is not a blocker — it degrades to the `unknown` caution the story specifies — but
it determines whether the feature is useful in practice.

```bash
curl -s "https://finnhub.io/api/v1/calendar/earnings?symbol=AAPL&from=$(date +%F)&to=$(date -v+50d +%F)&token=$FINNHUB_API_KEY" | jq '.earningsCalendar'
```

Expect a non-empty array containing an event more than 30 days out. If it returns
`[]` for several large-cap tickers with known upcoming prints, record that in
`research.md` and open a follow-up — the lookahead widening would then be
ineffective on the free tier.
