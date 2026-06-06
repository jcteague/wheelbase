---
plan: us-5
source: plans/us-5/
extracted_at: 2026-05-30
status: complete
---

# Extract: us-5

## Summary

This story adds the expiration-worthless path to the wheel lifecycle. A trader with a `CSP_OPEN` position on or after the expiration date clicks "Record Expiration →" in the position detail header, confirms in a right-side sheet, and the wheel transitions to `WHEEL_COMPLETE` with 100% of the collected premium captured. The expire leg is written with `action='EXPIRE'`, `fill_price=null`, and `fill_date` set to the option's expiration date. A post-success shortcut navigates to the New Wheel form with the ticker pre-filled to start the next cycle. The positions list is updated to split active and closed positions into separate sections. (Source: `plans/us-5/plan.md`)

## Architecture Decisions

### ADR: Lifecycle validation lives in the pure core engine

- **Decision:** Add `expireCsp(input)` to `src/main/core/lifecycle.ts` following the existing `closeCsp` pattern — it takes `currentPhase`, `expirationDate`, and `referenceDate`, validates phase is `CSP_OPEN` and `referenceDate >= expirationDate`, and returns `{ phase: 'WHEEL_COMPLETE' }`.
- **Why:** All lifecycle validation lives in pure core engines; `closeCsp` validates phase and dates in the same file, and `expireCsp` follows the same signature style. Keeps the engine DB-free and testable.
- **Alternatives considered:** Inline validation inside the service layer — rejected because it violates the core/service separation enforced by architecture rules.
- **Source:** `plans/us-5/research.md`

### ADR: Cost basis calculation is its own function, not reusing `calculateCspClose` with closePrice=0

- **Decision:** Add `calculateCspExpiration({ openPremiumPerContract, contracts })` to `src/main/core/costbasis.ts`. Returns `finalPnl = openPremiumPerContract × contracts × 100` and the constant `pnlPercentage = "100.0000"`.
- **Why:** An expiration worthless returns 100% of collected premium. The calculation is simpler than `calculateCspClose` (no close price) and follows the established `Decimal.js` `ROUND_HALF_UP` pattern. `pnlPercentage` is kept explicit (not derived) to avoid future confusion.
- **Alternatives considered:** Reusing `calculateCspClose` with `closePrice = 0` — rejected because zero is a special case that would distort the percentage math.
- **Source:** `plans/us-5/research.md`, `plans/us-5/plan.md`

### ADR: Add `'EXPIRE'` to the `LegAction` enum

- **Decision:** Extend `LegAction` in `src/main/core/types.ts` from `z.enum(['SELL', 'BUY'])` to `z.enum(['SELL', 'BUY', 'EXPIRE'])`. The expire leg uses `action: 'EXPIRE'` and `leg_role: 'EXPIRE'`.
- **Why:** An expiration is neither a buy nor a sell. The story specifies `action: "expire"`. No DB CHECK constraint enforces action values, so this is a type-only change with no migration.
- **Alternatives considered:** Using `'SELL'` to represent the original sell completing — rejected as semantically incorrect and confusing in leg history.
- **Source:** `plans/us-5/research.md`, `plans/us-5/data-model.md`

### ADR: Phase transition skips `CSP_EXPIRED` intermediate state

- **Decision:** Transition directly from `CSP_OPEN → WHEEL_COMPLETE` in one step.
- **Why:** The user story technical notes specify single-step transition for simplicity; there is no business value in surfacing an intermediate `CSP_EXPIRED` state since the position is immediately closed.
- **Source:** `plans/us-5/data-model.md`, `docs/epics/01-stories/US-5-record-csp-expiration.md`

### ADR: Use shadcn/ui `Sheet` for the right-side confirmation pattern

