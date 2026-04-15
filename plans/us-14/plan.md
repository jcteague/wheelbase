# Implementation Plan: US-14 — Roll an Open Covered Call

## Summary

This story adds the CC roll operation — the mirror image of the CSP roll (US-12). When a trader is in `CC_OPEN` phase, they can close the current call (ROLL_FROM BUY CALL) and open a new one at a different strike or expiration (ROLL_TO SELL CALL) as a linked pair, with the net credit or debit updating the cost basis. The done state is a working "Roll CC →" button on the detail page that opens a right-side sheet, validates inputs, previews the net credit/debit, warns when the new strike is below cost basis, and creates the linked leg pair on confirm.

## Supporting Documents

- **User Story & Acceptance Criteria:** `docs/epics/03-stories/US-14-roll-open-covered-call.md`
- **Research & Design Decisions:** `plans/us-14/research.md`
- **Data Model:** `plans/us-14/data-model.md`
- **API Contract:** `plans/us-14/contracts/roll-cc.md`
- **Quickstart & Verification:** `plans/us-14/quickstart.md`
- **Mockup:** `mockups/us-14-roll-covered-call-form.mdx`

## Prerequisites

- US-7 (Open Covered Call): `CC_OPEN` phase exists; `open-covered-call-position` service exists
- US-12 (CSP Roll): `rollCsp` lifecycle function, `rollCspPosition` service, `RollCspPayloadSchema`, `positions:roll-csp` IPC, `RollCspSheet`/`RollCspForm`/`RollCspSuccess` components, `useRollCsp` hook, `getRollTypeLabel`/`computeNetCreditDebit`/`rollCreditDebitColors` in `rolls.ts`
- `calculateRollBasis()` in `costbasis.ts` — already generic, used as-is

---

## Implementation Areas

### 1. Lifecycle Engine: `rollCc()`

**Files to create or modify:**

- `src/main/core/lifecycle.ts` — add `RollCcInput`, `RollCcResult` interfaces and `rollCc()` function

**Red — tests to write** (in `src/main/core/lifecycle.test.ts`, alongside existing `rollCsp` tests):

- `rollCc: throws invalid_phase when position is not CC_OPEN` — pass `currentPhase: 'CSP_OPEN'`, assert `ValidationError` with `field: '__phase__'`, `code: 'invalid_phase'`
- `rollCc: throws must_be_on_or_after_current when newExpiration is before currentExpiration` — pass `newExpiration: '2026-03-01'` with `currentExpiration: '2026-04-18'`, assert `ValidationError` with `field: 'newExpiration'`, `code: 'must_be_on_or_after_current'`
- `rollCc: accepts same expiration (>= not >)` — pass `newExpiration === currentExpiration` with different `newStrike`, assert no error, returns `{ phase: 'CC_OPEN' }`
- `rollCc: throws no_change when strike and expiration are both unchanged` — pass `newStrike === currentStrike` and `newExpiration === currentExpiration`, assert `ValidationError` with `field: '__roll__'`, `code: 'no_change'`
- `rollCc: throws must_be_positive when costToClosePerContract is 0` — assert `ValidationError` `field: 'costToClosePerContract'`
- `rollCc: throws must_be_positive when newPremiumPerContract is 0` — assert `ValidationError` `field: 'newPremiumPerContract'`
- `rollCc: returns { phase: CC_OPEN } on valid roll up and out` — valid inputs, assert return value
- `rollCc: returns { phase: CC_OPEN } on roll up (same expiration, higher strike)`
- `rollCc: returns { phase: CC_OPEN } on roll down (same expiration, lower strike)`
- `rollCc: returns { phase: CC_OPEN } on roll out (same strike, later expiration)`

**Green — implementation:**

- Add `RollCcInput` interface: `{ currentPhase, currentStrike, currentExpiration, newStrike, newExpiration, costToClosePerContract, newPremiumPerContract }` in `src/main/core/lifecycle.ts`
- Add `RollCcResult` interface: `{ phase: 'CC_OPEN' }`
- Add `rollCc(input: RollCcInput): RollCcResult` function:
  1. `requireCcOpenPhase(input.currentPhase)` (reuse existing private helper)
  2. `if (input.newExpiration < input.currentExpiration)` → throw `ValidationError('newExpiration', 'must_be_on_or_after_current', 'New expiration must be on or after the current expiration (...)')`
  3. `if (input.newStrike === input.currentStrike && input.newExpiration === input.currentExpiration)` → throw `ValidationError('__roll__', 'no_change', 'Roll must change the expiration, strike, or both')`
  4. `requirePositiveDecimal(input.costToClosePerContract, 'costToClosePerContract', 'Cost to close')`
  5. `requirePositiveDecimal(input.newPremiumPerContract, 'newPremiumPerContract', 'New premium')`
  6. Return `{ phase: 'CC_OPEN' }`

