# US-33 — Show current option mid-price and unrealized P&L for open legs — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off
- The `[Refactor]` step **must invoke the `/refactor` skill** in the main conversation (subagents cannot invoke it)

---

## Layer 1 — Foundation (no dependencies)

> All six areas can be started immediately and run in parallel.

### Area 1 — Pure engine: `buildOccSymbol`

- [x] **[Red]** Write failing tests — `src/main/core/option-symbol.test.ts`
  - Test cases:
    - whole-dollar PUT → `'AAPL260516P00180000'`
    - whole-dollar CALL → `'MSFT260502C00420000'`
    - fractional strike `180.5` → contains `'00180500'`
    - four-decimal strike `'180.0050'` → contains `'00180005'`
    - uppercases ticker (`'aapl'` → `'AAPL'` prefix)
    - trims surrounding whitespace from ticker
    - throws on empty ticker
    - throws on malformed expiration `'2026/05/16'`
    - throws on non-positive strike (0, -1)
    - throws on `instrumentType: 'STOCK'`
  - Run `pnpm test option-symbol` — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/option-symbol.ts` _(depends on: Area 1 Red ✓)_
  - Export `buildOccSymbol(input: BuildOccSymbolInput): string`
  - Validation: trim+uppercase ticker (throw on empty), `/^(\d{4})-(\d{2})-(\d{2})$/` expiration regex, `Decimal(strike)` > 0 + finite, `instrumentType` ∈ `{'PUT','CALL'}`
  - Format: `${ticker}${YY}${MM}${DD}${P|C}${strike.times(1000).toFixed(0).padStart(8,'0')}`
  - Only import: `decimal.js`
  - Run `pnpm test option-symbol` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/core/option-symbol.ts` _(depends on: Area 1 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Search repo for existing OCC builder (`OCC`/`occ`); delete duplicate if found
  - Confirm single named export; verify naming consistency with `costbasis.ts`/`lifecycle.ts`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 2 — Pure engine: `computeUnrealizedPnl` + `resolveProfitTarget`

- [x] **[Red]** Write failing tests — `src/main/core/costbasis.test.ts` + `src/main/core/profit-target.test.ts`
  - In `costbasis.test.ts`:
    - profitable case: `{entryPremium:'3.50', currentMid:'1.30', contracts:1}` → `pnl='220.0000'`, `maxProfit='350.0000'`, `pnlPercent='62.8571'`
    - loss case: `currentMid:'5.20'` → `pnl='-170.0000'`, `pnlPercent='-48.5714'`
    - scales by contracts (3 contracts → `pnl='660.0000'`, `maxProfit='1050.0000'`)
    - `currentMid:'0'` → `pnl='350.0000'`, `pnlPercent='100.0000'`
    - rounds half up to 4dp on percentage edge
    - throws on `entryPremium <= 0`, `currentMid < 0`, `contracts < 1`, non-integer contracts
  - In `profit-target.test.ts`:
    - `DEFAULT_PROFIT_TARGET_PERCENT === 50`
    - `resolveProfitTarget(25) === 25`
    - `resolveProfitTarget(null) === 50`
    - `resolveProfitTarget(0) === 0` (real override, not falsy-coalesced)
  - Run `pnpm test costbasis profit-target` — new tests must fail
- [x] **[Green]** Implement — `src/main/core/costbasis.ts` + `src/main/core/profit-target.ts` _(depends on: Area 2 Red ✓)_
  - Append `computeUnrealizedPnl(input: UnrealizedPnlInput): UnrealizedPnlResult` to `costbasis.ts`
    - `maxProfit = entry × contracts × 100`
    - `pnl = (entry − current) × contracts × 100`
    - `pnlPercent = (pnl / maxProfit) × 100`
    - all returned as `Decimal.toFixed(4)` strings
  - New `profit-target.ts` exports `DEFAULT_PROFIT_TARGET_PERCENT = 50` and `resolveProfitTarget(override: number | null): number` (return default only when override is `null`)
  - No DB/IO imports
  - Run `pnpm test costbasis profit-target` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/core/costbasis.ts` + `src/main/core/profit-target.ts` _(depends on: Area 2 Green ✓)_
  - **Invoke the `/refactor` skill**
  - Reuse `sharesFromContracts` and `round4` helpers if already present in `costbasis.ts`
  - Confirm `pnlPercent` uses `toFixed(4)`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 3 — Migration: `profit_target_percent` column

- [x] **[Red]** Write failing tests — extend `src/main/services/list-positions.test.ts` (or add `src/main/db/migrations.test.ts`)
  - migration 005 adds `profit_target_percent INTEGER` (not-null=0) via `PRAGMA table_info(positions)`
  - existing rows get `NULL` for the column
  - `listPositions` returns `profitTargetPercent: null` when not set
  - `listPositions` returns `profitTargetPercent: 25` after `UPDATE ... SET profit_target_percent = 25`
  - Run `pnpm test list-positions` — new tests must fail
- [x] **[Green]** Implement — `migrations/005_add_profit_target_percent.sql` _(depends on: Area 3 Red ✓)_
  - `ALTER TABLE positions ADD COLUMN profit_target_percent INTEGER;`
  - Migration runner picks it up automatically
  - Run `pnpm test list-positions` — all tests must pass
- [x] **[Refactor]** `/refactor` — `migrations/005_add_profit_target_percent.sql` _(depends on: Area 3 Green ✓)_
  - **Invoke the `/refactor` skill**
  - Confirm filename ordering (`005_…` follows `004_…`)
  - Verify `_migrations` table records the new migration on first run
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 5 — IPC schema: `GetOptionSnapshotsPayloadSchema`

- [x] **[Red]** Write failing tests — extend `src/main/schemas.test.ts` (create if absent)
  - accepts non-empty symbol array
  - accepts empty array
  - rejects when symbols is a string
  - rejects empty-string entry
  - rejects entry longer than 25 chars
  - rejects array longer than 50
  - Run `pnpm test schemas` — new tests must fail
- [x] **[Green]** Implement — `src/main/schemas.ts` _(depends on: Area 5 Red ✓)_
  - `GetOptionSnapshotsPayloadSchema = z.object({ symbols: z.array(z.string().min(1).max(25)).max(50) })`
  - Export inferred type `GetOptionSnapshotsPayload`
  - Run `pnpm test schemas` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/schemas.ts` _(depends on: Area 5 Green ✓)_
  - **Invoke the `/refactor` skill**
  - Confirm schema imported only by `src/main/ipc/market-data.ts`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 10 — Renderer helpers: `option-display.ts`

- [x] **[Red]** Write failing tests — `src/renderer/src/lib/option-display.test.ts`
  - `formatPnlPercentForDisplay('62.8571')` → `'62.9'`
  - `formatPnlPercentForDisplay('50.0000')` → `'50'`
  - `isWideSpread({bid:'0.50',ask:'1.50',mid:'1.00'})` → `true`
  - `isWideSpread({bid:'1.25',ask:'1.35',mid:'1.30'})` → `false`
  - `isWideSpread({bid:'0',ask:'0',mid:'0'})` → `false`
  - `hasNoBid({bid:'0'})`, `hasNoBid({bid:'0.00'})`, `hasNoBid({bid:'0.0000'})` → all `true`
  - `hasNoBid({bid:'0.05'})` → `false`
  - `formatTargetTooltip({pnlPercent:'62.8571',maxProfit:'350.0000',targetPercent:50})` → `'62.9% of max profit ($350) — target is 50%'`
  - Run `pnpm test option-display` — new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/lib/option-display.ts` _(depends on: Area 10 Red ✓)_
  - `formatPnlPercentForDisplay(value: string): string` — round to 1dp, drop trailing `.0`
  - `isWideSpread({bid,ask,mid}): boolean` — `mid > 0 && (ask − bid) / mid > 0.10`
  - `hasNoBid({bid}): boolean` — `Decimal(bid).isZero()`
  - `formatTargetTooltip({pnlPercent,maxProfit,targetPercent}): string` — drop cents on whole-dollar `maxProfit`
  - Export `WIDE_SPREAD_THRESHOLD` constant
  - Run `pnpm test option-display` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/lib/option-display.ts` _(depends on: Area 10 Green ✓)_
  - **Invoke the `/refactor` skill**
  - Confirm helpers are pure (no React imports)
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 16 — `FakeMarketDataProvider.getOptionSnapshots`

- [x] **[Red]** Write failing tests — `src/main/integrations/fake-market-data.test.ts`
  - returns entries from `WHEELBASE_MOCK_OPTION_SNAPSHOTS` env var (JSON map keyed by OCC)
  - omits unknown symbols from result
  - returns empty Map when env var unset
  - Run `pnpm test fake-market-data` — new tests must fail
- [x] **[Green]** Implement — `src/main/integrations/fake-market-data.ts` _(depends on: Area 16 Red ✓)_
  - Replace empty stub: `JSON.parse(process.env.WHEELBASE_MOCK_OPTION_SNAPSHOTS ?? '{}')` keyed by OCC; build Map for the requested subset
  - Run `pnpm test fake-market-data` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/integrations/fake-market-data.ts` _(depends on: Area 16 Green ✓)_
  - **Invoke the `/refactor` skill**
  - Confirm parity with `getStockQuotes`'s env-driven pattern
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — Service, IPC handler, presentational components (parallel after Layer 1)

> Five areas, each depends on a single Layer 1 Green. They can all run in parallel.

### Area 4 — Service layer: extend `listPositions`

**Requires:** Area 3 Green ✓

- [x] **[Red]** Write failing tests — extend `src/main/services/list-positions.test.ts` _(depends on: Area 3 Green ✓)_
  - `instrumentType === 'PUT'` for an open CSP
  - `instrumentType === 'CALL'` for an open CC
  - `instrumentType === null` for HOLDING_SHARES
  - `instrumentType === null` for closed positions
  - returns `contracts` and `entryPremiumPerContract` from active leg (`'3.5000'`)
  - `profitTargetPercent: null` by default
  - `profitTargetPercent: 25` when set via UPDATE
  - Run `pnpm test list-positions` — new tests must fail
- [x] **[Green]** Implement — `src/main/services/list-positions.ts` + `src/main/schemas.ts` _(depends on: Area 4 Red ✓)_
  - Extend `LIST_QUERY` SELECT: `l.instrument_type`, `l.contracts`, `l.premium_per_contract`, `p.profit_target_percent`
  - Extend internal `PositionRow` type and row mapper
  - Add fields to `PositionListItem` in `schemas.ts` (default to `null` when no active leg)
  - Run `pnpm test list-positions` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/list-positions.ts` _(depends on: Area 4 Green ✓)_
  - **Invoke the `/refactor` skill**
  - Confirm widened `PositionRow` keeps existing fields
  - Verify `Decimal.toFixed(4)` consistency
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 6 — IPC handler: `market-data:option-snapshots`

**Requires:** Area 5 Green ✓

- [x] **[Red]** Write failing tests — extend `src/main/ipc/market-data.test.ts` _(depends on: Area 5 Green ✓)_
  - registers `market-data:option-snapshots` channel
  - returns `ok:true` with snapshots record on success
  - returns `ok:true` with empty snapshots when symbols is empty (provider not called)
  - omits unknown symbols from result
  - returns `ok:false` `auth_failed` when provider throws `MarketDataError(auth_failed)`
  - returns `ok:false` `network_error` on `MarketDataError(network_error)`
  - returns `ok:false` `internal_error` on unexpected throw
  - returns `ok:false` with Zod validation error (`field: 'symbols'`)
  - Run `pnpm test market-data` — new tests must fail
- [x] **[Green]** Implement — `src/main/ipc/market-data.ts` + `src/main/services/market-data.ts` _(depends on: Area 6 Red ✓)_
  - Add `fetchOptionSnapshots(provider, symbols)` to service (early-return `{}` for empty)
  - Add `ipcMain.handle('market-data:option-snapshots', ...)` using `handleIpcCall` envelope + `GetOptionSnapshotsPayloadSchema.parse`
  - REST-only; no streaming wiring
  - Run `pnpm test market-data` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/ipc/market-data.ts` + `src/main/services/market-data.ts` _(depends on: Area 6 Green ✓)_
  - **Invoke the `/refactor` skill**
  - Confirm helper sits next to `fetchStockQuotes`
  - Verify `OptionSnapshot` is imported, not redefined
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 11 — Component: `OptMidCell`

**Requires:** Area 10 Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/components/OptMidCell.test.tsx` _(depends on: Area 10 Green ✓)_
  - renders `—` when `leg` is null
  - renders `—` when `snapshot` is undefined and leg is set
  - renders `$1.30` in normal case (no warning, no "no bid")
  - renders amber warning icon when spread > 10% of mid (`data-testid="opt-mid-spread-warning"`, `title="Wide spread: $0.50 × $1.50 — P&L may be unreliable"`)
  - renders `no bid` subtext when bid is zero
  - cell carries `data-testid="position-card-{TICKER}-opt-mid"`
  - Run `pnpm test OptMidCell` — new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/OptMidCell.tsx` _(depends on: Area 11 Red ✓)_
  - Two-line mono cell mirroring US-32 `PriceCell` (mockup lines 169–217)
  - Line 1 `text-[0.8125rem] font-semibold text-wb-text-primary`; Line 2 `text-[0.6rem] mt-px`
  - States: `noLeg`, `noQuote` (caption `unavailable`), `wideSpread`, `noBid`, normal
  - `<TableCell>` wrapper with `font-wb-mono`, `data-testid` prop
  - Tooltip uses `fmtMoney`
  - Tailwind/`wb-*` classes only, no inline color hex
  - Run `pnpm test OptMidCell` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/OptMidCell.tsx` _(depends on: Area 11 Green ✓)_
  - **Invoke the `/refactor` skill**
  - Verify only `wb-*` design tokens (per CLAUDE.md and memory feedback)
  - Confirm spread-warning element exposes `data-testid="opt-mid-spread-warning"` so e2e doesn't scrape `title`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 12 — Component: `UnrealizedPnlCell`

**Requires:** Area 2 Green ✓ AND Area 10 Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/components/UnrealizedPnlCell.test.tsx` _(depends on: Area 2 Green ✓, Area 10 Green ✓)_
  - renders `—` when leg is null
  - renders `—` when snapshot is undefined
  - profit case: `+$220.00` line 1 + `+62.9%` line 2, both with `text-wb-green`
  - loss case: `-$170.00` line 1 + `-48.6%` line 2, both with `text-wb-red`
  - cell carries `title="62.9% of max profit"` when profitable
  - cell carries `data-testid="position-card-{TICKER}-pnl"`
  - Run `pnpm test UnrealizedPnlCell` — new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/UnrealizedPnlCell.tsx` _(depends on: Area 12 Red ✓)_
  - Use `computeUnrealizedPnl` from `src/main/core/costbasis.ts`
  - Use `pnlColor` (existing) for color; format dollar via `fmtMoney`; prepend `+` when non-negative
  - `<TableCell>` with `data-testid` prop and `title` attribute
  - Run `pnpm test UnrealizedPnlCell` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/UnrealizedPnlCell.tsx` _(depends on: Area 12 Green ✓)_
  - **Invoke the `/refactor` skill**
  - Extract `formatSignedMoney(value)` to `lib/format.ts` for reuse in Area 15
  - Confirm `wb-*` tokens, no inline hex
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 13 — Component: `TargetBadge`

**Requires:** Area 10 Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/components/TargetBadge.test.tsx` _(depends on: Area 10 Green ✓)_
  - renders nothing when `targetReached: false`
  - renders `TARGET` text + gold styling (`bg-wb-gold-dim`, `text-wb-gold`) when `targetReached: true`
  - tooltip text equals `'62.9% of max profit ($350) — target is 50%'` for the spec inputs
  - gold styling applies regardless of `targetPercent` override (presentational)
  - Run `pnpm test TargetBadge` — new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/TargetBadge.tsx` _(depends on: Area 13 Red ✓)_
  - Props: `{ targetReached, pnlPercent, maxProfit, targetPercent }`
  - Return `null` when `!targetReached`; otherwise gold pill `<span data-testid="target-badge">`
  - Pill shape from US-32 `MarketStatusPill` (mockup lines 134–167): `text-[0.6rem] font-bold tracking-[0.1em] px-2 py-0.5 rounded-[10px] bg-wb-gold-dim text-wb-gold border border-wb-gold-border`
  - No leading dot, no pulse animation
  - Tooltip from `formatTargetTooltip`
  - Run `pnpm test TargetBadge` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/TargetBadge.tsx` _(depends on: Area 13 Green ✓)_
  - **Invoke the `/refactor` skill**
  - If a generic `Badge` from `ui/` exists, reuse it
  - Confirm no logic beyond the `targetReached` switch
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — Preload bridge

**Requires:** Area 6 Green ✓

### Area 7 — Preload bridge: `getOptionSnapshots`

- [x] **[Red]** No preload-level tests (per plan — thin bridge, coverage via Area 8 + e2e)
- [x] **[Green]** Implement — `src/preload/index.ts` + `src/preload/index.d.ts` _(depends on: Area 6 Green ✓)_
  - `index.d.ts`: add `IpcOptionSnapshot`, `IpcGetOptionSnapshotsPayload`, `IpcGetOptionSnapshotsResult` types; extend `Window['api']` with `getOptionSnapshots`
  - `index.ts`: add `getOptionSnapshots` invoke method calling `'market-data:option-snapshots'`
  - Run `pnpm typecheck` — clean
- [x] **[Refactor]** `/refactor` — `src/preload/index.ts` + `src/preload/index.d.ts` _(depends on: Area 7 Green ✓)_
  - **Invoke the `/refactor` skill**
  - Keep `Window['api']` ordering consistent with surrounding methods
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — Renderer adapter

**Requires:** Area 7 Green ✓

### Area 8 — Renderer adapter: `getOptionSnapshots`

- [x] **[Red]** Write failing tests — extend `src/renderer/src/api/market-data.test.ts` _(depends on: Area 7 Green ✓)_
  - returns snapshots record on `ok:true`
  - throws `ApiError(502)` on `ok:false` (`auth_failed`)
  - throws `ApiError(502)` on `network_error`
  - Run `pnpm test market-data` — new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/api/market-data.ts` _(depends on: Area 8 Red ✓)_
  - Export `OptionSnapshot`, `OptionSnapshotsBySymbol` (renderer-side aliases of preload types)
  - `getOptionSnapshots(symbols): Promise<OptionSnapshotsBySymbol>` — call `window.api.getOptionSnapshots`, throw `apiError(502, { detail: result.errors })` on `!ok`
  - Run `pnpm test market-data` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/api/market-data.ts` _(depends on: Area 8 Green ✓)_
  - **Invoke the `/refactor` skill**
  - Confirm `apiError(502, ...)` mirrors `getStockQuotes`
  - Confirm types are renderer-side aliases — never imported from `src/main/`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 5 — Hook

**Requires:** Area 1 Green ✓ AND Area 8 Green ✓

### Area 9 — Hook: `useOptionSnapshots(legs)`

- [x] **[Red]** Write failing tests — `src/renderer/src/hooks/useOptionSnapshots.test.ts` _(depends on: Area 1 Green ✓, Area 8 Green ✓)_
  - disabled (idle) when `legs` is empty
  - disabled when every leg lacks `instrumentType`
  - builds OCC symbols and fetches snapshots
  - re-fetches when legs change (different expiration → different OCC)
  - query key is `['market-data','option-snapshots', sortedSymbolsCsv]`
  - surfaces error state when `window.api` rejects
  - skips legs that throw from `buildOccSymbol` (e.g. `strike: 0`)
  - `refetchInterval === 60_000` ms
  - `refetchInterval === false` when `session: 'closed'`
  - Run `pnpm test useOptionSnapshots` — new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/hooks/useOptionSnapshots.ts` + extend `src/renderer/src/hooks/marketDataQueryKeys.ts` _(depends on: Area 9 Red ✓)_
  - `marketDataQueryKeys.optionSnapshots(symbols)` returns `['market-data','option-snapshots', symbols.slice().sort().join(',')] as const`
  - Hook signature: `useOptionSnapshots(legs: ActiveLegSummary[], options?: { session?: ... }): UseQueryResult<OptionSnapshotsBySymbol, Error>`
  - Build symbols via `buildOccSymbol` inside `useMemo`, wrapped in try/catch per leg (skip invalid)
  - `enabled: symbols.length > 0`, `refetchInterval: session==='closed' ? false : 60_000`, `staleTime: 30_000`, `refetchOnWindowFocus: true`
  - Run `pnpm test useOptionSnapshots` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/hooks/useOptionSnapshots.ts` _(depends on: Area 9 Green ✓)_
  - **Invoke the `/refactor` skill**
  - Extract top-level pure helper `legsToOccSymbols(legs)` for direct testing
  - Confirm `buildOccSymbol` import from `src/main/core/option-symbol.ts` (allowed — leaf pure module)
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 6 — UI Wiring (parallel after Layer 5 + Layer 2)

> Two areas can run in parallel. Both require the hook (Area 9) and the cells/badge (Areas 11–13).

### Area 14 — Wire columns + badge into `PositionRow` + `PositionsListPage`

**Requires:** Area 4 Green ✓ AND Area 9 Green ✓ AND Area 11 Green ✓ AND Area 12 Green ✓ AND Area 13 Green ✓

- [x] **[Red]** Write failing tests — extend `src/renderer/src/components/PositionCard.test.tsx` + `src/renderer/src/pages/PositionsListPage.test.tsx` _(depends on: Areas 4, 9, 11, 12, 13 Green ✓)_
  - `PositionCard.test.tsx`:
    - renders `OptMidCell` after Phase column (full `<td>` order: `Ticker, Phase, Price, Opt Mid, P&L, Strike, Expiration, DTE, Premium, Cost Basis`)
    - renders `TargetBadge` next to ticker when `targetReached: true`
    - no `TargetBadge` when `targetReached: false`
    - passes snapshot to `OptMidCell` and `UnrealizedPnlCell`
    - HOLDING_SHARES row → both cells show `—`
  - `PositionsListPage.test.tsx`:
    - header row text sequence exactly `Ticker, Phase, Price, Opt Mid, P&L, Strike, Expiration, DTE, Premium, Cost Basis`
    - derives `ActiveLegSummary[]` from active positions (asserted via `useOptionSnapshots` mock call args)
    - passes matching snapshot to each row (AAPL gets snapshot, MSFT gets undefined)
    - renders `TARGET` badge when AAPL P&L crosses default 50% (mid `1.30`, ~62.86%)
    - no badge when below threshold (mid `2.00`, ~42.86%)
    - renders `TARGET` with override 25% (mid `2.50`, ~28.57%)
    - no badge when override unmet (override 25, mid `2.90`, ~17%)
    - HOLDING_SHARES position → dashes
    - closed position → dashes
    - passes `session` to `useOptionSnapshots` (`{ session: 'closed' }` when `useMarketStatus` returns closed)
  - Run `pnpm test PositionCard PositionsListPage` — new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/pages/PositionsListPage.tsx` + `src/renderer/src/components/PositionCard.tsx` _(depends on: Area 14 Red ✓)_
  - `PositionsListPage`: extend `TABLE_COLUMNS`; derive `legs` via `useMemo`; call `useOptionSnapshots(legs, { session })`; pass snapshots record + per-row OCC down to `PositionTable`/`PositionRow`
  - `PositionRow`: accept `snapshot?: OptionSnapshot`; compute `pnl/pnlPercent/maxProfit` via `computeUnrealizedPnl` only when `snapshot && entryPremiumPerContract && contracts`; render `<TargetBadge>` after ticker name on line 1 with `flex items-center gap-1.5`; insert `<OptMidCell>` and `<UnrealizedPnlCell>` after `<PriceCell>`; closed rows pass `snapshot={undefined}`
  - Run `pnpm test PositionCard PositionsListPage` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/pages/PositionsListPage.tsx` + `src/renderer/src/components/PositionCard.tsx` _(depends on: Area 14 Green ✓)_
  - **Invoke the `/refactor` skill**
  - Extract pure helper `derivePositionRowDisplay(item, snapshot)` returning `{ targetReached, pnlPercent, maxProfit, targetPercent }`
  - Confirm `PositionTable` colspan still matches new column count for empty/loading rows
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 15 — Wire stats into `PositionDetailContent` Open Leg section

**Requires:** Area 9 Green ✓ AND Area 12 Green ✓ AND (Area 2 Green ✓ — for `computeUnrealizedPnl`)

- [x] **[Red]** Write failing tests — extend `src/renderer/src/pages/PositionDetailPage.test.tsx` _(depends on: Areas 2, 9, 12 Green ✓)_
  - Open Leg section renders `Current Mid` stat with value `$1.30` when snapshot present
  - Open Leg section renders `Unrealized P&L` stat `+$220.00` with green class for profit
  - renders `-$170.00` with red class for loss
  - renders `% of Max Profit` stat `62.9%` (one decimal)
  - omits all three stats when `activeLeg` is null
  - omits all three stats when snapshot is undefined
  - Run `pnpm test PositionDetailPage` — new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/pages/PositionDetailContent.tsx` + `src/renderer/src/pages/PositionDetailPage.tsx` _(depends on: Area 15 Red ✓)_
  - Invoke `useOptionSnapshots([leg])` in `PositionDetailPage`; pass snapshot prop down to `PositionDetailContent`
  - When `activeLeg && snapshot`, append three `StatGrid` items: `Current Mid` (`fmtMoney(snapshot.mid)`), `Unrealized P&L` (`formatSignedMoney(pnl)` colored by `pnlColor`), `% of Max Profit` (`formatPnlPercentForDisplay(pnlPercent)+'%'` colored)
  - Run `pnpm test PositionDetailPage` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/pages/PositionDetailContent.tsx` _(depends on: Area 15 Green ✓)_
  - **Invoke the `/refactor` skill**
  - Confirm `Caption` is the right primitive for stat labels
  - Reuse `formatSignedMoney` from `lib/format.ts` (extracted in Area 12 refactor)
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 7 — E2E Tests

**Requires:** All Green tasks from Layers 1–6 ✓

### Area 17 — E2E Tests

- [x] **[Red]** Write failing e2e tests — `e2e/option-pnl.spec.ts` _(depends on: all Green tasks ✓)_
  - One `it()` per AC bullet; test names mirror AC language
  - AC coverage:
    - **AC-1:** `displays option mid-price as $1.30 in the Opt Mid column for an open CSP` — open AAPL CSP (strike 180, exp 30d, contracts 1, premium 3.50); mock OCC snapshot `bid:'1.20',ask:'1.40',mid:'1.30'`; assert `[data-testid="position-card-AAPL-opt-mid"]:has-text("$1.30")` and header reads `Opt Mid`
    - **AC-2:** `shows unrealized P&L of +$220.00 in green when option has decayed below entry premium` — assert `[data-testid="position-card-AAPL-pnl"]:has-text("+$220.00")` with `text-wb-green` element
    - **AC-3:** `shows unrealized P&L of -$170.00 in red when option is above entry premium` — mid `5.20`; assert `-$170.00` with `text-wb-red`
    - **AC-4:** `shows gold TARGET badge on the row when default 50% threshold is reached` — assert `[data-testid="target-badge"]` inside AAPL row with `title` containing `62.9%`, `$350`, `target is 50%`
    - **AC-5:** `shows gold TARGET badge using per-position override of 25%` — write `profit_target_percent=25` directly via `better-sqlite3` before launch; mid `2.50` (28.57%); assert badge with `title` containing `target is 25%`
    - **AC-6:** `Open Leg section on the detail page shows Current Mid, Unrealized P&L, and % of Max Profit stats` — navigate to detail; assert all three stats with values `$1.30`, `+$220.00` (green), `62.9%`
    - **AC-7:** `shows amber spread-warning icon when bid-ask spread exceeds 10% of mid` — `bid:'0.50',ask:'1.50',mid:'1.00'`; assert `[data-testid="opt-mid-spread-warning"]` with `title="Wide spread: $0.50 × $1.50 — P&L may be unreliable"`
    - **AC-8:** `shows "no bid" indicator when bid is zero on a deep-OTM option` — `bid:'0',ask:'0.05',mid:'0.03'`; assert `$0.03` plus visible `no bid` text; assert P&L `+$347.50` in green
    - **AC-9:** `shows dashes for Opt Mid and P&L when position is HOLDING_SHARES with no open option leg` — assign CSP via `assignCsp` IPC; assert both cells show `—`
    - **AC-10:** `falls back to dashes when option snapshot is unavailable for the OCC symbol` — empty `WHEELBASE_MOCK_OPTION_SNAPSHOTS={}`; assert both cells `—`, other position data still displays
  - Run `pnpm test:e2e option-pnl` — all new tests must fail (per memory: e2e runs fine in Claude Code shell)
- [x] **[Green]** Make e2e tests pass — `e2e/option-pnl.spec.ts` _(depends on: Area 17 Red ✓)_
  - Build `launchWithMocks(dbPath, { quotes, optionSnapshots, marketStatus })` helper forwarding to env vars (mirror `e2e/live-underlying-price.spec.ts`)
  - Helpers: `seedPosition`, `goToPositionsList`, `goToPositionDetail`
  - For AC-5, write to DB with `better-sqlite3` before launching Electron
  - Hard-code OCC symbols in fixtures from seed parameters; use `localDate(30)` for expiration
  - Run `pnpm test:e2e option-pnl` — all tests must pass
- [x] **[Refactor]** `/refactor` — `e2e/option-pnl.spec.ts` _(depends on: Area 17 Green ✓)_
  - **Invoke the `/refactor` skill**
  - Extract `setupOptionSnapshotMocks(page, byOcc)` helper if reused across tests
  - Run `pnpm test:e2e`

---

## Completion Checklist

- [x] All Red tasks complete (tests written and failing for the right reason)
- [x] All Green tasks complete (all tests passing)
- [x] All Refactor tasks complete (lint + typecheck clean)
- [x] E2E tests cover every AC (10/10)
- [x] `pnpm test && pnpm lint && pnpm typecheck` — all clean
- [x] `pnpm test:e2e` — all clean
