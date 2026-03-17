# Implementation Plan: US-6 — Record CSP Assignment

## Summary

Implement the full assignment flow that transitions a `CSP_OPEN` position to `HOLDING_SHARES` when the trader records a broker assignment. Work spans a DB migration (rename `option_type` → `instrument_type`, add `STOCK` value), two core engine additions, a new service, IPC handler, preload binding, renderer API/hook, and a right-side `AssignmentSheet` component. Done state: a trader can open the assignment sheet from the position detail page, confirm a date, and see the position transition to HOLDING_SHARES with the correct cost basis and the strategic nudge.

## Supporting Documents

- **User Story & Acceptance Criteria:** `docs/epics/02-stories/US-6-record-csp-assignment.md`
- **Research & Design Decisions:** `plans/us-6/research.md`
- **Data Model & Validation Rules:** `plans/us-6/data-model.md`
- **API Contract:** `plans/us-6/contracts/assign-csp.md`
- **Quickstart & Verification:** `plans/us-6/quickstart.md`
- **Mockup:** `mockups/us-6-record-csp-assignment.mdx`

## Prerequisites

US-1 through US-5 complete. All existing tests passing. The `ASSIGN` leg role and `HOLDING_SHARES` phase are already defined in `src/main/core/types.ts` and `migrations/001_initial_schema.sql`.

---

## Implementation Areas

### 1. DB Migration — rename `option_type` → `instrument_type`

**Files to create or modify:**
- `migrations/003_rename_option_type_to_instrument_type.sql` — new migration

**Red — tests to write:**
- In `src/main/db/migrate.test.ts` (or the existing migration integration test): assert that after running all migrations, a row inserted into `legs` with `instrument_type = 'STOCK'` is accepted, and that `instrument_type = 'BOND'` is rejected by the CHECK constraint.
- Assert that the `option_type` column no longer exists after migration.

**Green — implementation:**
- Write `migrations/003_rename_option_type_to_instrument_type.sql`:
  - If SQLite ≥ 3.25.0: `ALTER TABLE legs RENAME COLUMN option_type TO instrument_type;` followed by a CHECK constraint update via table rebuild.
  - The table rebuild approach (always safe): create `legs_new` with the new column name and constraint `instrument_type IN ('PUT','CALL','STOCK')`, copy data, drop old table, rename new.
- No application code changes in this area — just the SQL file.

**Refactor — cleanup to consider:**
- Confirm the migration runner picks up `003_` correctly by checking naming conventions of existing files.

**Acceptance criteria covered:**
- Foundational: enables the `STOCK` instrument type required by the assignment leg.

---

### 2. Core type extensions (`src/main/core/types.ts` + downstream references)

**Files to create or modify:**
- `src/main/core/types.ts` — rename `OptionType` → `InstrumentType`, add `'STOCK'`; add `'ASSIGN'` to `LegAction`
- `src/main/schemas.ts` — rename `optionType: OptionType` → `instrumentType: InstrumentType` in `LegRecord`
- `src/main/services/expire-csp-position.ts` — update `'PUT'` → still `'PUT'` but column reference `option_type` → `instrument_type` in SQL
- `src/main/services/close-csp-position.ts` — same column rename in SQL
- `src/main/services/positions.ts` (createPosition service) — same column rename in SQL
- `src/main/services/get-position.ts` — update column alias `option_type as optionType` → `instrument_type as instrumentType`
- `src/renderer/src/api/positions.ts` — rename `optionType` → `instrumentType` in `PositionDetail.activeLeg`, `PositionDetail.legs`, and `LegData`

**Red — tests to write:**
- In `src/main/core/types.test.ts` (new or existing): assert `InstrumentType.parse('STOCK')` succeeds; assert `InstrumentType.parse('BOND')` throws; assert `LegAction.parse('ASSIGN')` succeeds.
- In existing `createPosition` integration tests: assert the returned leg has `instrumentType: 'PUT'` (not `optionType`).
- In existing `expireCspPosition` integration tests: assert the returned expire leg has `instrumentType: 'PUT'`.

