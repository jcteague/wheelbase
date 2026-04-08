# US-13 Research: Roll CSP Down and Out

## US-12 Baseline (In-Progress, Worktree)

US-12 is being built in a separate worktree (`~/my-stuff/wheelbase-us-12/`). US-13 assumes US-12 is merged. Key infrastructure US-12 provides:

### Lifecycle Engine (`src/main/core/lifecycle.ts`)
- `rollCsp(input: RollCspInput): RollCspResult` — validates `currentPhase === 'CSP_OPEN'`, `newExpiration > currentExpiration`, positive amounts
- **No `newStrike` parameter** — lifecycle is unaware of strike changes
- Returns `{ phase: 'CSP_OPEN' }` (no phase transition)

### Schema (`src/main/schemas.ts`)
- `RollCspPayloadSchema` already includes `newStrike: z.number().positive().optional()`
- Service defaults `newStrike` to current strike when omitted

### Service (`src/main/services/roll-csp-position.ts`)
- `rollCspPosition(db, positionId, payload)` — atomic transaction
- Creates ROLL_FROM (BUY at current strike) + ROLL_TO (SELL at newStrike) legs
- Links with shared `roll_chain_id` UUID
- Creates cost basis snapshot via `calculateRollBasis()`
- `newStrike` defaults to current strike if omitted

### Cost Basis (`src/main/core/costbasis.ts`)
- `calculateRollBasis({ prevBasisPerShare, prevTotalPremiumCollected, costToClosePerContract, newPremiumPerContract, contracts })`
- Net = newPremium - costToClose; credit reduces basis, debit increases it

### Renderer (`src/renderer/src/components/RollCspSheet.tsx`)
- Strike field is editable, pre-filled with current strike
- `getRollTypeLabel(currentStrike, newStrike)` — only 3 types (no expiration comparison)
- `NetCreditDebitPreview` — debit warning says "costs more to close than new premium provides"
- No roll count logic anywhere
- Success state does not highlight strike changes

### Position Queries
- `list-positions.ts` and `get-position.ts` already select the latest active leg (by `fill_date DESC, created_at DESC`) for display
- After a roll with strike change, the new ROLL_TO leg's strike will naturally be displayed — **no query changes needed**

---

## Lifecycle Validation Change

- **Decision:** Extend `rollCsp()` to accept `newStrike` and `currentStrike` parameters. Allow same-expiration rolls when strike differs. Reject when both strike and expiration are unchanged.
- **Rationale:** US-12 enforces `newExpiration > currentExpiration` unconditionally. US-13 needs to allow same-expiration strike-only rolls ("Roll Down", "Roll Up"). The lifecycle engine is the right place for this validation since it's a pure function.
- **Alternatives considered:** Validating only in the service layer — rejected because lifecycle.ts owns all phase-transition and roll-validity rules per architecture standards.

## Roll Type Label Logic

- **Decision:** Replace the 3-way `getRollTypeLabel(currentStrike, newStrike)` with a 5-way function that also compares expirations: `getRollTypeLabel(currentStrike, newStrike, currentExpiration, newExpiration)`.
- **Rationale:** The 5 types (Roll Out, Roll Down & Out, Roll Up & Out, Roll Down, Roll Up) are defined in the acceptance criteria and the mockup already uses this logic.
- **Alternatives considered:** Keeping 3-way and labeling same-expiration rolls as "Roll Down & Out" anyway — rejected because the label would be misleading.

## Roll Count

- **Decision:** Add a `getRollCount(db, positionId)` query that counts ROLL_TO legs for the position. Pass count to the renderer via the position detail response. Display on the roll form with a soft warning at 3+.
- **Rationale:** Roll count is needed for display only — it doesn't affect the roll logic or block execution. Counting ROLL_TO legs is the simplest approach since each roll creates exactly one ROLL_TO.
- **Alternatives considered:** Counting distinct `roll_chain_id` values — equivalent but slightly more complex SQL for no benefit.

## Net Debit Warning Text

- **Decision:** Change from "This roll costs more to close than the new premium provides" to "This roll produces a net debit, which increases your cost basis" (per AC).
- **Rationale:** The new wording is more informative — it tells the trader the consequence (increased cost basis), not just the fact.

## Position Card Strike After Roll

- **Decision:** No query changes needed. The existing `list-positions.ts` query already selects the latest leg with `leg_role IN ('CSP_OPEN')` ordered by `fill_date DESC`. Since ROLL_TO legs have `leg_role = 'ROLL_TO'` (not `CSP_OPEN`), we need to verify this works.
- **Update:** After re-checking, the list query uses `leg_role IN ('CSP_OPEN', 'CC_OPEN')` — ROLL_TO is NOT included. The `get-position.ts` query also filters by `leg_role = 'CSP_OPEN'` for the active leg. **This means ROLL_TO legs won't be picked up as the active leg.** Either the queries need updating to include `ROLL_TO`, or the service needs to check if US-12 handles this differently.
- **Resolution:** Reading the US-12 service more carefully — US-12 does NOT update the leg_role. The ROLL_TO leg has `leg_role = 'ROLL_TO'`. So both `list-positions` and `get-position` queries need `ROLL_TO` added to the active-leg filter. **This is likely already handled by US-12** since it needs the rolled position to display correctly. Need to verify.

## Active Leg Query Gap (VERIFIED)

**Finding:** US-12's `list-positions.ts` (line 37) filters `leg_role IN ('CSP_OPEN', 'CC_OPEN')` and `get-position.ts` (line 108) filters `leg_role = 'CSP_OPEN'`. Neither includes `ROLL_TO`. After a roll, the ROLL_TO leg (with the new strike) will NOT be selected as the active leg.

**Impact:** The position card and detail page will show stale strike/expiration data after a roll.

**Decision:** US-13 must add `ROLL_TO` to both active-leg queries. This is required by AC: "the position card displays $175.00 as the active strike." The query change is: `leg_role IN ('CSP_OPEN', 'CC_OPEN', 'ROLL_TO')` (and corresponding change in get-position for the CSP_OPEN branch).

**Note:** This may also be a bug in US-12 (roll-out with same strike would still show stale expiration). If US-12 fixes this before merge, this area becomes a no-op for US-13.
