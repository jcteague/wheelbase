---
page: docs/spec/features/us-33-option-mid-pnl.md
audited_at: 2026-09-28
findings: 5
---

# Audit: docs/spec/features/us-33-option-mid-pnl.md

## Verified (27)

- ✓ `market-data:option-snapshots` handler registered, Zod-parsed, delegates to `fetchOptionSnapshots` — `src/main/ipc/market-data.ts:65-69`
- ✓ `fetchOptionSnapshots` returns empty map for empty input without calling provider and loops the singular `getOptionSnapshot` — `src/main/services/market-data.ts:57-66`
- ✓ `GetOptionSnapshotsPayloadSchema = { symbols: z.array(z.string().min(1).max(25)).max(50) }` — `src/main/schemas.ts:397-399`
- ✓ `PositionListItem` gains `instrumentType`, `contracts`, `entryPremiumPerContract`, `profitTargetPercent` (all nullable) — `src/main/schemas.ts:165-170`
- ✓ `LIST_QUERY` selects `p.profit_target_percent`, `l.instrument_type, l.contracts, l.premium_per_contract` — `src/main/services/list-positions.ts:39-41,79-86`
- ✓ Migration `005_add_profit_target_percent.sql` adds nullable `profit_target_percent INTEGER` — `migrations/005_add_profit_target_percent.sql:1-2`
- ✓ `buildOccSymbol` in `src/shared/option-symbol.ts:31`, imports only `decimal.js` (`:7`); re-exported via barrel `src/main/core/option-symbol.ts:1-6`
- ✓ `DEFAULT_PROFIT_TARGET_PERCENT = 50`, `resolveProfitTarget` uses explicit `=== null` — `src/main/core/profit-target.ts:4-11`
- ✓ `computeUnrealizedPnl` in `src/main/core/costbasis.ts:285`; `ROUND_HALF_UP` — `:8`
- ✓ Preload `window.api.getOptionSnapshots` → `market-data:option-snapshots` — `src/preload/index.ts:33`
- ✓ `marketDataQueryKeys.optionSnapshots(symbols)` — `src/renderer/src/hooks/marketDataQueryKeys.ts:5-6`
- ✓ `useOptionSnapshots`: `enabled: symbols.length > 0`, `refetchInterval: session === 'closed' ? false : 60_000`, `staleTime: 30_000`, `refetchOnWindowFocus: true` — `src/renderer/src/hooks/useOptionSnapshots.ts:22-23,63-66`
- ✓ `WIDE_SPREAD_THRESHOLD = 0.1`, `isWideSpread`, `hasNoBid`, `formatPnlPercentForDisplay`, `formatTargetTooltip` — `src/renderer/src/lib/option-display.ts:5-37`
- ✓ `formatSignedMoney` — `src/renderer/src/lib/format.ts:9`
- ✓ `OptMidCell.tsx`, `UnrealizedPnlCell.tsx`, `TargetBadge.tsx` exist
- ✓ Column order `Ticker, Phase, Price, Opt Mid, P&L, Strike, Expiration, DTE, Premium, Cost Basis` — `src/renderer/src/pages/PositionsListPage.tsx:28-39`
- ✓ `useOptionSnapshots(legs, { session })` wired on list — `src/renderer/src/pages/PositionsListPage.tsx:184`; detail page — `src/renderer/src/pages/PositionDetailPage.tsx:53`
- ✓ `FakeMarketDataProvider.getOptionSnapshot` reads `WHEELBASE_MOCK_OPTION_SNAPSHOTS`, throws `unknown` `MarketDataError` when absent — `src/main/integrations/fake-market-data.ts:241-248`
- ✓ Provider-side mid = computed from bid/ask — `src/main/integrations/alpaca-market-data-mappers.ts:149`
- ✓ `e2e/option-pnl.spec.ts` exists with 10 tests

## Drift (5)

- ✗ TanStack key documented as `['market-data', 'option-snapshots', ...]`; actual prefix is `'market'` — `src/renderer/src/hooks/marketDataQueryKeys.ts:5-6`.
- ✗ Page says the hook "Exports `legsToOccSymbols(legs)` for direct unit testing"; it is a non-exported local function — `src/renderer/src/hooks/useOptionSnapshots.ts:25`.
- ✗ E2E mocking: page says `e2e/option-pnl.spec.ts` sets `WHEELBASE_MARKET_MOCK=true`; the launch env uses `FAKE_MARKET_DATA: 'true'` — `e2e/option-pnl.spec.ts:99` (`WHEELBASE_MARKET_MOCK` appears only in a stale header comment, `:3`, and nowhere in `src/`; the factory keys on `FAKE_MARKET_DATA` — `src/main/integrations/market-data-factory.ts:18`).
- ✗ Page says AC-5 "writes `profit_target_percent=25` directly to SQLite via `better-sqlite3`" and "Per-position override is read-only this story". The spec now uses the `window.api.setPositionProfitTarget` IPC — `e2e/option-pnl.spec.ts:269-272`.
- ✗ Source files: "`PositionDetailContent.tsx` — appended three `StatGrid` items to the Open Leg section". `PositionDetailContent.tsx` (89 lines) no longer renders a StatGrid; the Open Leg drawer now lives in `src/renderer/src/components/position-cockpit/PositionCockpit.tsx:112` and adds only `Current Mid` (P&L / % of max moved into cockpit surfaces under us-34). Suggested fix: note the us-34 supersession.

## Unverifiable (4)

- ? Styling classes for `TargetBadge` / `OptMidCell` / `UnrealizedPnlCell` — not exhaustively checked line by line.
- ? "No DB-level CHECK; validation in service layer (1-99)" — no CHECK in migration 005 (verified), service bound owned by us-57-58, not checked here.
- ? Rationale that Alpaca's option-quote stream lacks Greeks — narrative.
- ? Handoff prototype / open questions under `plans/us-33/` — plan dir history.

## Missing files (0)