**Refactor — cleanup to consider:**

- Check whether the `requireCcOpenPhase` helper can be reused without duplication; it already exists in the file.
- Confirm `requirePositiveDecimal` is shared cleanly with CSP/CC.

**Acceptance criteria covered:**

- Scenario: Validation — new expiration must not be before current expiration
- Scenario: Validation — new expiration or strike must differ
- Scenario: Validation — cost to close and new premium must be positive
- Scenario: CC roll out / CC roll up / CC roll down and out (valid paths)

---

### 2. Schemas: `RollCcPayloadSchema` + `RollCcResult`

**Files to create or modify:**

- `src/main/schemas.ts` — add `RollCcPayloadSchema`, `RollCcPayload` type, `RollCcResult` interface

**Red — tests to write** (in `src/main/schemas.test.ts` or inline in the IPC test — see Area 4):

- `RollCcPayloadSchema: parses valid payload with all fields`
- `RollCcPayloadSchema: parses valid payload without optional newStrike and fillDate`
- `RollCcPayloadSchema: rejects non-UUID positionId`
- `RollCcPayloadSchema: rejects non-positive costToClosePerContract`
- `RollCcPayloadSchema: rejects invalid date format for newExpiration`

**Green — implementation:**

- Add `RollCcPayloadSchema` in `src/main/schemas.ts` (after existing `RollCspPayloadSchema`):
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
- Add `RollCcResult` interface:
  ```ts
  export interface RollCcResult {
    position: { id: string; ticker: string; phase: 'CC_OPEN'; status: 'ACTIVE' }
    rollFromLeg: LegRecord
    rollToLeg: LegRecord
    rollChainId: string
    costBasisSnapshot: CostBasisSnapshotRecord
  }
  ```

**Refactor — cleanup to consider:**

- Check for duplication and naming consistency with `RollCspPayloadSchema`/`RollCspResult`.

**Acceptance criteria covered:**

- All validation scenarios — the schema is the first gate before the service runs.

---

### 3. Service: `rollCcPosition()`

**Files to create or modify:**

- `src/main/services/roll-cc-position.ts` — new file
- `src/main/services/roll-cc-position.test.ts` — new file

**Red — tests to write** (in `src/main/services/roll-cc-position.test.ts`):

- `rollCcPosition: happy path (net credit) — creates ROLL_FROM BUY CALL and ROLL_TO SELL CALL with lower basisPerShare`
  - Use `makeTestDb()`, create CSP → assign → open CC to reach CC_OPEN
  - Assert `result.rollFromLeg.action === 'BUY'`, `instrumentType === 'CALL'`, `legRole === 'ROLL_FROM'`
  - Assert `result.rollToLeg.action === 'SELL'`, `instrumentType === 'CALL'`, `legRole === 'ROLL_TO'`
  - Assert both legs share `rollChainId`
  - Assert `costBasisSnapshot.basisPerShare < originalSnapshot.basisPerShare` (net credit reduces basis)
  - Assert `result.position.phase === 'CC_OPEN'`
- `rollCcPosition: happy path (net debit) — snapshot has higher basisPerShare`
  - `costToClosePerContract > newPremiumPerContract`, assert basis increased
- `rollCcPosition: roll preserves contracts count`
- `rollCcPosition: throws not_found when positionId does not exist`
- `rollCcPosition: throws invalid_phase when position is not CC_OPEN`
- `rollCcPosition: throws no_change when both strike and expiration unchanged`
- `rollCcPosition: newStrike defaults to current CC strike when omitted`
  - Omit `newStrike` from payload, pass different `newExpiration`
  - Assert `rollToLeg.strike === activeLeg.strike`
- `rollCcPosition: uses today as fillDate when not provided`
- `rollCcPosition: both legs have the same roll_chain_id in the DB` (query `SELECT roll_chain_id FROM legs WHERE position_id = ?`)
- `rollCcPosition: cost basis snapshot is correct — $176.50 → $175.80 with net credit $0.70` (exact arithmetic from AC Scenario 4)

**Green — implementation:**

