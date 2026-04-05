# Research: US-11 — Wheel Leg Chain Display

## Snapshot-to-Leg Matching Algorithm

- **Decision:** Carry-forward pointer scan — iterate legs in `fill_date ASC` order; maintain a snapshot pointer advancing through snapshots sorted `snapshot_at ASC`; for each leg advance the pointer while `snapshot.snapshotAt.slice(0,10) <= leg.fillDate`, then record the last seen `basisPerShare` as `runningCostBasis` for that leg.
- **Rationale:** Snapshots are created on the same day as their triggering leg (CSP_OPEN, ASSIGN, CC_OPEN, CC_EXPIRED, CALLED_AWAY). The date comparison (`slice(0,10)`) is safe because snapshot timestamps use ISO-8601 and the leg `fillDate` is already `YYYY-MM-DD`. CC_CLOSE has no snapshot, so its leg simply carries forward the last known basis. This algorithm is O(n+m) and requires no look-ahead.
- **Alternatives considered:** Matching by leg role name (brittle — breaks if two CC_OPEN legs exist); SQL join on fill_date (not possible client-side); returning pre-computed running basis from the backend (adds DB logic that belongs in display layer).

## `allSnapshots` Backend Query

- **Decision:** Add a second SQLite query in `get-position.ts`: `SELECT * FROM cost_basis_snapshots WHERE position_id = ? ORDER BY snapshot_at ASC`. Return the result as `allSnapshots: CostBasisSnapshotRecord[]` on `GetPositionResult`.
- **Rationale:** The current service already issues a second query for all legs (`GET_LEGS_QUERY`). Adding a parallel snapshot query is consistent with that pattern and keeps the IPC response self-contained.
- **Alternatives considered:** Embedding snapshot data in the legs query via JOIN (overcomplicated, not consistent with existing patterns); returning only the latest snapshot and re-deriving history (data loss — terminal PnL is on the last snapshot only).

## `deriveRunningBasis` Placement

- **Decision:** Pure function in `src/renderer/src/lib/deriveRunningBasis.ts`. Exported as `deriveRunningBasis(legs: LegRecord[], snapshots: CostBasisSnapshotRecord[])`.
- **Rationale:** This is display logic (enriching data for rendering), not business logic. The renderer already has a `lib/` folder for pure helpers (`format.ts`, `phase.ts`). Keeping it renderer-side avoids coupling the backend service to a display concern.
- **Alternatives considered:** Placing in `src/main/core/` (would work since it's pure, but violates the separation of display vs business logic); placing inline in `PositionDetailPage` (testability concern — harder to unit-test).

## `LegHistoryTable` Column Changes

- **Decision:** Replace the existing 5-column table (Date, Action, Type, Strike, Premium) with the 8-column layout shown in the mockup: Role (badge) | Action | Strike | Expiration | Contracts | Premium | Fill Date | Running Basis / Share.
- **Rationale:** The mockup is authoritative. The new `LegHistoryEntry` type adds `expiration: string | null`, `contracts: number`, and `runningCostBasis: string | null`. The `finalPnl?: string | null` prop controls the `<tfoot>` footer row.
- **Alternatives considered:** Keeping the old columns and adding to them (rejected — old column order doesn't match mockup; "Type" column is replaced by the Role badge per technical notes).

## Role Color and Label Mapping

- **Decision:** Add `ROLE_COLOR: Record<string, string>` to `src/renderer/src/lib/phase.ts` using exact hex values from the mockup (`CSP_OPEN: '#e6a817'`, `ASSIGN: '#79c0ff'`, `CC_OPEN: '#d2a8ff'`, `CC_CLOSE: '#3fb950'`, `CC_EXPIRED: '#484f58'`, `CALLED_AWAY: '#3fb950'`). Also update `LEG_ROLE_LABEL` to add missing entries (`CALLED_AWAY: 'Called Away'`, `CC_EXPIRED: 'CC Expired'`, `CC_CLOSE: 'CC Close'`) to match the mockup labels.
- **Rationale:** Centralized in `phase.ts` alongside existing role/phase maps. Mockup explicitly defines colors per role.
- **Alternatives considered:** Inline constants in `LegHistoryTable.tsx` (duplication risk if a future component needs the same colors); a separate `legRoles.ts` file (unnecessary fragmentation for two small maps).

## Premium Cell Rendering

- **Decision:** Implement a `PremiumCell` subcomponent inside `LegHistoryTable.tsx` with this rendering logic (from mockup + technical notes):
  - `ASSIGN`: muted italic "— (assigned)" + smaller "{contracts × 100} shares received" annotation
  - `CALLED_AWAY`: muted italic "— (assigned)" + "{contracts × 100} shares called away" annotation
  - `CC_EXPIRED`: muted italic "expired worthless"
  - `CC_CLOSE`: amber (`var(--wb-gold)`) "−$X.XX" (buyback debit; note em-dash minus, not hyphen)
  - All others with a value: green (`var(--wb-green)`) "+$X.XX"
  - Fallback (null/zero): muted "—"
- **Rationale:** Directly specified in story technical notes and mockup `PremiumCell` component.
- **Alternatives considered:** Separate file (overkill for a single-use subcomponent).

## Final P&L Footer

- **Decision:** Render `<tfoot>` with `colSpan={8}` only when `finalPnl` prop is truthy. Use `pnlColor()` from `src/renderer/src/lib/format.ts` for the P&L amount color (green/red). Label "Final P&L" in muted style. Border top `rgba(63,185,80,0.25)` + background `rgba(63,185,80,0.04)` matches mockup.
- **Rationale:** Mockup shows the footer as part of the table's `<tfoot>`, passed via prop from `PositionDetailPage` using `costBasisSnapshot.finalPnl`.
- **Alternatives considered:** Rendering a separate card below the table (doesn't match mockup, which shows it inline).
