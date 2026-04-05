# Implementation Plan: US-11 — Display the full wheel leg chain with running cost basis

## Summary

This story enriches the position detail page's leg history table with two additions: a **running cost basis column** (per-share basis after each leg, derived from historical cost basis snapshots) and **special premium-cell rendering** for ASSIGN, CALLED_AWAY, CC_CLOSE, and CC_EXPIRED legs. The backend `getPosition` service gains an `allSnapshots` field; a new renderer utility derives the running basis per leg; and `LegHistoryTable` is extended from 5 columns to 8. Done when the leg history table on the detail page renders all legs with their running basis and a final P&L footer for completed wheels.

## Supporting Documents

- **User Story & Acceptance Criteria:** `docs/epics/02-stories/US-11-wheel-leg-chain-display.md`
- **Research & Design Decisions:** `plans/us-11/research.md`
- **Data Model & Selection Logic:** `plans/us-11/data-model.md`
- **API Contract:** `plans/us-11/contracts/get-position.md`
- **Quickstart & Verification:** `plans/us-11/quickstart.md`

## Prerequisites

- US-6 through US-10 complete — `ASSIGN`, `CC_OPEN`, `CC_CLOSE`, `CC_EXPIRED`, `CALLED_AWAY` leg types and their snapshot-creation logic must exist.
- `LegHistoryTable` component exists at `src/renderer/src/components/LegHistoryTable.tsx` (from US-6).
- `get-position.ts` service exists, already returns `legs` via a second query (`GET_LEGS_QUERY`).
- `CostBasisSnapshotRecord` type is defined in `src/main/schemas.ts`.
- `cost_basis_snapshots` table exists; snapshots are created by each lifecycle service.

## Implementation Areas

---

### 1. Backend — `GetPositionResult` gains `allSnapshots`

**Files to create or modify:**
- `src/main/schemas.ts` — add `allSnapshots: CostBasisSnapshotRecord[]` to `GetPositionResult`
- `src/main/services/get-position.ts` — add `GET_ALL_SNAPSHOTS_QUERY` and populate `allSnapshots`

**Red — tests to write** (`src/main/services/get-position.test.ts`):
- `getPosition returns allSnapshots as empty array when position has no snapshots` — insert a bare position (no legs, no snapshots), call `getPosition`, assert `detail.allSnapshots` equals `[]`
- `getPosition returns allSnapshots ordered snapshot_at ASC for a CSP_OPEN position` — `createPosition` (which creates one snapshot), call `getPosition`, assert `detail.allSnapshots` has length 1 with `basisPerShare` matching the initial basis
- `getPosition returns allSnapshots with multiple snapshots after assign and CC open` — create position, run `assignCspPosition`, run `openCoveredCallPosition`, call `getPosition`, assert `detail.allSnapshots` has length 3 (CSP_OPEN, ASSIGN, CC_OPEN) in `snapshot_at ASC` order, assert `basisPerShare` decreases after CC open

**Green — implementation:**
- Add `allSnapshots: CostBasisSnapshotRecord[]` to `GetPositionResult` interface in `src/main/schemas.ts` (see `plans/us-11/data-model.md`)
- Add `GET_ALL_SNAPSHOTS_QUERY` constant in `get-position.ts` querying all snapshots `WHERE position_id = ? ORDER BY snapshot_at ASC` (see `plans/us-11/contracts/get-position.md` for exact SQL)
- Define `SnapshotRow` interface for the SQLite row shape
- Execute `db.prepare(GET_ALL_SNAPSHOTS_QUERY).all(positionId)` alongside the existing `GET_LEGS_QUERY` call
- Map snapshot rows to `CostBasisSnapshotRecord[]` and include as `allSnapshots` in the return value

**Refactor — cleanup to consider:**
- The `SnapshotRow` interface and mapping may be extractable alongside the existing `LegRow` pattern in the same file.
- Check for naming consistency: `allSnapshots` vs `snapshots` — use `allSnapshots` to distinguish from the singular `costBasisSnapshot`.

**Acceptance criteria covered:**
- Enables "Running cost basis column shows basis after each leg" — without historical snapshots, running basis cannot be computed.
- Enables "Single-leg position shows partial chain" — returns the initial CSP_OPEN snapshot.

---

### 2. Renderer API type — `PositionDetail` gains `allSnapshots`

**Files to create or modify:**
- `src/renderer/src/api/positions.ts` — add `allSnapshots` array to `PositionDetail` type