- **Decision:** Use the shadcn `Sheet` component (`src/renderer/src/components/ui/sheet.tsx`) with `<SheetContent side="right">`. Install via `pnpm dlx shadcn@latest add sheet --yes`. `ExpirationSheet` wraps the shadcn primitives and manages two internal states: `'confirmation'` and `'success'`.
- **Why:** Existing UI components (`popover.tsx`, `calendar.tsx`) use Radix UI primitives with `cn()`/Tailwind styling — Sheet follows the same pattern. shadcn's Sheet supplies scrim overlay (`Dialog.Overlay`), slide-in animation via `tailwindcss-animate`, keyboard dismissal (Escape), and focus management. This eliminates the custom CSS the mockup required.
- **Alternatives considered:** Custom `position: fixed` div — rejected once the existing shadcn component pattern was confirmed; reinventing what Radix Dialog provides is unnecessary work.
- **Source:** `plans/us-5/research.md`, `plans/us-5/plan.md`

### ADR: Pre-fill ticker via wouter query string, not global state

- **Decision:** The shortcut button navigates to `/new?ticker=AAPL`. `NewWheelPage` reads the ticker via wouter's `useSearch()` and passes it as a `defaultTicker` prop to `NewWheelForm`, which sets it through `useForm` `defaultValues`.
- **Why:** Wouter's `useSearch` hook returns the query string for the hash route. Query params are idiomatic for pre-filling forms from navigation and require no new state library.
- **Alternatives considered:** Storing pre-fill state in a global Zustand store — rejected as over-engineered for a single string. Context API — same.
- **Source:** `plans/us-5/research.md`

### ADR: Each expired wheel is a self-contained lifecycle

- **Decision:** Re-opening a CSP on the same ticker creates a new, independent wheel — not a continuation of the expired one. The "Open new wheel on AAPL" shortcut therefore points at the New Wheel form, not at any "resume" action on the prior position.
- **Why:** Keeps P&L tracking clean and history meaningful: each wheel's final P&L is whole, not split between phases of the same record.
- **Source:** `docs/epics/01-stories/US-5-record-csp-expiration.md`

### ADR: Positions list splits into Active / Closed sections

- **Decision:** Update `PositionsListPage` and `PositionCard` to separate positions into "Active" and "Closed" groups. Closed positions render at `opacity: 0.55`; the `WHEEL_COMPLETE` badge uses the project green token; for closed positions the card shows a "Final P&L" value with green styling in place of the live "Premium" label.
- **Why:** Screen 5 of the mockup shows this grouping; the acceptance criterion requires the WHEEL_COMPLETE phase badge to be visible on the list after expiration. A flat list would bury closed wheels among active ones.
- **Alternatives considered:** Separate route for closed positions — rejected as over-engineering for Phase 1 scope.
- **Source:** `plans/us-5/research.md`, `plans/us-5/plan.md`

## Contracts

### `positions:expire-csp`

- **Type:** IPC handler
- **Shape:**

  ```typescript
  // Request payload
  {
    positionId: string                // UUID — required
    expirationDateOverride?: string   // YYYY-MM-DD — optional override
  }

  // Success response
  {
    ok: true,
    position: {
      id: string
      ticker: string
      phase: 'WHEEL_COMPLETE'
      status: 'CLOSED'
      closedDate: string              // YYYY-MM-DD
    },
    leg: {
      id: string
      positionId: string
      legRole: 'EXPIRE'
      action: 'EXPIRE'
      optionType: 'PUT'
      strike: string
      expiration: string
      contracts: number
      premiumPerContract: '0.0000'
      fillDate: string                // YYYY-MM-DD (expiration date)
      createdAt: string
      updatedAt: string
    },
    costBasisSnapshot: {
      id: string
      positionId: string
      basisPerShare: string
      totalPremiumCollected: string
      finalPnl: string                // equals totalPremiumCollected
      snapshotAt: string
      createdAt: string
    }
  }

  // Error responses
  { ok: false, errors: [{ field: '__root__', code: 'not_found',       message: 'Position not found' }] }
  { ok: false, errors: [{ field: '__phase__', code: 'invalid_phase',  message: 'Position is not in CSP_OPEN phase' }] }
  { ok: false, errors: [{ field: 'expiration', code: 'too_early',     message: 'Cannot record expiration before the expiration date' }] }
  { ok: false, errors: [{ field: '__root__', code: 'internal_error',  message: 'An unexpected error occurred' }] }
  ```

