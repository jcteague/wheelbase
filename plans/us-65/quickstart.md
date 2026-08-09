# Quickstart — US-65 verification

US-65 is **backend-only** (pure engine + service + IPC). The renderer surface is US-66,
so there is no Playwright E2E for this story; AC-level coverage runs as a headless
integration test of `screenWatchlistCandidates` against a stub `MarketDataProvider` and
an in-memory SQLite DB.

## Prerequisites

- Deps installed; `better-sqlite3` built for both ABIs (order matters):
  ```bash
  npx electron-rebuild -f -w better-sqlite3   # first, for Electron
  pnpm rebuild better-sqlite3                 # then, for system Node (Vitest)
  ```
- **No new migrations.** US-65 persists nothing; it reads the existing `ivr_snapshot`
  table (`migrations/007_create_ivr_snapshot.sql`) and the `watchlist` table
  (`migrations/012_create_watchlist.sql`). The integration test applies migrations to an
  in-memory DB and seeds both.
- Seed data used by the integration test:
  - `watchlist`: KO, AAPL, MSFT, TSLA, XYZ
  - `ivr_snapshot`: rows for KO (`38.0`) and AAPL (`44.0`); **no row for MSFT** — that
    absence is what drives the "IV rank n/a" AC.
  - a scripted provider returning put chains per scenario (no network calls).

## Test layout

| Layer                     | File                                             |
| ------------------------- | ------------------------------------------------ |
| Pure scoring + filters    | `src/main/core/screener.test.ts`                 |
| IVR read path             | `src/main/services/ivr-snapshots.test.ts`        |
| Service orchestration     | `src/main/services/screener.test.ts`             |
| IPC envelope              | `src/main/ipc/screener.test.ts`                  |
| AC integration (headless) | `src/main/services/screener.integration.test.ts` |

## Run

```bash
pnpm test src/main/core/screener.test.ts
pnpm test src/main/services/screener
pnpm test src/main/services/ivr-snapshots.test.ts
pnpm test src/main/ipc/screener.test.ts
pnpm test                # full suite must stay green
```

## Passing criteria

- **Engine:** AAPL 180 put @ 2.70, 37 DTE yields `periodYield '0.0150'`,
  `annualizedYield '0.1480'`, `capitalSecured '18000.00'`, `yieldPerDelta '0.5285'`;
  candidate B (0.20Δ, 24% ann.) outranks candidate A (0.30Δ, 30% ann.) with scores
  `1.2000` vs `1.0000`.
- **Filters:** each excluded candidate carries the exact reason string —
  `delta 0.42 outside 0.20–0.30`, `open interest 120 below 500`,
  `spread 22% exceeds 10%` — and a `0.08 / 0.15` quote is **not** spread-excluded.
- **Soft inputs:** a ticker with no `ivr_snapshot` row still ranks, with `ivRank: null`.
- **Best-per-ticker:** a ticker with three survivors contributes exactly one row to
  `ranked`, the highest `yieldPerDelta`.
- **Envelope:** `screener:results` returns `{ ok: true, status, ranked, excluded,
quoteTimestamp }` and never throws to the renderer.
- **Isolation:** one ticker throwing inside `screenTicker` does not suppress the others'
  results (regression for the `alert-evaluation-failure-isolation` ADR).

## Manual smoke (optional)

With the fake provider active (`WHEELBASE_MOCK_OPTION_SNAPSHOTS`), from the renderer
devtools console:

```js
await window.api.screener.results()
```

Expect a `{ ok: true, status: 'ok', ranked: [...] }` envelope. There is no screener UI
until US-66.

## Post-change checklist

```bash
pnpm test && pnpm lint && pnpm typecheck && pnpm format
```

</content>
