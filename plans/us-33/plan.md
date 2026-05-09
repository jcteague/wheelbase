# Implementation Plan: US-33 — Show current option mid-price and unrealized P&L for open legs

## Summary

Adds two new columns (`Opt Mid` and `P&L`) to the positions list and three new stats
(`Current Mid`, `Unrealized P&L`, `% of Max Profit`) to the position-detail Open Leg
section, plus a gold `TARGET` badge that fires when the unrealized P&L reaches the
position's profit target (default 50%, optionally overridden per position). A new IPC
channel `market-data:option-snapshots` polls the existing `MarketDataProvider`
(already shipping `getOptionSnapshots(contractIds)` from US-31) every 60 s for the
OCC symbols built from each active option leg. Done state: every active option leg
shows live mid-price, signed P&L colored green/red, and the TARGET badge when
threshold is crossed; HOLDING_SHARES rows show `—`; spread > 10% of mid shows an
amber warning; missing snapshots show `—` without breaking the row.

## Supporting Documents

Read these before starting implementation — they contain the decisions, data model, and API contracts:

- **User Story & Acceptance Criteria:** `docs/epics/06-stories/US-33-option-price-unrealized-pnl.md`
- **Research & Design Decisions:** `plans/us-33/research.md`
- **Data Model & Derived UI States:** `plans/us-33/data-model.md`
- **API Contracts:**
  - `plans/us-33/contracts/market-data-option-snapshots.md` (new IPC channel)
  - `plans/us-33/contracts/positions-list.md` (existing channel, extended response)
- **Quickstart & Verification:** `plans/us-33/quickstart.md`
- **Visual Reference:** `mockups/us-32-live-underlying-price.mdx` (US-33 has no
  mockup of its own; reuse the US-32 idiom — see "Visual Idiom" below).

## Visual Idiom (from US-32 mockup)

`mockups/us-32-live-underlying-price.mdx` is the canonical visual reference for
this story. Lift these specific patterns:

- **Two-line mono table cell** (lines 169–217, `PriceCell`): top line is the primary
  value (`text-[0.8125rem] font-semibold text-wb-text-primary`); bottom line is a
  secondary detail at `text-[0.68rem]` colored by meaning. Cell padding is
  `10px 16px` (`px-4 py-2.5`), bottom-border `border-b border-wb-border/40`.
  `OptMidCell` and `UnrealizedPnlCell` follow this two-line shape.
- **Unavailable cell** (lines 169–186): when value is missing, render `—` in
  muted color (`text-wb-text-muted` / `#4a5a6a`) on line 1, with the small
  caption `unavailable` on line 2 in the same muted tone, and put a `title`
  tooltip on the `<td>`. `OptMidCell` and `UnrealizedPnlCell` use this exact
  shape for the `noLeg` and `noQuote` states (caption text `—` only when
  there is no leg; `unavailable` only when leg exists but snapshot missing).
- **Green/red signed values** (lines 209–215): use `text-wb-green` for positive
  P&L, `text-wb-red` for negative — the same tokens used for the daily change
  in `PriceCell`. Always prepend a `+` for non-negative values to mirror the
  US-32 change column (`+$1.45`).
- **Pill-shaped badge** (lines 100–132 `PhasePill`, lines 134–167 `MarketStatusPill`):
  mono font, `text-[0.65rem]` to `text-[0.7rem]`, `font-semibold` or `font-bold`,
  uppercase, `tracking-[0.06em]` to `tracking-[0.1em]`, padding `px-2 py-0.5`,
  rounded (`rounded` for square pills, `rounded-[10px]` for fully-pill shapes),
  `bg-{color}/10 text-{color} border border-{color}/30`. `TargetBadge` is gold
  using existing `wb-gold-*` tokens (`bg-wb-gold-dim text-wb-gold border-wb-gold-border`).
- **Stale/warning banner** (lines 327–343): amber thin banner across the top of
  the table area, mono font, `text-[0.75rem] text-wb-gold` with `bg-wb-gold-dim`
  and `border-b border-wb-gold-border/30`, prefixed with a `⚠` glyph. We do not
  add a new banner for spread warnings (per-cell only), but if AC-7's amber
  treatment ever escalates, this is the visual to copy.
- **Mono font on every numeric cell** (`font-wb-mono` Tailwind class — the
  existing token for `'JetBrains Mono', 'Fira Mono', 'Cascadia Code'`).
- **Hover affordance** (`wb-row-hover`, lines 248): rows already get
  `hover:bg-white/[0.025] cursor-pointer` from `PositionRow`; new cells inherit
  this — no per-cell hover styling needed.

These rules drive the Green sections of Areas 11–15 below; do not invent new
colors, font sizes, or border tokens outside this idiom.

## Prerequisites

- US-31 shipped: `MarketDataProvider` interface; `getOptionSnapshots(contractIds)`
  already implemented in `AlpacaMarketDataProvider` and stubbed in
  `FakeMarketDataProvider` (returns empty Map).
- US-32 shipped: `registerMarketDataHandlers(provider, getWindow)` IPC scaffold,
  `handleIpcCall` envelope, `useStockQuotes`/`useMarketStatus` hook patterns,
  `marketDataQueryKeys` keys, `data-testid="position-card-{TICKER}-price"` pattern.
- Renderer routing, TanStack Query setup, existing PositionRow / PositionsListPage
  / PositionDetailContent layout.
- Existing helpers: `fmtMoney`, `pnlColor`, `Caption`, `SectionCard`, `StatGrid`,
  `TableCell`, `apiError`.

---

## Implementation Areas

### 1. Pure engine: `buildOccSymbol`

**Files to create or modify:**

- `src/main/core/option-symbol.ts` — new pure module.
- `src/main/core/option-symbol.test.ts` — new test file.

**Red — tests to write (in `src/main/core/option-symbol.test.ts`):**

- `buildOccSymbol returns standard OCC string for whole-dollar PUT` — input
  `{ ticker: 'AAPL', expiration: '2026-05-16', strike: 180, instrumentType: 'PUT' }`
  → expect `'AAPL260516P00180000'`.
- `buildOccSymbol returns standard OCC string for whole-dollar CALL` — input
  `{ ticker: 'MSFT', expiration: '2026-05-02', strike: 420, instrumentType: 'CALL' }`
  → expect `'MSFT260502C00420000'`.
- `buildOccSymbol formats fractional strikes` — input `strike: 180.5` →
  expect symbol contains `'00180500'`.
- `buildOccSymbol formats four-decimal strikes` — input `strike: '180.0050'` →
  expect symbol contains `'00180005'`.
- `buildOccSymbol uppercases the ticker` — input `ticker: 'aapl'` → expect prefix `'AAPL'`.
- `buildOccSymbol trims surrounding whitespace from ticker` — input `'  AAPL  '` →
  expect prefix `'AAPL'` only.
- `buildOccSymbol throws on empty ticker`.
- `buildOccSymbol throws on malformed expiration ('2026/05/16')`.
- `buildOccSymbol throws on non-positive strike (0, -1)`.
- `buildOccSymbol throws on instrumentType: 'STOCK'`.

**Green — implementation:**

