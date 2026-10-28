# US-33: Show current option mid-price and unrealized P&L for open legs

<!-- generated:from us-33,us-18 -->

## Summary

Adds live option pricing and unrealized P&L to every position with an open option leg. On the positions list the option mid is the mark in each wheel card's leg block (`$2.60 · $3.50 credit`) and the unrealized P&L is the card's headline figure (since [us-18](./us-18-position-cards.md); they shipped as `Opt Mid` and `P&L` table columns between `Price` and `Strike`), and the position-detail Open Leg section gains three matching stats (`Current Mid`, `Unrealized P&L`, `% of Max Profit`). A new `market-data:option-snapshots` IPC channel polls the [us-31-market-data-provider-adapter](./us-31-market-data-provider-adapter.md) `MarketDataProvider.getOptionSnapshot()` (singular, called once per symbol) every 60 s for OCC symbols built from each active leg. A gold `TARGET` badge in the card header fires when P&L crosses the position's profit target (default 50 %, optional per-position override stored on a new nullable column). HOLDING_SHARES cards and cards with no snapshot render `—` without breaking the rest of the layout.

This story also prototyped a "Triage Cockpit" redesign of `PositionDetailContent` inside `plans/us-33/handoff/`. The cockpit itself — verdict engine, delta gauge, distance thermometer, context strip, collapsible drawers — was **not** shipped under us-33; it was ported and finished under us-34 (see [us-34-position-cockpit](./us-34-position-cockpit.md)). Everything below covers the data layer us-33 actually shipped.

## Acceptance criteria

Background: the trader has an open CSP on AAPL with strike `180.00`, expiration 30 days out, `1` contract, entry premium `3.50`; the `MarketDataProvider` is returning option snapshots.

- **Position row shows option mid-price for the open leg** — Given the current option bid is $1.20 and ask is $1.40, when the trader views the position list, then the AAPL row shows the option mid-price as `$1.30` and the mid-price column header reads `Opt Mid`.
- **Unrealized P&L displays as green when profitable** — Given entry premium was $3.50 and current mid-price is $1.30, the row shows `+$220.00` in green (`(3.50 − 1.30) × 1 × 100 = $220.00`).
- **Unrealized P&L displays as red when at a loss** — Given current mid-price is $5.20, the row shows `-$170.00` in red (`(3.50 − 5.20) × 1 × 100 = −$170.00`).
- **Profit target badge appears when threshold is reached** — Given the global profit target is 50 %, the position has no override, max profit is $350.00, and current P&L is $220.00 (62.9 % of max), then a gold `TARGET` badge appears on the row; hovering shows `62.9% of max profit ($350) — target is 50%`.
- **Per-position profit target overrides global default** — Given the AAPL position has `profit_target_percent = 25` and P&L is $100.00 (28.6 % of max), the gold `TARGET` badge appears (28.6 % > 25 %).
- **Position detail page shows P&L in the Open Leg section** — Three additional `StatGrid` items render: `Current Mid` `$1.30`, `Unrealized P&L` `+$220.00` in green, `% of Max Profit` `62.9%`.
- **Wide bid-ask spread shows warning** — Given bid $0.50 / ask $1.50 (spread > 10 % of mid), the mid `$1.00` displays with an amber spread-warning icon; hovering shows `Wide spread: $0.50 × $1.50 — P&L may be unreliable`.
- **No bid on deep OTM option near expiration** — Given bid $0.00 / ask $0.05, the mid shows `$0.03`, P&L shows `+$347.50` in green, and a `no bid` indicator appears.
- **HOLDING_SHARES position shows no option P&L** — With no open option leg, both `Opt Mid` and `P&L` columns render `—`.
- **Option data unavailable falls back gracefully** — Given the provider returns no snapshot for the AAPL option, mid and P&L both render `—`; the rest of the row displays normally.

(Source: `docs/epics/06-stories/US-33-option-price-unrealized-pnl.md` via `plans/us-33/plan.md`)

## Revisions

