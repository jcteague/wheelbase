# Quickstart: US-68 — Promote a screener result to the new wheel form

## Setup

No migrations, no seed data, no new environment variables. All work is in
`src/renderer/` plus e2e. Standard install:

```bash
pnpm install
npx electron-rebuild -f -w better-sqlite3   # Electron ABI (dev/build/e2e)
pnpm rebuild better-sqlite3                 # system-Node ABI (Vitest)
```

> Order matters. If `pnpm test:e2e` later hangs on `waiting for event 'window'`, a
> `pnpm test` run has swapped the ABI back — re-run `npx electron-rebuild -f -w better-sqlite3`.

## Unit / integration tests (Vitest)

New and touched suites:

```bash
pnpm test src/renderer/src/lib/promote.test.ts                     # param codec, moved-threshold, banner precedence
pnpm test src/renderer/src/hooks/usePromotedQuote.test.ts          # one-shot fetch, degrade-on-failure
pnpm test src/renderer/src/components/NewWheelForm.test.tsx        # promoted mode: prefill, derived row, banners, editability
pnpm test src/renderer/src/components/ScreenerResultsTable.test.tsx
pnpm test src/renderer/src/pages/ScreenerPage.test.tsx             # promote click → navigation with thesis from watchlist
```

Full gate (run all four after every change, in order):

```bash
pnpm test && pnpm lint && pnpm typecheck && pnpm format
```

Passing criteria: zero failures, zero lint errors, zero TS errors.

## E2E (Playwright `_electron`)

```bash
pnpm test:e2e e2e/promote-to-trade.spec.ts
```

The spec reuses the US-66 screener harness (`e2e/screener-helpers.ts`): fake provider
fixtures (AAPL $180 put, mid 2.70, 37 DTE), watchlist seeded through production IPC,
market session from the `marketStatus` launch fixture. Quote drift and provider outage
between the screener run and the form's re-fetch are simulated by mutating
`process.env.WHEELBASE_MOCK_OPTION_SNAPSHOTS` / `FAKE_MARKET_DATA_ERROR` at runtime via
`app.evaluate(...)` — the fake provider re-reads env on every call.

Passing criteria: one green e2e test per acceptance criterion (9 tests — the
market-not-open scenario outline yields two: CLOSED and EXT).

## Manual smoke (optional)

```bash
pnpm dev
```

1. Add AAPL to the watchlist with a note; open Screener; click **Promote to trade** on a
   ranked row.
2. Verify the form opens with ticker/strike/expiration/premium/contracts=1 pre-filled,
   the gold "Promoted from Screener · Quoted HH:mm:ss" strip, and the capital-required
   row.
3. Edit the premium — yield recomputes, green "recording your entered price" note
   appears; submit records the edited value.
