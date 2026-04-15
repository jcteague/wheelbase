# US-11 — Display the full wheel leg chain with running cost basis — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off

---

## Layer 1 — Foundation (no dependencies)

> All four areas can start immediately and run in parallel.

### Area 1 — Backend: `getPosition` gains `allSnapshots`

- [x] **[Red]** Write failing tests — `src/main/services/get-position.test.ts`
  - `getPosition returns allSnapshots as empty array when position has no snapshots`
  - `getPosition returns allSnapshots ordered snapshot_at ASC for a CSP_OPEN position`
  - `getPosition returns allSnapshots with multiple snapshots after assign and CC open` (length 3, basisPerShare decreases after CC_OPEN)
  - Run `pnpm test src/main/services/get-position.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/schemas.ts` + `src/main/services/get-position.ts` _(depends on: Area 1 Red ✓)_
  - Add `allSnapshots: CostBasisSnapshotRecord[]` to `GetPositionResult` in `schemas.ts`
  - Add `GET_ALL_SNAPSHOTS_QUERY` constant: `SELECT id, position_id, basis_per_share, total_premium_collected, final_pnl, snapshot_at, created_at FROM cost_basis_snapshots WHERE position_id = ? ORDER BY snapshot_at ASC`
  - Define `SnapshotRow` interface for the SQLite row shape
  - Execute alongside existing `GET_LEGS_QUERY`; map rows to `CostBasisSnapshotRecord[]`; include as `allSnapshots` in return value
  - Run `pnpm test src/main/services/get-position.test.ts` — all tests must pass
- [x] **[Refactor]** Clean up _(depends on: Area 1 Green ✓)_
  - `SnapshotRow` interface and mapping should mirror the existing `LegRow` pattern
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 2 — Renderer type: `PositionDetail` gains `allSnapshots`

- [x] **[Red]** Write failing tests — `src/renderer/src/pages/PositionDetailPage.test.tsx`
  - Extend existing `CSP_OPEN_DETAIL` fixture with `allSnapshots: []` — confirm TypeScript compiles and existing tests still pass
  - Add a new fixture with a populated `allSnapshots` array (one snapshot entry); confirm `usePosition` mock with the updated fixture renders without errors
  - Run `pnpm test src/renderer/src/pages/PositionDetailPage.test.tsx` — new fixture assertions must fail until type is added
- [x] **[Green]** Implement — `src/renderer/src/api/positions.ts` _(depends on: Area 2 Red ✓)_
  - Add `allSnapshots: Array<{ id: string; positionId: string; basisPerShare: string; totalPremiumCollected: string; finalPnl: string | null; snapshotAt: string; createdAt: string }>` to `PositionDetail`
  - No change to `getPosition()` function body — it casts IPC result directly
  - Run `pnpm test src/renderer/src/pages/PositionDetailPage.test.tsx` — all tests must pass
- [x] **[Refactor]** Clean up _(depends on: Area 2 Green ✓)_
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 3 — Renderer lib: `deriveRunningBasis` pure function

