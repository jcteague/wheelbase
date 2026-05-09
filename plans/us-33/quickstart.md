# Quickstart: US-33

## One-time setup

This story adds a SQL migration (`005_add_profit_target_percent.sql`) which runs
automatically on app start via `runMigrations()`. No manual DB step is required for
unit/integration tests — `vitest` migrations run via the existing `initDb()` flow.

If you have an old DB on disk and want to re-run migrations:

```bash
rm -f ~/Library/Application\ Support/wheelbase/wheelbase.db    # macOS
# next `pnpm dev` will recreate with all migrations applied
```

---

## Run unit + integration tests

```bash
pnpm test                                                   # runs the full Vitest suite
pnpm test src/main/core/option-symbol.test.ts               # OCC builder
pnpm test src/main/core/costbasis.test.ts                   # computeUnrealizedPnl
pnpm test src/main/core/profit-target.test.ts               # resolver helper
pnpm test src/main/services/list-positions.test.ts          # extended query result
pnpm test src/main/ipc/market-data.test.ts                  # new option-snapshots handler
pnpm test src/renderer/src/api/market-data.test.ts          # adapter
pnpm test src/renderer/src/hooks/useOptionSnapshots.test.ts # hook
pnpm test src/renderer/src/components/OptMidCell.test.tsx
pnpm test src/renderer/src/components/UnrealizedPnlCell.test.tsx
pnpm test src/renderer/src/components/TargetBadge.test.tsx
pnpm test src/renderer/src/pages/PositionsListPage.test.tsx
pnpm test src/renderer/src/pages/PositionDetailPage.test.tsx
```

Pass criteria: every test in the files above is green and overall `pnpm test` exits 0.

---

## Run the typechecker and linter

```bash
pnpm typecheck
pnpm lint
pnpm format
```

Pass criteria: zero TypeScript errors, zero ESLint warnings/errors.

---

## Run the e2e suite

```bash
pnpm test:e2e e2e/option-pnl.spec.ts
```

The spec uses `WHEELBASE_MARKET_MOCK=true` and seeds option snapshots and stock quotes
via env vars (`WHEELBASE_MOCK_OPTION_SNAPSHOTS`, `WHEELBASE_MOCK_STOCK_QUOTES`). No real
Alpaca credentials needed.

> Note: `pnpm test` will rebuild `better-sqlite3` for the system Node ABI. To run
> e2e afterwards, rebuild for Electron:
> `npx electron-rebuild -f -w better-sqlite3 && pnpm test:e2e`

Pass criteria: every AC scenario in the e2e file passes (one test case per AC).

---

## Manually verify in the running app

```bash
pnpm dev
```

1. Seed a CSP via the New Wheel form: ticker `AAPL`, strike `180`, expiration ~30
   days out, contracts `1`, premium `3.50`.
2. Open the position detail page; confirm the "Open Leg" section now shows
   `Current Mid`, `Unrealized P&L`, and `% of Max Profit` stats. With the fake
   provider, these will show `—` until you set `WHEELBASE_MARKET_MOCK=true` plus
   `WHEELBASE_MOCK_OPTION_SNAPSHOTS` to a JSON map keyed by OCC symbol.
3. On the positions list, confirm the `Opt Mid` and `P&L` columns appear and show
   data when the mock returns a snapshot for the position's OCC symbol.

For the per-position override path, set the override directly via SQLite while the
app is closed:

```bash
sqlite3 ~/Library/Application\ Support/wheelbase/wheelbase.db \
  "UPDATE positions SET profit_target_percent = 25 WHERE ticker = 'AAPL';"
```

Then restart the app and confirm the gold `TARGET` badge appears at a lower P&L
threshold than for a position without an override.