**Green — implementation:**
- In `src/main/core/types.ts`:
  - Rename `OptionType` to `InstrumentType`, add `'STOCK'` to the enum values.
  - Export `InstrumentType` type alias.
  - Add `'ASSIGN'` to `LegAction` enum.
- Update all `import { OptionType }` → `import { InstrumentType }` references.
- In every service SQL INSERT for legs, rename the column `option_type` → `instrument_type`.
- In `getPosition` service, update the SELECT alias.
- In `src/main/schemas.ts` `LegRecord`, rename the field `optionType: OptionType` → `instrumentType: InstrumentType`.

**Refactor — cleanup to consider:**
- Search for any remaining `optionType` / `option_type` / `OptionType` references via grep and confirm all are updated.

**Acceptance criteria covered:**
- Foundational: type system correctness required by all subsequent areas.

---

### 3. Lifecycle engine — `recordAssignment()`

**Files to create or modify:**
- `src/main/core/lifecycle.ts` — add `RecordAssignmentInput`, `RecordAssignmentResult`, `recordAssignment()`

**Red — tests to write:**
- In `src/main/core/lifecycle.test.ts`:
  - `recordAssignment returns HOLDING_SHARES for valid CSP_OPEN input`
  - `recordAssignment throws invalid_phase when currentPhase is HOLDING_SHARES`
  - `recordAssignment throws invalid_phase when currentPhase is CC_OPEN`
  - `recordAssignment throws date_before_open when assignmentDate is before openFillDate`
  - `recordAssignment succeeds when assignmentDate is a future date (no error thrown)`
  - `recordAssignment succeeds when assignmentDate equals openFillDate (boundary — valid)`

**Green — implementation:**
- Add `RecordAssignmentInput` interface: `{ currentPhase: WheelPhase, assignmentDate: string, openFillDate: string }`
- Add `RecordAssignmentResult` interface: `{ phase: 'HOLDING_SHARES' }`
- Add `recordAssignment(input: RecordAssignmentInput): RecordAssignmentResult`:
  - Throw `ValidationError('__phase__', 'invalid_phase', 'Assignment can only be recorded on a CSP_OPEN position')` if `currentPhase !== 'CSP_OPEN'`
  - Throw `ValidationError('assignmentDate', 'date_before_open', 'Assignment date cannot be before the CSP open date')` if `assignmentDate < openFillDate`
  - Return `{ phase: 'HOLDING_SHARES' }`

**Refactor — cleanup to consider:**
- Confirm date comparison uses string ISO comparison (consistent with `closeCsp` and `expireCsp`).

**Acceptance criteria covered:**
- AC: "Reject assignment if position is not in CSP_OPEN phase"
- AC: "Reject assignment date before the CSP open date"

---

### 4. Cost basis engine — `calculateAssignmentBasis()`

**Files to create or modify:**
- `src/main/core/costbasis.ts` — add `AssignmentBasisLeg`, `AssignmentBasisInput`, `AssignmentBasisResult`, `calculateAssignmentBasis()`

**Red — tests to write:**
- In `src/main/core/costbasis.test.ts`:
  - `calculateAssignmentBasis: single CSP leg, $180 strike, $3.50 premium → basisPerShare=$176.50, sharesHeld=100`
  - `calculateAssignmentBasis: CSP + roll, $175 strike, $2.00 + $1.50 → basisPerShare=$171.50, sharesHeld=100`
  - `calculateAssignmentBasis: 2 contracts, $180 strike, $3.50 premium → basisPerShare=$176.50, sharesHeld=200`
  - `calculateAssignmentBasis: waterfall has one entry per premiumLeg, labeled correctly (CSP_OPEN → "CSP premium", ROLL_TO → "Roll credit")`
  - `calculateAssignmentBasis: totalPremiumCollected = sum(premiumPerContract × contracts × 100) across all premium legs`