- Create `src/main/services/roll-cc-position.ts` modelled exactly on `roll-csp-position.ts`:
  - Import `calculateRollBasis` from `../core/costbasis`
  - Import `ValidationError, rollCc` from `../core/lifecycle`
  - Import `RollCcPayload, RollCcResult` from `../schemas`
  - `getPosition` to load position + active leg + snapshot
  - Resolve `newStrikeFormatted = new Decimal(payload.newStrike ?? activeLeg.strike).toFixed(4)`
  - Call `rollCc({ currentPhase, currentStrike: activeLeg.strike, currentExpiration: activeLeg.expiration, newStrike: newStrikeFormatted, newExpiration: payload.newExpiration, costToClosePerContract: ..., newPremiumPerContract: ... })`
  - Call `calculateRollBasis(...)`
  - Atomic transaction: insert ROLL_FROM (BUY CALL), insert ROLL_TO (SELL CALL), insert snapshot; position row unchanged
  - Return `RollCcResult`
  - `logger.info({ positionId, rollChainId, basisPerShare }, 'cc_rolled')`

**Refactor — cleanup to consider:**

- Check for extraction opportunity if `rollCspPosition` and `rollCcPosition` share enough structure (but per CLAUDE.md style, avoid premature abstraction — three similar lines of code is better than a premature abstraction).

**Acceptance criteria covered:**

- Scenario: Successful CC roll creates linked leg pair
- Scenario: CC roll out / CC roll down and out / CC roll up (service validates via lifecycle)
- Scenario: Validation errors (delegated to lifecycle via `rollCc()`)

---

### 4. IPC Handler: `positions:roll-cc`

**Files to create or modify:**

- `src/main/ipc/positions.ts` — add import for `RollCcPayloadSchema` and `rollCcPosition`; register handler
- `src/main/ipc/positions.test.ts` — add tests for `positions:roll-cc` channel

**Red — tests to write** (in `src/main/ipc/positions.test.ts`):

- `positions:roll-cc: registers the channel` — assert `ipcMain.handle` called with `'positions:roll-cc'`
- `positions:roll-cc: returns { ok: true, ...RollCcResult } on success` — mock `rollCcPosition` to return a valid result, assert spread response
- `positions:roll-cc: returns { ok: false, errors } when rollCcPosition throws ValidationError`
- `positions:roll-cc: returns { ok: false, errors } when payload fails schema validation` (e.g. missing `positionId`)

**Green — implementation:**

- In `src/main/ipc/positions.ts`:
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

**Refactor — cleanup to consider:**

- Check for duplication and naming consistency.

**Acceptance criteria covered:**

- All scenarios (the IPC layer is the entry point for the renderer).

---

### 5. Preload Bridge + API Adapter

**Files to create or modify:**

- `src/preload/index.ts` — add `rollCc` to the `api` object
- `src/renderer/src/api/positions.ts` — add `RollCcPayload`, `RollCcResponse` types and `rollCc()` function

**Red — tests to write:**