**Red — tests to write** (`src/renderer/src/pages/PositionDetailPage.test.tsx`):
- Extend the `CSP_OPEN_DETAIL` fixture in the existing test file with `allSnapshots: []`, then add `allSnapshots: [{ id: 's1', positionId: 'pos-123', basisPerShare: '177.5000', totalPremiumCollected: '250.0000', finalPnl: null, snapshotAt: '2026-03-01T10:00:00.000Z', createdAt: '2026-03-01T10:00:00.000Z' }]` to a new fixture to verify TypeScript compiles — confirm that `usePosition` mock with the updated fixture renders without errors.

**Green — implementation:**
- Add `allSnapshots: Array<{ id: string; positionId: string; basisPerShare: string; totalPremiumCollected: string; finalPnl: string | null; snapshotAt: string; createdAt: string }>` to `PositionDetail` in `src/renderer/src/api/positions.ts`
- No change to the `getPosition()` function body — it casts the IPC result as `PositionDetail` already

**Refactor — cleanup to consider:**
- The snapshot shape inside `PositionDetail` is structurally identical to `CostBasisSnapshotRecord`. If both sides were in the same module, a shared type would be possible; for now, keep inline (renderer has no direct import of main-process types).

**Acceptance criteria covered:**
- Prerequisite type change that enables `PositionDetailPage` to access `data.allSnapshots`.

---

### 3. Renderer lib — `deriveRunningBasis` pure function

**Files to create or modify:**
- `src/renderer/src/lib/deriveRunningBasis.ts` — new file with `deriveRunningBasis` function
- `src/renderer/src/lib/deriveRunningBasis.test.ts` — unit tests

**Red — tests to write** (`src/renderer/src/lib/deriveRunningBasis.test.ts`):
- `returns empty array for empty legs` — call with `([], [])`, assert `[]`
- `single CSP_OPEN leg gets the initial snapshot basis` — one leg with `fillDate: '2026-01-03'`, one snapshot with `snapshotAt: '2026-01-03T10:00:00Z'`, assert `runningCostBasis === '176.5000'`
- `leg before any snapshot gets null` — one leg with `fillDate: '2026-01-02'`, one snapshot with `snapshotAt: '2026-01-03T10:00:00Z'`, assert `runningCostBasis === null`
- `ASSIGN leg carries forward CSP_OPEN snapshot` — two legs (CSP_OPEN on 2026-01-03, ASSIGN on 2026-01-17), two snapshots (one at 2026-01-03, one at 2026-01-17), assert ASSIGN gets ASSIGN snapshot basis
- `CC_OPEN leg gets its own snapshot` — three legs (CSP_OPEN, ASSIGN, CC_OPEN), three snapshots; assert CC_OPEN basis is lower than ASSIGN basis
- `CC_CLOSE leg carries forward CC_OPEN snapshot (no new snapshot)` — four legs (CSP_OPEN, ASSIGN, CC_OPEN, CC_CLOSE), three snapshots (no CC_CLOSE snapshot); assert CC_CLOSE `runningCostBasis === cc_open_basis`
- `multiple snapshots on the same day: last one wins` — two snapshots same date, assert leg gets the second snapshot's basis
- `ROLL_FROM leg carries forward without crashing` — leg with role 'ROLL_FROM', no matching snapshot, assert carry-forward works (no exception)

**Green — implementation:**
- Create `src/renderer/src/lib/deriveRunningBasis.ts`
- Define types: `SnapshotInput = { snapshotAt: string; basisPerShare: string }`, `LegInput = { fillDate: string; [key: string]: unknown }`, `EnrichedLeg<T> = T & { runningCostBasis: string | null }`
- Export `deriveRunningBasis<T extends { fillDate: string }>(legs: T[], snapshots: SnapshotInput[]): Array<T & { runningCostBasis: string | null }>`
- Algorithm: sort snapshots by `snapshotAt` ASC (treat input as immutable — sort a copy), then carry-forward scan as described in `plans/us-11/data-model.md`
- Use `slice(0, 10)` to extract the date portion of `snapshotAt` for comparison with `fillDate`

**Refactor — cleanup to consider:**
- The generic `T extends { fillDate: string }` signature avoids importing `LegRecord` from the main process. Check naming is consistent with `data-model.md`.

**Acceptance criteria covered:**
- "Running cost basis column shows basis after each leg, including CC_CLOSE carry-forward"
- "Single-leg position shows partial chain" (CSP_OPEN leg gets its basis)
- Basis logic for CALLED_AWAY and CC_EXPIRED carry-forward