- File `src/main/core/option-symbol.ts` exports `buildOccSymbol(input: BuildOccSymbolInput): string`.
- Implementation:
  1. Trim + uppercase ticker; throw `Error('Invalid ticker')` if empty.
  2. Match `expiration` against `/^(\d{4})-(\d{2})-(\d{2})$/`; throw on mismatch.
     Extract YY (last 2 of YYYY), MM, DD.
  3. Coerce `strike` via `new Decimal(strike)`; throw if `lte(0)` or not finite.
  4. Compute `strikeInt = strike.times(1000).toFixed(0)`; left-pad with `'0'` to width 8.
  5. `optionLetter = instrumentType === 'PUT' ? 'P' : instrumentType === 'CALL' ? 'C' : (throw)`.
  6. Return `${ticker}${YY}${MM}${DD}${optionLetter}${strikeInt8}`.
- No imports from anything except `decimal.js`.

**Refactor — cleanup to consider:**

- Confirm there is no existing OCC builder elsewhere in the repo (search `OCC`/`occ`).
  If found, delete the duplicate.
- Verify the helper exports a single named function — no default export.
- Check naming consistency with sibling pure modules (`costbasis.ts`, `lifecycle.ts`).

**Acceptance criteria covered:**

- Foundational. Used by every option-snapshot AC.

---

### 2. Pure engine: `computeUnrealizedPnl` + profit-target resolver

**Files to create or modify:**

- `src/main/core/costbasis.ts` — add `computeUnrealizedPnl` (and types).
- `src/main/core/costbasis.test.ts` — extend with new cases.
- `src/main/core/profit-target.ts` — new pure module exporting `DEFAULT_PROFIT_TARGET_PERCENT` and `resolveProfitTarget`.
- `src/main/core/profit-target.test.ts` — new test file.

**Red — tests to write:**

In `src/main/core/costbasis.test.ts`:

- `computeUnrealizedPnl returns positive pnl when current mid is below entry premium`
  — input `{ entryPremium: '3.50', currentMid: '1.30', contracts: 1 }` → expect
  `pnl === '220.0000'`, `maxProfit === '350.0000'`, `pnlPercent === '62.8571'`.
- `computeUnrealizedPnl returns negative pnl when current mid is above entry premium`
  — input `{ entryPremium: '3.50', currentMid: '5.20', contracts: 1 }` → expect
  `pnl === '-170.0000'`, `pnlPercent === '-48.5714'`.
- `computeUnrealizedPnl scales by contracts` — input `contracts: 3`,
  `entryPremium: '3.50'`, `currentMid: '1.30'` → expect `pnl === '660.0000'`,
  `maxProfit === '1050.0000'`.
- `computeUnrealizedPnl handles current mid of 0 (max profit)` — input
  `currentMid: '0'`, `entryPremium: '3.50'`, `contracts: 1` → expect
  `pnl === '350.0000'`, `pnlPercent === '100.0000'`.
- `computeUnrealizedPnl rounds half up to 4 decimal places` — verify
  `Decimal.ROUND_HALF_UP` is honored on the percentage edge case.
- `computeUnrealizedPnl throws on entryPremium <= 0`.
- `computeUnrealizedPnl throws on currentMid < 0`.
- `computeUnrealizedPnl throws on contracts < 1` and on non-integer contracts.

In `src/main/core/profit-target.test.ts`:

- `DEFAULT_PROFIT_TARGET_PERCENT is 50`.
- `resolveProfitTarget returns the override when provided` — input `25` returns `25`.
- `resolveProfitTarget returns the default when override is null` — input `null` returns `50`.
- `resolveProfitTarget returns the default when override is 0` — by spec `0` is treated as a real override (returns `0`), confirming we don't accidentally falsy-coalesce. (Alternative behavior would be ambiguous; see research.md.)

**Green — implementation:**

- In `src/main/core/costbasis.ts`, append:

  ```ts
  export interface UnrealizedPnlInput {
    entryPremium: string
    currentMid: string
    contracts: number
  }
  export interface UnrealizedPnlResult {
    pnl: string
    pnlPercent: string
    maxProfit: string
  }
  export function computeUnrealizedPnl(input: UnrealizedPnlInput): UnrealizedPnlResult {
    // validate inputs (throw on invalid)
    // entry, current as Decimal
    // maxProfit = entry * contracts * 100
    // pnl = (entry - current) * contracts * 100
    // pnlPercent = (pnl / maxProfit) * 100
    // return all as toFixed(4)
  }
  ```

- In `src/main/core/profit-target.ts`:

  ```ts
  export const DEFAULT_PROFIT_TARGET_PERCENT = 50
  export function resolveProfitTarget(override: number | null): number {
    return override === null ? DEFAULT_PROFIT_TARGET_PERCENT : override
  }
  ```

- No DB/IO imports anywhere in either file.

**Refactor — cleanup to consider:**

- Confirm `computeUnrealizedPnl` reuses `sharesFromContracts` and `round4` helpers
  already in `costbasis.ts` rather than reinventing them.
- Confirm `pnlPercent` uses 4-decimal `toFixed(4)` to match the rest of the engine.

**Acceptance criteria covered:**

- "Unrealized P&L displays as green when profitable" (positive case).
- "Unrealized P&L displays as red when at a loss" (negative case).
- "Profit target badge appears when threshold is reached" (resolver supplies the threshold).
- "Per-position profit target overrides global default".

---

### 3. Migration: `profit_target_percent` column

**Files to create or modify:**

- `migrations/005_add_profit_target_percent.sql` — new SQL migration.
- `src/main/services/list-positions.test.ts` — extend to assert the new column flows through.

**Red — tests to write (in `src/main/services/list-positions.test.ts` or a new `src/main/db/migrations.test.ts`):**

- `migration 005 adds profit_target_percent column to positions table` — open a fresh
  in-memory DB, run migrations, run `PRAGMA table_info(positions)`, assert the column
  appears with type `INTEGER` and non-required (not-null=0).
- `existing positions get NULL for the new column` — after running all migrations,
  insert a row using only pre-existing columns; assert `profit_target_percent IS NULL`.
- `listPositions returns profitTargetPercent: null when not set` — seed a CSP
  position; call `listPositions(db)`; expect `result[0].profitTargetPercent === null`.
- `listPositions returns profitTargetPercent: 25 when override is set` — `UPDATE
positions SET profit_target_percent = 25`; assert the same field returns `25`.

**Green — implementation:**

- `migrations/005_add_profit_target_percent.sql`:

  ```sql
  ALTER TABLE positions
    ADD COLUMN profit_target_percent INTEGER;
  ```

- Migration runner picks it up automatically (sorts files; new file > existing 004).

**Refactor — cleanup to consider:**

- Confirm migration filename ordering (`005_…` follows `004_…`).
- Verify the `_migrations` table records the new migration on first run and skips it on subsequent runs.

**Acceptance criteria covered:**

- Foundational for "Per-position profit target overrides global default" — column must exist before service-layer reads it.

---

### 4. Service layer: extend `listPositions` SELECT + mapping

**Files to create or modify:**

- `src/main/services/list-positions.ts` — extend `LIST_QUERY` and `PositionRow`/mapping.
- `src/main/schemas.ts` — extend `PositionListItem` interface with the four new fields.
- `src/main/services/list-positions.test.ts` — extend.

**Red — tests to write (in `src/main/services/list-positions.test.ts`):**

