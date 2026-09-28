---
page: docs/spec/features/us-10-call-away.md
audited_at: 2026-09-28
findings: 3
---

# Audit: docs/spec/features/us-10-call-away.md

## Verified (26)

- ✓ All 29 listed source files exist (types, lifecycle, costbasis, schemas, record-call-away-position service, ipc/positions, preload, api/positions, usePositionMutation, useRecordCallAway, useCloseCoveredCallEarly, CallAwaySheet/Form/Success, PositionDetailActions, PositionDetailPage/Content, usePositionDetailSheets, and their tests) plus `e2e/call-away.spec.ts`
- ✓ `recordCallAway()` pure lifecycle fn — `src/main/core/lifecycle.ts:243`
- ✓ Shared helpers `requireCcOpenPhase()` / `requireFillDateOnOrAfterOpen()` and `NO_OPEN_COVERED_CALL_MESSAGE = 'No open covered call on this position'` — `lifecycle.ts:33,55,61`; used by both call-away and close-CC (`lifecycle.ts:244,332`)
- ✓ `multi_contract_unsupported` / "Multi-contract call-away is not yet supported" — `lifecycle.ts:249-250`
- ✓ "Fill date cannot be before the CC open date" — `lifecycle.ts:257`
- ✓ `calculateCallAway()` — `src/main/core/costbasis.ts:310`; helpers `SHARES_PER_CONTRACT`, `sharesFromContracts()`, `calculateCycleDays()` — `costbasis.ts:10,27,31`
- ✓ `LEG_ACTION_VALUES` includes `'EXERCISE'`; `LegAction = z.enum(LEG_ACTION_VALUES)` — `src/main/core/types.ts:3,31`
- ✓ `PositionIdSchema = z.string().uuid()` — `src/main/schemas.ts:40`; `RecordCallAwayPayloadSchema` — `schemas.ts:254`
- ✓ `positions:record-call-away` registered via `registerParsedPositionHandler` — `src/main/ipc/positions.ts:35,115`
- ✓ Service inserts action `EXERCISE`, instrument `CALL`, premium `'0.0000'`; updates `phase='WHEEL_COMPLETE', status='CLOSED', closed_date` — `src/main/services/record-call-away-position.ts:11-13,78,93`
- ✓ Service appends a `cost_basis_snapshots` row with `final_pnl` — `record-call-away-position.ts:98`
- ✓ `getCcOpenLeg()` helper; fillDate derived from `ccOpenLeg.expiration` — `record-call-away-position.ts:15,36`
- ✓ Preload shared `invoke()` helper; `recordCallAway` → `positions:record-call-away` — `src/preload/index.ts:4,26`
- ✓ Adapter `recordCallAway` + `throwMappedIpcErrors` + `FilledOptionCloseLegData` — `src/renderer/src/api/positions.ts:3,368,396`
- ✓ `useRecordCallAway` and `useCloseCoveredCallEarly` delegate to `usePositionMutation` — `useRecordCallAway.ts:8`, `useCloseCoveredCallEarly.ts:8`
- ✓ `CallAwaySheet` uses `createPortal` and a `successState: RecordCallAwayResponse | null` — `CallAwaySheet.tsx:3,24,42`
- ✓ Read-only fill-date hint "Derived from your CC — the day shares are delivered to the buyer" — `CallAwayForm.tsx:151`
- ✓ Warning "This cannot be undone." / "…Full leg history is preserved." — `CallAwayForm.tsx:156`
- ✓ "WHEEL COMPLETE" hero, `pnlColor(finalPnl)`, "Start New Wheel on {ticker} →", `window.location.hash = '#/new?ticker=' + ticker` — `CallAwaySuccess.tsx:2,34,62,125,127`
- ✓ `ActionButton` renderer and `record-call-away-btn` — `PositionDetailActions.tsx:24,62`
- ✓ `usePositionDetailSheets()` owns `callAwayCtx` — `usePositionDetailSheets.ts:44,106,113`; page consumes it — `PositionDetailPage.tsx:84,207`
- ✓ Page-level test clicks `record-call-away-btn` and asserts sheet — `PositionDetailPage.test.tsx:551-553`
- ✓ e2e covers +$780 P&L, loss in red, waterfall, button hidden outside CC_OPEN, read-only fill date, success state — `e2e/call-away.spec.ts:46,69,89,106,133,147`
- ✓ `no_cc_open_leg` error exists — `record-call-away-position.ts:49`
- ✓ `WHEEL_COMPLETE` phase exists; no migration needed for `EXERCISE` (TEXT column)
- ✓ All relative links resolve (`us-4`, `us-5`, domain/contracts/schema pages)

## Drift (3)

- ✗ Summary (line 7), AC (line 11), What-was-built (line 24) and Architecture decisions (line 41) state in the present tense that the backend writes a leg with `leg_role = 'CC_CLOSE'`. Current code inserts `leg_role = 'CALLED_AWAY'` (`src/main/services/record-call-away-position.ts:78`; enum value at `src/main/core/types.ts:26`), a change introduced by US-11. Suggested fix: update the leg shape to `CALLED_AWAY`/`EXERCISE`/`CALL` and note the US-11 change.
- ✗ Line 24 lists error envelopes `__root__/not_found` and `__root__/no_cc_open_leg`; the service throws both on field `positionId` (`record-call-away-position.ts:32,47-49`). Suggested fix: `positionId/not_found`, `positionId/no_cc_open_leg`.
- ✗ Lines 30 and 51 say `PositionDetailPage` "was reduced to / dropped to 142 lines"; it is now 264 lines (`wc -l src/renderer/src/pages/PositionDetailPage.tsx`). Historical at the time, but a stale size claim; suggest dropping the line count.

## Unverifiable (2)

- ? "Reusing `BUY` was rejected because…" and "shadcn `Sheet` primitive rejected as inconsistent" — design rationale, not mechanically checkable.
- ? The page-level test is described as asserting the detail view **blurs** during call-away; the blur assertion found is for AssignmentSheet (`PositionDetailPage.test.tsx:315-329`); call-away test at `:551` was only partially read. Flag for human review.

## Missing files (0)