---

### 4. Renderer `phase.ts` — add `ROLE_COLOR`, update `LEG_ROLE_LABEL`

**Files to create or modify:**
- `src/renderer/src/lib/phase.ts` — add `ROLE_COLOR` export; update `LEG_ROLE_LABEL` with missing entries

**Red — tests to write** (`src/renderer/src/lib/phase.test.ts`):
- `ROLE_COLOR contains all six role keys` — assert `ROLE_COLOR` has keys `CSP_OPEN, ASSIGN, CC_OPEN, CC_CLOSE, CC_EXPIRED, CALLED_AWAY` with hex string values
- `LEG_ROLE_LABEL contains CALLED_AWAY entry` — assert `LEG_ROLE_LABEL['CALLED_AWAY'] === 'Called Away'`
- `LEG_ROLE_LABEL contains CC_EXPIRED entry` — assert `LEG_ROLE_LABEL['CC_EXPIRED'] === 'CC Expired'`
- `LEG_ROLE_LABEL contains CC_CLOSE entry` — assert `LEG_ROLE_LABEL['CC_CLOSE'] === 'CC Close'`

**Green — implementation:**
- Add to `src/renderer/src/lib/phase.ts`:
  ```ts
  export const ROLE_COLOR: Record<string, string> = {
    CSP_OPEN:    '#e6a817',
    ASSIGN:      '#79c0ff',
    CC_OPEN:     '#d2a8ff',
    CC_CLOSE:    '#3fb950',
    CC_EXPIRED:  '#484f58',
    CALLED_AWAY: '#3fb950',
  }
  ```