**Green — implementation:**
- Add interfaces per `plans/us-6/data-model.md`.
- `calculateAssignmentBasis(input: AssignmentBasisInput): AssignmentBasisResult`:
  - `sharesHeld = input.contracts * 100`
  - For each `premiumLeg`, compute label: `legRole === 'ROLL_TO' ? 'Roll credit' : 'CSP premium'`
  - `basisPerShare = strike − Σ(premiumPerContract)` (Decimal arithmetic, `ROUND_HALF_UP`, 4dp)
  - `totalPremiumCollected = Σ(premiumPerContract × leg.contracts × 100)` (4dp)
  - `premiumWaterfall = premiumLegs.map(leg => ({ label, amount: leg.premiumPerContract }))`

**Refactor — cleanup to consider:**
- All arithmetic via `decimal.js`; no native float operations.

**Acceptance criteria covered:**
- AC: "Effective cost basis displays as $176.50 per share"
- AC: "Cost basis accounts for all CSP premiums including rolls"
- AC: "Summary card shows the full premium waterfall"

---

### 5. IPC schemas — `AssignCspPayloadSchema` and `AssignCspPositionResult`

**Files to create or modify:**
- `src/main/schemas.ts` — add `AssignCspPayloadSchema`, `AssignCspPositionResult`

**Red — tests to write:**
- In a schema unit test (or inline in service tests):
  - `AssignCspPayloadSchema.parse({ positionId: validUuid, assignmentDate: '2026-01-17' })` succeeds
  - `AssignCspPayloadSchema.parse({ positionId: 'not-a-uuid', assignmentDate: '2026-01-17' })` throws
  - `AssignCspPayloadSchema.parse({ positionId: validUuid })` (missing date) throws

**Green — implementation:**
- `AssignCspPayloadSchema`: per `plans/us-6/contracts/assign-csp.md`.
- `AssignCspPositionResult` interface: per `plans/us-6/data-model.md`.

**Refactor — cleanup to consider:**
- Check for duplication and naming consistency with `CloseCspPositionResult` and `ExpireCspPositionResult`.

**Acceptance criteria covered:**
- Foundational: schema validation is the first line of defence for all IPC calls.

---

### 6. Service — `assignCspPosition()`

**Files to create or modify:**
- `src/main/services/assign-csp-position.ts` — new file
- `src/main/services/positions.ts` (barrel) — add `assignCspPosition` export if using barrel pattern; otherwise import directly in IPC handler

**Red — tests to write:**
- In `src/main/services/assign-csp-position.test.ts`:
  - `successfully assigns a CSP_OPEN position: inserts ASSIGN leg, updates phase to HOLDING_SHARES, inserts snapshot, returns correct result`
  - `returns correct premiumWaterfall from all CSP and roll legs`
  - `throws not_found when positionId does not exist`
  - `throws invalid_phase when position is HOLDING_SHARES`
  - `throws date_before_open when assignmentDate before openFillDate`
  - `activeLeg is null in getPosition after assignment (ASSIGN leg not surfaced as activeLeg)`

**Green — implementation:**
- `assignCspPosition(db, positionId, payload)`:
  1. Call `getPosition(db, positionId)` — throw `not_found` if null.
  2. Collect `premiumLegs` from all legs where `leg_role IN ('CSP_OPEN', 'ROLL_TO')`.
  3. Call `recordAssignment({ currentPhase, assignmentDate, openFillDate: openLeg.fillDate })`.
  4. Call `calculateAssignmentBasis({ strike: openLeg.strike, contracts: openLeg.contracts, premiumLegs })`.
  5. In a `db.transaction()`:
     - INSERT leg with `leg_role='ASSIGN'`, `action='ASSIGN'`, `instrument_type='STOCK'`, `premium_per_contract='0.0000'`, `fill_price=NULL`, `fill_date=assignmentDate`.
     - UPDATE position: `phase='HOLDING_SHARES'`, `updated_at=now`. (Do NOT set `status='CLOSED'` or `closed_date`.)
     - INSERT cost_basis_snapshot: `basis_per_share`, `total_premium_collected`, `final_pnl=NULL`.
  6. Log `logger.info({ positionId, phase: 'HOLDING_SHARES' }, 'position_assigned')`.
  7. Return `AssignCspPositionResult` per `plans/us-6/data-model.md`.