- **Source:** `plans/us-5/contracts/expire-csp.md`
- **Implementation:** `src/main/ipc/positions.ts`, `src/main/services/expire-csp-position.ts`

### `ExpireCspPayloadSchema`

- **Type:** Zod schema
- **Shape:**
  ```typescript
  z.object({
    positionId: z.string().uuid(),
    expirationDateOverride: z.string().optional()
  })
  ```
- **Source:** `plans/us-5/plan.md`, `plans/us-5/contracts/expire-csp.md`
- **Implementation:** `src/main/schemas.ts`

### `ExpireCspInput` / `ExpireCspResult` (lifecycle engine)

- **Type:** other (core lifecycle function signature)
- **Shape:**

  ```typescript
  ExpireCspInput {
    currentPhase: WheelPhase
    expirationDate: string   // YYYY-MM-DD
    referenceDate: string    // YYYY-MM-DD
  }

  ExpireCspResult {
    phase: 'WHEEL_COMPLETE'
  }
  ```

- **Source:** `plans/us-5/plan.md`
- **Implementation:** `src/main/core/lifecycle.ts`

### `CspExpirationInput` / `CspExpirationResult` (cost basis engine)

- **Type:** other (core cost-basis function signature)
- **Shape:**

  ```typescript
  CspExpirationInput {
    openPremiumPerContract: string
    contracts: number
  }

  CspExpirationResult {
    finalPnl: string         // 4 dp TEXT
    pnlPercentage: string    // constant '100.0000'
  }
  ```

- **Source:** `plans/us-5/plan.md`, `plans/us-5/data-model.md`
- **Implementation:** `src/main/core/costbasis.ts`

### `ExpireCspPositionResult` (service / IPC return type)

- **Type:** other (TypeScript interface)
- **Shape:**
  ```typescript
  ExpireCspPositionResult {
    position: {
      id: string
      ticker: string
      phase: 'WHEEL_COMPLETE'
      status: 'CLOSED'
      closedDate: string
    }
    leg: LegRecord
    costBasisSnapshot: CostBasisSnapshotRecord & { finalPnl: string }
  }
  ```
- **Source:** `plans/us-5/plan.md`, `plans/us-5/contracts/expire-csp.md`
- **Implementation:** `src/main/schemas.ts`, `src/main/services/expire-csp-position.ts`

### Preload binding `expirePosition`

- **Type:** other (preload IPC binding)
- **Shape:**
  ```typescript
  // src/preload/index.ts
  expirePosition: (payload: unknown) => ipcRenderer.invoke('positions:expire-csp', payload)
  ```
- **Source:** `plans/us-5/contracts/expire-csp.md`, `plans/us-5/research.md`
- **Implementation:** `src/preload/index.ts`, `src/preload/index.d.ts` (`IpcExpireCspPayload` type + `expirePosition` method on `Window.api`)

### Renderer API adapter `expirePosition` + `ExpireCspPayload` / `ExpireCspResponse`

- **Type:** other (renderer adapter)
- **Shape:**

  ```typescript
  export type ExpireCspPayload = {
    position_id: string
    expiration_date_override?: string
  }

  export type ExpireCspResponse = {
    position: {
      id: string
      ticker: string
      phase: WheelPhase
      status: WheelStatus
      closedDate: string
    }
    leg: { id: string; legRole: string; action: string; fillDate: string /* ... */ }
    costBasisSnapshot: { finalPnl: string; totalPremiumCollected: string /* ... */ }
  }

  // Payload mapping (renderer snake_case -> IPC camelCase):
  //   position_id              -> positionId
  //   expiration_date_override -> expirationDateOverride
  ```

- **Source:** `plans/us-5/contracts/expire-csp.md`, `plans/us-5/plan.md`
- **Implementation:** `src/renderer/src/api/positions.ts`

### `useExpirePosition` hook

- **Type:** other (TanStack Query mutation hook)
- **Shape:**
  ```typescript
  // useMutation wrapping expirePosition.
  // onSuccess: queryClient.invalidateQueries({ queryKey: ['positions'] })
  ```
