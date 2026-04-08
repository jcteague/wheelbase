# Research: US-12 — Roll Open CSP Out

## roll_chain_id Column

- **Decision:** Use the existing `roll_chain_id TEXT` column in the `legs` table (migration 001)
- **Rationale:** Already present in schema; no new migration needed
- **Alternatives considered:** Adding a separate `rolls` join table — not needed given the linked-leg-pair design already baked in

## ROLL_FROM / ROLL_TO Leg Roles

- **Decision:** Use existing `ROLL_FROM` and `ROLL_TO` values in the `LegRole` enum (`src/main/core/types.ts`)
- **Rationale:** Already defined; `costbasis.ts` already references `ROLL_TO` in `LEG_ROLE_LABEL`
- **Alternatives considered:** None — these are already in the type system

## Service File Pattern

- **Decision:** Create a standalone service file `src/main/services/roll-csp-position.ts` (not adding to `positions.ts`)
- **Rationale:** All other operations follow the one-file-per-operation pattern (close-csp-position.ts, assign-csp-position.ts, etc.)
- **Alternatives considered:** Adding to positions.ts — inconsistent with existing pattern

## Cost Basis After Roll

- **Decision:** Add `calculateRollBasis` to `src/main/core/costbasis.ts`. Formula: `prevBasisPerShare - netCreditPerShare` (credit case) or `prevBasisPerShare + netDebitPerShare` (debit case), where `netCredit = newPremium - costToClose`. Net per-share = net/contract value (option contracts are per-share already, 1 contract = 100 shares, so `netTotal = net * contracts * 100`, and `netPerShare = netTotal / (contracts * 100) = net`).
- **Rationale:** Consistent with `calculateCcOpenBasis` pattern; credit reduces basis, debit increases it
- **Alternatives considered:** Inline math in service — violates pure-engine boundary rule

## Phase After Roll

- **Decision:** Phase stays `CSP_OPEN` after a roll
- **Rationale:** Explicitly stated in the user story; the trader is extending the trade, not closing it
- **Alternatives considered:** N/A — requirement is clear

## IPC Handler Pattern

- **Decision:** Use `registerParsedPositionHandler` helper for `positions:roll-csp`
- **Rationale:** Identical to all other position mutation handlers; eliminates boilerplate
- **Alternatives considered:** Inline `ipcMain.handle` — inconsistent with existing pattern

## Frontend Sheet Pattern

- **Decision:** `RollCspSheet` uses `createPortal` to `document.body`, width 420px (matches mockup), slide-in animation class, success state rendered inside same portal
- **Rationale:** Matches `ExpirationSheet`, `AssignmentSheet`, `OpenCoveredCallSheet` patterns exactly; mockup specifies 420px
- **Alternatives considered:** Separate success page — inconsistent with existing UX patterns

## Net Credit/Debit Preview

- **Decision:** Compute client-side in real time as the user types (no IPC call needed)
- **Rationale:** Pure arithmetic (`newPremium - costToClose`); no server-side state required. Matches mockup's `NetCreditDebitPreview` component logic
- **Alternatives considered:** Debounced IPC call — unnecessary round-trip for simple math

## Form Library

- **Decision:** React Hook Form + Zod resolver (`zodResolver`) — already used in `NewWheelForm.tsx` and other forms
- **Rationale:** Consistent with existing codebase; Zod schemas already defined on the main-process side; renderer-side schemas are defined inline in components
- **Alternatives considered:** Uncontrolled inputs — inconsistent with existing pattern

## newStrike Field

- **Decision:** Include `newStrike` as optional in `RollCspPayloadSchema` (defaults to current strike on the service side for roll-out). The form pre-fills it with the current strike (editable, not read-only at the data layer — the sheet renders it as editable per mockup, which supports both US-12 roll-out and US-13 roll-down-out)
- **Rationale:** Story notes say "newStrike is optional; defaults to current strike for roll-out"
- **Alternatives considered:** Separate schemas for roll-out vs roll-down — unnecessary complexity