**Refactor — cleanup to consider:**
- Confirm the transaction follows the same `db.transaction(() => { ... })()` invocation pattern as `expireCspPosition`.

**Acceptance criteria covered:**
- AC: "Successfully record an assignment — position transitions to HOLDING_SHARES"
- AC: "A stock_assignment leg is recorded with fill_date '2026-01-17'"
- AC: "100 shares held at assignment strike $180.00"

---

### 7. IPC handler — `positions:assign-csp`

**Files to create or modify:**
- `src/main/ipc/positions.ts` — add handler registration

**Red — tests to write:**
- IPC integration test (or service-level test already covers most paths; add an IPC-level test if the project has an IPC test harness):
  - `positions:assign-csp with valid payload returns ok:true and phase HOLDING_SHARES`
  - `positions:assign-csp with missing assignmentDate returns ok:false with Zod parse error`
  - `positions:assign-csp with non-UUID positionId returns ok:false`

**Green — implementation:**
- Register in `registerPositionsHandlers`:
  ```typescript
  ipcMain.handle('positions:assign-csp', (_, payload: unknown) =>
    handleIpcCall('positions_assign_csp_unhandled_error', () => {
      const parsed = AssignCspPayloadSchema.parse(payload)
      return assignCspPosition(db, parsed.positionId, parsed)
    })
  )
  ```
- Import `AssignCspPayloadSchema` from `'../schemas'` and `assignCspPosition` from `'../services/assign-csp-position'`.

**Refactor — cleanup to consider:**
- Check for duplication and naming consistency with `positions:expire-csp` handler.

**Acceptance criteria covered:**
- Foundational: exposes the backend capability to the renderer.

---

### 8. Preload — `assignPosition`

**Files to create or modify:**
- `src/preload/index.ts` — add `assignPosition`

**Red — tests to write:**
- No dedicated unit test needed; covered by E2E. Verify via TypeScript: `window.api.assignPosition` must be callable with `{ positionId, assignmentDate }`.

**Green — implementation:**
- Add to the `api` object:
  ```typescript
  assignPosition: (payload: unknown) => ipcRenderer.invoke('positions:assign-csp', payload)
  ```

**Refactor — cleanup to consider:**
- Confirm `preload/index.d.ts` (or equivalent type declaration) is updated so the renderer's `window.api` type includes `assignPosition`.

**Acceptance criteria covered:**
- Foundational: bridges preload to IPC channel.

---

### 9. Renderer API adapter — `assignPosition()`

**Files to create or modify:**
- `src/renderer/src/api/positions.ts` — add `AssignCspPayload`, `AssignCspResponse` types and `assignPosition()` function; add `assignmentDate` to `IPC_TO_FORM_FIELD`

**Red — tests to write:**
- No dedicated unit test; covered by hook and E2E tests. TypeScript typecheck confirms shape correctness.

**Green — implementation:**
- Add `AssignCspPayload = { position_id: string; assignment_date: string }` type.
- Add `AssignCspResponse` type per `plans/us-6/contracts/assign-csp.md`.
- Add `assignmentDate: 'assignment_date'` to `IPC_TO_FORM_FIELD`.
- Add `async function assignPosition(payload: AssignCspPayload): Promise<AssignCspResponse>` — follows the same pattern as `expirePosition`.

