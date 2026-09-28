---
page: docs/spec/features/us-7-open-covered-call.md
audited_at: 2026-09-28
findings: 7
---

# Audit: docs/spec/features/us-7-open-covered-call.md

## Verified (15)

- ✓ All 21 listed source files exist, including `src/main/services/open-covered-call-position.ts` and `e2e/open-covered-call.spec.ts`.
- ✓ `openCoveredCall()` lifecycle function (`src/main/core/lifecycle.ts:181`) with `OpenCoveredCallInput` / `OpenCoveredCallResult` (`:165`, `:177`).
- ✓ `invalid_phase` "A covered call is already open on this position" when phase is `CC_OPEN` (`lifecycle.ts:182-187`).
- ✓ Error codes `contracts/exceeds_shares` "Contracts cannot exceed shares held (n)" (`lifecycle.ts:201-206`), `fillDate/before_assignment` (`:209-213`), `fillDate/cannot_be_future` (`:217-218`).
- ✓ `requirePositiveStrike` / `requirePositivePremium` private helpers (`lifecycle.ts:35`, `:47`) shared by `openWheel()` (`:72`, `:82`) and `openCoveredCall()` (`:198-199`).
- ✓ `calculateCcOpenBasis` with `CcOpenBasisInput` / `CcOpenBasisResult` using `round4` (`src/main/core/costbasis.ts:142-165`); `totalPremiumCollected = round4(prevTotal + premium × contracts × 100)` (`:161`, `:165`).
- ✓ Service loads context via `getPosition` (`open-covered-call-position.ts:22`), reads the ASSIGN leg for `positionContracts` (`:30`, `:59`), runs in one `db.transaction` (`:68`), inserts `CC_OPEN`/`SELL`/`CALL` leg (`:69-73`), updates phase to `CC_OPEN` (`:87`), inserts a `cost_basis_snapshots` row with `trigger_event = 'CC_OPEN'` and `finalPnl: null` (`:93-95`, `:138`).
- ✓ `positions:open-cc` registered with label `positions_open_cc_unhandled_error` and `OpenCcPayloadSchema` (`src/main/ipc/positions.ts:97-103`) through `registerParsedPositionHandler`, which wraps `handleIpcCall` (`ipc/positions.ts:35-47`).
- ✓ `OpenCcPayloadSchema` `{ positionId, strike, expiration, contracts, premiumPerContract, fillDate? }` with positive / int constraints (`src/main/schemas.ts:233-240`); `OpenCcPositionResult` (`:244`).
- ✓ Preload `openCoveredCall` → `positions:open-cc` (`src/preload/index.ts:24`); renderer adapter `openCoveredCall` (`src/renderer/src/api/positions.ts:317`); `IPC_TO_FORM_FIELD` maps `premiumPerContract` / `fillDate` (`api/positions.ts:79-80`).
- ✓ `useOpenCoveredCall` invalidates `positionQueryKeys.all` (`useOpenCoveredCall.ts:14`).
- ✓ `computeGuardrail(strike, basis)` returns `below | at | above` with verbatim copy for all three variants (`openCcGuardrail.ts:24-43`); `above → AlertBox variant="info"`, `at|below → variant="warning"` (`OpenCcForm.tsx:93-98`).
- ✓ `OpenCcSuccess` has a `StatBox` sub-component (`OpenCcSuccess.tsx:9`, `:84-89`).
- ✓ "Open Covered Call →" entry point exists (`src/renderer/src/components/PositionDetailActions.tsx:78`).
- ✓ Linked pages `domain/wheel-lifecycle.md`, `domain/cost-basis.md`, `contracts/ipc-handlers.md`, `schema/tables.md` exist.

## Drift (7)

- ✗ Summary says the sheet "hosts a React Hook Form + Zod form"; `OpenCoveredCallSheet.tsx:24-30` manages every field with hand-rolled `useState` (`strike`, `premium`, `ccContracts`, `expiration`, `fillDate`, `fieldErrors`) and neither it nor `OpenCcForm.tsx` imports `useForm` / `zodResolver`. (Also contradicts the CLAUDE.md RHF rule — code-side debt, not only a doc issue.)
- ✗ AC and ADR say the CC leg is written with `fill_price = null`; the insert passes `premiumFormatted` for `fill_price` (`src/main/services/open-covered-call-position.ts:79-81`) and the result returns `fillPrice: premiumFormatted` (`:127`).
- ✗ Basis formula stated as `basisPerShare = round4(prevBasisPerShare − ccPremiumPerContract)`; code prorates across shares held: `prev − (premium × contracts × 100) / (positionContracts × 100)` (`src/main/core/costbasis.ts:160-164`, `CcOpenBasisInput.positionContracts` at `:147`). Equal only at full coverage.
- ✗ AC: invalid-phase message "This position is closed" — no such string in `src/`; the non-`HOLDING_SHARES` branch throws "Position is not in HOLDING_SHARES phase" (`lifecycle.ts:190-195`).
- ✗ AC: past expiration rejected with "Expiration date must be in the future" — not found in `src/`; lifecycle instead throws `expiration/before_fill_date` "Expiration cannot be before fill date" (`lifecycle.ts:221-225`), which is also missing from the page's known-error-code list.
- ✗ AC: partial-coverage notice "1 of 2 contracts covered — 100 shares uncovered" and the zero-premium / future-fill-date soft warnings — no matching copy found in `OpenCcForm.tsx` or `OpenCoveredCallSheet.tsx` (only the guardrail and "This cannot be undone." warnings, `OpenCcForm.tsx:93-153`). Zero premium is in fact rejected server-side by `requirePositivePremium` (`lifecycle.ts:199`) and `z.number().positive()` (`schemas.ts:238`), so "zero premium shows a soft warning only" contradicts the backend.
- ✗ "`PositionDetailPage` … owns `openCcCtx` state" and "(104 lines)": the state lives in `src/renderer/src/pages/usePositionDetailSheets.ts:111`, the button in `PositionDetailActions.tsx:78`; `OpenCoveredCallSheet.tsx` is now 123 lines.

## Unverifiable (2)

- ? "after a 649-line draft was split during refactor" — history.
- ? "File-size limit (~200 lines) drove the split" — rationale.

## Missing files (0)