- `listPositions returns instrumentType "PUT" for an open CSP` — seed a CSP; expect
  `result[0].instrumentType === 'PUT'`.
- `listPositions returns instrumentType "CALL" for an open CC` — seed assignment +
  open CC; expect `result[0].instrumentType === 'CALL'`.
- `listPositions returns instrumentType null for HOLDING_SHARES` — seed CSP →
  assignment (no CC yet); expect `result[0].instrumentType === null`.
- `listPositions returns instrumentType null for closed positions` — seed CSP →
  close; expect closed row's `instrumentType === null`.
- `listPositions returns contracts and entryPremiumPerContract from the active leg`
  — for CSP with `contracts: 1`, `premium: '3.50'`, expect those values back as
  `contracts: 1`, `entryPremiumPerContract: '3.5000'`.
- `listPositions returns profitTargetPercent: null by default` — without an override,
  expect `null`.
- `listPositions returns profitTargetPercent: 25 when set` — `UPDATE positions ...`;
  expect `25`.

**Green — implementation:**

- Extend `LIST_QUERY` to also select `l.instrument_type`, `l.contracts`,
  `l.premium_per_contract`, `p.profit_target_percent`.
- Extend internal `PositionRow` type and the row mapper.
- Add four new fields to `PositionListItem` in `schemas.ts`. New fields default to
  `null` when there's no active leg (LEFT JOIN result is null).

**Refactor — cleanup to consider:**

- Verify the renamed/widened `PositionRow` keeps the existing fields.
- Confirm `Decimal(...)` formatting is consistent (existing code uses `toFixed(4)`).
- Update any call sites of `listPositions` if a tighter type is in use.

**Acceptance criteria covered:**

- Foundational. Required by every snapshot/P&L AC because the renderer needs the leg
  metadata to build OCC symbols.

---

### 5. IPC schema: `GetOptionSnapshotsPayloadSchema`

**Files to create or modify:**

- `src/main/schemas.ts` — add the schema.
- `src/main/schemas.test.ts` — extend (or new file if absent).

**Red — tests to write:**

- `GetOptionSnapshotsPayloadSchema accepts non-empty symbol array` — `parse({ symbols: ['AAPL260516P00180000'] })` succeeds.
- `GetOptionSnapshotsPayloadSchema accepts empty array` — `parse({ symbols: [] })` succeeds.
- `GetOptionSnapshotsPayloadSchema rejects when symbols is a string` — `safeParse({ symbols: 'AAPL...' })` fails with path `symbols`.
- `GetOptionSnapshotsPayloadSchema rejects empty-string entry` — `safeParse({ symbols: [''] })` fails.
- `GetOptionSnapshotsPayloadSchema rejects entry longer than 25 chars` — fails.
- `GetOptionSnapshotsPayloadSchema rejects array longer than 50` — fails.

**Green — implementation:**

- Add to `src/main/schemas.ts`:

  ```ts
  export const GetOptionSnapshotsPayloadSchema = z.object({
    symbols: z.array(z.string().min(1).max(25)).max(50)
  })
  export type GetOptionSnapshotsPayload = z.infer<typeof GetOptionSnapshotsPayloadSchema>
  ```

**Refactor — cleanup to consider:**

- Confirm the schema is imported only by `src/main/ipc/market-data.ts`.

**Acceptance criteria covered:**

- Defensive layer for every option-snapshot AC.

---

### 6. IPC handler: `market-data:option-snapshots`

**Files to create or modify:**

- `src/main/ipc/market-data.ts` — extend `registerMarketDataHandlers` to add the new handler.
- `src/main/services/market-data.ts` — add `fetchOptionSnapshots(provider, symbols)` helper.
- `src/main/ipc/market-data.test.ts` — extend.

**Red — tests to write (in `src/main/ipc/market-data.test.ts`, mocking the provider):**

- `registers market-data:option-snapshots channel` — assert `ipcMain.handle` called for it.
- `market-data:option-snapshots returns ok:true with snapshots record on success` —
  provider's mocked `getOptionSnapshots` returns a Map with one OCC entry; handler
  returns `{ ok: true, snapshots: { 'AAPL260516P00180000': { bid, ask, mid, ..., greeks } } }`.
- `market-data:option-snapshots returns ok:true with empty snapshots when symbols is empty`
  — provider not called; handler returns `{ ok: true, snapshots: {} }`.
- `market-data:option-snapshots omits unknown symbols from result` — provider's Map
  contains only `'AAPL...'` when asked for `['AAPL...', 'XYZ...']`; handler returns
  only the AAPL entry.
- `market-data:option-snapshots returns ok:false with auth_failed when provider throws MarketDataError(auth_failed)`.
- `market-data:option-snapshots returns ok:false with network_error when provider throws MarketDataError(network_error)`.
- `market-data:option-snapshots returns ok:false with internal_error on unexpected throw`.
- `market-data:option-snapshots returns ok:false on Zod validation error` — invalid
  payload `{ symbols: 'AAPL...' }`; envelope contains `field: 'symbols'`.

**Green — implementation:**

- In `src/main/services/market-data.ts`:

  ```ts
  export async function fetchOptionSnapshots(
    provider: MarketDataProvider,
    symbols: string[]
  ): Promise<Record<string, OptionSnapshot>> {
    if (symbols.length === 0) return {}
    const map = await provider.getOptionSnapshots(symbols)
    return Object.fromEntries(map)
  }
  ```

- In `src/main/ipc/market-data.ts`, add to `registerMarketDataHandlers`:

  ```ts
  ipcMain.handle('market-data:option-snapshots', (_, payload: unknown) =>
    handleIpcCall('market_data_option_snapshots_unhandled_error', async () => {
      const { symbols } = GetOptionSnapshotsPayloadSchema.parse(payload)
      const snapshots = await fetchOptionSnapshots(provider, symbols)
      return { snapshots }
    })
  )
  ```

- No streaming wiring; this handler is REST-only.

**Refactor — cleanup to consider:**

- Confirm the helper sits next to `fetchStockQuotes` for symmetry.
- Verify `OptionSnapshot` is exported from `market-data-provider.ts` and not redefined.

**Acceptance criteria covered:**

- Foundational for "Position row shows option mid-price" and "Position detail page
  shows P&L in the Open Leg section".

---

### 7. Preload bridge: `getOptionSnapshots`

**Files to create or modify:**

- `src/preload/index.ts` — add invoke method.
- `src/preload/index.d.ts` — add the IPC types and extend `Window['api']`.

**Red — tests to write:**

- None at the preload level (thin bridge). Coverage comes via the renderer adapter
  tests in Area 8 and the e2e suite.

**Green — implementation:**

- In `src/preload/index.d.ts`, add:

  ```ts
  type IpcOptionSnapshot = {
    bid: string
    ask: string
    mid: string
    lastTrade: string
    openInterest: number | null
    volume: number | null
    greeks: { delta: string; gamma: string; theta: string; vega: string; iv: string }
    timestamp: string
  }
  type IpcGetOptionSnapshotsPayload = { symbols: string[] }
  type IpcGetOptionSnapshotsResult =
    | { ok: true; snapshots: Record<string, IpcOptionSnapshot> }
    | { ok: false; errors: IpcFieldError[] }
  ```

  Extend `Window['api']`:

  ```ts
  getOptionSnapshots: (payload: IpcGetOptionSnapshotsPayload) =>
    Promise<IpcGetOptionSnapshotsResult>
  ```