**Refactor — cleanup to consider:**
- Check for duplication and naming consistency with `expirePosition`.

**Acceptance criteria covered:**
- Foundational: renderer-side API contract.

---

### 10. Hook — `useAssignPosition()`

**Files to create or modify:**
- `src/renderer/src/hooks/useAssignPosition.ts` — new file

**Red — tests to write:**
- No dedicated unit test needed; the hook follows the same pattern as `useExpirePosition`. TypeScript typecheck + E2E cover correctness.

**Green — implementation:**
- Mirror `src/renderer/src/hooks/useExpirePosition.ts` exactly, substituting `assignPosition` for `expirePosition` and the corresponding types.
- On success, call `queryClient.invalidateQueries({ queryKey: positionQueryKeys.all })`.
- Accept optional `onSuccess` callback that receives `AssignCspResponse`.

**Refactor — cleanup to consider:**
- Check for duplication and naming consistency with `useExpirePosition`.

**Acceptance criteria covered:**
- Foundational: mutation hook consumed by the AssignmentSheet component.

---

### 11. AssignmentSheet component

**Files to create or modify:**
- `src/renderer/src/components/AssignmentSheet.tsx` — new file

The component is a 400px right-side sheet rendered via `createPortal` to `document.body` (identical to `ExpirationSheet`). It has two internal states: the form state and the success state.

**Red — tests to write:**
- In `src/renderer/src/components/AssignmentSheet.test.tsx` (Vitest + React Testing Library):
  - `renders the summary card with premium waterfall lines when open`
  - `shows phase transition badges: CSP_OPEN → HOLDING_SHARES`
  - `shows shares to receive as contracts × 100`
  - `shows Confirm Assignment button enabled with a valid date`
  - `shows red inline error "Assignment date is required" when submitted with no date`
  - `shows red inline error "Assignment date cannot be before the CSP open date" for a date before openFillDate`
  - `shows gold soft warning "This date is in the future — are you sure?" for a future date; Confirm Assignment button remains enabled`
  - `calls onClose when Cancel is clicked`
  - `renders success state with hero card "HOLDING 100 SHARES" and effective cost basis after mutation succeeds`
  - `success state shows strategic nudge text about waiting 1–3 days`
  - `success state shows "Open Covered Call" CTA button`

**Green — implementation:**

Component props:
```typescript
interface AssignmentSheetProps {
  open: boolean
  positionId: string
  ticker: string
  strike: string
  expiration: string
  contracts: number
  openFillDate: string       // for date_before_open validation
  premiumWaterfall: Array<{ label: string; amount: string }>
  projectedBasisPerShare: string
  onClose: () => void
}
```

**Form state** (mirrors mockup `form`, `validation-error`, `date-before-open`, `future-date-warning` states):
- Sheet header: eyebrow "Record Assignment", title "Assign CSP to Shares", subtitle "PUT $[strike] · [expiration]", close (×) button.
- Summary card: rows for Position, Contracts, Shares to receive (`contracts × 100`, gold), Phase transition (CSP_OPEN badge → HOLDING_SHARES badge).
- Cost Basis Calculation waterfall subsection (dark background within the card): "Assignment strike" row, one "− [label]" row per `premiumWaterfall` entry (amounts in green), separator line, "= Effective cost basis" row (gold, larger text).
- Total basis footer row: "per share · [sharesHeld] shares total" / "$[total] total basis".
- Assignment Date field: `<input type="date">` or date picker. Client-side validation:
  - Missing → red error "Assignment date is required" (block submission)
  - Before `openFillDate` → red error "Assignment date cannot be before the CSP open date" (block submission)
  - After today → gold warning "This date is in the future — are you sure?" (allow submission)
- Irrevocable warning callout (gold border): "This cannot be undone. The position will transition to Holding Shares. Full leg history is preserved."
- Footer: Cancel (outline), Confirm Assignment (gold). Confirm disabled while `isPending`.

