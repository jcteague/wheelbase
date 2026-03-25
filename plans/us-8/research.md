# Research: US-8 — Close Covered Call Early

## LegRole: CC_CLOSE

- **Decision:** Use existing `CC_CLOSE` value from `LegRole` enum in `src/main/core/types.ts`.
- **Rationale:** The enum already contains `'CC_CLOSE'` — no schema or migration change needed.
- **Alternatives considered:** Adding a new role; not needed.

## Cost Basis on CC Close

- **Decision:** Do **not** create a new cost basis snapshot when closing the CC early.
- **Rationale:** The story states explicitly: "the snapshot created when the CC was opened already reflects the CC premium reduction; closing the CC does not reverse that." The existing CC_OPEN snapshot remains the current snapshot.
- **Alternatives considered:** Creating a snapshot with `finalPnl` for the CC leg (as done in CSP close). This would be incorrect — the wheel is still ACTIVE and no final P&L exists for the position.

## CC Leg P&L Formula

- **Decision:** `(openPremiumPerContract − closePricePerContract) × contracts × 100`
- **Rationale:** Matches the story's acceptance criteria examples exactly:
  - ($2.30 − $1.10) × 1 × 100 = +$120.00
  - ($2.30 − $3.50) × 1 × 100 = −$120.00
- **Alternatives considered:** Using existing `calculateCspClose` from `costbasis.ts` — the formula is identical, but naming a `calculateCcClose` function clearly communicates domain intent.

## "% of max" Preview Label

- **Decision:** Show `(openPremium − closePrice) / openPremium × 100` as "X% of max" only when `closePrice < openPremium` (profit). Show only the dollar loss amount + "X% above open" when `closePrice > openPremium`. Show "Break-even" when exactly equal.
- **Rationale:** Directly from the story's Technical Notes section. The mockup `MockPnlPreview` confirms the pattern: profit shows "% of max", loss shows "% above open".
- **Alternatives considered:** Always showing percentage — not aligned with story spec.

## IPC Return Shape

- **Decision:** Return `{ position: { id, ticker, phase: 'HOLDING_SHARES', status: 'ACTIVE', closedDate: null }, leg: LegRecord, ccLegPnl: string }`. No cost basis snapshot in the response.
- **Rationale:** Position stays ACTIVE (wheel continues), so `closedDate` stays null and status stays ACTIVE. The P&L is needed by the renderer for the success hero card.
- **Alternatives considered:** Including the existing snapshot in the response — not necessary since the renderer can derive it from the refreshed `positions:get` call after mutation.

## Fill Date Validation Bounds

- **Decision:** `fillDate >= CC_OPEN leg fillDate` AND `fillDate <= CC expiration date`.
- **Rationale:** Story specifies three date error cases:
  1. Before CC open date → "Fill date cannot be before the CC open date"
  2. After CC expiration → "Fill date cannot be after the CC expiration date — use Record Expiry instead"
  3. Future dates are implicitly rejected (consistent with all other lifecycle functions using `referenceDate`).
- **Alternatives considered:** Only bounding one side — not sufficient per ACs.

## No New DB Migration Required

- **Decision:** No migration needed for this story.
- **Rationale:** The `legs` table already supports `CC_CLOSE` leg role and `BUY` action. The `positions` table already supports `HOLDING_SHARES` phase. No new columns or tables are required.
- **Alternatives considered:** Adding a `cc_leg_pnl` column to track the P&L — not needed; P&L is derivable from leg data at any time.

## Sheet Component Pattern

- **Decision:** Follow the `OpenCoveredCallSheet` portal pattern: `CloseCcEarlySheet` (orchestrator) + `CloseCcEarlyForm` (form body) + `CloseCcEarlySuccess` (success state).
- **Rationale:** Existing sheets (`OpenCoveredCallSheet`, `AssignmentSheet`, `ExpirationSheet`) all use `createPortal` with a fixed right-panel overlay. The mockup shows the same 400px right-side sheet layout with scrim.
- **Alternatives considered:** Using shadcn Sheet primitive — the project has established a custom portal pattern; using a different approach would be inconsistent.
