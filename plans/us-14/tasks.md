# US-14 — Roll an Open Covered Call — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off

---

## Layer 1 — Foundation (no dependencies)

> These areas can be started immediately and run in parallel.

### Area 1: Lifecycle Engine (`rollCc()`)

- [x] **[Red]** Write failing tests — `src/main/core/lifecycle.test.ts`
  - Test cases:
    - `rollCc: throws invalid_phase when position is not CC_OPEN` (pass `currentPhase: 'CSP_OPEN'`, assert `ValidationError` field `__phase__`, code `invalid_phase`)
    - `rollCc: throws must_be_on_or_after_current when newExpiration is before currentExpiration` (`newExpiration: '2026-03-01'`, `currentExpiration: '2026-04-18'`)
    - `rollCc: accepts same expiration (>= not >)` (same expiration but different newStrike, assert no error, returns `{ phase: 'CC_OPEN' }`)
    - `rollCc: throws no_change when strike and expiration are both unchanged` (assert field `__roll__`, code `no_change`)
    - `rollCc: throws must_be_positive when costToClosePerContract is 0` (assert field `costToClosePerContract`)
    - `rollCc: throws must_be_positive when newPremiumPerContract is 0` (assert field `newPremiumPerContract`)
    - `rollCc: returns { phase: CC_OPEN } on valid roll up and out`
    - `rollCc: returns { phase: CC_OPEN } on roll up (same expiration, higher strike)`
    - `rollCc: returns { phase: CC_OPEN } on roll down (same expiration, lower strike)`
    - `rollCc: returns { phase: CC_OPEN } on roll out (same strike, later expiration)`
  - Run `pnpm test src/main/core/lifecycle.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/lifecycle.ts` _(depends on: Area 1 Red ✓)_
  - Add `RollCcInput` interface: `{ currentPhase, currentStrike, currentExpiration, newStrike, newExpiration, costToClosePerContract, newPremiumPerContract }`
  - Add `RollCcResult` interface: `{ phase: 'CC_OPEN' }`
  - Add `rollCc(input: RollCcInput): RollCcResult` function:
    1. `requireCcOpenPhase(input.currentPhase)` (reuse existing helper)
    2. `if (input.newExpiration < input.currentExpiration)` → throw `ValidationError('newExpiration', 'must_be_on_or_after_current', ...)`
    3. `if (input.newStrike === input.currentStrike && input.newExpiration === input.currentExpiration)` → throw `ValidationError('__roll__', 'no_change', ...)`
    4. `requirePositiveDecimal(input.costToClosePerContract, 'costToClosePerContract', 'Cost to close')`
    5. `requirePositiveDecimal(input.newPremiumPerContract, 'newPremiumPerContract', 'New premium')`
    6. Return `{ phase: 'CC_OPEN' }`
  - Run `pnpm test src/main/core/lifecycle.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/core/lifecycle.ts` _(depends on: Area 1 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Check whether `requireCcOpenPhase` helper is reused cleanly; confirm `requirePositiveDecimal` is shared with CSP/CC without duplication
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 2: Schemas (`RollCcPayloadSchema` + `RollCcResult`)

- [x] **[Red]** Write failing tests — `src/main/schemas.test.ts`
  - Test cases:
    - `RollCcPayloadSchema: parses valid payload with all fields`
    - `RollCcPayloadSchema: parses valid payload without optional newStrike and fillDate`
    - `RollCcPayloadSchema: rejects non-UUID positionId`
    - `RollCcPayloadSchema: rejects non-positive costToClosePerContract`
    - `RollCcPayloadSchema: rejects invalid date format for newExpiration`
  - Run `pnpm test src/main/schemas.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/schemas.ts` _(depends on: Area 2 Red ✓)_
  - Add `RollCcPayloadSchema` (after existing `RollCspPayloadSchema`):
    ```ts
    export const RollCcPayloadSchema = z.object({
      positionId: PositionIdSchema,
      costToClosePerContract: z.number().positive(),
      newPremiumPerContract: z.number().positive(),
      newExpiration: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a valid date (YYYY-MM-DD)'),
      newStrike: z.number().positive().optional(),
      fillDate: z.string().optional()
    })
    export type RollCcPayload = z.infer<typeof RollCcPayloadSchema>
    ```
  - Add `RollCcResult` interface: `{ position, rollFromLeg: LegRecord, rollToLeg: LegRecord, rollChainId: string, costBasisSnapshot: CostBasisSnapshotRecord }`
  - Run `pnpm test src/main/schemas.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/schemas.ts` _(depends on: Area 2 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Check for duplication and naming consistency with `RollCspPayloadSchema`/`RollCspResult`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 6: CC Roll Type Utilities

- [x] **[Red]** Write failing tests — `src/renderer/src/lib/rolls.test.ts`
  - Test cases:
    - `getCcRollType: returns "Roll Up & Out" when strike is higher and expiration is later`
    - `getCcRollType: returns "Roll Down & Out" when strike is lower and expiration is later`
    - `getCcRollType: returns "Roll Out" when strike is same and expiration is later`
    - `getCcRollType: returns "Roll Up" when strike is higher and expiration is same`
    - `getCcRollType: returns "Roll Down" when strike is lower and expiration is same`
    - `getCcRollType: returns "No Change" when both strike and expiration are same`
    - `getCcRollTypeColor: returns purple-like string for "Roll Up & Out"`
    - `getCcRollTypeColor: returns purple-like string for "Roll Up"`
    - `getCcRollTypeColor: returns red-like string for "Roll Down & Out"`
    - `getCcRollTypeColor: returns red-like string for "Roll Down"`
    - `getCcRollTypeColor: returns red-like string for "No Change"`
    - `getCcRollTypeColor: returns gold-like string for "Roll Out"`
  - Run `pnpm test src/renderer/src/lib/rolls.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/lib/rolls.ts` _(depends on: Area 6 Red ✓)_
  - Add `CcRollType` union type: `'Roll Up & Out' | 'Roll Down & Out' | 'Roll Up' | 'Roll Down' | 'Roll Out' | 'No Change'`
  - Add `getCcRollType(currentStrike, newStrike, currentExpiration, newExpiration): CcRollType`
  - Add `getCcRollTypeColor(rollType: CcRollType): string` — Up → purple, Down/No Change → red, Roll Out → gold
  - Run `pnpm test src/renderer/src/lib/rolls.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/lib/rolls.ts` _(depends on: Area 6 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Check naming consistency with `getRollTypeLabel`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 11: `PositionDetailActions` — "Roll CC →" Button

- [x] **[Red]** Write failing tests — `src/renderer/src/components/PositionDetailActions.test.tsx`
  - Test cases:
    - `PositionDetailActions: shows "Roll CC →" button when phase is CC_OPEN` (assert `data-testid="roll-cc-btn"` visible)
    - `PositionDetailActions: does not show "Roll CC →" button when phase is CSP_OPEN`
  - Run `pnpm test src/renderer/src/components/PositionDetailActions.test.tsx` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/PositionDetailActions.tsx` _(depends on: Area 11 Red ✓)_
  - Add `onRollCc: () => void` to props
  - In the `phase === 'CC_OPEN'` block, add `<ActionButton testId="roll-cc-btn" label="Roll CC →" onClick={onRollCc} />` alongside existing CC phase buttons
  - Run `pnpm test src/renderer/src/components/PositionDetailActions.test.tsx` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/PositionDetailActions.tsx` _(depends on: Area 11 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Check prop ordering consistency
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 12: `usePositionDetailSheets` — CC Roll State

- [ ] **[Red]** Write failing tests — _(no isolated unit test needed; wiring exercised by Area 13)_
  - Skip; this area has no dedicated Red task — the test coverage comes from Area 13
- [x] **[Green]** Implement — `src/renderer/src/pages/usePositionDetailSheets.ts` _(no upstream dependency)_
  - Add `const [rollCcOpen, setRollCcOpen] = useState(false)` alongside `rollCspOpen`
  - Include `rollCcOpen` in the `overlayOpen` derivation
  - Return `rollCcOpen, handleRollCc: () => setRollCcOpen(true), handleCloseRollCc: () => setRollCcOpen(false)` from the hook
  - Update `PositionDetailSheetsResult` type to include these three new fields
  - Run `pnpm test && pnpm lint && pnpm typecheck`
- [x] **[Refactor]** `/refactor` — `src/renderer/src/pages/usePositionDetailSheets.ts` _(depends on: Area 12 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Confirm `overlayOpen` derivation includes `rollCcOpen`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — Service + API Adapter + Form Components (depends on Layer 1)

> These areas can run in parallel with each other **after** their Layer 1 dependencies are complete.

### Area 3: Service (`rollCcPosition()`)

**Requires:** Area 1 Green ✓, Area 2 Green ✓

- [x] **[Red]** Write failing tests — `src/main/services/roll-cc-position.test.ts` _(depends on: Area 1 Green ✓, Area 2 Green ✓)_
  - Test cases:
    - `rollCcPosition: happy path (net credit) — creates ROLL_FROM BUY CALL and ROLL_TO SELL CALL with lower basisPerShare`
    - `rollCcPosition: happy path (net debit) — snapshot has higher basisPerShare`
    - `rollCcPosition: roll preserves contracts count`
    - `rollCcPosition: throws not_found when positionId does not exist`
    - `rollCcPosition: throws invalid_phase when position is not CC_OPEN`
    - `rollCcPosition: throws no_change when both strike and expiration unchanged`
    - `rollCcPosition: newStrike defaults to current CC strike when omitted` (assert `rollToLeg.strike === activeLeg.strike`)
    - `rollCcPosition: uses today as fillDate when not provided`
    - `rollCcPosition: both legs have the same roll_chain_id in the DB`
    - `rollCcPosition: cost basis snapshot is correct — $176.50 → $175.80 with net credit $0.70`
  - Use `makeTestDb()`, create CSP → assign → open CC to reach CC_OPEN state
  - Run `pnpm test src/main/services/roll-cc-position.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/roll-cc-position.ts` _(depends on: Area 3 Red ✓)_
  - New file modelled on `roll-csp-position.ts`:
    - Import `calculateRollBasis` from `../core/costbasis`
    - Import `ValidationError, rollCc` from `../core/lifecycle`
    - Import `RollCcPayload, RollCcResult` from `../schemas`
    - `getPosition` to load position + active leg + snapshot
    - Resolve `newStrikeFormatted = new Decimal(payload.newStrike ?? activeLeg.strike).toFixed(4)`
    - Call `rollCc({ currentPhase, currentStrike, currentExpiration, newStrike, newExpiration, costToClosePerContract, newPremiumPerContract })`
    - Call `calculateRollBasis(...)`
    - Atomic transaction: insert ROLL_FROM (BUY CALL), insert ROLL_TO (SELL CALL), insert snapshot; position row unchanged
    - Return `RollCcResult`
    - `logger.info({ positionId, rollChainId, basisPerShare }, 'cc_rolled')`
  - Run `pnpm test src/main/services/roll-cc-position.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/roll-cc-position.ts` _(depends on: Area 3 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 5: Preload Bridge + API Adapter

**Requires:** Area 2 Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/api/positions.test.ts` _(depends on: Area 2 Green ✓)_
  - Test cases:
    - `rollCc: calls window.api.rollCc with mapped payload and returns RollCcResponse` (mock `window.api.rollCc`, assert correct camelCase→snake_case field mapping)
  - Run `pnpm test src/renderer/src/api/positions.test.ts` — new test must fail
- [x] **[Green]** Implement _(depends on: Area 5 Red ✓)_
  - `src/preload/index.ts`: add `rollCc: (payload: unknown) => invoke('positions:roll-cc', payload)` to the `api` object
  - `src/renderer/src/api/positions.ts`: add `RollCcPayload` type, `RollCcResponse` type, and `rollCc()` function that maps snake_case payload to camelCase IPC call, calls `throwMappedIpcErrors` on failure
  - Verify `window.api` TypeScript declaration includes `rollCc`
  - Run `pnpm test src/renderer/src/api/positions.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/api/positions.ts` + `src/preload/index.ts` _(depends on: Area 5 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 8: `RollCcForm` Component

**Requires:** Area 6 Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/components/RollCcForm.test.tsx` _(depends on: Area 6 Green ✓)_
  - Test cases:
    - `RollCcForm: renders Current Leg section with strike, expiration, DTE, premium, and cost basis`
    - `RollCcForm: renders New Leg inputs: New Strike, New Expiration, Cost to Close, New Premium, Fill Date`
    - `RollCcForm: shows roll type badge and description when strike or expiration differs` (set `newStrike='190.00'`, `newExpiration='2026-05-16'`, assert "Roll Up & Out" badge and description)
    - `RollCcForm: shows amber below-cost-basis warning when newStrike < basisPerShare` (`newStrike='175.00'`, `basisPerShare='176.50'`, assert alert text contains "below your cost basis" and "$1.50/share")
    - `RollCcForm: does not show below-cost-basis warning when newStrike > basisPerShare`
    - `RollCcForm: shows "cannot be undone" amber warning when no validation error`
    - `RollCcForm: Confirm Roll button is disabled when hasNoChange is true`
  - Run `pnpm test src/renderer/src/components/RollCcForm.test.tsx` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/RollCcForm.tsx` _(depends on: Area 8 Red ✓)_
  - New file modelled on `RollCspForm.tsx` with CC-specific sections:
    - SheetHeader: eyebrow = roll type label, title = "Roll Covered Call", subtitle = `{ticker} CALL ${strike} · exp {expiration}`
    - Current Leg SectionCard: Type, Strike, Expiration (with DTE), Premium collected, Cost basis (highlighted)
    - New Leg SectionCard: New Strike (NumberInput), New Expiration (DatePicker), Cost to Close + New Premium (2-col), Fill Date (DatePicker)
    - Roll type badge + description (only when rollType !== 'No Change')
    - Below-cost-basis amber AlertBox (non-blocking, when `parseFloat(newStrike) < parseFloat(basisPerShare)`)
    - "No change" red AlertBox (when rollType === 'No Change')
    - NetCreditDebitPreview (when costToClose and newPremium are valid positive numbers)
    - "Cannot be undone" amber AlertBox (when rollType !== 'No Change')
    - Confirm Roll button disabled when rollType === 'No Change'
  - Props: `ticker, strike, expiration, contracts, premiumPerContract, basisPerShare, register, errors, control, costToClose, newPremium, newStrike, newExpiration, isPending, onSubmit, onClose`
  - Run `pnpm test src/renderer/src/components/RollCcForm.test.tsx` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/RollCcForm.tsx` _(depends on: Area 8 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider extracting `NetCreditDebitPreview` to `src/renderer/src/components/ui/NetCreditDebitPreview.tsx` if identical to the one in `RollCspForm`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 9: `RollCcSuccess` Component

**Requires:** Area 6 Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/components/RollCcSuccess.test.tsx` _(depends on: Area 6 Green ✓)_
  - Test cases:
    - `RollCcSuccess: renders "Roll Complete" eyebrow and "CC Rolled Successfully" title`
    - `RollCcSuccess: renders hero box with net credit amount and total`
    - `RollCcSuccess: renders summary rows: roll type badge, old leg, new leg, new expiration + DTE, phase badge, cost basis transition`
    - `RollCcSuccess: shows cost basis transition from prevBasisPerShare to new basisPerShare` (assert "$176.50 → $175.80/share")
  - Run `pnpm test src/renderer/src/components/RollCcSuccess.test.tsx` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/RollCcSuccess.tsx` _(depends on: Area 9 Red ✓)_
  - New file modelled on `RollCspSuccess.tsx` adapted for CC:
    - SheetHeader: eyebrow "Roll Complete" (green), title "CC Rolled Successfully", subtitle `CALL ${rollFromLeg.strike} → CALL ${rollToLeg.strike} · {rollToLeg.expiration}`, borderBottomColor green
    - Hero box: "Roll Net Credit"/"Roll Net Debit", large signed net amount, sub-line total + contracts
    - Summary SectionCard: roll type badge, old leg (ROLL_FROM · BUY CALL), new leg (ROLL_TO · SELL CALL), new expiration + DTE, phase badge + "(unchanged)", cost basis transition (highlighted)
  - Props: `response: RollCcResponse, ticker: string, prevBasisPerShare: string, onClose: () => void`
  - Run `pnpm test src/renderer/src/components/RollCcSuccess.test.tsx` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/RollCcSuccess.tsx` _(depends on: Area 9 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Check naming consistency with `RollCspSuccess`; check for shared logic
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — IPC + Hook (depends on Layer 2)

> These areas can run in parallel **after** their Layer 2 dependencies are complete.

### Area 4: IPC Handler (`positions:roll-cc`)

**Requires:** Area 2 Green ✓, Area 3 Green ✓

- [x] **[Red]** Write failing tests — `src/main/ipc/positions.test.ts` _(depends on: Area 2 Green ✓, Area 3 Green ✓)_
  - Test cases:
    - `positions:roll-cc: registers the channel` (assert `ipcMain.handle` called with `'positions:roll-cc'`)
    - `positions:roll-cc: returns { ok: true, ...RollCcResult } on success` (mock `rollCcPosition`, assert spread response)
    - `positions:roll-cc: returns { ok: false, errors } when rollCcPosition throws ValidationError`
    - `positions:roll-cc: returns { ok: false, errors } when payload fails schema validation` (e.g. missing `positionId`)
  - Run `pnpm test src/main/ipc/positions.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/ipc/positions.ts` _(depends on: Area 4 Red ✓)_
  - Add `RollCcPayloadSchema` to imports from `'../schemas'`
  - Add `import { rollCcPosition } from '../services/roll-cc-position'`
  - In `registerPositionsHandlers`, add:
    ```ts
    registerParsedPositionHandler(
      db,
      'positions:roll-cc',
      'positions_roll_cc_unhandled_error',
      RollCcPayloadSchema,
      rollCcPosition
    )
    ```
  - Run `pnpm test src/main/ipc/positions.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/ipc/positions.ts` _(depends on: Area 4 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 7: `useRollCc` Hook

**Requires:** Area 5 Green ✓

- [ ] **[Red]** Write failing tests — _(no dedicated test file; the hook is a one-liner wrapper)_
  - Skip; the hook is exercised by integration through `RollCcSheet` tests in Area 10
- [x] **[Green]** Implement — `src/renderer/src/hooks/useRollCc.ts` _(depends on: Area 5 Green ✓)_
  - New file:

    ```ts
    import type { RollCcPayload, RollCcResponse } from '../api/positions'
    import { rollCc } from '../api/positions'
    import { usePositionMutation } from './usePositionMutation'

    export function useRollCc(options?: {
      onSuccess?: (data: RollCcResponse) => void
    }): ReturnType<typeof usePositionMutation<RollCcResponse, RollCcPayload>> {
      return usePositionMutation<RollCcResponse, RollCcPayload>(rollCc, options)
    }
    ```

  - Run `pnpm lint && pnpm typecheck`

- [x] **[Refactor]** `/refactor` — `src/renderer/src/hooks/useRollCc.ts` _(depends on: Area 7 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Check naming consistency with `useRollCsp`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — Sheet Component (depends on Layer 3)

### Area 10: `RollCcSheet` Component

**Requires:** Area 7 Green ✓, Area 8 Green ✓, Area 9 Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/components/RollCcSheet.test.tsx` _(depends on: Area 7 Green ✓, Area 8 Green ✓, Area 9 Green ✓)_
  - Test cases:
    - `RollCcSheet: renders nothing when open=false`
    - `RollCcSheet: renders RollCcForm when open=true`
    - `RollCcSheet: schema validation — rejects empty new expiration`
    - `RollCcSheet: schema validation — rejects new expiration before current expiration` (assert error "on or after")
    - `RollCcSheet: schema validation — rejects zero cost to close` (assert "must be greater than zero")
    - `RollCcSheet: schema validation — rejects zero new premium`
    - `RollCcSheet: transitions to RollCcSuccess when mutation resolves`
  - Run `pnpm test src/renderer/src/components/RollCcSheet.test.tsx` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/RollCcSheet.tsx` _(depends on: Area 10 Red ✓)_
  - New file modelled on `RollCspSheet.tsx`:
    - `makeRollCcSchema(currentStrike, currentExpiration)` factory: `cost_to_close` positive, `new_premium` positive, `new_expiration` min(1) + `.refine(v => v >= currentExpiration, ...)`, `new_strike` positive, `fill_date` optional
    - `defaultValues`: `new_strike = parseFloat(props.strike).toFixed(2)`, others empty
    - `useWatch` for `cost_to_close`, `new_premium`, `new_strike`, `new_expiration`
    - `onSubmit` maps form values → `RollCcPayload` and calls `mutate`
    - Renders `RollCcForm` or `RollCcSuccess` inside `SheetPanel` portalled via `getSheetPortal()`
    - Props: `open, positionId, ticker, strike, expiration, contracts, premiumPerContract, basisPerShare, totalPremiumCollected, onClose`
  - Run `pnpm test src/renderer/src/components/RollCcSheet.test.tsx` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/RollCcSheet.tsx` _(depends on: Area 10 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 5 — Page Wiring (depends on Layer 4)

### Area 13: `PositionDetailPage` — Wire `RollCcSheet`

**Requires:** Area 10 Green ✓, Area 11 Green ✓, Area 12 Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/pages/PositionDetailPage.test.tsx` _(depends on: Area 10 Green ✓, Area 11 Green ✓, Area 12 Green ✓)_
  - Test cases:
    - `PositionDetailPage: shows "Roll CC →" button when position is in CC_OPEN phase`
    - `PositionDetailPage: opens RollCcSheet when "Roll CC →" is clicked`
    - `PositionDetailPage: closes RollCcSheet when cancelled`
    - `PositionDetailPage: blurs content when RollCcSheet is open (overlayOpen=true)`
  - Run `pnpm test src/renderer/src/pages/PositionDetailPage.test.tsx` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/pages/PositionDetailPage.tsx` _(depends on: Area 13 Red ✓)_
  - Import `RollCcSheet`
  - Destructure `rollCcOpen, handleRollCc, handleCloseRollCc` from `usePositionDetailSheets(data)`
  - Pass `onRollCc={handleRollCc}` to `<PositionDetailActions>`
  - Add `RollCcSheet` mount alongside other sheets:
    ```tsx
    {
      rollCcOpen && activeLeg && costBasisSnapshot && (
        <RollCcSheet
          open
          positionId={position.id}
          ticker={position.ticker}
          strike={activeLeg.strike}
          expiration={activeLeg.expiration}
          contracts={activeLeg.contracts}
          premiumPerContract={activeLeg.premiumPerContract}
          basisPerShare={costBasisSnapshot.basisPerShare}
          totalPremiumCollected={costBasisSnapshot.totalPremiumCollected}
          onClose={handleCloseRollCc}
        />
      )
    }
    ```
  - Run `pnpm test src/renderer/src/pages/PositionDetailPage.test.tsx` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/pages/PositionDetailPage.tsx` _(depends on: Area 13 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Check sheet render order consistency with existing pattern
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 6 — E2E Tests

**Requires:** All Green tasks from previous layers ✓

### Area 14: E2E Tests

- [x] **[Red]** Write failing e2e tests — `e2e/cc-roll.spec.ts` _(depends on: all Green tasks ✓)_
  - One `it()` per AC bullet — test names mirror AC language:
    - AC-1: `"shows current CC details and cost basis context when roll form is opened"`
    - AC-2: `"shows net credit preview for roll up and out"`
    - AC-3: `"shows amber warning when new CC strike is below cost basis"`
    - AC-4: `"creates linked ROLL_FROM and ROLL_TO leg pair on successful CC roll"`
    - AC-5: `"accepts CC roll out with same strike and later expiration"`
    - AC-6: `"accepts CC roll down and out with lower strike"`
    - AC-7: `"accepts CC roll up with same expiration and higher strike"`
    - AC-8: `"shows net debit preview and confirms roll when cost to close exceeds new premium"`
    - AC-9: `"shows validation error when new expiration is before current expiration"`
    - AC-10: `"shows validation error when neither strike nor expiration changed"`
    - AC-11: `"shows validation error when cost to close is zero"`
  - Helpers: `reachCcOpenDetail(page)`, `openRollCcSheet(page)`
  - Run `pnpm test:e2e` — all new tests must fail
- [x] **[Green]** Make e2e tests pass _(depends on: Area 14 Red ✓)_
  - Run `pnpm test:e2e` — all tests must pass
- [x] **[Refactor]** `/refactor` e2e tests _(depends on: Area 14 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review

---

## Completion Checklist

- [ ] All Red tasks complete (tests written and failing for right reason)
- [ ] All Green tasks complete (all tests passing)
- [ ] All Refactor tasks complete (lint + typecheck clean)
- [ ] E2E tests cover every AC (11 scenarios)
- [ ] `pnpm test && pnpm lint && pnpm typecheck` — all clean