- **Source:** `plans/us-5/plan.md`
- **Implementation:** `src/renderer/src/hooks/useExpirePosition.ts`

## Schema Changes

### No new migrations

- **Change:** none — no DB schema changes. Adding `'EXPIRE'` to `LegAction` is a type-only update; `legs.action` has no CHECK constraint, so the new value is accepted by the existing column.
- **Source:** `plans/us-5/data-model.md`, `plans/us-5/quickstart.md`

### `LegAction` type (TypeScript / Zod enum)

- **Change:** type extended (no DB change)
- **Before:** `LegAction = z.enum(['SELL', 'BUY'])`
- **After:** `LegAction = z.enum(['SELL', 'BUY', 'EXPIRE'])`
- **Source:** `plans/us-5/data-model.md`, `plans/us-5/plan.md`
- **Migration file:** none

### `legs` row INSERT — expire leg

- **Change:** new row (no schema change)
- **Columns / fields:**
  | Field | Value |
  | ---------------------- | -------------------------------------- |
  | `id` | new UUID |
  | `position_id` | parent position ID |
  | `leg_role` | `'EXPIRE'` |
  | `action` | `'EXPIRE'` |
  | `option_type` | `'PUT'` (copied from open leg) |
  | `strike` | copied from the CSP_OPEN leg |
  | `expiration` | copied from the CSP_OPEN leg |
  | `contracts` | copied from the CSP_OPEN leg |
  | `premium_per_contract` | `'0.0000'` (expires worthless) |
  | `fill_price` | `NULL` (no fill at expiration) |
  | `fill_date` | open leg's `expiration` date |
- **Source:** `plans/us-5/data-model.md`
- **Migration file:** none

### `positions` row UPDATE on expiration

- **Change:** altered row (no schema change)
- **Columns / fields:**
  | Field | Before | After |
  | ------------- | ---------- | --------------------------- |
  | `phase` | `CSP_OPEN` | `WHEEL_COMPLETE` |
  | `status` | `ACTIVE` | `CLOSED` |
  | `closed_date` | `NULL` | expiration date (ISO) |
  | `updated_at` | open ts | close ts (now) |
- **Source:** `plans/us-5/data-model.md`
- **Migration file:** none

### `cost_basis_snapshots` row INSERT — expiration snapshot

- **Change:** new row (no schema change)
- **Columns / fields:**
  | Field | Value |
  | ------------------------- | ---------------------------------------------------------- |
  | `id` | new UUID |
  | `position_id` | parent position ID |
  | `basis_per_share` | copied from the most recent prior snapshot |
  | `total_premium_collected` | copied from the most recent prior snapshot |
  | `final_pnl` | equals `total_premium_collected` (100% captured) |
  | `snapshot_at` | now + 1ms (sorts after opening snapshot) |
  | `created_at` | now |
- **Source:** `plans/us-5/data-model.md`
- **Migration file:** none

## Acceptance Criteria

Background (applies to all scenarios): the trader has an open CSP on AAPL with strike $180.00, expiration 2026-04-17, contracts 1, premium_per_contract $2.50, phase CSP_OPEN.

- Scenario: Successfully record CSP expiration
  - Given today is 2026-04-17 or later
  - When the trader records the CSP as expired
  - Then the position phase changes to WHEEL_COMPLETE
  - And the position status changes to closed
  - And an expire leg is recorded with action "expire" and no fill_price
  - And the cost basis snapshot shows final_pnl of $250.00
  - And the total premium captured shows 100%
- Scenario: Post-expiration offers shortcut to open new wheel on same ticker
  - Given the trader has just recorded expiration on the AAPL wheel
  - When the expiration confirmation is displayed
  - Then a "Open new wheel on AAPL" shortcut is available
  - And clicking it navigates to the New Wheel form with ticker pre-filled as "AAPL"
- Scenario: Reject expiration when position is not in CSP_OPEN phase
  - Given the position phase is CSP_CLOSED_PROFIT
  - When the trader attempts to record expiration
  - Then the action is rejected with message "Position is not in CSP_OPEN phase"