- [x] **[Red]** Write failing tests — `src/renderer/src/lib/deriveRunningBasis.test.ts`
  - `returns empty array for empty legs` — call with `([], [])`, assert `[]`
  - `single CSP_OPEN leg gets the initial snapshot basis` — leg `fillDate: '2026-01-03'`, snapshot `snapshotAt: '2026-01-03T10:00:00Z'`, assert `runningCostBasis === '176.5000'`
  - `leg before any snapshot gets null` — leg `fillDate: '2026-01-02'`, snapshot `snapshotAt: '2026-01-03T10:00:00Z'`, assert `runningCostBasis === null`
  - `ASSIGN leg carries forward CSP_OPEN snapshot` — two legs (CSP_OPEN 2026-01-03, ASSIGN 2026-01-17), two snapshots; assert ASSIGN gets its own snapshot basis
  - `CC_OPEN leg gets its own snapshot` — three legs, three snapshots; assert CC_OPEN basis is lower than ASSIGN basis
  - `CC_CLOSE leg carries forward CC_OPEN snapshot (no new snapshot)` — four legs, three snapshots (no CC_CLOSE snapshot); assert CC_CLOSE `runningCostBasis === cc_open_basis`
  - `multiple snapshots on the same day: last one wins` — two snapshots same date, assert leg gets second snapshot's basis
  - `ROLL_FROM leg carries forward without crashing` — leg with role 'ROLL_FROM', no matching snapshot, assert carry-forward works (no exception)
  - Run `pnpm test src/renderer/src/lib/deriveRunningBasis.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/lib/deriveRunningBasis.ts` _(depends on: Area 3 Red ✓)_
  - Export `deriveRunningBasis<T extends { fillDate: string }>(legs: T[], snapshots: SnapshotInput[]): Array<T & { runningCostBasis: string | null }>`
  - `SnapshotInput = { snapshotAt: string; basisPerShare: string }`
  - Algorithm: sort snapshot copy by `snapshotAt` ASC; carry-forward pointer scan — advance pointer while `snapshots[si].snapshotAt.slice(0,10) <= leg.fillDate`, record last seen `basisPerShare` as `runningCostBasis`
  - Run `pnpm test src/renderer/src/lib/deriveRunningBasis.test.ts` — all tests must pass
- [x] **[Refactor]** Clean up _(depends on: Area 3 Green ✓)_
  - Generic signature `T extends { fillDate: string }` avoids importing `LegRecord` from main process — verify naming consistency with `data-model.md`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 4 — Renderer lib: `ROLE_COLOR` + `LEG_ROLE_LABEL` in `phase.ts`

- [x] **[Red]** Write failing tests — `src/renderer/src/lib/phase.test.ts`
  - `ROLE_COLOR contains all six role keys` — assert keys `CSP_OPEN, ASSIGN, CC_OPEN, CC_CLOSE, CC_EXPIRED, CALLED_AWAY` with hex string values
  - `LEG_ROLE_LABEL contains CALLED_AWAY entry` — assert `=== 'Called Away'`
  - `LEG_ROLE_LABEL contains CC_EXPIRED entry` — assert `=== 'CC Expired'`
  - `LEG_ROLE_LABEL contains CC_CLOSE entry` — assert `=== 'CC Close'`
  - Run `pnpm test src/renderer/src/lib/phase.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/lib/phase.ts` _(depends on: Area 4 Red ✓)_
  - Add `export const ROLE_COLOR: Record<string, string>` with values: `CSP_OPEN: '#e6a817'`, `ASSIGN: '#79c0ff'`, `CC_OPEN: '#d2a8ff'`, `CC_CLOSE: '#3fb950'`, `CC_EXPIRED: '#484f58'`, `CALLED_AWAY: '#3fb950'`
  - Update `LEG_ROLE_LABEL` to add/replace: `CSP_OPEN: 'CSP Open'`, `ASSIGN: 'Assign'`, `CC_OPEN: 'CC Open'`, `CC_CLOSE: 'CC Close'`, `CC_EXPIRED: 'CC Expired'`, `CALLED_AWAY: 'Called Away'`
  - Run `pnpm test src/renderer/src/lib/phase.test.ts` — all tests must pass
- [x] **[Refactor]** Clean up _(depends on: Area 4 Green ✓)_
  - Verify no other consumer of `LEG_ROLE_LABEL` depended on the old label strings (e.g. `'Sell Put'`)
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — Component (depends on Area 4 Green)

> Start after Area 4 Green is checked off. Areas 1–3 can still be completing in parallel.

### Area 5 — `LegHistoryTable` rewrite