- No dedicated unit tests for the preload (it's a thin bridge). The IPC test covers the service side; the sheet tests cover the renderer side.
- In `src/renderer/src/api/positions.test.ts` (if it exists) or inline in the sheet test: `rollCc: calls window.api.rollCc with mapped payload and returns RollCcResponse` — mock `window.api.rollCc`, assert correct field mapping.

**Green — implementation:**

- `src/preload/index.ts`: add `rollCc: (payload: unknown) => invoke('positions:roll-cc', payload)` to the `api` object
- `src/renderer/src/api/positions.ts`: add

  ```ts
  export type RollCcPayload = {
    position_id: string
    cost_to_close_per_contract: number
    new_premium_per_contract: number
    new_expiration: string
    new_strike?: number
    fill_date?: string
  }

  export type RollCcResponse = {
    position: { id: string; ticker: string; phase: 'CC_OPEN'; status: 'ACTIVE' }
    rollFromLeg: LegData & {
      legRole: 'ROLL_FROM'
      action: 'BUY'
      fillDate: string
      premiumPerContract: string
    }
    rollToLeg: LegData & {
      legRole: 'ROLL_TO'
      action: 'SELL'
      fillDate: string
      premiumPerContract: string
    }
    rollChainId: string
    costBasisSnapshot: {
      id: string
      positionId: string
      basisPerShare: string
      totalPremiumCollected: string
      finalPnl: null
      snapshotAt: string
      createdAt: string
    }
  }

  export async function rollCc(payload: RollCcPayload): Promise<RollCcResponse> {
    const result = await window.api.rollCc({
      positionId: payload.position_id,
      costToClosePerContract: payload.cost_to_close_per_contract,
      newPremiumPerContract: payload.new_premium_per_contract,
      newExpiration: payload.new_expiration,
      newStrike: payload.new_strike,
      fillDate: payload.fill_date
    })
    if (!result.ok) throwMappedIpcErrors(result.errors)
    return result as unknown as RollCcResponse
  }
  ```

**Refactor — cleanup to consider:**

- Check that the `window.api` TypeScript declaration (in `src/preload/index.d.ts` or similar) includes `rollCc`.

**Acceptance criteria covered:**

- All IPC-connected ACs flow through this layer.

---

### 6. CC Roll Type Utilities

**Files to create or modify:**

- `src/renderer/src/lib/rolls.ts` — add `getCcRollType()` and `getCcRollTypeColor()`
- `src/renderer/src/lib/rolls.test.ts` — add tests

**Red — tests to write** (in `src/renderer/src/lib/rolls.test.ts`):

- `getCcRollType: returns "Roll Up & Out" when strike is higher and expiration is later` — `('185', '190', '2026-04-18', '2026-05-16')`
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

**Green — implementation:**

- In `src/renderer/src/lib/rolls.ts`, add:

  ```ts
  export type CcRollType =
    | 'Roll Up & Out'
    | 'Roll Down & Out'
    | 'Roll Up'
    | 'Roll Down'
    | 'Roll Out'
    | 'No Change'

  export function getCcRollType(
    currentStrike: string,
    newStrike: string,
    currentExpiration: string,
    newExpiration: string
  ): CcRollType {
    const sameStrike = parseFloat(newStrike) === parseFloat(currentStrike)
    const sameExpiration = newExpiration === currentExpiration
    const strikeDiff = parseFloat(newStrike) - parseFloat(currentStrike)
    if (sameStrike && sameExpiration) return 'No Change'
    if (sameStrike) return 'Roll Out'
    if (sameExpiration) return strikeDiff > 0 ? 'Roll Up' : 'Roll Down'
    return strikeDiff > 0 ? 'Roll Up & Out' : 'Roll Down & Out'
  }

  export function getCcRollTypeColor(rollType: CcRollType): string {
    if (rollType.includes('Up')) return 'var(--wb-purple)'
    if (rollType.includes('Down') || rollType === 'No Change') return 'var(--wb-red)'
    return 'var(--wb-gold)'
  }
  ```

**Refactor — cleanup to consider:**

- Naming consistency with `getRollTypeLabel`.

**Acceptance criteria covered:**

- Scenario: Net credit preview (label shows "Roll Up & Out: $185 → $190 strike, Apr → May expiration")
- Scenario: CC roll out (label shows "Roll Out: same $185 strike, Apr → May expiration")
- Scenario: CC roll down and out
- Scenario: CC roll up

---

### 7. `useRollCc` Hook

**Files to create or modify:**

- `src/renderer/src/hooks/useRollCc.ts` — new file

**Red — tests to write:**

- No dedicated test file needed; the hook is a one-liner wrapper over `usePositionMutation`. The sheet test exercises it via integration.

**Green — implementation:**

- Create `src/renderer/src/hooks/useRollCc.ts`:

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

**Refactor — cleanup to consider:**

- Naming consistency with `useRollCsp`.

**Acceptance criteria covered:**

- Hooks into the mutation lifecycle for success/error state in the sheet.

---

### 8. `RollCcForm` Component

**Files to create or modify:**

- `src/renderer/src/components/RollCcForm.tsx` — new file
- `src/renderer/src/components/RollCcForm.test.tsx` — new file

**Red — tests to write** (in `src/renderer/src/components/RollCcForm.test.tsx`):

- `RollCcForm: renders Current Leg section with strike, expiration, DTE, premium, and cost basis` — render with mockup's `MOCK_POSITION` props, assert text content
- `RollCcForm: renders New Leg inputs: New Strike, New Expiration, Cost to Close, New Premium, Fill Date`
- `RollCcForm: shows roll type badge and description when strike or expiration differs` — set `newStrike='190.00'`, `newExpiration='2026-05-16'`, assert "Roll Up & Out" badge and description "$185 → $190 strike, Apr → May expiration"
- `RollCcForm: shows amber below-cost-basis warning when newStrike < basisPerShare` — set `newStrike='175.00'` with `basisPerShare='176.50'`, assert alert text contains "below your cost basis" and "$1.50/share"
- `RollCcForm: does not show below-cost-basis warning when newStrike > basisPerShare`
- `RollCcForm: shows "cannot be undone" amber warning when no validation error`
- `RollCcForm: Confirm Roll button is disabled when hasNoChange is true` — set `newStrike` equal to current and `newExpiration` equal to current, assert button disabled

**Green — implementation:**

- Create `src/renderer/src/components/RollCcForm.tsx` modelled on `RollCspForm.tsx` with CC-specific additions. This file renders the **form state** (not success) of the mockup at `mockups/us-14-roll-covered-call-form.mdx`:

  **Sheet header** (via `SheetHeader`):
  - `eyebrow`: roll type label (e.g. "Roll Up & Out")
  - `title`: "Roll Covered Call"
  - `subtitle`: `{ticker} CALL ${strike} · exp {expiration}`

  **SheetBody content:**
  1. **Current Leg** `SectionCard` (header="Current Leg"):
     - `SummaryRow` Type: `<PhaseBadge phase="CC_OPEN" />` + " CALL"
     - `SummaryRow` Strike: `fmtMoney(strike)`
     - `SummaryRow` Expiration: `{expiration} ({dte} DTE)`
     - `SummaryRow` Premium collected: `+{fmtMoney(premiumPerContract)}/contract`
     - `SummaryRow` **Cost basis**: `{fmtMoney(basisPerShare)}/share` with `highlight` prop — as shown in mockup annotation for cost basis context

  2. **New Leg** `SectionCard` (header="New Leg"):
     - `Field` "New Strike" → `NumberInput` prefix="$" `aria-label="New Strike"`
     - `Field` "New Expiration" → `Controller` + `DatePicker` `aria-label="New Expiration"`
     - 2-column grid: `Field` "Cost to Close" (hint "Buy-to-close") + `Field` "New Premium" (hint "Sell-to-open")
     - `Field` "Fill Date" → `Controller` + `DatePicker` `aria-label="Fill Date"`

  3. **Roll type badge + description** (below New Leg card, only when rollType !== 'No Change'):
     - `<Badge>` colored by `getCcRollTypeColor(rollType)` with rollType text
     - Description string: e.g. "$185 → $190 strike, Apr → May expiration" (built from strike/expiration comparison)

  4. **Below-cost-basis warning** (amber `AlertBox variant="warning"`, only when `parseFloat(newStrike) < parseFloat(basisPerShare)`):
     - Title: "Strike below cost basis"
     - Body: `New strike ($X) is below your cost basis ($Y). If called away at this strike, you lock in a loss of $Z/share.`
     - Non-blocking — does not disable the confirm button

  5. **"No change" validation error** (red `AlertBox variant="error"`, only when rollType === 'No Change'):
     - Title: "No change detected"
     - Body: "Roll must change the expiration, strike, or both. Update at least one field to continue."

  6. **`NetCreditDebitPreview`** (reuse component from `RollCspForm` or extract to shared — only shown when costToClose and newPremium are valid positive numbers):
     - Green for credit, red for debit; large per-contract amount + total

  7. **"Cannot be undone" warning** (amber `AlertBox variant="warning"`, only when rollType !== 'No Change'):
     - "This cannot be undone. A ROLL_FROM leg (buy-to-close) and ROLL_TO leg (sell-to-open) will be recorded as a linked pair. The position remains in CC_OPEN phase."

  **Props:** `ticker, strike, expiration, contracts, premiumPerContract, basisPerShare, register, errors, control, costToClose, newPremium, newStrike, newExpiration, isPending, onSubmit, onClose`

  **Confirm Roll button:** disabled when `getCcRollType(...)` returns `'No Change'`

**Refactor — cleanup to consider:**

- `NetCreditDebitPreview` is duplicated between `RollCspForm` and `RollCcForm`. If it's identical, extract it to `src/renderer/src/components/ui/NetCreditDebitPreview.tsx` during refactor.

**Acceptance criteria covered:**

- Scenario: Roll form shows current CC details and cost basis context
- Scenario: Net credit preview for CC roll up and out
- Scenario: Warning when new CC strike is below cost basis
- Scenario: Net debit roll
- Scenario: Validation — new expiration or strike must differ (disabled button + error box)

---

### 9. `RollCcSuccess` Component

**Files to create or modify:**

- `src/renderer/src/components/RollCcSuccess.tsx` — new file
- `src/renderer/src/components/RollCcSuccess.test.tsx` — new file

**Red — tests to write** (in `src/renderer/src/components/RollCcSuccess.test.tsx`):

- `RollCcSuccess: renders "Roll Complete" eyebrow and "CC Rolled Successfully" title`
- `RollCcSuccess: renders hero box with net credit amount and total`
- `RollCcSuccess: renders summary rows: roll type badge, old leg, new leg, new expiration + DTE, phase badge, cost basis transition`
- `RollCcSuccess: shows cost basis transition from prevBasisPerShare to new basisPerShare` — assert "$176.50 → $175.80/share" text

**Green — implementation:**

- Create `src/renderer/src/components/RollCcSuccess.tsx` modelled on `RollCspSuccess.tsx` adapted for CC. This implements the **success state** from the mockup:

  **Sheet header** (via `SheetHeader`):
  - `eyebrow`: "Roll Complete" (green color)
  - `title`: "CC Rolled Successfully"
  - `subtitle`: `CALL ${rollFromLeg.strike} → CALL ${rollToLeg.strike} · {rollToLeg.expiration}`
  - `borderBottomColor`: green

  **SheetBody content:**
  1. **Hero box** (green gradient, centered):
     - Overline: "Roll Net Credit" or "Roll Net Debit"
     - Large number: `+$0.70` (sign + abs net)
     - Sub: `$70.00 total · 1 contract`

  2. **Summary `SectionCard`** (as shown in mockup success state):
     - `SummaryRow` Roll type: `<Badge>Roll Up &amp; Out</Badge>` (using `getCcRollType()`)
     - `SummaryRow` Old leg: `ROLL_FROM · BUY CALL ${fmtMoney(rollFromLeg.strike)} @ ${fmtMoney(rollFromLeg.premiumPerContract)}`
     - `SummaryRow` New leg: `ROLL_TO · SELL CALL ${fmtMoney(rollToLeg.strike)} @ ${fmtMoney(rollToLeg.premiumPerContract)}`
     - `SummaryRow` New expiration: `{rollToLeg.expiration} ({dte} DTE)`
     - `SummaryRow` Phase: `<PhaseBadge phase="CC_OPEN" />` + "(unchanged)"
     - `SummaryRow` Cost basis: `{fmtMoney(prevBasisPerShare)} → {fmtMoney(newBasis)}/share` with `highlight` — shown in green in the mockup

  **Props:** `response: RollCcResponse, ticker: string, prevBasisPerShare: string, onClose: () => void`

**Refactor — cleanup to consider:**

- Naming consistency with `RollCspSuccess`. Check for shared logic between the two success components.

**Acceptance criteria covered:**

- Scenario: Successful CC roll creates linked leg pair (success state shows ROLL_FROM, ROLL_TO, phase CC_OPEN, cost basis transition)

---

### 10. `RollCcSheet` Component

**Files to create or modify:**

- `src/renderer/src/components/RollCcSheet.tsx` — new file
- `src/renderer/src/components/RollCcSheet.test.tsx` — new file

**Red — tests to write** (in `src/renderer/src/components/RollCcSheet.test.tsx`):

- `RollCcSheet: renders nothing when open=false`
- `RollCcSheet: renders RollCcForm when open=true`
- `RollCcSheet: schema validation — rejects empty new expiration`
- `RollCcSheet: schema validation — rejects new expiration before current expiration` — set `newExpiration` to a date before `currentExpiration`, attempt submit, assert error message "on or after"
- `RollCcSheet: schema validation — rejects zero cost to close` — assert error "must be greater than zero"
- `RollCcSheet: schema validation — rejects zero new premium`
- `RollCcSheet: transitions to RollCcSuccess when mutation resolves`

**Green — implementation:**

- Create `src/renderer/src/components/RollCcSheet.tsx` modelled on `RollCspSheet.tsx`:
  - `makeRollCcSchema(currentStrike, currentExpiration)` factory:
    - `cost_to_close`: positive string refine
    - `new_premium`: positive string refine
    - `new_expiration`: min(1) + `.refine(v => v >= currentExpiration, 'New expiration must be on or after the current expiration (...)')`
    - `new_strike`: positive string refine
    - `fill_date`: optional string
    - **Note:** The "no change" validation (`new_strike === currentStrike AND new_expiration === currentExpiration`) is enforced by the disabled button + AlertBox in `RollCcForm`. The schema does not add this as a `superRefine` (the button is disabled, so submit cannot fire; the backend lifecycle engine provides defense-in-depth).
  - `defaultValues`: `new_strike = parseFloat(props.strike).toFixed(2)`, others empty
  - `useWatch` for `cost_to_close`, `new_premium`, `new_strike`, `new_expiration` (all four needed for roll type and below-basis warning)
  - `onSubmit` maps form values → `RollCcPayload` and calls `mutate`
  - Renders `RollCcForm` (form state) or `RollCcSuccess` (success state) inside `SheetPanel` portalled via `getSheetPortal()`

  **Props** (`RollCcSheetProps`):

  ```ts
  open: boolean
  positionId: string
  ticker: string
  strike: string         // current CC strike
  expiration: string     // current CC expiration
  contracts: number
  premiumPerContract: string
  basisPerShare: string
  totalPremiumCollected: string
  onClose: () => void
  ```

**Refactor — cleanup to consider:**

- `makeRollCcSchema` factory vs `makeRollCspSchema` — check if similar enough to share; probably not worth it given different validation messages.

**Acceptance criteria covered:**

- Scenario: Validation — new expiration must not be before current expiration
- Scenario: Validation — cost to close and new premium must be positive

---

### 11. `PositionDetailActions`: Add "Roll CC →" Button

**Files to create or modify:**

- `src/renderer/src/components/PositionDetailActions.tsx` — add `onRollCc` prop and "Roll CC →" button
- `src/renderer/src/components/PositionDetailActions.test.tsx` — add test

**Red — tests to write** (in `src/renderer/src/components/PositionDetailActions.test.tsx`):

- `PositionDetailActions: shows "Roll CC →" button when phase is CC_OPEN` — render with `phase='CC_OPEN'`, assert button with `data-testid="roll-cc-btn"` is visible
- `PositionDetailActions: does not show "Roll CC →" button when phase is CSP_OPEN`

**Green — implementation:**

- In `PositionDetailActions.tsx`:
  - Add `onRollCc: () => void` to props
  - In the `phase === 'CC_OPEN'` block, add:
    ```tsx
    <ActionButton testId="roll-cc-btn" label="Roll CC →" onClick={onRollCc} />
    ```
    alongside the existing "Close CC Early →" and "Record Call-Away →" buttons

**Refactor — cleanup to consider:**

- Prop ordering consistency.

**Acceptance criteria covered:**

- Scenario: Roll form shows current CC details (the button opens the sheet).

---

### 12. `usePositionDetailSheets`: Add CC Roll State

**Files to create or modify:**

- `src/renderer/src/pages/usePositionDetailSheets.ts` — add `rollCcOpen`, `handleRollCc`, `handleCloseRollCc`

**Red — tests to write:**

- No isolated unit test needed; the wiring is exercised by `PositionDetailPage.test.tsx` (see Area 13).

**Green — implementation:**

- In `usePositionDetailSheets.ts`:
  - Add `const [rollCcOpen, setRollCcOpen] = useState(false)` alongside `rollCspOpen`
  - Include `rollCcOpen` in the `overlayOpen` calculation
  - Return `rollCcOpen, handleRollCc: () => setRollCcOpen(true), handleCloseRollCc: () => setRollCcOpen(false)` from the hook
  - Update `PositionDetailSheetsResult` type to include these three
  - Destructure `rollCcOpen, handleRollCc, handleCloseRollCc` in `PositionDetailPage`

**Refactor — cleanup to consider:**

- `overlayOpen` derivation — confirm `rollCcOpen` is included.

**Acceptance criteria covered:**

- All sheet-open scenarios.

---

### 13. `PositionDetailPage`: Wire `RollCcSheet`

**Files to create or modify:**

- `src/renderer/src/pages/PositionDetailPage.tsx` — import `RollCcSheet`, add `onRollCc` prop to `PositionDetailActions`, render `RollCcSheet`
- `src/renderer/src/pages/PositionDetailPage.test.tsx` — add tests

**Red — tests to write** (in `src/renderer/src/pages/PositionDetailPage.test.tsx`):

- `PositionDetailPage: shows "Roll CC →" button when position is in CC_OPEN phase`
- `PositionDetailPage: opens RollCcSheet when "Roll CC →" is clicked`
- `PositionDetailPage: closes RollCcSheet when cancelled`
- `PositionDetailPage: blurs content when RollCcSheet is open (overlayOpen=true)`

**Green — implementation:**

- In `PositionDetailPage.tsx`:
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

**Refactor — cleanup to consider:**

- Sheet render order consistency with existing pattern.

**Acceptance criteria covered:**

- All scenarios (entry point to the full flow).

---

### 14. E2E Tests

**Files to create or modify:**

- `e2e/cc-roll.spec.ts` — new file

**Red — tests to write** (each maps to one AC from the user story):

```
Helper: reachCcOpenDetail(page)
  — openPosition(AAPL, strike=185, premium=2.50, contracts=1, expiration=CC_EXPIRATION)
  — navigate to detail, click "Record Assignment →", confirm
  — click "Open Covered Call →", fill strike=185, premium=2.50, expiration=CC_EXPIRATION, confirm
  — verify phase is CC_OPEN

Helper: openRollCcSheet(page)
  — page.click('[data-testid="roll-cc-btn"]')
  — page.waitForSelector('text=Roll Covered Call')
```

- **AC: Roll form shows current CC details and cost basis context** →
  `"shows current CC details and cost basis context when roll form is opened"`:
  - Open roll sheet; assert body contains "Current Leg", "$185.00", CC expiration date, DTE, "+$2.50/contract", "Cost basis", "$176.50/share"
  - Assert inputs visible: New Strike, New Expiration, Cost to Close, New Premium, Fill Date

- **AC: Net credit preview for CC roll up and out** →
  `"shows net credit preview for roll up and out"`:
  - Fill Cost to Close=3.50, New Premium=4.20; assert "Net Credit", "+$0.70/contract", "$70.00 total"

- **AC: Warning when new CC strike is below cost basis** →
  `"shows amber warning when new CC strike is below cost basis"`:
  - Fill New Strike=175.00; assert "Strike below cost basis", "$175.00", "$176.50", "$1.50/share"
  - Assert Confirm Roll button is NOT disabled (warning is non-blocking)

- **AC: Successful CC roll creates linked leg pair** →
  `"creates linked ROLL_FROM and ROLL_TO leg pair on successful CC roll"`:
  - Fill strike=190.00, expiration=NEW_EXPIRATION, cost=3.50, premium=4.20; click Confirm Roll
  - Wait for "CC Rolled Successfully"; assert "Roll Complete", "ROLL_FROM", "ROLL_TO", "CC_OPEN", "+$0.70"
  - Assert cost basis transition text `$176.50 → $175.80`

- **AC: CC roll out (same strike, later expiration)** →
  `"accepts CC roll out with same strike and later expiration"`:
  - Keep New Strike=185.00 (unchanged), fill New Expiration=NEW_EXPIRATION, cost=1.80, premium=3.10
  - Confirm; assert "CC Rolled Successfully" and "Roll Out" label

- **AC: CC roll down and out (lower strike)** →
  `"accepts CC roll down and out with lower strike"`:
  - Fill New Strike=182.00, New Expiration=NEW_EXPIRATION; confirm; assert "Roll Down & Out"

- **AC: CC roll up — same expiration, higher strike** →
  `"accepts CC roll up with same expiration and higher strike"`:
  - Fill New Strike=190.00, New Expiration=CC_EXPIRATION (same), cost=2.00, premium=3.50
  - Confirm; assert "CC Rolled Successfully" and "Roll Up" label

- **AC: Net debit roll** →
  `"shows net debit preview and confirms roll when cost to close exceeds new premium"`:
  - Fill cost=5.00, premium=3.50; assert "Net Debit", "-$1.50/contract", "$150.00 total"
  - Fill New Strike=190.00, New Expiration=NEW_EXPIRATION; confirm; assert "CC Rolled Successfully"

- **AC: Validation — new expiration must not be before current expiration** →
  `"shows validation error when new expiration is before current expiration"`:
  - Fill New Expiration=PAST_EXPIRATION; attempt confirm; assert error "on or after the current expiration"; assert "CC Rolled Successfully" NOT visible

- **AC: Validation — new expiration or strike must differ** →
  `"shows validation error when neither strike nor expiration changed"`:
  - Leave New Strike=185.00 (same) and New Expiration=CC_EXPIRATION (same); fill cost=2.00, premium=2.50
  - Assert "No change detected" / "Roll must change the expiration, strike, or both"
  - Assert Confirm Roll button is disabled

- **AC: Validation — cost to close must be positive** →
  `"shows validation error when cost to close is zero"`:
  - Fill cost=0; attempt confirm; assert "Cost to close must be greater than zero"

**Acceptance criteria covered:** All 11 AC scenarios, one test per AC.
