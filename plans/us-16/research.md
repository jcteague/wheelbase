# Research: US-16 — Cost Basis After Sequential Rolls

## Current State of `calculateRollBasis`

- **Decision:** Extend the existing `calculateRollBasis` function rather than creating a new one.
- **Rationale:** The function already exists in `src/main/core/costbasis.ts` and is called by both `rollCspPosition` and `rollCcPosition`. It correctly handles the net credit/debit math but applies only the simple formula (`prevBasis - netCredit`) regardless of leg type or strike change. Adding `legType`, `prevStrike`, and `newStrike` to its input is a backward-compatible extension.
- **Alternatives considered:** Creating a separate `calculateCspRollBasis` and `calculateCcRollBasis`; rejected because it duplicates shared net-credit logic.

## CSP Different-Strike Roll Formula

- **Decision:** `newBasis = prevBasis + (newStrike − prevStrike) − netCredit` for CSP rolls where `newStrike ≠ prevStrike`.
- **Rationale:** When rolling down (e.g., $50 → $47), the assignment obligation drops by $3/share; this must be reflected in basis immediately, not just at assignment. Ignoring the strike delta gives a materially wrong basis ($47.70 vs the correct $44.70 in the US-16 roll-down scenario).
- **Alternatives considered:** Deferring the strike adjustment to assignment time; rejected because intermediate snapshots would be inaccurate.

## CC Roll Formula

- **Decision:** CC rolls always use `newBasis = prevBasis - netCredit` regardless of strike direction.
- **Rationale:** CC strike changes do not affect share cost basis — the shares are already held and the cost was set at assignment. Only the net option premium from the CC roll changes basis.
- **Alternatives considered:** None — this is stated directly in the tech notes and confirmed by the AC.

## Assignment Basis After Rolled CSPs

- **Decision:** Fix `assignCspPosition` to compute a **net credit per roll chain** (ROLL_TO.premium − ROLL_FROM.premium) and pass those netted values to `calculateAssignmentBasis` as `legRole: 'ROLL_NET'` entries with explicit labels.
- **Rationale:** `calculateAssignmentBasis` currently sums CSP_OPEN + all ROLL_TO premiums. This is wrong because it treats the gross ROLL_TO premium as a credit without deducting the ROLL_FROM cost to close. For example: CSP opened at $50, premium $2.00; rolled (cost-to-close $0.80, new premium $1.50, net credit $0.70) → correct basis = $47.30. Current code gives $50 − $2.00 − $1.50 = $46.50, which is wrong.
- **Alternatives considered:**
  - Passing ROLL_FROM legs directly to the engine as debits — rejected because the engine would need roll_chain_id grouping logic (not appropriate for a pure function).
  - Using the previous cost basis snapshot at assignment time — rejected because `calculateAssignmentBasis` recalculates from scratch and also needs to produce a waterfall; the snapshot does not carry waterfall data.
  - Mutating the engine to infer debits from ROLL_FROM legRole — rejected because it requires the engine to know how to group roll pairs, which belongs in the service layer.

## Premium Waterfall Format for Assignment After Roll

- **Decision:** The premium waterfall shows one line per roll: `"Roll #N credit: $X"` or `"Roll #N debit: $X"` where X is the net value. This is produced by the service layer grouping legs by roll_chain_id (ordered by fill_date), computing net per roll, and passing an explicit `label` field in `AssignmentBasisLeg`.
- **Rationale:** The AC specifies `"Roll #1 credit: $0.70"` — a single net line, not two separate ROLL_FROM/ROLL_TO lines.
- **Alternatives considered:** Showing gross ROLL_TO and ROLL_FROM as two separate waterfall lines — rejected because the AC and mockup both show a single net line.

## `AssignmentBasisLeg` Interface Extension

- **Decision:** Add an optional `label?: string` field to `AssignmentBasisLeg` so the service layer can supply display text for roll-net entries. Engine uses `leg.label ?? LEG_ROLE_LABEL[leg.legRole] ?? leg.legRole` in waterfall generation.
- **Rationale:** The engine stays pure (no string formatting logic beyond applying the label), while the service controls how each roll is labeled.
- **Alternatives considered:** Adding a separate labeling map in the engine keyed by roll index — rejected because the engine has no roll index concept.

## No New IPC Surface, Migrations, or Frontend Work

- **Decision:** This story makes no changes to IPC handlers, Zod schemas, SQL migrations, or the renderer.
- **Rationale:** The story explicitly states "The display is handled by US-15" and "this is primarily a core engine and service-layer story." All data flows through existing IPC channels; correctness is validated at the engine and service layer.