**Requires:** Area 4 Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/components/LegHistoryTable.test.tsx` _(depends on: Area 4 Green ✓)_
  - `renders all 8 column headers including "Running Basis / Share"` — render one CSP_OPEN leg, assert headers: Role, Action, Strike, Expiration, Contracts, Premium, Fill Date, Running Basis / Share
  - `renders a role badge for each leg using ROLE_COLOR` — render CSP_OPEN leg, assert badge text "CSP Open" and color `#e6a817`
  - `ASSIGN leg: premium cell shows "— (assigned)" and "100 shares received" annotation` — `contracts: 1`
  - `ASSIGN leg with 2 contracts shows "200 shares received"` — `contracts: 2`
  - `CALLED_AWAY leg: premium cell shows "— (assigned)" and "100 shares called away"` — `contracts: 1`
  - `CC_EXPIRED leg: premium cell shows "expired worthless" in muted style`
  - `CC_CLOSE leg: premium cell shows "−$1.80" in amber` — `premiumPerContract: '1.80'`, assert em-dash minus and `var(--wb-gold)` color
  - `Running basis cell shows "$176.50" for runningCostBasis "176.5000"`
  - `Running basis cell shows "—" for null runningCostBasis`
  - `no tfoot row when finalPnl is null`
  - `renders tfoot "Final P&L: +$780.00" in green when finalPnl is "780.0000"`
  - Run `pnpm test src/renderer/src/components/LegHistoryTable.test.tsx` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/LegHistoryTable.tsx` _(depends on: Area 5 Red ✓)_
  - Update `LegHistoryEntry` type: add `expiration: string | null`, `contracts: number`, `runningCostBasis: string | null`; make `premiumPerContract: string | null`
  - Add `finalPnl?: string | null` to `LegHistoryTableProps`
  - Add `PremiumCell` local subcomponent: ASSIGN → muted italic "— (assigned)" + `{contracts*100} shares received`; CALLED_AWAY → "— (assigned)" + `{contracts*100} shares called away`; CC_EXPIRED → muted italic "expired worthless"; CC_CLOSE → amber `var(--wb-gold)` "−${premiumPerContract}" (em-dash); else with value → green "+${premiumPerContract}"; else → muted "—"
  - Add `BasisCell` local subcomponent: null → muted "—"; value → sky `#79c0ff` bold "$X.XX" (`parseFloat(value).toFixed(2)`)
  - Update `<thead>` to 8 columns; Running Basis header: `background: rgba(121,192,255,0.05)`, `borderLeft: '1px solid rgba(121,192,255,0.12)'`, `color: '#79c0ff'`
  - Update `<tbody>` rows with Role badge (import `Badge`, `ROLE_COLOR`, `LEG_ROLE_LABEL`), all 8 cells, sky tint on Running Basis cell
  - Add `<tfoot>` rendered only when `finalPnl` truthy: `colSpan={8}`, green-dim border top, `rgba(63,185,80,0.04)` background, muted "Final P&L" + `pnlColor(finalPnl)` amount via `fmtMoney`
  - Run `pnpm test src/renderer/src/components/LegHistoryTable.test.tsx` — all tests must pass
- [x] **[Refactor]** Clean up _(depends on: Area 5 Green ✓)_
  - `PremiumCell` and `BasisCell` are single-use — keep in same file
  - Ensure `whiteSpace: 'nowrap'` on all cells
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — Page wiring (depends on Areas 1, 2, 3, 5 Green)

> Start after all Layer 1 and Layer 2 Green tasks are checked off.

### Area 6 — `PositionDetailPage`: wire `deriveRunningBasis` and `finalPnl`