**Success state** (mirrors mockup `success` state):
- Sheet header: eyebrow "Complete" (gold), title "[ticker] Assigned".
- Hero card (gold gradient): "HOLDING [sharesHeld] SHARES" headline; "[ticker] · [contracts] contract assigned at $[strike]" subtitle; "Effective Cost Basis $[basisPerShare] per share" inline badge (gold on dark).
- Result summary card: "Leg recorded" → "assign · [fmtDate(assignmentDate)]" (gold), "Phase" → HOLDING_SHARES badge, "Shares held" → sharesHeld (gold), "Effective cost basis" → "$[basisPerShare] / share".
- Strategic nudge: blue-tinted callout (blue border, `rgba(88,166,255,0.06)` background), 💡 icon, text: "Many traders wait **1–3 days** for a bounce before selling the first covered call — avoid locking in a low strike right after assignment."
- "What's next?" label (muted uppercase).
- "Open Covered Call on [ticker] →" button (gold, full width) — navigates to the open CC route.
- "View full position history" ghost link (calls `onClose`).
- No footer buttons in success state.

**Refactor — cleanup to consider:**
- Extract shared inline styles (panel chrome, summary row, eyebrow) into shared constants consistent with `ExpirationSheet` — only if extraction avoids meaningful duplication.

**Acceptance criteria covered:**
- AC: "Summary card shows the full premium waterfall"
- AC: "Future assignment date shows a soft warning but remains submittable"
- AC: "Reject submission when assignment date is missing"
- AC: "Success state shows strategic nudge before CC CTA"

---

### 12. PositionDetailPage — add "Record Assignment →" button

**Files to create or modify:**
- `src/renderer/src/pages/PositionDetailPage.tsx` — add `showAssignment` state, "Record Assignment →" button, `AssignmentSheet` mount

**Red — tests to write:**
- In `src/renderer/src/pages/PositionDetailPage.test.tsx` (or relevant component test):
  - `shows "Record Assignment →" button when phase is CSP_OPEN`
  - `does not show "Record Assignment →" button when phase is HOLDING_SHARES`
  - `opens AssignmentSheet when "Record Assignment →" is clicked`
  - `blurs and disables the detail page content when AssignmentSheet is open (same pattern as ExpirationSheet)`

**Green — implementation:**
- Add `const [showAssignment, setShowAssignment] = useState(false)` alongside `showExpiration`.
- In the `right` slot of `PageHeader`, add a second button when `position.phase === 'CSP_OPEN'`:
  ```tsx
  <button
    data-testid="record-assignment-btn"
    className="wb-teal-button"
    onClick={() => setShowAssignment(true)}
    style={{ ... }}
  >
    Record Assignment →
  </button>
  ```
- Apply the same blur/opacity style to `<main>` when `showAssignment` is true (alongside the existing `showExpiration` check).
- Mount `<AssignmentSheet>` when `showAssignment && activeLeg && costBasisSnapshot` — pass `premiumWaterfall` and `projectedBasisPerShare` from position data. These values come from the `GetPositionResult`; the `getPosition` service may need to calculate and return the waterfall, or the page can derive it from the `legs` array. See note below.
- Pass `onClose={() => setShowAssignment(false)}`.