- Update `LEG_ROLE_LABEL` to add/replace entries so it matches mockup labels (`plans/us-11/research.md` — Role Color and Label section):
  - `CALLED_AWAY: 'Called Away'`
  - `CC_EXPIRED: 'CC Expired'`
  - `CC_CLOSE: 'CC Close'`
  - Existing entries may have different labels (e.g. `CSP_OPEN: 'Sell Put'` vs mockup's `'CSP Open'`) — **update to match mockup**: `CSP_OPEN: 'CSP Open'`, `ASSIGN: 'Assign'`, `CC_OPEN: 'CC Open'`

**Refactor — cleanup to consider:**
- The old `LEG_ROLE_LABEL` values (`Sell Put`, `Buy to Close Put`, etc.) were used in the existing `LegHistoryTable`. After Area 5 replaces the table, confirm no other consumer of `LEG_ROLE_LABEL` depended on the old labels.

**Acceptance criteria covered:**
- Role badge appearance for all leg types (prerequisite for Area 5).

---

### 5. Renderer `LegHistoryTable` — full column update with special cells

**Files to create or modify:**
- `src/renderer/src/components/LegHistoryTable.tsx` — rewrite with 8 columns, `PremiumCell`, `BasisCell`, footer
- `src/renderer/src/components/LegHistoryTable.test.tsx` — updated/extended tests

**Red — tests to write** (`src/renderer/src/components/LegHistoryTable.test.tsx`):
- `renders all 8 column headers including "Running Basis / Share"` — render with one CSP_OPEN leg, assert headers: Role, Action, Strike, Expiration, Contracts, Premium, Fill Date, Running Basis / Share
- `renders a role badge for each leg using ROLE_COLOR` — render CSP_OPEN leg, assert badge with text "CSP Open" and color `#e6a817` is present
- `ASSIGN leg: premium cell shows "— (assigned)" and shares received annotation` — render one ASSIGN leg with `contracts: 1`, assert "— (assigned)" and "100 shares received" visible
- `ASSIGN leg with 2 contracts shows "200 shares received"` — render ASSIGN with `contracts: 2`, assert "200 shares received"
- `CALLED_AWAY leg: premium cell shows "— (assigned)" and shares called away annotation` — render CALLED_AWAY leg with `contracts: 1`, assert "100 shares called away"
- `CC_EXPIRED leg: premium cell shows "expired worthless" in muted style` — render CC_EXPIRED, assert "expired worthless" text present
- `CC_CLOSE leg: premium cell shows "−$1.80" (not "+$1.80")` — render CC_CLOSE with `premiumPerContract: '1.80'`, assert text "−$1.80" with amber color `var(--wb-gold)` (via inline style or data-testid)
- `Running basis cell shows "$176.50" for a leg with runningCostBasis "176.5000"` — render CSP_OPEN with `runningCostBasis: '176.5000'`, assert "$176.50" visible in sky-blue cell
- `Running basis cell shows "—" for a leg with null runningCostBasis` — render leg with `runningCostBasis: null`, assert "—" in basis cell
- `no tfoot row when finalPnl is null` — render without `finalPnl` prop, assert no "Final P&L" text
- `renders tfoot "Final P&L: +$780.00" in green when finalPnl is "+780.0000"` — render with `finalPnl="780.0000"`, assert "Final P&L" and "$780.00" visible; assert green color

**Green — implementation:**

Rewrite `src/renderer/src/components/LegHistoryTable.tsx` per mockup `MockLegHistoryTable` and `PremiumCell` patterns:

1. **Update `LegHistoryEntry` type** — add `expiration: string | null`, `contracts: number`, `runningCostBasis: string | null`; make `premiumPerContract` nullable: `string | null`

2. **Update `LegHistoryTableProps`** — add `finalPnl?: string | null`

3. **Add `PremiumCell` subcomponent** with rendering logic:
   - `ASSIGN`: flex column, muted italic "— (assigned)" + `{contracts * 100} shares received` at `0.68rem`
   - `CALLED_AWAY`: flex column, muted italic "— (assigned)" + `{contracts * 100} shares called away` at `0.68rem`
   - `CC_EXPIRED`: muted italic "expired worthless"
   - `CC_CLOSE`: amber `var(--wb-gold)` "−${premiumPerContract}" (em-dash minus prefix, not hyphen)
   - Else with value: green `var(--wb-green)` "+${premiumPerContract}"
   - Else null/zero: muted "—"

4. **Add `BasisCell` subcomponent**: `null` → muted "—"; value → sky `#79c0ff` bold "$X.XX" (format as `parseFloat(value).toFixed(2)`)

5. **Update `<thead>`** — 8 columns matching mockup: Role | Action | Strike | Expiration | Contracts | Premium | Fill Date | Running Basis / Share. Running Basis header gets `background: rgba(121,192,255,0.05)`, `borderLeft: '1px solid rgba(121,192,255,0.12)'`, `color: '#79c0ff'`.

6. **Update `<tbody>` rows**:
   - Role: `<Badge color={ROLE_COLOR[leg.legRole] ?? '#8899aa'}>{LEG_ROLE_LABEL[leg.legRole] ?? leg.legRole}</Badge>` — import `Badge` from `./ui/Badge`, `ROLE_COLOR` and `LEG_ROLE_LABEL` from `../lib/phase`
   - Action: `leg.action` in muted color `var(--wb-text-secondary)`
   - Strike: `$${parseFloat(leg.strike).toFixed(2)}` in gold `var(--wb-gold)`
   - Expiration: `leg.expiration ?? '—'` (muted if null)
   - Contracts: `leg.contracts` in secondary color
   - Premium: `<PremiumCell leg={leg} />`
   - Fill Date: `leg.fillDate`
   - Running Basis: `<BasisCell value={leg.runningCostBasis} />` with `borderLeft` and `background` sky tint matching header

7. **Add `<tfoot>`**: rendered only when `finalPnl` is truthy. `<td colSpan={8}>` with green-dim border top, `rgba(63,185,80,0.04)` background, muted "Final P&L" label + `pnlColor(finalPnl)`-colored `fmtMoney(finalPnl)` amount. Import `fmtMoney`, `pnlColor` from `../lib/format`.

**Refactor — cleanup to consider:**
- `PremiumCell` and `BasisCell` are single-use but non-trivial — keep them as local functions in the same file unless they grow.
- Check the `whiteSpace: 'nowrap'` style is on all cells to prevent wrapping.

**Acceptance criteria covered:**
- "Each row shows: leg role, action, instrument type, strike, expiration, contracts, premium, fill date"
- "ASSIGN leg displays shares received, not premium" (AC 4)
- "CC_CLOSE premium column shows '−$1.80' in amber" (AC 2)
- "CC_EXPIRED premium shows 'expired worthless' in muted text" (AC 6)
- "CALLED_AWAY premium shows '— (assigned)' and shares called away annotation" (AC 5)
- "Final P&L footer row '+$780.00' in green" (AC 3)

---

### 6. Renderer `PositionDetailPage` — wire `deriveRunningBasis` and `finalPnl`

**Files to create or modify:**
- `src/renderer/src/pages/PositionDetailPage.tsx` — import `deriveRunningBasis`, compute enriched legs, pass `finalPnl` to `LegHistoryTable`
- `src/renderer/src/pages/PositionDetailPage.test.tsx` — new test cases

**Red — tests to write** (`src/renderer/src/pages/PositionDetailPage.test.tsx`):
- `leg history table shows running cost basis column header` — mock `usePosition` with a CSP_OPEN position including `allSnapshots: [...]`, render `PositionDetailPage`, assert "Running Basis / Share" header is visible
- `leg history table shows running basis value for CSP_OPEN leg` — mock with one leg + one matching snapshot, assert the computed basis amount is rendered in the table
- `leg history table renders final P&L footer for WHEEL_COMPLETE position` — mock with `position.status: 'CLOSED'`, `costBasisSnapshot.finalPnl: '780.0000'`, assert "Final P&L" and "$780.00" visible
- `leg history table has no P&L footer when finalPnl is null` — mock active position with `costBasisSnapshot.finalPnl: null`, assert "Final P&L" text is not present

**Green — implementation:**
- Import `deriveRunningBasis` from `'../lib/deriveRunningBasis'` in `PositionDetailPage.tsx`
- In the render body (after destructuring `{ position, activeLeg, costBasisSnapshot, legs, allSnapshots }`), compute:
  ```ts
  const enrichedLegs = deriveRunningBasis(legs, allSnapshots ?? [])
  ```
- Pass `enrichedLegs` (instead of `legs`) to `<LegHistoryTable>`
- Pass `finalPnl={costBasisSnapshot?.finalPnl ?? null}` to `<LegHistoryTable>`
- Update the existing `CSP_OPEN_DETAIL` and other fixtures in `PositionDetailPage.test.tsx` to include `allSnapshots: []` (or a populated array for basis tests)

**Refactor — cleanup to consider:**
- The `allSnapshots ?? []` fallback handles old fixtures in tests that don't include the new field.
- No structural changes needed — `LegHistoryTable` slot already exists in the JSX.

**Acceptance criteria covered:**
- "Running cost basis column shows basis after each leg" (AC 2) — via `deriveRunningBasis`
- "Completed wheel shows final P&L in the chain footer" (AC 3) — via `finalPnl` prop
- "Single-leg position shows partial chain" (AC 7) — `deriveRunningBasis` with one leg returns it with its basis

---

### 7. E2E Tests

**Files to create or modify:**
- `e2e/leg-chain-display.spec.ts` — new E2E spec

**Red — tests to write** (one test per AC):

- `leg chain displays all legs in chronological order` — Create a position, record assignment, open a CC. Navigate to the position detail page. Assert the leg history table shows 3 rows in order: CSP Open → Assign → CC Open (verify row text content by `data-testid` or table row order).

- `running cost basis column shows basis after each leg including CC_CLOSE carry-forward` — Create position (CSP premium $3.50, strike $180). Record assignment. Open CC (premium $2.30). Close CC early. Navigate to detail. Assert column header "Running Basis / Share" is visible. Assert CSP_OPEN row basis cell shows "$176.50". Assert CC_OPEN row basis cell shows "$174.20". Assert CC_CLOSE row basis cell shows "$174.20" (carried forward).

- `completed wheel shows final P&L in the chain footer` — Create position, assign, open CC, record called-away (or use expire path to reach WHEEL_COMPLETE). Navigate to detail. Assert "Final P&L" text is visible in the table footer. Assert the amount is in green.

- `ASSIGN leg displays shares received not premium` — Create position and record assignment with 1 contract. Navigate to detail. Find the ASSIGN row. Assert "— (assigned)" text is visible. Assert "100 shares received" annotation text is visible. Assert no "$" amount in the premium cell.

- `CALLED_AWAY leg shows call-away strike and inherits running basis` — Create position, assign, open CC, trigger called-away. Navigate to detail. Find the CALLED_AWAY row. Assert "— (assigned)" and "100 shares called away" visible. Assert the running basis cell shows a non-empty dollar amount (carried forward from CC_OPEN snapshot).

- `CC_EXPIRED leg displays expired worthless in muted style` — Create position, assign, open CC, let CC expire worthless. Navigate to detail. Find the CC_EXPIRED row. Assert "expired worthless" text is visible in the premium cell.

- `single-leg position shows partial chain with initial basis` — Create a new position (CSP_OPEN, no further actions). Navigate to detail. Assert exactly 1 row in the leg history table. Assert the running basis cell shows the initial basis value (strike minus premium per share, e.g. "$176.50" for strike=180, premium=3.50).

**Acceptance criteria covered:** All 7 ACs from the user story have a corresponding E2E test case above.