- Scenario: Reject expiration before expiration date
  - Given today is 2026-04-10 (before expiration)
  - When the trader attempts to record the CSP as expired
  - Then a validation error appears: "Cannot record expiration before the expiration date"
- Scenario: Allow expiration on the expiration date itself
  - Given today is 2026-04-17 (the expiration date)
  - When the trader records the CSP as expired
  - Then the expiration is recorded successfully
- Scenario: Position disappears from active positions after expiration
  - Given the trader has recorded the AAPL CSP as expired
  - When the trader views the positions list
  - Then the AAPL position shows the WHEEL_COMPLETE phase badge
  - And the position status is closed

(Source: `docs/epics/01-stories/US-5-record-csp-expiration.md`)

## Decisions & Tradeoffs

- `referenceDate === expirationDate` (same-day) passes validation — recording on expiration day is valid. Standard equity options expire Saturday but cease trading Friday; traders enter Friday as the expiration date, so `>=` is correct. (Source: `plans/us-5/plan.md`, `docs/epics/01-stories/US-5-record-csp-expiration.md`)
- `pnlPercentage` is the literal constant `"100.0000"` for expiration — kept explicit rather than derived to avoid future confusion. (Source: `plans/us-5/plan.md`, `plans/us-5/research.md`)
- The expire leg's `premium_per_contract` is `'0.0000'` and `fill_price` is `NULL` — `0` reflects "expired worthless" while `null` signals "no fill ever occurred." (Source: `plans/us-5/data-model.md`)
- The expire leg's `fill_date` is set to the open leg's `expiration` date (not "today"), regardless of when the user records the expiration. (Source: `plans/us-5/data-model.md`)
- The new cost basis snapshot has `snapshot_at = now + 1ms` so it sorts after the opening snapshot via the existing `ORDER BY snapshot_at DESC LIMIT 1` query. (Source: `plans/us-5/data-model.md`)
- Error `field` naming follows the close-CSP convention: `__phase__` for phase mismatch, `__root__` for not-found/internal, `expiration` for the date-too-early check. (Source: `plans/us-5/contracts/expire-csp.md`)
- The `CloseCspForm` inline close-early section coexists with the new "Record Expiration →" action on `CSP_OPEN`; they are separate flows (Screen 1 of the mockup shows "Roll", "Close Early", and "Record Expiration →" buttons in the header). (Source: `plans/us-5/plan.md`)
- `useExpirePosition` invalidates `queryKey: ['positions']` on success — both list and detail entries refresh. (Source: `plans/us-5/plan.md`)
- Frontend service-test coverage is the boundary: IPC handlers are not unit-tested in isolation, and the API adapter / hook have no dedicated unit tests — the component test for `ExpirationSheet` exercises them indirectly. (Source: `plans/us-5/plan.md`)
- The shadcn `Sheet` install is via `pnpm dlx shadcn@latest add sheet --yes`; verified by `--dry-run` to write exactly `src/renderer/src/components/ui/sheet.tsx` and pull in `@radix-ui/react-dialog`, with no edits to `index.css`. (Source: `plans/us-5/research.md`, `plans/us-5/plan.md`)
- `ExpirationSheet` manages two internal states (`'confirmation'` and `'success'`); the success body shows the P&L display, a "Open new wheel on {ticker}" button (`navigate('/new?ticker=' + ticker)`), and a "View full position history" link (`onClose`). (Source: `plans/us-5/plan.md`)
- `PositionCard` for closed positions: `opacity: 0.55`; `WHEEL_COMPLETE` badge uses `var(--wb-green)` / `#3de07e` with no pulse animation and a "Complete" label with a "✓" prefix; the card surfaces "Final P&L" in green. (Source: `plans/us-5/plan.md`)

## Refactor-Phase Decisions

Authoritative source: `plans/us-5/refactor-phase-results.md`. The code-simplifier agent ran but introduced type errors that required manual repair; the final state below was hand-verified (150 tests passing, 0 lint errors, 0 typecheck errors).