- In `src/preload/index.ts`, add the invoke method calling `'market-data:option-snapshots'`.

**Refactor — cleanup to consider:**

- Keep `Window['api']` ordering consistent with surrounding methods.

**Acceptance criteria covered:**

- Foundational.

---

### 8. Renderer adapter: `getOptionSnapshots`

**Files to create or modify:**

- `src/renderer/src/api/market-data.ts` — add `getOptionSnapshots`, types.
- `src/renderer/src/api/market-data.test.ts` — extend.

**Red — tests to write (mock `window.api`):**

- `getOptionSnapshots returns the snapshots record on success` — mock to resolve
  `{ ok: true, snapshots: {...} }`; assert returned object equals the snapshots map.
- `getOptionSnapshots throws ApiError(502) on ok:false` — mock to resolve
  `{ ok: false, errors: [{ field: '__root__', code: 'auth_failed', message: '...' }] }`;
  assert thrown object has `status: 502` and `body.detail` includes the errors.
- `getOptionSnapshots throws ApiError(502) when provider returns network_error`.

**Green — implementation:**

- Append to `src/renderer/src/api/market-data.ts`:

  ```ts
  export type OptionSnapshot = IpcOptionSnapshot
  export type OptionSnapshotsBySymbol = Record<string, OptionSnapshot>

  export async function getOptionSnapshots(symbols: string[]): Promise<OptionSnapshotsBySymbol> {
    const result = await window.api.getOptionSnapshots({ symbols })
    if (!result.ok) {
      throw apiError(502, { detail: result.errors })
    }
    return result.snapshots as OptionSnapshotsBySymbol
  }
  ```

**Refactor — cleanup to consider:**

- Confirm the same `apiError(502, ...)` pattern as existing `getStockQuotes`.
- Confirm types are renderer-side aliases — never imported from `src/main/`.

**Acceptance criteria covered:**

- Foundational.

---

### 9. Hook: `useOptionSnapshots(legs)`

**Files to create or modify:**

- `src/renderer/src/hooks/useOptionSnapshots.ts` — new file.
- `src/renderer/src/hooks/useOptionSnapshots.test.ts` — new file.
- `src/renderer/src/hooks/marketDataQueryKeys.ts` — extend with `optionSnapshots(symbols)` key.

**Red — tests to write (using `QueryClientProvider` and a mocked `window.api`):**

- `disabled when legs has no option entries` — pass `[]`; assert
  `result.current.fetchStatus === 'idle'`; `window.api.getOptionSnapshots` not called.
- `disabled when every leg lacks an instrumentType (e.g. HOLDING_SHARES rows)` —
  pass legs with `instrumentType: null`; assert idle.
- `builds OCC symbols and fetches snapshots` — pass one PUT leg; assert
  `getOptionSnapshots` called with `{ symbols: ['AAPL260516P00180000'] }` and the
  hook resolves with the corresponding snapshot keyed by OCC.
- `re-fetches when legs change` — start with one leg; re-render with a different
  expiration; assert second fetch with the new OCC symbol.
- `query key is ['market-data', 'option-snapshots', sortedSymbolsCsv]`.
- `surfaces error state when window.api fails` — mock to reject; assert `isError === true`.
- `gracefully handles a leg with missing/invalid input` — leg with `strike: 0`;
  hook excludes that leg's symbol from the request and continues.
- `refetchInterval is 60_000 ms` — verify by inspecting query options
  (`queryClient.getQueryDefaults` or by spying on `useQuery` options).
- `refetchInterval is false (disabled) when statusSession is 'closed'` — pass
  `session: 'closed'` prop; assert refetchInterval is false.

**Green — implementation:**

- `marketDataQueryKeys.ts` — add:

  ```ts
  optionSnapshots: (symbols: string[]) =>
    ['market-data', 'option-snapshots', symbols.slice().sort().join(',')] as const
  ```

- `useOptionSnapshots.ts`:

  ```ts
  type ActiveLegSummary = {
    ticker: string
    expiration: string | null
    strike: string | null
    instrumentType: 'PUT' | 'CALL' | null
  }

  type Options = { session?: 'regular' | 'pre' | 'post' | 'closed' }

  export function useOptionSnapshots(
    legs: ActiveLegSummary[],
    options: Options = {}
  ): UseQueryResult<OptionSnapshotsBySymbol, Error> {
    const symbols = useMemo(
      () =>
        legs
          .filter((l) => l.instrumentType && l.expiration && l.strike)
          .map((l) =>
            buildOccSymbol({
              ticker: l.ticker,
              expiration: l.expiration!,
              strike: l.strike!,
              instrumentType: l.instrumentType!
            })
          )
          .sort(),
      [legs]
    )
    const queryKey = marketDataQueryKeys.optionSnapshots(symbols)
    return useQuery({
      queryKey,
      queryFn: () => getOptionSnapshots(symbols),
      enabled: symbols.length > 0,
      refetchInterval: options.session === 'closed' ? false : 60_000,
      staleTime: 30_000,
      refetchOnWindowFocus: true
    })
  }
  ```

- Catch any `buildOccSymbol` throw with a try/catch in the `.map` (skip invalid leg).

**Refactor — cleanup to consider:**

