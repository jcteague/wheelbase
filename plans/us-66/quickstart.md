# Quickstart: US-66 — Display ranked screener results

## Setup

No migrations, seed data, or new dependencies. The story is pure renderer work over
the existing `screener:results` channel.

```bash
pnpm install                                  # if not already done
npx electron-rebuild -f -w better-sqlite3     # Electron ABI (dev/build/e2e)
pnpm rebuild better-sqlite3                   # system-Node ABI (Vitest)
```

> Order matters (electron-rebuild first, then the system rebuild). Known gotcha:
> running `pnpm test` can break a subsequent `pnpm test:e2e` in the same checkout —
> symptom is a "waiting for event 'window'" timeout. Fix by re-running
> `npx electron-rebuild -f -w better-sqlite3`.

## Unit / integration tests (Vitest)

New test files this story adds:

```bash
pnpm test src/renderer/src/lib/screener-format.test.ts     # formatters
pnpm test src/renderer/src/api/screener.test.ts            # adapter envelope mapping
pnpm test src/renderer/src/components/ScreenerResultsTable.test.tsx
pnpm test src/renderer/src/components/ScreenerExcludedSection.test.tsx
pnpm test src/renderer/src/components/ScreenerStateCard.test.tsx
pnpm test src/renderer/src/pages/ScreenerPage.test.tsx     # state switching + header
pnpm test                                                   # full suite — must pass
```

Renderer component tests follow the existing pattern (Vitest + Testing Library,
`window.api` stubbed per test, TanStack Query wrapped in a fresh `QueryClient`).

## E2E tests (Playwright `_electron`)

```bash
pnpm test:e2e e2e/screener-results.spec.ts   # builds the app, then runs the spec
pnpm test:e2e                                 # full e2e suite
```

The spec is fully offline:

- `FAKE_MARKET_DATA=true` + `WHEELBASE_MOCK_OPTION_SNAPSHOTS` (OCC-keyed put fixtures
  built by `e2e/screener-helpers.ts` with expirations at `localDate(+37)` /
  `localDate(+44)` so DTE lands in the default 30–45 window on any run date)
- Watchlist seeded via `window.api.watchlist.add(...)` in `page.evaluate`
- IVR rows (KO 38, AAPL 44; none for MSFT) via `WHEELBASE_FAKE_IVR=true` +
  `_test:ivr-set-outcomes` + collect-now (see `e2e/ivr-helpers.ts`)
- Provider outage scenario: `FAKE_MARKET_DATA_ERROR=network_error`
- Stale scenario: `FAKE_MARKET_STATUS='{"isOpen":false,...,"session":"closed"}'`

Navigate with `location.hash = '#/screener'` (hash routing).

## Post-change checklist (every change)

```bash
pnpm test && pnpm lint && pnpm typecheck && pnpm format
```

## Passing criteria

- All six AC scenarios pass as individually named e2e tests in
  `e2e/screener-results.spec.ts`.
- Full `pnpm test`, `pnpm lint`, `pnpm typecheck` are clean.
- Manual smoke (`pnpm dev`): Screener nav item appears after Watchlist; with no
  Massive key configured the page shows the "Market data unavailable" card (the
  unconfigured provider maps to `provider_unavailable`), not an error toast.