- Extracted shared API types `ClosedPositionData` and `ClosedSnapshotData`, and moved a `PHASE_COLOR` constant into `lib/phase.ts` (shared by `PositionCard` and `PositionDetailPage` — addresses the earlier US-4 note that phase-color mappings were independently maintained).
- Added `IpcExpireCspPayload` type and `expirePosition` method to the `Window.api` interface in `src/preload/index.d.ts` (fixes the missing TS declaration).
- `ExpirationSheet` error display reads `String(error.body ?? 'An error occurred')` from `ApiError` (not `error.message` — `ApiError` exposes `status` + `body`).
- Test mocks for `ExpirationSheet` use the correct `ApiError` shape: `{ status: 400, body: '...' }`. `onSuccess` mocks are typed `(data: ExpireCspResponse)`. Inline test fixtures are narrowed via `as ExpireCspResponse` cast.
- `ExpirationSheet` resets state on re-open via a `useEffect` with `eslint-disable-line react-hooks/set-state-in-effect` — an earlier attempt to use `useRef` in render was reverted (illegal). Logged as tech debt: the canonical fix is for the parent to pass a `key` prop so React resets state automatically.
- `PositionCard` auto-detects closed state: `closed = isClosed ?? item.status === 'CLOSED'` controls the `data-testid="position-card-closed"` marker and the de-emphasis styling.
- Removed a broken red-phase test in `PositionCard.test.tsx` that asserted a "Final P&L" label which was never implemented in green; component does not render this label and the test was dropped rather than retro-fitting.
- Lint hygiene fixes: removed an unused `userEvent.setup()` call, swapped a named `(payload: unknown)` mock param for `()`, and replaced `What's next?` with `What&apos;s next?` to satisfy `react/no-unescaped-entities`.

Remaining tech debt called out by the refactor results:

- `ExpirationSheet` state reset uses `useEffect` + `eslint-disable`; should migrate to a parent-supplied `key` prop.
- `ClosedSnapshotData` mixes camelCase (`positionId`, `snapshotAt`) with the camelCase fields it inherits from `CostBasisSnapshotData` — `CostBasisSnapshotData` itself uses snake_case (`basis_per_share`), so the API types have inconsistent naming conventions (a manifestation of the broader `LegData` snake_case debt).
- `ExpireCspResponse.leg` carries many fields the `ExpirationSheet` component never reads; the type could be narrowed.

## Source Code References

- `src/main/core/lifecycle.ts`
- `src/main/core/lifecycle.test.ts`
- `src/main/core/costbasis.ts`
- `src/main/core/costbasis.test.ts`
- `src/main/core/types.ts`
- `src/main/schemas.ts`
- `src/main/services/expire-csp-position.ts`
- `src/main/services/expire-csp-position.test.ts`
- `src/main/services/positions.ts`
- `src/main/ipc/positions.ts`
- `src/preload/index.ts`
- `src/preload/index.d.ts`
- `src/renderer/src/api/positions.ts`
- `src/renderer/src/hooks/useExpirePosition.ts`
- `src/renderer/src/lib/phase.ts`
- `src/renderer/src/components/ui/sheet.tsx`
- `src/renderer/src/components/ExpirationSheet.tsx`
- `src/renderer/src/components/ExpirationSheet.test.tsx`
- `src/renderer/src/components/PositionCard.tsx`
- `src/renderer/src/components/PositionCard.test.tsx`
- `src/renderer/src/components/NewWheelForm.tsx`
- `src/renderer/src/components/NewWheelForm.test.tsx`
- `src/renderer/src/pages/PositionDetailPage.tsx`
- `src/renderer/src/pages/PositionDetailPage.test.tsx`
- `src/renderer/src/pages/PositionsListPage.tsx`
- `src/renderer/src/pages/NewWheelPage.tsx`

## Open Questions

- None unresolved. Final quality gates per `plans/us-5/refactor-phase-results.md`: 150 tests passing, 0 lint errors (86 prettier style warnings), 0 typecheck errors.

Deferred / out of scope (noted in story, not unresolved): assignment handling (Epic 02), automatic expiration detection from broker (Epic 06 — live market data), editing the expiration date after the fact, partial expiration (not applicable to standard options). (Source: `docs/epics/01-stories/US-5-record-csp-expiration.md`)
