# US-12 — Roll Open CSP Out — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off

---

## Layer 1 — Foundation (pure engines + schema, no dependencies)

> All three areas can start immediately and run in parallel.

### Lifecycle Engine: `rollCsp`

- [x] **[Red]** Write failing tests — `src/main/core/lifecycle.test.ts`
  - `rollCsp` returns `{ phase: 'CSP_OPEN' }` for valid input (CSP_OPEN, later expiration, positive amounts)
  - throws `ValidationError` field `__phase__` / code `invalid_phase` when phase is not `CSP_OPEN`
  - throws `ValidationError` field `newExpiration` / code `must_be_after_current` when `newExpiration <= currentExpiration` (same date AND earlier date — two cases)
  - throws `ValidationError` field `costToClosePerContract` / code `must_be_positive` when value is `0`
  - throws `ValidationError` field `newPremiumPerContract` / code `must_be_positive` when value is `0`
  - Run `pnpm test src/main/core/lifecycle.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/lifecycle.ts` _(depends on: Lifecycle Engine Red ✓)_
  - Add `RollCspInput` interface: `{ currentPhase, currentExpiration, newExpiration, costToClosePerContract, newPremiumPerContract }`
  - Add `RollCspResult` interface: `{ phase: 'CSP_OPEN' }`
  - Add `rollCsp(input: RollCspInput): RollCspResult` — validate phase, validate `newExpiration > currentExpiration` using string comparison, reuse `requirePositivePremium` and `requirePositiveClosePrice` helpers
  - Run `pnpm test src/main/core/lifecycle.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/core/lifecycle.ts` _(depends on: Lifecycle Engine Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider renaming `requirePositiveClosePrice` → `requirePositiveAmount` if it removes duplication cleanly; only do so if it does
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Cost Basis Engine: `calculateRollBasis`

- [x] **[Red]** Write failing tests — `src/main/core/costbasis.test.ts`
  - Net credit ($2.80 − $1.20 = $1.60, 1 contract): `basisPerShare` decreases by $1.60, `totalPremiumCollected` increases by $160.00
  - Net debit ($2.50 − $3.00 = −$0.50, 1 contract): `basisPerShare` increases by $0.50, `totalPremiumCollected` decreases by $50.00
  - Zero net (premium equals cost): `basisPerShare` and `totalPremiumCollected` unchanged
  - Multi-contract (2 contracts, $1.60 net credit): `basisPerShare` still decreases by $1.60 (net is per-contract/per-share), `totalPremiumCollected` increases by $320.00
  - Run `pnpm test src/main/core/costbasis.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/costbasis.ts` _(depends on: Cost Basis Engine Red ✓)_
  - Add `RollBasisInput`: `{ prevBasisPerShare, prevTotalPremiumCollected, costToClosePerContract, newPremiumPerContract, contracts }` (all strings except contracts)
  - Add `RollBasisResult`: `{ basisPerShare: string; totalPremiumCollected: string }`
  - Add `calculateRollBasis(input: RollBasisInput): RollBasisResult`:
    - `net = new Decimal(newPremiumPerContract).minus(costToClosePerContract)` (positive = credit)
    - `basisPerShare = round4(new Decimal(prevBasisPerShare).minus(net)).toFixed(4)`
    - `netTotal = net.times(sharesFromContracts(contracts))`
    - `totalPremiumCollected = round4(new Decimal(prevTotalPremiumCollected).plus(netTotal)).toFixed(4)`
  - Run `pnpm test src/main/core/costbasis.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/core/costbasis.ts` _(depends on: Cost Basis Engine Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Check for duplication with `calculateCcOpenBasis`; extract shared pattern only if it produces genuinely cleaner code
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Schema: `RollCspPayloadSchema`

- [x] **[Green]** Implement — `src/main/schemas.ts` _(no Red needed — validation covered by service tests)_
  - Add `RollCspPayloadSchema`:
    ```typescript
    z.object({
      positionId: PositionIdSchema,
      costToClosePerContract: z.number().positive(),
      newPremiumPerContract: z.number().positive(),
      newExpiration: z.string(),
      newStrike: z.number().positive().optional(),
      fillDate: z.string().optional()
    })
    ```
  - Add `export type RollCspPayload = z.infer<typeof RollCspPayloadSchema>`
  - Add `RollCspResult` interface: `{ position, rollFromLeg, rollToLeg, rollChainId, costBasisSnapshot }` — see `plans/us-12/contracts/roll-csp.md` for full shape
  - Run `pnpm typecheck` — no errors
- [x] **[Refactor]** `/refactor` — `src/main/schemas.ts` _(depends on: Schema Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Verify camelCase naming consistency with existing payload schemas
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — Service + Renderer API (parallel after Layer 1 Green)

> Both areas can start once Layer 1 Green tasks are done. Run in parallel.

### Service: `rollCspPosition`

**Requires:** Lifecycle Engine Green ✓, Cost Basis Engine Green ✓, Schema Green ✓

- [x] **[Red]** Write failing tests — `src/main/services/roll-csp-position.test.ts` _(depends on: Layer 1 Green ✓)_
  - Happy path (net credit): creates ROLL_FROM leg (`action='BUY'`, `legRole='ROLL_FROM'`, same strike+expiration as current), creates ROLL_TO leg (`action='SELL'`, `legRole='ROLL_TO'`, new expiration, new premium), both legs share the same `roll_chain_id` UUID, new snapshot has lower `basisPerShare`, position phase stays `CSP_OPEN`
  - Happy path (net debit): snapshot has higher `basisPerShare` than previous
  - Throws `ValidationError` (`not_found`) when position does not exist
  - Throws `ValidationError` (`no_active_leg`) when position has no active leg
  - Throws `ValidationError` (from lifecycle) when new expiration is not after current
  - `rollFromLeg`: `legRole='ROLL_FROM'`, `action='BUY'`, strike = current CSP strike, expiration = current CSP expiration, `premiumPerContract` = costToClosePerContract formatted to 4dp
  - `rollToLeg`: `legRole='ROLL_TO'`, `action='SELL'`, strike = newStrike or current if omitted, expiration = newExpiration, `premiumPerContract` = newPremiumPerContract formatted to 4dp
  - Run `pnpm test src/main/services/roll-csp-position.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/roll-csp-position.ts` _(depends on: Service Red ✓)_
  - New standalone file (follow `close-csp-position.ts` pattern)
  - Steps: `getPosition` → lifecycle `rollCsp` → `calculateRollBasis` → `db.transaction`:
    - INSERT ROLL_FROM leg (BUY, currentStrike, currentExpiration, roll_chain_id = new UUID)
    - INSERT ROLL_TO leg (SELL, newStrike??currentStrike, newExpiration, same roll_chain_id)
    - INSERT cost_basis_snapshot (new basis, final_pnl = NULL)
    - Position row NOT updated (phase stays CSP_OPEN)
  - Return `{ position, rollFromLeg, rollToLeg, rollChainId, costBasisSnapshot }`
  - Run `pnpm test src/main/services/roll-csp-position.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/roll-csp-position.ts` _(depends on: Service Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Compare INSERT column ordering and formatting helpers with `close-csp-position.ts` for consistency
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Renderer API Adapter

**Requires:** Schema Green ✓ (for field shapes from `plans/us-12/contracts/roll-csp.md`)

- [x] **[Green]** Implement — `src/renderer/src/api/positions.ts` _(depends on: Schema Green ✓)_
  - Add `RollCspPayload` type (snake_case: `position_id`, `cost_to_close_per_contract`, `new_premium_per_contract`, `new_expiration`, `new_strike?`, `fill_date?`)
  - Add `RollCspResponse` type — see `plans/us-12/contracts/roll-csp.md`
  - Add `rollCsp(payload: RollCspPayload): Promise<RollCspResponse>` — maps snake_case → camelCase, calls `window.api.rollCsp`, throws `apiError(400, ...)` on `ok: false`
  - Extend `IPC_TO_FORM_FIELD`: add `costToClosePerContract`, `newPremiumPerContract`, `newExpiration`
  - Run `pnpm typecheck` — no errors
- [x] **[Refactor]** `/refactor` — `src/renderer/src/api/positions.ts` _(depends on: Renderer API Adapter Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Check for naming duplication with existing close/open payload adapters
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — IPC + Hook (parallel after Layer 2 Green)

> Both areas can start once their Layer 2 dependency is done. Run in parallel.

### IPC Handler and Preload

**Requires:** Service Green ✓, Schema Green ✓

- [x] **[Red]** Write failing tests — `src/main/ipc/positions.test.ts` _(depends on: Service Green ✓)_
  - Handler returns `{ ok: true, position, rollFromLeg, rollToLeg, rollChainId, costBasisSnapshot }` on success
  - Handler returns `{ ok: false, errors }` when service throws `ValidationError`
  - Handler returns `{ ok: false, errors }` when Zod rejects malformed payload (missing `positionId`)
  - Run `pnpm test src/main/ipc/positions.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/ipc/positions.ts` + `src/preload/index.ts` _(depends on: IPC Red ✓)_
  - In `positions.ts`: import `RollCspPayloadSchema`, `rollCspPosition`; call `registerParsedPositionHandler(db, 'positions:roll-csp', 'positions_roll_csp_unhandled_error', RollCspPayloadSchema, rollCspPosition)`
  - In `preload/index.ts`: add `rollCsp: (payload: unknown) => invoke('positions:roll-csp', payload)`
  - Run `pnpm test src/main/ipc/positions.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/ipc/positions.ts` _(depends on: IPC Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Verify log label follows `positions_{verb}_{noun}_unhandled_error` pattern
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### React Hook: `useRollCsp`

**Requires:** Renderer API Adapter Green ✓

- [x] **[Green]** Implement — `src/renderer/src/hooks/useRollCsp.ts` _(depends on: Renderer API Adapter Green ✓, no Red needed — pattern identical to existing hooks)_

  ```typescript
  import type { RollCspPayload, RollCspResponse } from '../api/positions'
  import { rollCsp } from '../api/positions'
  import { usePositionMutation } from './usePositionMutation'

  export function useRollCsp(options?: {
    onSuccess?: (data: RollCspResponse) => void
  }): ReturnType<typeof usePositionMutation<RollCspResponse, RollCspPayload>> {
    return usePositionMutation<RollCspResponse, RollCspPayload>(rollCsp, options)
  }
  ```

  - Run `pnpm typecheck` — no errors

- [x] **[Refactor]** `/refactor` — `src/renderer/src/hooks/useRollCsp.ts` _(depends on: Hook Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — `RollCspSheet` Component

**Requires:** Renderer API Adapter Green ✓, Hook (`useRollCsp`) Green ✓

### `RollCspSheet` Component

- [x] **[Red]** Write failing tests — `src/renderer/src/components/RollCspSheet.test.tsx` _(depends on: Layer 3 Green ✓)_
  - When `open=false`, renders nothing
  - When `open=true`, renders title "Roll Cash-Secured Put" and eyebrow "Roll Out"
  - Current Leg section shows: ticker, strike, expiration, DTE, premium collected (total), cost basis
  - New Leg section shows fields: New Strike (pre-filled with current strike), New Expiration, Cost to Close, New Premium, Fill Date
  - Net credit preview (green) when cost to close $1.20, new premium $2.80: shows "+$1.60/contract ($160.00 total)"
  - Net debit preview (amber) when cost to close $3.00, new premium $2.50: shows "-$0.50/contract ($50.00 total)" and warning text "This roll costs more to close than the new premium provides"
  - Submit with new expiration before current: inline error "New expiration must be after the current expiration"
  - Submit with cost to close $0.00: inline error "Cost to close must be greater than zero"
  - Submit with new premium $0.00: inline error "New premium must be greater than zero"
  - On `onSuccess` callback, success state shows green header "Roll Complete", hero with net amount, summary card with ROLL_FROM/ROLL_TO leg details, cost basis before → after
  - Run `pnpm test src/renderer/src/components/RollCspSheet.test.tsx` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/RollCspSheet.tsx` _(depends on: RollCspSheet Red ✓)_
  - Follow `ExpirationSheet` portal pattern: `createPortal` to `document.body`, width 420px, slide-in animation class
  - Props: `{ open, positionId, ticker, strike, expiration, contracts, premiumPerContract, basisPerShare, totalPremiumCollected, onClose }`
  - Form: React Hook Form + Zod resolver; fields: `newStrike` (number, default = current strike), `newExpiration` (string, required, > currentExpiration), `costToClosePerContract` (number, positive), `newPremiumPerContract` (number, positive), `fillDate` (string, optional)
  - `NetCreditDebitPreview`: inline calc, `net = newPremium - costToClose`; green card if credit, amber card + warning row if debit; only shown when both values are > 0
  - Roll type indicator badge: `getRollTypeLabel(currentStrike, newStrike)` → "Roll Out" / "Roll Down & Out" / "Roll Up & Out"
  - Irrevocable warning box (amber): "This cannot be undone. A ROLL_FROM leg (buy-to-close) and ROLL_TO leg (sell-to-open) will be recorded as a linked pair. The position remains in CSP_OPEN phase."
  - Footer: Cancel + Confirm Roll buttons (hidden in success state)
  - Success state (via `useRollCsp` `onSuccess`): green header "Roll Complete" / "CSP Rolled Successfully", green hero card (net credit/debit amount), summary card (roll type, old leg, new leg, new expiration + DTE, roll chain ID truncated, phase unchanged, cost basis before → after), info box with DTE note
  - Run `pnpm test src/renderer/src/components/RollCspSheet.test.tsx` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/RollCspSheet.tsx` _(depends on: RollCspSheet Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider extracting `NetCreditDebitPreview` as a separate component if over ~30 lines
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 5 — Wire Up to Position Detail

**Requires:** `RollCspSheet` Green ✓

### Wire Up to Position Detail

- [x] **[Red]** Write failing tests — `src/renderer/src/components/PositionDetailActions.test.tsx` _(depends on: RollCspSheet Green ✓)_
  - When `phase='CSP_OPEN'`, renders button `data-testid="roll-csp-btn"` with label "Roll CSP →"; clicking calls `onRollCsp`
  - When `phase='HOLDING_SHARES'`, "Roll CSP →" button is not rendered
  - Run `pnpm test src/renderer/src/components/PositionDetailActions.test.tsx` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/PositionDetailActions.tsx` + `src/renderer/src/pages/PositionDetailPage.tsx` _(depends on: Wire Up Red ✓)_
  - In `PositionDetailActions.tsx`: add `onRollCsp: () => void` to props; inside `phase === 'CSP_OPEN'` block add `<ActionButton testId="roll-csp-btn" label="Roll CSP →" onClick={onRollCsp} />`
  - In `PositionDetailPage.tsx`: add `const [rollCspOpen, setRollCspOpen] = useState(false)`; pass `onRollCsp={() => setRollCspOpen(true)}`; render `<RollCspSheet open={rollCspOpen} onClose={() => setRollCspOpen(false)} ...props from detail.activeLeg + detail.costBasisSnapshot>`; include `rollCspOpen` in `overlayOpen` prop to `PositionDetailContent`
  - Run `pnpm test src/renderer/src/components/PositionDetailActions.test.tsx` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/PositionDetailActions.tsx` _(depends on: Wire Up Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 6 — E2E Tests

**Requires:** All Green tasks from Layers 1–5 ✓

### E2E Tests

- [x] **[Red]** Write failing e2e tests — `e2e/csp-roll.spec.ts` _(depends on: all Green tasks ✓)_
  - One `it()` per AC — test names mirror AC language exactly:
    - AC-1: Roll form shows current leg summary and new leg inputs → `it('shows current leg summary and new leg inputs when roll form is opened')`
    - AC-2: Net credit/debit preview updates as trader enters values → `it('shows net credit preview when cost to close and new premium are entered')`
    - AC-3: Net debit preview shown with warning → `it('shows net debit preview with warning when cost to close exceeds new premium')`
    - AC-4: Successful CSP roll out creates linked leg pair → `it('creates linked ROLL_FROM and ROLL_TO leg pair and keeps position in CSP_OPEN on successful roll')`
    - AC-5: Roll form validates new expiration is later than current → `it('shows validation error when new expiration is not after current expiration')`
    - AC-6: Roll form validates positive cost to close → `it('shows validation error when cost to close is zero')`
    - AC-7: Roll form validates positive new premium → `it('shows validation error when new premium is zero')`
  - Follow `e2e/csp-flow.spec.ts` pattern: launch Electron with temp DB, create CSP_OPEN position, navigate to position detail, interact with roll sheet
  - Run `pnpm test:e2e` — all new tests must fail
- [x] **[Green]** Make e2e tests pass _(depends on: E2E Red ✓)_
  - Run `pnpm test:e2e` — all 7 tests must pass
- [x] **[Refactor]** `/refactor` e2e tests _(depends on: E2E Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Extract shared "create a CSP_OPEN position" setup into `e2e/helpers.ts` if not already present

---

## Completion Checklist

- [x] All Red tasks complete (tests written and failing for right reason)
- [x] All Green tasks complete (all tests passing)
- [x] All Refactor tasks complete (lint + typecheck clean)
- [x] E2E tests cover all 7 ACs from US-12
- [x] `pnpm test && pnpm lint && pnpm typecheck` — all clean