> **Note on waterfall data source:** The `AssignmentSheet` needs the premium waterfall to render the form state before the assignment is submitted. The `getPosition` service already returns `legs: LegRecord[]`. The page can filter `legs` for `CSP_OPEN` and `ROLL_TO` roles and build the `premiumWaterfall` prop inline (a pure map — acceptable in the page layer since it's a display transform, not business logic). Alternatively, the `getPosition` service can return a pre-computed waterfall. Either approach is acceptable; document the choice in code comments.

**Refactor — cleanup to consider:**
- Check whether the `showExpiration` and `showAssignment` blur conditions can be combined cleanly.

**Acceptance criteria covered:**
- AC: "Reject assignment if position is not in CSP_OPEN phase" (button only visible when CSP_OPEN)
- AC: "Successfully record an assignment — position transitions to HOLDING_SHARES"

---

### 13. E2E Tests

**Files to create or modify:**
- `e2e/csp-assignment.spec.ts` — new file

**Red — tests to write (one test per AC):**

Each test creates a fresh in-memory DB via a temp file and opens the Electron app. Use the `openPosition` helper from `e2e/position-management.spec.ts` (or extract to a shared helper) to seed a `CSP_OPEN` position before exercising the assignment flow.

- **AC 1 — "Successfully record an assignment":**
  `records an assignment: position transitions to HOLDING_SHARES, 100 shares, correct cost basis, leg recorded`
  - Open a position (strike $180, premium $3.50, 1 contract).
  - Navigate to position detail, click "Record Assignment →".
  - Sheet opens, enter date "2026-01-17", click "Confirm Assignment".
  - Assert success hero card shows "HOLDING 100 SHARES".
  - Assert phase badge in header shows "Holding" (HOLDING_SHARES).

- **AC 2 — "Summary card shows the full premium waterfall":**
  `assignment form shows premium waterfall with strike, CSP premium line, and effective cost basis`
  - Open a position (strike $180, premium $3.50).
  - Click "Record Assignment →".
  - Assert summary card contains "Assignment strike" row with "$180.00".
  - Assert summary card contains "− CSP premium" row with "$3.50".
  - Assert summary card contains "= Effective cost basis" with "$176.50".

- **AC 3 — "Cost basis accounts for all CSP premiums including rolls":**
  `assignment cost basis includes roll credits in the waterfall`
  - This AC requires a rolled position. If roll functionality (US-4/US-5) is already present: open a position, record a roll, then trigger assignment; assert waterfall shows two deduction lines and the correct basis.
  - If roll is not yet e2e-testable: mark as `it.todo` with a note to enable after US-4/5 e2e coverage is complete.

- **AC 4 — "Future assignment date shows soft warning but remains submittable":**
  `entering a future date shows gold warning and keeps Confirm Assignment enabled`
  - Open a position, click "Record Assignment →".
  - Enter a date one year in the future.
  - Assert gold warning text "This date is in the future — are you sure?" is visible.
  - Assert "Confirm Assignment" button is enabled (not disabled).

- **AC 5 — "Reject submission when assignment date is missing":**
  `submitting without a date shows validation error "Assignment date is required"`
  - Open a position, click "Record Assignment →".
  - Click "Confirm Assignment" without entering a date.
  - Assert red error text "Assignment date is required" is visible.
  - Assert position phase is still "Put Open" (CSP_OPEN) — no transition occurred.

- **AC 6 — "Reject assignment date before the CSP open date":**
  `submitting with a date before the CSP open date shows error`
  - Open a position (fill date today).
  - Click "Record Assignment →".
  - Enter a date one year in the past.
  - Assert red error "Assignment date cannot be before the CSP open date" is visible.
  - Assert no phase transition occurred.

- **AC 7 — "Reject assignment if position is not in CSP_OPEN phase":**
  `Record Assignment button is not visible when position is in HOLDING_SHARES phase`
  - Record a successful assignment (reuse AC 1 flow).
  - After success, close the sheet.
  - Assert "Record Assignment →" button is not present in the position detail header.

- **AC 8 — "Success state shows strategic nudge before CC CTA":**
  `success state shows strategic nudge and Open Covered Call CTA`
  - Record a successful assignment.
  - Assert nudge text "Many traders wait 1–3 days for a bounce" is visible in the success sheet.
  - Assert "Open Covered Call on AAPL" button is visible below the nudge.

**Acceptance criteria covered:**
- All 8 ACs from `docs/epics/02-stories/US-6-record-csp-assignment.md`