- Extract `legsToOccSymbols(legs)` as a top-level pure helper for direct testing.
- Confirm the import of `buildOccSymbol` comes from `src/main/core/option-symbol.ts` (allowed — it's a leaf pure module).

**Acceptance criteria covered:**

- Foundational for "Position row shows option mid-price" and "No bid on deep OTM
  option near expiration" (just data plumbing — display is in Areas 11–13).

---

### 10. Renderer helpers: `option-display.ts`

**Files to create or modify:**

- `src/renderer/src/lib/option-display.ts` — new file.
- `src/renderer/src/lib/option-display.test.ts` — new file.

**Red — tests to write:**

- `formatPnlPercentForDisplay rounds to one decimal` — `'62.8571'` → `'62.9'`.
- `formatPnlPercentForDisplay strips trailing zeros where natural` — `'50.0000'` → `'50'`.
- `isWideSpread returns true when (ask - bid) / mid > 0.10` — bid `0.50`, ask `1.50`,
  mid `1.00` → `(1.0 / 1.0) > 0.10` → `true`.
- `isWideSpread returns false when spread <= 10% of mid` — bid `1.20`, ask `1.40`,
  mid `1.30` → spread `0.20 / 1.30 ≈ 0.154` → wait, that's wide. Use `bid 1.25, ask 1.35, mid 1.30` → `0.10 / 1.30 ≈ 0.077` → `false`.
- `isWideSpread returns false when mid is 0` — bid `0`, ask `0.05`, mid `0.025` →
  spread fraction `2.0` → … but per research.md, return `false` when mid is 0
  exactly (the "no bid" indicator handles that). Test: bid `0`, ask `0`, mid `0`
  → `false`.
- `hasNoBid returns true when bid string parses to 0` — input `'0'`, `'0.00'`,
  `'0.0000'` → all `true`.
- `hasNoBid returns false otherwise` — `'0.05'` → `false`.
- `formatTargetTooltip composes tooltip text exactly` — given `{ pnlPercent: '62.8571', maxProfit: '350.0000', targetPercent: 50 }` →
  expect `"62.9% of max profit ($350) — target is 50%"` (rounded percent + dollar with no cents because `350` is whole).

**Green — implementation:**

- Add helpers in `src/renderer/src/lib/option-display.ts`:
  - `formatPnlPercentForDisplay(value: string): string` — rounds to one decimal,
    drops trailing `.0` when whole.
  - `isWideSpread({ bid, ask, mid }): boolean` — `mid > 0 && (ask − bid) / mid > 0.10`.
  - `hasNoBid({ bid }): boolean` — `Decimal(bid).isZero()`.
  - `formatTargetTooltip({ pnlPercent, maxProfit, targetPercent })`:
    - Format `pnlPercent` via `formatPnlPercentForDisplay`.
    - Format `maxProfit`: drop cents when whole (`'350'` not `'350.00'`).
    - Concatenate: `${pct}% of max profit ($${money}) — target is ${targetPercent}%`.

**Refactor — cleanup to consider:**

- Confirm helpers are pure (no React imports).
- Verify `WIDE_SPREAD_THRESHOLD` constant is exported.

**Acceptance criteria covered:**

- "Wide bid-ask spread shows warning" — `isWideSpread` is the predicate.
- "No bid on deep OTM option near expiration" — `hasNoBid` is the predicate.
- "hovering the badge shows '62.9% of max profit ($350) — target is 50%'" — exact tooltip text.

---

### 11. Component: `OptMidCell`

**Files to create or modify:**

- `src/renderer/src/components/OptMidCell.tsx` — new file.
- `src/renderer/src/components/OptMidCell.test.tsx` — new file.

The cell mirrors the visual idiom of `PriceCell` from the US-32 mockup
(`mockups/us-32-live-underlying-price.mdx` lines 169–217). Two stacked mono
lines inside a `<td>` with `px-4 py-2.5 border-b border-wb-border/40`:

- Line 1 (primary): mid price `$1.30` — `text-[0.8125rem] font-semibold text-wb-text-primary tracking-[0.02em]`.
- Line 2 (secondary, `mt-px`): empty in the normal case; the small label
  `no bid` (`text-[0.6rem] text-wb-text-muted`) when `hasNoBid`; or an amber
  `⚠` glyph (`text-[0.6rem] text-wb-gold`) with `title` tooltip when `isWideSpread`.
- `noLeg` state: line 1 shows `—` in `text-wb-text-muted`; line 2 is empty.
- `noQuote` state (leg present, snapshot missing): line 1 shows `—` in
  `text-wb-text-muted`; line 2 shows the muted caption `unavailable`
  (`text-[0.6rem] text-wb-text-muted mt-px`); the `<td>` carries
  `title="Option snapshot unavailable"` and `cursor-help` — exactly mirroring
  the US-32 unavailable PriceCell (lines 169–186).

**Red — tests to write:**

- `renders dash when leg is null` — props `{ leg: null, snapshot: undefined }`;
  expect cell text contains `—` and no other content.
- `renders dash when snapshot is undefined and leg is set` — props `{ leg: <PUT>, snapshot: undefined }`;
  expect `—`.
- `renders mid price as $1.30 in normal case` — props with snapshot
  `{ bid: '1.20', ask: '1.40', mid: '1.30', ... }`; expect `$1.30`, no warning, no "no bid" subtext.
- `renders amber spread-warning icon when spread > 10% of mid` — bid `0.50`, ask
  `1.50`, mid `1.00`; expect `$1.00`, plus an element with `data-testid="opt-mid-spread-warning"`
  and `title="Wide spread: $0.50 × $1.50 — P&L may be unreliable"`.
- `renders "no bid" subtext when bid is zero` — bid `0`, ask `0.05`, mid `0.03`;
  expect `$0.03` and a small `no bid` label.
- `renders the testId on the wrapping cell` — expect
  `data-testid="position-card-{TICKER}-opt-mid"`.

**Green — implementation:**

- Match the table-cell idiom (use `<TableCell>` and `font-wb-mono` class).
- Layout:
  - Line 1 (top): `$1.30` (or `—` for null cases) — `text-wb-text-primary` class,
    `text-[0.8125rem]`, `font-semibold`.
  - Line 2 (bottom): conditionally one of:
    - empty (normal),
    - `no bid` (gray, `text-[0.6rem] text-wb-text-muted`),
    - amber `⚠` icon (`text-wb-gold`) with `title` tooltip.
- Tooltip text for spread warning is built from `bid` and `ask`:
  `Wide spread: $0.50 × $1.50 — P&L may be unreliable` (using `fmtMoney`).
- Wrapping `<TableCell>` carries `data-testid={\`position-card-${ticker}-opt-mid\`}`.

**Refactor — cleanup to consider:**

- Confirm only Tailwind/`wb-*` classes are used (no inline color hex per CLAUDE.md).
- Confirm the spread-warning element is also exposed as a child for tests
  (`data-testid="opt-mid-spread-warning"`) so the e2e doesn't have to scrape `title`.

**Acceptance criteria covered:**

- "the AAPL row shows the option mid-price as '$1.30'".
- "the mid-price label reads 'Opt Mid'" — header label, not the cell — covered in Area 14.
- "Wide bid-ask spread shows warning".
- "No bid on deep OTM option near expiration".

---

### 12. Component: `UnrealizedPnlCell`

**Files to create or modify:**

- `src/renderer/src/components/UnrealizedPnlCell.tsx` — new file.
- `src/renderer/src/components/UnrealizedPnlCell.test.tsx` — new file.

Visual idiom: same two-line mono cell as `OptMidCell`, mirroring the change-line
treatment in the US-32 `PriceCell` (lines 206–216). Line 1 is the signed dollar
amount; line 2 is the signed percent in the same color. When no leg or no
snapshot: line 1 `—` (muted), line 2 empty (`noLeg`) or `unavailable` (`noQuote`).

- Profit case: line 1 `+$220.00` in `text-wb-green text-[0.8125rem] font-semibold`;
  line 2 `+62.9%` in `text-wb-green text-[0.68rem] font-medium mt-px`.
- Loss case: line 1 `-$170.00` in `text-wb-red`; line 2 `-48.6%` in `text-wb-red`.
- The `<td>` carries `title="62.9% of max profit"` so screen readers / hover get
  the un-rounded label even when the visible percent is truncated.

**Red — tests to write:**

- `renders dash when leg is null` — props `{ leg: null, snapshot: undefined }`;
  expect `—`.
- `renders dash when snapshot is undefined` — props `{ leg: <PUT>, snapshot: undefined }`;
  expect `—`.
- `renders +$220.00 on line 1 and +62.9% on line 2 in green when profitable` —
  props `leg.entryPremiumPerContract = '3.50'`, `leg.contracts = 1`,
  `snapshot.mid = '1.30'`; expect both texts present, both inside elements with
  class containing `text-wb-green`.
- `renders -$170.00 on line 1 and -48.6% on line 2 in red when at a loss` —
  props with `mid = '5.20'`; expect both texts with class `text-wb-red`.
- `cell carries title attribute with the percent label when profitable` — verify
  `title` attribute equals `62.9% of max profit`.
- `renders the testId on the wrapping cell` —
  `data-testid="position-card-{TICKER}-pnl"`.

**Green — implementation:**

- Use `computeUnrealizedPnl` from `src/main/core/costbasis.ts` with the leg + snapshot inputs.
- Use `pnlColor` (existing) for the color.
- Format dollar amount via `fmtMoney`. For positive values, prepend a `+`.
- Wrap in `<TableCell>` with the `data-testid` prop.

**Refactor — cleanup to consider:**

- Extract `formatSignedMoney(value)` — `fmtMoney` already prepends `-` for negative;
  the helper just adds `+` when the parsed value is non-negative. (Could be in
  `lib/format.ts` for reuse.)
- Confirm classes use `wb-*` tokens, not inline hex.

**Acceptance criteria covered:**

- "the unrealized P&L shows '+$220.00' in green".
- "the unrealized P&L shows '-$170.00' in red".

---

### 13. Component: `TargetBadge`

**Files to create or modify:**

- `src/renderer/src/components/TargetBadge.tsx` — new file.
- `src/renderer/src/components/TargetBadge.test.tsx` — new file.

A small gold pill with text `TARGET` rendered next to the ticker in the row when
the position has reached the profit-target threshold. Tooltip shows the breakdown
text from `formatTargetTooltip`. Hidden otherwise.

Visual mirrors the `MarketStatusPill` shape from the US-32 mockup (lines 134–167):
mono font, `text-[0.6rem] font-bold tracking-[0.1em]`, padding `px-2 py-0.5`,
fully rounded (`rounded-[10px]`), `bg-wb-gold-dim text-wb-gold border border-wb-gold-border`.
Unlike the LIVE pill, `TargetBadge` has no leading dot and no pulse animation —
it's a static achievement marker, not a status indicator.

**Red — tests to write:**

- `renders nothing when targetReached is false` — props
  `{ targetReached: false, ... }`; query for `data-testid="target-badge"` returns null.
- `renders TARGET text when targetReached is true` — props
  `{ targetReached: true, ... }`; expect element with text `TARGET` and gold styling
  (class containing `bg-wb-gold-dim` and `text-wb-gold`).
- `renders the tooltip text built by formatTargetTooltip` — props
  `{ pnlPercent: '62.8571', maxProfit: '350.0000', targetPercent: 50, targetReached: true }`;
  expect `title` attribute exactly `62.9% of max profit ($350) — target is 50%`.
- `renders gold styling regardless of percent override` — props with
  `targetPercent: 25` still produces gold color (component is presentational).

**Green — implementation:**

- `type TargetBadgeProps = { targetReached: boolean; pnlPercent: string; maxProfit: string; targetPercent: number }`.
- Render `null` when `!targetReached`.
- Otherwise render `<span data-testid="target-badge" title={formatTargetTooltip({...})}
className="...gold-pill...">TARGET</span>`. Use existing `wb-gold` design tokens
  (`bg-wb-gold-dim`, `text-wb-gold`, `border-wb-gold-border`).

**Refactor — cleanup to consider:**

- If any other "gold pill" component exists (e.g., `Badge` from `ui/`), reuse it.
- Confirm no logic in this component beyond the `targetReached` switch.

**Acceptance criteria covered:**

- "a gold 'TARGET' badge appears on the AAPL row".
- "hovering the badge shows '62.9% of max profit ($350) — target is 50%'".

---

### 14. Wire columns and badge into `PositionRow` + `PositionsListPage`

**Files to create or modify:**

- `src/renderer/src/pages/PositionsListPage.tsx` — extend `TABLE_COLUMNS`, derive
  legs, call `useOptionSnapshots`, pass props to `PositionTable` → `PositionRow`.
- `src/renderer/src/components/PositionCard.tsx` (`PositionRow`) — accept `snapshot`
  prop, render `OptMidCell` and `UnrealizedPnlCell` in the table; render `TargetBadge`
  next to the ticker.
- `src/renderer/src/pages/PositionsListPage.test.tsx` — extend.
- `src/renderer/src/components/PositionCard.test.tsx` — extend.

**Red — tests to write:**

In `PositionCard.test.tsx`:

- `renders OptMidCell after Phase column` — assert column order `Ticker, Phase,
Price, Opt Mid, P&L, Strike, Expiration, DTE, Premium, Cost Basis`. (The table
  header check lives in the page test; row test checks `<td>` order.)
- `renders TargetBadge next to ticker when targetReached is true` — props with
  reached state; `getByTestId('target-badge')` returns an element inside the
  ticker cell.
- `renders no TargetBadge when targetReached is false`.
- `passes snapshot to OptMidCell and UnrealizedPnlCell` — assert children receive
  the snapshot via render output (text-based assertions).
- `renders dashes for HOLDING_SHARES row` — `instrumentType: null`; both Opt Mid
  and P&L cells show `—`.

In `PositionsListPage.test.tsx`:

- `Opt Mid and P&L headers appear in the table header in the right order` — assert
  header row text sequence is exactly `Ticker, Phase, Price, Opt Mid, P&L, Strike,
Expiration, DTE, Premium, Cost Basis`.
- `derives ActiveLegSummary list from active positions` — render with two CSP
  positions; assert `useOptionSnapshots` mock receives both legs (assert via the
  mocked hook's call args).
- `passes the matching snapshot to each row` — useOptionSnapshots returns
  `{ 'AAPL...': { mid: '1.30', ... } }`; assert AAPL row gets snapshot, MSFT row
  gets undefined.
- `renders TARGET badge when AAPL P&L crosses default 50%` — entry `3.50`,
  contracts `1`, mid `1.30` → 62.86%; assert badge visible on AAPL row.
- `does not render TARGET badge when P&L is below default threshold` — mid `2.00`
  (~42.86%); assert badge absent.
- `renders TARGET badge using per-position override` — position has
  `profitTargetPercent: 25`; mid `2.50` (~28.57% > 25%); assert badge visible.
- `does not render TARGET badge when override is unmet` — same position with
  override 25, mid `2.90` (~17%); assert badge absent.
- `renders dashes in Opt Mid and P&L for HOLDING_SHARES position`.
- `renders dashes in Opt Mid and P&L for closed position`.
- `passes session to useOptionSnapshots so polling stops when market is closed`
  — assert hook called with `{ session: 'closed' }` when `useMarketStatus` returns closed.

**Green — implementation:**

- In `PositionsListPage.tsx`:
  - Update `TABLE_COLUMNS` to include `'Opt Mid'` and `'P&L'` between `'Price'`
    and `'Strike'`. New full list: `['Ticker', 'Phase', 'Price', 'Opt Mid', 'P&L',
'Strike', 'Expiration', 'DTE', 'Premium', 'Cost Basis']`.
  - Derive `legs: ActiveLegSummary[]` from `activePositions`:

    ```ts
    const legs = useMemo(
      () =>
        activePositions.map((p) => ({
          ticker: p.ticker,
          expiration: p.expiration,
          strike: p.strike,
          instrumentType: p.instrumentType
        })),
      [activePositions]
    )
    ```

  - `const snapshotsQuery = useOptionSnapshots(legs, { session: statusQuery.data?.session })`.
  - Pass `snapshots={snapshotsQuery.data}` to `PositionTable`, then for each row
    derive `snapshot = snapshots?.[buildOccSymbol(...)]` (or pass the snapshot
    record and OCC symbol directly).
  - Pass `targetReached`, `pnl`, `pnlPercent`, `maxProfit`, `targetPercent` to
    each row by computing them in the page or in the row itself; cleanest is to
    compute inside `PositionRow` using `computeUnrealizedPnl` + `resolveProfitTarget`
    so the page only routes data.

- In `PositionCard.tsx` (`PositionRow`):
  - Accept new props: `snapshot?: OptionSnapshot`.
  - In the ticker `<TableCell>` (the cell that shows the ticker name on line 1
    and `ACTIVE` caption on line 2 in the US-32 mockup, lines 403–408), render
    `<TargetBadge ...>` after the ticker text on line 1, separated by a small
    gap (`flex items-center gap-1.5`) — the same gap pattern used between
    pills in the page header (`gap-3`, lines 295). Do not push the badge to
    line 2 next to `ACTIVE`.
    Compute `pnl`, `pnlPercent`, `maxProfit` via `computeUnrealizedPnl` only when
    `snapshot && item.entryPremiumPerContract && item.contracts`. Otherwise pass
    `targetReached: false` (badge won't render).
  - Insert `<OptMidCell leg={...} snapshot={snapshot} testId={...}/>` after the
    `<PriceCell>`.
  - Insert `<UnrealizedPnlCell leg={...} snapshot={snapshot} testId={...}/>` next.
  - Closed rows (`isClosed`): pass `snapshot={undefined}` so cells render `—`.

**Refactor — cleanup to consider:**

- Move per-row P&L/target derivation into a small pure helper
  `derivePositionRowDisplay(item, snapshot)` returning `{ targetReached, pnlPercent,
maxProfit, targetPercent }` — keeps the JSX clean and testable.
- Confirm `PositionTable` colspan still matches new column count when rendering
  empty/loading rows.

**Acceptance criteria covered:**

- "the AAPL row shows the option mid-price as '$1.30'".
- "the unrealized P&L shows '+$220.00' in green" / "shows '-$170.00' in red".
- "a gold 'TARGET' badge appears on the AAPL row".
- "Per-position profit target overrides global default".
- "HOLDING_SHARES position shows no option P&L".
- "Option data unavailable falls back gracefully".

---

### 15. Wire stats into `PositionDetailContent` Open Leg section

**Files to create or modify:**

- `src/renderer/src/pages/PositionDetailContent.tsx` — extend.
- `src/renderer/src/pages/PositionDetailPage.test.tsx` — extend.

The Open Leg section already shows `Strike, Expiration, DTE, Contracts,
Premium / Contract, Fill Date`. This story adds three more stats: `Current Mid`,
`Unrealized P&L`, `% of Max Profit`. Hidden when there's no active option leg or
no snapshot.

**Red — tests to write (in `PositionDetailPage.test.tsx`):**

- `Open Leg section renders Current Mid stat when snapshot is present` — mock
  `useOptionSnapshots` to return one snapshot; assert `Current Mid` label and value
  `$1.30`.
- `Open Leg section renders Unrealized P&L stat with green for profit` — same
  mock; assert `Unrealized P&L` label and `+$220.00` value with green class.
- `Open Leg section renders Unrealized P&L stat with red for loss` — mock with
  `mid: '5.20'`; assert `-$170.00` with red class.
- `Open Leg section renders % of Max Profit stat with one decimal` — assert
  `62.9%` text.
- `Open Leg section omits the three stats when activeLeg is null` — render with
  `activeLeg: null`; assert none of the labels appear.
- `Open Leg section omits the three stats when snapshot is undefined` — render
  with active leg but no snapshot; assert none of the labels appear.

**Green — implementation:**

- In `PositionDetailContent`, accept (or invoke at the page level then pass down)
  the snapshot for the active leg's OCC symbol. Cleanest: invoke
  `useOptionSnapshots([leg])` in `PositionDetailPage` and pass the snapshot as a
  new prop to `PositionDetailContent`.
- In `PositionDetailContent`, when `activeLeg && snapshot`:
  - Compute `pnlResult = computeUnrealizedPnl({ entryPremium: activeLeg.premiumPerContract, currentMid: snapshot.mid, contracts: activeLeg.contracts })`.
  - Append three items to the existing `StatGrid items`:
    - `{ label: 'Current Mid', value: <span className="text-wb-text-primary">{fmtMoney(snapshot.mid)}</span> }`
    - `{ label: 'Unrealized P&L', value: <span style={{ color: pnlColor(pnlResult.pnl) }}>{formatSignedMoney(pnlResult.pnl)}</span> }`
    - `{ label: '% of Max Profit', value: <span style={{ color: pnlColor(pnlResult.pnl) }}>{formatPnlPercentForDisplay(pnlResult.pnlPercent)}%</span> }`

**Refactor — cleanup to consider:**

- Confirm `Caption` is the right primitive for the stat labels (existing pattern).
- Verify `formatSignedMoney` is reused from Area 12 (or pulled into `lib/format.ts`).

**Acceptance criteria covered:**

- "Position detail page shows P&L in the Open Leg section" + the three exact stats.

---

### 16. Provider plumbing: pass-through for `getOptionSnapshots` in `FakeMarketDataProvider`

**Files to create or modify:**

- `src/main/integrations/fake-market-data.ts` — replace the empty stub with one
  that reads `WHEELBASE_MOCK_OPTION_SNAPSHOTS` (JSON env var) keyed by OCC symbol.
- (No new test file — the fake is only exercised by the existing factory test plus
  the e2e suite. The factory test already asserts shape; the e2e suite asserts
  behavior end-to-end.)

**Red — tests to write:**

- (Optional) `src/main/integrations/fake-market-data.test.ts`:
  - `getOptionSnapshots returns entries from WHEELBASE_MOCK_OPTION_SNAPSHOTS env var`
    — set env var to JSON map; call `getOptionSnapshots(['AAPL...'])`; expect Map
    with that one entry.
  - `getOptionSnapshots omits unknown symbols` — env has only AAPL; ask for
    `['AAPL...', 'ZZZZ...']`; expect Map with only AAPL.
  - `getOptionSnapshots returns empty Map when env var is unset`.

**Green — implementation:**

- Replace the stub:

  ```ts
  async getOptionSnapshots(symbols: string[]): Promise<Map<string, OptionSnapshot>> {
    const raw = process.env.WHEELBASE_MOCK_OPTION_SNAPSHOTS
    const all: Record<string, OptionSnapshot> = raw
      ? (JSON.parse(raw) as Record<string, OptionSnapshot>)
      : {}
    const result = new Map<string, OptionSnapshot>()
    for (const s of symbols) if (all[s]) result.set(s, all[s])
    return result
  }
  ```

**Refactor — cleanup to consider:**

- Confirm parity with `getStockQuotes`'s env-driven pattern.

**Acceptance criteria covered:**

- Foundational for the e2e tests below.

---

### 17. E2e Tests

**Files to create or modify:**

- `e2e/option-pnl.spec.ts` — new file.

The spec uses the existing `WHEELBASE_MARKET_MOCK=true` lever from US-32; adds
`WHEELBASE_MOCK_OPTION_SNAPSHOTS` env var with a JSON map keyed by OCC symbol.
Each test seeds positions via `createPosition` IPC, then visits the positions list
or the detail page. The OCC symbols used in fixtures are precomputed (and verified
by Area 1 unit tests) so the spec doesn't import `buildOccSymbol`.

**Red — tests to write (each Red bullet is one e2e test case; test name mirrors the AC language):**

- **AC-1:** `displays option mid-price as $1.30 in the Opt Mid column for an open CSP`
  — Background: open AAPL CSP at strike 180, exp 30d out, contracts 1, premium 3.50.
  Stub `WHEELBASE_MOCK_OPTION_SNAPSHOTS` to return `bid: '1.20', ask: '1.40',
mid: '1.30'` for the matching OCC. Visit positions list.
  Assert `[data-testid="position-card-AAPL-opt-mid"]:has-text("$1.30")` is visible
  and the column header reads `Opt Mid`.

- **AC-2:** `shows unrealized P&L of +$220.00 in green when option has decayed below entry premium`
  — Same Background. Assert `[data-testid="position-card-AAPL-pnl"]:has-text("+$220.00")`
  and the cell contains an element with class `text-wb-green`.

- **AC-3:** `shows unrealized P&L of -$170.00 in red when option is above entry premium`
  — Same Background but mid `5.20`. Assert `-$170.00` with class `text-wb-red`.

- **AC-4:** `shows gold TARGET badge on the row when default 50% threshold is reached`
  — Same Background, mid `1.30` (62.86%). Assert `[data-testid="target-badge"]`
  visible inside `[data-testid="position-card"]:has-text("AAPL")` with `title`
  containing `62.9%`, `$350`, `target is 50%`.

- **AC-5:** `shows gold TARGET badge using per-position override of 25%`
  — After seeding the AAPL position, run a SQL `UPDATE` via a helper IPC (or via
  page.evaluate calling a test-only IPC handler that runs the UPDATE) to set
  `profit_target_percent = 25`. Set mid `2.50` (28.57%). Reload positions list.
  Assert `[data-testid="target-badge"]` visible and `title` contains `target is 25%`.

  > Note: This requires a test-only IPC handler analogous to `test:trigger-stock-tick`.
  > If unwanted, the test can write to a temp DB directly using `better-sqlite3`
  > before launching Electron — the spec already creates the DB file. Cleaner.

- **AC-6:** `Open Leg section on the detail page shows Current Mid, Unrealized P&L, and % of Max Profit stats`
  — Same Background as AC-2. Navigate to the position detail page. Assert three
  stats appear with labels `Current Mid` (value `$1.30`), `Unrealized P&L` (value
  `+$220.00` in green), and `% of Max Profit` (value `62.9%`).

- **AC-7:** `shows amber spread-warning icon when bid-ask spread exceeds 10% of mid`
  — Mock returns bid `0.50`, ask `1.50`, mid `1.00` (spread 100% of mid). Visit
  positions list. Assert `[data-testid="opt-mid-spread-warning"]` visible with
  `title="Wide spread: $0.50 × $1.50 — P&L may be unreliable"`.

- **AC-8:** `shows "no bid" indicator when bid is zero on a deep-OTM option`
  — Mock returns bid `0`, ask `0.05`, mid `0.03`. Visit positions list.
  Assert `[data-testid="position-card-AAPL-opt-mid"]:has-text("$0.03")` and the
  cell contains visible text `no bid`. Assert P&L cell also shows the expected
  `+$347.50` in green.

- **AC-9:** `shows dashes for Opt Mid and P&L when position is HOLDING_SHARES with no open option leg`
  — Background: AAPL CSP → assignment (move to HOLDING_SHARES via `assignCsp` IPC).
  Visit positions list. Assert `[data-testid="position-card-AAPL-opt-mid"]` text
  is `—` and `[data-testid="position-card-AAPL-pnl"]` text is `—`.

- **AC-10:** `falls back to dashes when option snapshot is unavailable for the OCC symbol`
  — Background: AAPL CSP open. Stub `WHEELBASE_MOCK_OPTION_SNAPSHOTS` to be empty
  `{}`. Visit positions list. Assert AAPL row's Opt Mid and P&L cells both render
  `—`. Assert all other position data (Premium, Cost Basis) still displays.

**Green — implementation:**

- Build `e2e/option-pnl.spec.ts` following `e2e/live-underlying-price.spec.ts`'s
  pattern: helper `launchWithMocks(dbPath, { quotes, optionSnapshots, marketStatus })`
  forwarding to env vars, helpers `seedPosition`, `goToPositionsList`,
  `goToPositionDetail`.
- For AC-5, write directly to the DB using `better-sqlite3` in the spec file before
  launching the Electron app. Example:

  ```ts
  const db = new Database(dbPath)
  db.prepare(`UPDATE positions SET profit_target_percent = ? WHERE ticker = ?`).run(25, 'AAPL')
  db.close()
  ```

- Add `data-testid="opt-mid-spread-warning"` to the spread-warning element in
  `OptMidCell` (Area 11) so this test can select it.
- All OCC symbols hard-coded in fixtures: derived from the seed parameters
  (ticker AAPL, strike 180, exp `EXPIRATION_ISO`).

**Refactor — cleanup to consider:**

- Extract a `setupOptionSnapshotMocks(page, byOcc)` helper if used in many tests.
- Reuse `localDate(30)` for the expiration to keep tests evergreen.

**Acceptance criteria covered:**

- Each e2e case maps 1:1 to one Gherkin scenario from the user story (audit table below).

---

## AC Audit (every story AC mapped to one e2e test case)

The user story's Gherkin has 10 scenarios; each maps to exactly one e2e test case:

| Gherkin scenario from `US-33-option-price-unrealized-pnl.md` | E2E test case in `e2e/option-pnl.spec.ts`                                                                |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Position row shows option mid-price for the open leg         | AC-1: `displays option mid-price as $1.30 in the Opt Mid column for an open CSP`                         |
| Unrealized P&L displays as green when profitable             | AC-2: `shows unrealized P&L of +$220.00 in green when option has decayed below entry premium`            |
| Unrealized P&L displays as red when at a loss                | AC-3: `shows unrealized P&L of -$170.00 in red when option is above entry premium`                       |
| Profit target badge appears when threshold is reached        | AC-4: `shows gold TARGET badge on the row when default 50% threshold is reached`                         |
| Per-position profit target overrides global default          | AC-5: `shows gold TARGET badge using per-position override of 25%`                                       |
| Position detail page shows P&L in the Open Leg section       | AC-6: `Open Leg section on the detail page shows Current Mid, Unrealized P&L, and % of Max Profit stats` |
| Wide bid-ask spread shows warning                            | AC-7: `shows amber spread-warning icon when bid-ask spread exceeds 10% of mid`                           |
| No bid on deep OTM option near expiration                    | AC-8: `shows "no bid" indicator when bid is zero on a deep-OTM option`                                   |
| HOLDING_SHARES position shows no option P&L                  | AC-9: `shows dashes for Opt Mid and P&L when position is HOLDING_SHARES with no open option leg`         |
| Option data unavailable falls back gracefully                | AC-10: `falls back to dashes when option snapshot is unavailable for the OCC symbol`                     |

All 10 AC scenarios are covered by exactly one e2e test case each.