- **us-33** (original): shipped the option-snapshots channel, P&L math, profit-target column, and the `Opt Mid` / `P&L` table cells (`OptMidCell`, `UnrealizedPnlCell`) on `PositionRow`, plus the detail-page Open Leg stats.
- **us-18**: the positions table became a card grid. `OptMidCell`, `UnrealizedPnlCell`, `PositionRow` and `derivePositionRowDisplay` are deleted; the mid (with its `no bid` / wide-spread `⚠` note) now renders in the wheel card's leg block, the P&L as the card's headline figure with a `% of max profit` line, and the `TARGET` badge in the card header — all derived by the pure `deriveWheelCardDisplay` view model. Every e2e test id is preserved. `useOptionSnapshots` builds symbols through the shared `occSymbolForLeg`, and the fake provider throws `not_found` for a missing snapshot.

## Architecture decisions

- OCC option symbol building lives in a pure leaf module `src/shared/option-symbol.ts` (format `{TICKER}{YYMMDD}{P|C}{STRIKE×1000 padded 8}`), re-exported through `src/main/core/option-symbol.ts` and imported by both main and renderer — domain rule, single source of truth → [[occ-symbol-pure-leaf]]
- Profit-target storage: a nullable `profit_target_percent INTEGER` column on `positions` (migration `005`), plus a hard-coded `DEFAULT_PROFIT_TARGET_PERCENT = 50` constant resolved by `resolveProfitTarget(override)`; no `app_settings` table → [[profit-target-nullable-column]]
- Target-reached check runs renderer-side after `computeUnrealizedPnl` — IPC does not ship a `targetReached` boolean, avoiding an extra round-trip on every price tick → [[profit-target-nullable-column]]
- P&L math (`computeUnrealizedPnl`) is added to `src/main/core/costbasis.ts`, returning `Decimal.toFixed(4)` strings on the 0–100 percent scale to match the engine's existing convention → [[pnl-math-in-costbasis]]
- REST-only polling at 60 s, disabled when `session === 'closed'`; no WebSocket stream (Alpaca's option-quote stream lacks Greeks, which us-34 needs) → [[option-snapshots-rest-polling]]
- The renderer builds OCC symbols from active legs and calls `getOptionSnapshots(payload)` (the IPC channel is plural); the main process never receives raw leg objects → [[renderer-builds-occ-symbols]]
- Active-leg metadata (`instrumentType`, `contracts`, `entryPremiumPerContract`, `profitTargetPercent`) flows through `positions:list` by extending the existing active-leg subquery — no second query → [[active-leg-metadata-via-positions-list]]
- `market-data:option-snapshots` returns the provider's full `OptionSnapshot` 1:1 including `greeks`, `lastTrade`, `openInterest`, `volume` — no flattening, so us-34 can read Greeks without a contract change → [[ipc-returns-full-option-snapshot]]
- Wide-spread (`(ask − bid) / mid > 0.10`) and no-bid (`Decimal(bid).isZero()`) are pure renderer predicates in `src/renderer/src/lib/option-display.ts`, directly testable without React state → [[spread-no-bid-renderer-predicates]]
- The card's display is a discriminated union (`closed | shares | option`) from `deriveWheelCardDisplay` (`src/renderer/src/lib/wheel-card-display.ts`), so a closed or shares-only card cannot carry a TARGET badge or a live P&L → [us-18-position-cards](./us-18-position-cards.md)
- Per-position override is read-only this story — no editing UI; AC-5 is verified by seeding the column directly. Editing is a future ticket.
- The "Triage Cockpit" prototype in `plans/us-33/handoff/` (verdict engine + cockpit components) is **not** part of us-33's shipped surface; see [us-34-position-cockpit](./us-34-position-cockpit.md).

## Contracts

- `market-data:option-snapshots` — new IPC request/response handler; payload `{ symbols: string[] }` (OCC, ≤ 50, each 1–25 chars); response `{ ok: true, snapshots: Record<string, IpcOptionSnapshot> } | { ok: false, errors }`. Empty input returns `{ ok: true, snapshots: {} }` without calling the provider; missing symbols are absent from the map (renderer renders `—`). `MarketDataError` codes (`auth_failed`, `network_error`, `rate_limited`) map to a `__root__` field error → [contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `IpcOptionSnapshot` — IPC-flat shape with `bid`, `ask`, `mid`, `lastTrade` (all decimal strings), `openInterest`/`volume` (`number | null`), `greeks` (`{ delta, gamma, theta, vega, iv }` decimal strings), `timestamp` — full passthrough from the provider → [contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `GetOptionSnapshotsPayloadSchema` — Zod `{ symbols: z.array(z.string().min(1).max(25)).max(50) }`; empty array is valid → [contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `positions:list` (extension) — `PositionListItem` gains four nullable fields: `instrumentType: 'PUT' | 'CALL' | null`, `contracts: number | null`, `entryPremiumPerContract: string | null`, `profitTargetPercent: number | null`. Sourced by extending `LIST_QUERY`'s active-leg subquery SELECT to include `l.instrument_type, l.contracts, l.premium_per_contract` plus `p.profit_target_percent`. All four are `null` when no active option leg exists → [contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- Preload bridge — `window.api.getOptionSnapshots(payload)` invoke method; no event listeners (REST-only) → [contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `buildOccSymbol({ ticker, expiration, strike, instrumentType })` — pure function; trims/uppercases ticker, validates `YYYY-MM-DD`, requires `strike > 0` and `instrumentType ∈ {PUT, CALL}`; supports up to 4-decimal strikes; only imports `decimal.js`. Defined in `src/shared/option-symbol.ts` and re-exported through `src/main/core/option-symbol.ts` (a barrel)
- `computeUnrealizedPnl({ entryPremium, currentMid, contracts })` → `{ pnl, pnlPercent, maxProfit }` — all `Decimal.toFixed(4)` strings; `pnlPercent` on the 0–100 scale; `Decimal.ROUND_HALF_UP`; validates `entryPremium > 0`, `currentMid ≥ 0`, `contracts ≥ 1` → [domain/cost-basis.md](../domain/cost-basis.md)
- `resolveProfitTarget(override: number | null) → number` — returns `DEFAULT_PROFIT_TARGET_PERCENT = 50` when override is `null`; explicit `=== null` so `0` is honored as a real override → `src/main/core/profit-target.ts`
- `useOptionSnapshots(legs, { session })` — renderer hook; `useMemo`-builds sorted OCC symbols through the shared `occSymbolForLeg(leg)` (`src/shared/option-symbol.ts`, [us-18]), which returns `null` — and the leg is skipped — for a non-option leg or one `buildOccSymbol` rejects; `enabled: symbols.length > 0`, `refetchInterval: session === 'closed' ? false : 60_000`, `staleTime: 30_000`, `refetchOnWindowFocus: true`. `PositionsGrid` uses the same helper to look up each wheel card's snapshot.
- TanStack Query key — `['market-data', 'option-snapshots', symbols.slice().sort().join(',')]` (sorted to keep the cache stable across input ordering).

## Schema changes

Migration `005_add_profit_target_percent.sql`:

```sql
ALTER TABLE positions
  ADD COLUMN profit_target_percent INTEGER;
```

- Nullable `INTEGER`, no default. `NULL` means "use `DEFAULT_PROFIT_TARGET_PERCENT = 50`".
- Valid non-null range: `1-99` inclusive. No DB-level `CHECK`; validation is enforced in the service layer. (This corrects the earlier prediction of "1..100" made before the edit IPC shipped — see [us-57-58 — Configurable Alert Thresholds](../features/us-57-58-configurable-alert-thresholds.md), which shipped the real edit path with the 1-99 bound.)
- Read-only for this story — seeded only via tests/dev. Migration runs automatically on app start via `runMigrations()`.

→ [schema/tables.md](../schema/tables.md)

## Decisions & tradeoffs

- **P&L formula** — `maxProfit = entryPremium × contracts × 100`; `pnl = (entryPremium − currentMid) × contracts × 100`; `pnlPercent = (pnl / maxProfit) × 100`. Sign convention: positive when the option decays below entry premium.
- **Mid-price formula** — `mid = (bid + ask) / 2`, set provider-side on `OptionSnapshot.mid`; the renderer reads it directly with no client-side recomputation.
- **Wide-spread predicate** — `mid > 0 && (ask − bid) / mid > 0.10`; `WIDE_SPREAD_THRESHOLD = 0.1`. When `mid === 0` the predicate returns `false` and the "no bid" indicator owns the case.
- **No-bid predicate** — `Decimal(bid).isZero()` — `'0'`, `'0.00'`, `'0.0000'` all match.
- **Target tooltip text** — `${pnlPercentForDisplay}% of max profit ($${maxProfitWholeOrCents}) — target is ${targetPercent}%`; percent rounded to one decimal with trailing `.0` stripped (`'62.8571'` → `'62.9'`, `'50.0000'` → `'50'`); `maxProfit` drops cents when whole (`'350.0000'` → `'350'`).
- **Card display states** ([us-18]) — `deriveWheelCardDisplay(item, snapshot, quote, { closed, profitTargetDefault })` returns one of: `shares` (no option leg) → leg `no option leg open — sell a covered call` with `—` DTE and mark, P&L `—` / `no option leg open`; `closed` → `—` mark and P&L `—` / `closed — no live marks` (no snapshot is requested for closed items); `option` → a mark that is either `'unavailable'` (no snapshot, or one whose bid/ask/mid do not parse) or `{ mid, note }`, and a P&L that is either `'unavailable'` or a valued `{ amount, tone, target, percentLine }`. The mark note is `noBid` or `wideSpread`; **`no bid` wins over the wide-spread warning** (a zero bid always reads as wide).
- **Target-reached predicate** — `pnlPercent >= resolveProfitTarget(item.profitTargetPercent, profitTargetDefault)`, where `profitTargetDefault` is the global alert default from settings; an explicit per-position `0` is honoured (explicit `=== null`, not falsy-coalesced).
- **Where the figures sit** ([us-18]) — the table's `['Ticker', 'Phase', 'Price', 'Opt Mid', 'P&L', 'Strike', …]` column order is gone. On a wheel card the header carries the ticker, `PhaseBadge`, then the `TARGET` badge and `Expiring soon` flag; the `Unrealized P&L` headline figure sits under the header; the leg block reads `$180.00 put · 2027-09-12 · 30d · $2.60 · $3.50 credit` (tag, title, DTE, mark, credit).
- **`TargetBadge` styling** — gold pill mirroring `MarketStatusPill` shape (`bg-wb-gold-dim text-wb-gold border border-wb-gold-border`); static, no leading dot, no pulse; tooltip from `formatTargetTooltip`.
- **Mark** ([us-18], `MarkText` in `WheelCard.tsx`) — the mid via `fmtMoney`; muted ` no bid` subtext when `hasNoBid`; amber `⚠` (`opt-mid-spread-warning`) with the spread tooltip when `isWideSpread`; when unavailable, `— unavailable` with `cursor-help` and `title="Option snapshot unavailable"`.
- **P&L figure** ([us-18], `PnlFigure` in `WheelCard.tsx`) — the signed dollar amount (`+$220.00`) in `text-wb-green` / `text-wb-red` as the card's headline figure, over a `+62.9% of max profit` line in the same tone. The percent is signed by the P&L's tone, not the rounded figure, so a tiny loss reads `-0%`, never `+0%`. Blank states show a muted `—` over the state text (`unavailable`, `no option leg open`, `closed — no live marks`).
- **Spread-warning tooltip** — `Wide spread: $0.50 × $1.50 — P&L may be unreliable` (formatted from `bid`/`ask` via `fmtMoney`). E2E selects via `data-testid="opt-mid-spread-warning"`.
- **Test IDs added for e2e** — `position-card-{TICKER}-opt-mid`, `position-card-{TICKER}-pnl`, `target-badge`, `opt-mid-spread-warning`. [us-18] preserved all four on the card (the mark span, the P&L figure, the header badge, the `⚠`).
- **Refactor extractions** — `formatSignedMoney(value)` lives in `src/renderer/src/lib/format.ts`, shared by the card's P&L figure and the detail-page Open Leg stats. us-33's `derivePositionRowDisplay` was superseded by [us-18]'s `deriveWheelCardDisplay`.
- **`FakeMarketDataProvider.getOptionSnapshot`** (singular) — Reads `WHEELBASE_MOCK_OPTION_SNAPSHOTS` (JSON map keyed by OCC) and returns the `OptionSnapshot` for the requested contract id, throwing a `not_found` `MarketDataError` when the symbol is absent ([us-18]; was `unknown`), matching the Alpaca adapter so one missing contract does not fail the whole batch. Matches the env-driven pattern `getStockQuotes` uses from [us-32-live-position-prices](./us-32-live-position-prices.md).
- **E2E mocking strategy** — [us-18] AC-1 now asserts the card's mid (and that no table header exists) rather than the `Opt Mid` column header. `e2e/option-pnl.spec.ts` sets `WHEELBASE_MARKET_MOCK=true` (the us-32 lever) plus `WHEELBASE_MOCK_OPTION_SNAPSHOTS`; each test seeds positions via `createPosition` IPC and hard-codes OCC symbols verified by `option-symbol.test.ts`. AC-5 writes `profit_target_percent=25` directly to SQLite via `better-sqlite3` (cleaner than a test-only IPC handler).

## Source code references

Files this plan introduced or modified:

- `src/shared/option-symbol.ts` — pure module defining `buildOccSymbol` and ([us-18]) `occSymbolForLeg`; re-exported through the `src/main/core/option-symbol.ts` barrel
- `src/main/core/profit-target.ts` — new pure module: `DEFAULT_PROFIT_TARGET_PERCENT`, `resolveProfitTarget`
- `src/main/core/costbasis.ts` — added `computeUnrealizedPnl` + types
- `src/main/schemas.ts` — `GetOptionSnapshotsPayloadSchema`; `PositionListItem` extended with `instrumentType`, `contracts`, `entryPremiumPerContract`, `profitTargetPercent`
- `src/main/services/list-positions.ts` — extended `LIST_QUERY` SELECT and row mapper with active-leg `instrument_type`/`contracts`/`premium_per_contract` and `positions.profit_target_percent`
- `src/main/services/market-data.ts` — added `fetchOptionSnapshots(provider, symbols)`, which loops calling the provider's singular `getOptionSnapshot(symbol)` per OCC symbol
- `src/main/ipc/market-data.ts` — extended `registerMarketDataHandlers` with `market-data:option-snapshots`
- `src/main/integrations/fake-market-data.ts` — replaced stub `getOptionSnapshot` (singular) with env-driven implementation
- `migrations/005_add_profit_target_percent.sql` — nullable `profit_target_percent INTEGER` on `positions`
- `src/preload/index.ts` — `getOptionSnapshots` invoke method
- `src/preload/index.d.ts` — `IpcOptionSnapshot`, `IpcGetOptionSnapshotsPayload`, `IpcGetOptionSnapshotsResult`; `Window['api']` extension
- `src/renderer/src/api/market-data.ts` — `getOptionSnapshots`, `OptionSnapshot` / `OptionSnapshotsBySymbol` type aliases
- `src/renderer/src/hooks/marketDataQueryKeys.ts` — `optionSnapshots(symbols)` key
- `src/renderer/src/hooks/useOptionSnapshots.ts` — new hook (REST poll, session-aware refetch)
- `src/renderer/src/lib/option-display.ts` — `formatPnlPercentForDisplay`, `isWideSpread`, `hasNoBid`, `formatTargetTooltip`, `WIDE_SPREAD_THRESHOLD`
- `src/renderer/src/lib/format.ts` — added `formatSignedMoney`
- `src/renderer/src/components/TargetBadge.tsx` — gold pill rendered when the target is reached
- `src/renderer/src/lib/wheel-card-display.ts` — [us-18] `deriveWheelCardDisplay`: mark, P&L and target per card
- `src/renderer/src/components/position-card/WheelCard.tsx` — [us-18] renders the mark in the leg block, the P&L figure and the `TARGET` badge
- `src/renderer/src/components/PositionsGrid.tsx` — [us-18] looks up each wheel card's snapshot by `occSymbolForLeg`
- `src/renderer/src/pages/PositionsListPage.tsx` — derives `legs` via `useMemo`; wires `useOptionSnapshots(legs, { session })`; passes snapshots to the grid
- Deleted by [us-18]: `OptMidCell.tsx`, `UnrealizedPnlCell.tsx`, `PositionCard.tsx` (`PositionRow`) and the page's `TABLE_COLUMNS`
- `src/renderer/src/pages/PositionDetailContent.tsx` — appended three `StatGrid` items to the Open Leg section when snapshot present
- `src/renderer/src/pages/PositionDetailPage.tsx` — invokes `useOptionSnapshots([leg])` and threads the snapshot down
- `e2e/option-pnl.spec.ts` — 10 e2e tests, one per AC

Cockpit prototype files (under `plans/us-33/handoff/` and ported to production under us-34) — see [us-34-position-cockpit](./us-34-position-cockpit.md) for the full list.

## Open questions

`plans/us-33/research.md` recorded none — "All unknowns resolved — proceed to Phase 1." The handoff prototype raised three questions that are now owned by us-34:

- Should the verdict pill be clickable to surface its rationale (which rule fired, threshold values)?
- Should `TARGET HIT` automatically pre-fill the Close CSP form, or stay informational?
- Stale-snapshot threshold — confirm 5 min against any other convention in the app.

<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