**Requires:** Area 1 Green ✓, Area 2 Green ✓, Area 3 Green ✓, Area 5 Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/pages/PositionDetailPage.test.tsx` _(depends on: Areas 1, 2, 3, 5 Green ✓)_
  - `leg history table shows running cost basis column header` — mock `usePosition` with CSP_OPEN position including `allSnapshots: [...]`, assert "Running Basis / Share" header visible
  - `leg history table shows running basis value for CSP_OPEN leg` — one leg + one matching snapshot, assert computed basis amount rendered
  - `leg history table renders final P&L footer for WHEEL_COMPLETE position` — `position.status: 'CLOSED'`, `costBasisSnapshot.finalPnl: '780.0000'`, assert "Final P&L" and "$780.00" visible
  - `leg history table has no P&L footer when finalPnl is null` — active position, `costBasisSnapshot.finalPnl: null`, assert "Final P&L" not present
  - Run `pnpm test src/renderer/src/pages/PositionDetailPage.test.tsx` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/pages/PositionDetailPage.tsx` _(depends on: Area 6 Red ✓)_
  - Import `deriveRunningBasis` from `'../lib/deriveRunningBasis'`
  - Destructure `allSnapshots` from `data`; compute `const enrichedLegs = deriveRunningBasis(legs, allSnapshots ?? [])`
  - Pass `enrichedLegs` (instead of `legs`) to `<LegHistoryTable>`
  - Pass `finalPnl={costBasisSnapshot?.finalPnl ?? null}` to `<LegHistoryTable>`
  - Update any existing test fixtures missing `allSnapshots` to include `allSnapshots: []`
  - Run `pnpm test src/renderer/src/pages/PositionDetailPage.test.tsx` — all tests must pass
- [x] **[Refactor]** Clean up _(depends on: Area 6 Green ✓)_
  - `allSnapshots ?? []` fallback handles old fixtures — verify no other callers pass enriched legs without the new field
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — E2E Tests (depends on all Green tasks)

**Requires:** All Green tasks from Layers 1–3 ✓

### E2E Tests

- [x] **[Red]** Write failing e2e tests — `e2e/leg-chain-display.spec.ts` _(depends on: all Green tasks ✓)_
  - AC-1: `leg chain displays all legs in chronological order` — create position, assign, open CC; assert leg table shows 3 rows: CSP Open → Assign → CC Open
  - AC-2: `running cost basis column shows basis after each leg including CC_CLOSE carry-forward` — create position (strike $180, premium $3.50), assign, open CC (premium $2.30), close CC early; assert "Running Basis / Share" header, CSP_OPEN row "$176.50", CC_OPEN row "$174.20", CC_CLOSE row "$174.20" (carried forward)
  - AC-3: `completed wheel shows final P&L in the chain footer` — full cycle to WHEEL_COMPLETE; assert "Final P&L" in green in table footer
  - AC-4: `ASSIGN leg displays shares received not premium` — create position, assign (1 contract); assert "— (assigned)" and "100 shares received" in ASSIGN row; assert no "$" amount in premium cell
  - AC-5: `CALLED_AWAY leg shows call-away annotation and inherits running basis` — full cycle through called-away; assert "— (assigned)" and "100 shares called away"; assert running basis cell shows a non-empty dollar amount
  - AC-6: `CC_EXPIRED leg displays expired worthless in muted style` — create position, assign, open CC, expire worthless; assert "expired worthless" text in CC_EXPIRED premium cell
  - AC-7: `single-leg position shows partial chain with initial basis` — new CSP_OPEN position only; assert exactly 1 row; assert running basis cell shows "$176.50" (strike 180 − premium 3.50)
  - Run `pnpm test:e2e` — all new tests must fail
- [x] **[Green]** Make e2e tests pass _(depends on: E2E Red ✓)_
  - Run `pnpm test:e2e` — all tests must pass
- [x] **[Refactor]** Clean up e2e tests _(depends on: E2E Green ✓)_
  - Run `pnpm test:e2e && pnpm lint && pnpm typecheck`

---

## Completion Checklist

- [x] All Red tasks complete (tests written and failing for right reason)
- [x] All Green tasks complete (all tests passing)
- [x] All Refactor tasks complete (lint + typecheck clean)
- [x] E2E tests cover all 7 ACs
- [x] `pnpm test && pnpm lint && pnpm typecheck` — all clean
