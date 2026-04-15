# Implementation Plan: US-5 — Record a CSP Expiring Worthless

## Summary

Adds the expiration-worthless path to the wheel lifecycle. A trader with a `CSP_OPEN` position on or after the expiration date clicks "Record Expiration →" in the position detail header, confirms in a right-side sheet, and the wheel transitions to `WHEEL_COMPLETE` with 100% premium captured. A post-success shortcut navigates to the New Wheel form with the ticker pre-filled to start the next cycle.

## Supporting Documents

- **User Story & Acceptance Criteria:** `docs/epics/01-stories/US-5-record-csp-expiration.md`
- **Research & Design Decisions:** `plans/us-5/research.md`
- **Data Model & Selection Logic:** `plans/us-5/data-model.md`
- **API Contract:** `plans/us-5/contracts/expire-csp.md`
- **Quickstart & Verification:** `plans/us-5/quickstart.md`

## Prerequisites

- US-1 complete: `positions`, `legs`, `cost_basis_snapshots` tables exist; `createPosition` service exists
- US-3 complete: `PositionDetailPage` exists with `activeLeg` and `costBasisSnapshot` display
- `WheelPhase`, `LegRole`, `LegAction` enums defined in `src/main/core/types.ts`
- `closeCsp`, `calculateCspClose` patterns in `lifecycle.ts` and `costbasis.ts` are the direct analogues to follow

---

## Implementation Areas

### 1. Lifecycle Engine: `expireCsp`

**Files to create or modify:**

- `src/main/core/lifecycle.ts` — add `ExpireCspInput`, `ExpireCspResult`, `expireCsp` function

**Red — tests to write** (`src/main/core/lifecycle.test.ts`):

- `expireCsp` with `currentPhase: 'CSP_OPEN'` and `referenceDate >= expirationDate` returns `{ phase: 'WHEEL_COMPLETE' }`
- `expireCsp` with `currentPhase: 'CSP_CLOSED_PROFIT'` throws `ValidationError` with `field='__phase__'`, `code='invalid_phase'`
- `expireCsp` with `referenceDate` one day before `expirationDate` throws `ValidationError` with `field='expiration'`, `code='too_early'`
- `expireCsp` with `referenceDate === expirationDate` (same day) succeeds — boundary case from AC: "Allow expiration on the expiration date itself"

**Green — implementation:**

- `ExpireCspInput`: `{ currentPhase: WheelPhase; expirationDate: string; referenceDate: string }`
- `ExpireCspResult`: `{ phase: 'WHEEL_COMPLETE' }`
- `expireCsp(input: ExpireCspInput): ExpireCspResult` — validates `currentPhase === 'CSP_OPEN'` (throws `ValidationError('__phase__', 'invalid_phase', 'Position is not in CSP_OPEN phase')`) then validates `input.referenceDate >= input.expirationDate` (throws `ValidationError('expiration', 'too_early', 'Cannot record expiration before the expiration date')`) then returns `{ phase: 'WHEEL_COMPLETE' }`

**Refactor — cleanup to consider:**

- Check if the date comparison can share a helper with `closeCsp` date validation

**Acceptance criteria covered:**

- "Reject expiration when position is not in CSP_OPEN phase"
- "Reject expiration before expiration date"
- "Allow expiration on the expiration date itself"

---

### 2. Cost Basis Engine: `calculateCspExpiration`

**Files to create or modify:**

- `src/main/core/costbasis.ts` — add `CspExpirationInput`, `CspExpirationResult`, `calculateCspExpiration` function

**Red — tests to write** (`src/main/core/costbasis.test.ts`):

- `calculateCspExpiration({ openPremiumPerContract: '2.50', contracts: 1 })` returns `{ finalPnl: '250.0000', pnlPercentage: '100.0000' }`
- `calculateCspExpiration({ openPremiumPerContract: '1.35', contracts: 3 })` returns `{ finalPnl: '405.0000', pnlPercentage: '100.0000' }`
- Verify Decimal.js 4dp rounding with an edge-case premium like `'0.005'` and `contracts: 1` → `finalPnl: '0.5000'`

**Green — implementation:**

- `CspExpirationInput`: `{ openPremiumPerContract: string; contracts: number }`
- `CspExpirationResult`: `{ finalPnl: string; pnlPercentage: string }`
- `calculateCspExpiration(input): CspExpirationResult` — `finalPnl = round4(premium × contracts × 100).toFixed(4)`, `pnlPercentage = '100.0000'`

**Refactor — cleanup to consider:**

- `pnlPercentage` is a constant 100 here; keep it explicit and not derived to avoid future confusion

**Acceptance criteria covered:**

- "the cost basis snapshot shows final_pnl of $250.00"
- "the total premium captured shows 100%"

---

### 3. Type Update: Add `'EXPIRE'` to `LegAction`

**Files to create or modify:**

- `src/main/core/types.ts` — add `'EXPIRE'` to `LegAction` enum

**Red — tests to write:**

- No separate test needed; the TypeScript type change is exercised by the service layer tests in area 4 — if `action: 'EXPIRE'` is typed incorrectly, typecheck will fail

**Green — implementation:**

- Change `export const LegAction = z.enum(['SELL', 'BUY'])` to `z.enum(['SELL', 'BUY', 'EXPIRE'])`

**Refactor — cleanup to consider:**

- Verify `LegAction` usage in the renderer (e.g. any switch or display-mapping on action values) handles the new value without exhaustiveness errors

**Acceptance criteria covered:**

- "An expire leg is recorded with action "expire" and no fill_price"

---

### 4. Schema: `ExpireCspPayload` and `ExpireCspPositionResult`

**Files to create or modify:**

- `src/main/schemas.ts` — add `ExpireCspPayloadSchema`, `ExpireCspPayload`, `ExpireCspPositionResult`

**Red — tests to write:**

- No direct tests; Zod schema correctness is verified by the IPC handler parsing in the service test (area 5)

**Green — implementation:**

- `ExpireCspPayloadSchema = z.object({ positionId: z.string().uuid(), expirationDateOverride: z.string().optional() })`
- `ExpireCspPayload = z.infer<typeof ExpireCspPayloadSchema>`
- `ExpireCspPositionResult` interface: `{ position: { id, ticker, phase: 'WHEEL_COMPLETE', status: 'CLOSED', closedDate: string }, leg: LegRecord, costBasisSnapshot: CostBasisSnapshotRecord & { finalPnl: string } }`

**Refactor — cleanup to consider:**

- The result shape matches `CloseCspPositionResult` closely — check if a shared base type is warranted or if the minor differences make it cleaner to keep them separate

**Acceptance criteria covered:**

- N/A (prerequisite for service layer)

---

### 5. Service Layer: `expireCspPosition`

**Files to create or modify:**

- `src/main/services/expire-csp-position.ts` — new file, `expireCspPosition` function
- `src/main/services/positions.ts` — add `export { expireCspPosition } from './expire-csp-position'`

**Red — tests to write** (`src/main/services/expire-csp-position.test.ts`):

- Set up an in-memory SQLite DB with migrations; create a position via `createPosition`
- Test: calling `expireCspPosition` with valid positionId and `referenceDate = expiration date` writes the expire leg (`leg_role='EXPIRE'`, `action='EXPIRE'`, `fill_price=null`, `fill_date=expiration`), updates position to `phase='WHEEL_COMPLETE'`, `status='CLOSED'`, `closed_date=expiration date`, inserts a new cost_basis_snapshot with `final_pnl = total_premium_collected`
- Test: returns correct `ExpireCspPositionResult` shape with all fields
- Test: throws `ValidationError` with `code='not_found'` when positionId doesn't exist
- Test: throws `ValidationError` with `code='invalid_phase'` when position is not `CSP_OPEN` (set up a closed position)
- Test: throws `ValidationError` with `code='too_early'` when referenceDate is before expiration

**Green — implementation:**

- Follows `close-csp-position.ts` pattern exactly
- `expireCspPosition(db, positionId, payload)`:
  1. Derive `referenceDate` from `payload.expirationDateOverride ?? new Date().toISOString().slice(0, 10)`
  2. Call `getPosition(db, positionId)` — throw `not_found` if null
  3. Read `openLeg = positionDetail.activeLeg` — throw `no_active_leg` if null
  4. Call `expireCsp({ currentPhase: position.phase, expirationDate: openLeg.expiration, referenceDate })`
  5. Call `calculateCspExpiration({ openPremiumPerContract: openLeg.premiumPerContract, contracts: openLeg.contracts })`
  6. DB transaction: INSERT expire leg (see data-model.md for column values), UPDATE position (`phase='WHEEL_COMPLETE'`, `status='CLOSED'`, `closed_date=openLeg.expiration`), INSERT cost_basis_snapshot (`final_pnl=calcResult.finalPnl`, snapshot copies `basis_per_share` and `total_premium_collected` from `openSnapshot`)
  7. Log `logger.info({ positionId, finalPnl }, 'position_expired')`
  8. Return `ExpireCspPositionResult`

**Refactor — cleanup to consider:**

- The expire and close services are very similar — check if the DB transaction blocks share enough logic to extract a helper; only extract if the duplication is genuine and extraction doesn't add indirection

**Acceptance criteria covered:**

- "the position phase changes to WHEEL_COMPLETE"
- "the position status changes to closed"
- "An expire leg is recorded with action "expire" and no fill_price"
- "the cost basis snapshot shows final_pnl of $250.00"
- "Successfully record CSP expiration"

---

### 6. IPC Handler + Preload

**Files to create or modify:**

- `src/main/ipc/positions.ts` — add `positions:expire-csp` handler inside `registerPositionsHandlers`
- `src/preload/index.ts` — add `expirePosition` binding

**Red — tests to write:**

- No new test file needed; IPC handlers are thin wrappers. Correctness of the service is covered in area 5. If an IPC integration test file exists, add one case; otherwise skip.

**Green — implementation:**

- In `positions.ts` IPC file: add `ipcMain.handle('positions:expire-csp', (_, payload: unknown) => handleIpcCall('positions_expire_csp_unhandled_error', () => { const parsed = ExpireCspPayloadSchema.parse(payload); return expireCspPosition(db, parsed.positionId, parsed) }))`
- In `preload/index.ts`: add `expirePosition: (payload: unknown) => ipcRenderer.invoke('positions:expire-csp', payload)` to the `api` object

**Refactor — cleanup to consider:**

- Ensure the handler label string `'positions_expire_csp_unhandled_error'` follows the existing naming pattern

**Acceptance criteria covered:**

- N/A (infrastructure for renderer → main communication)

---

### 7. API Adapter + Hook

**Files to create or modify:**

- `src/renderer/src/api/positions.ts` — add `ExpireCspPayload`, `ExpireCspResponse` types; add `expirePosition` function; update `IPC_TO_FORM_FIELD` map if any field names need translation
- `src/renderer/src/hooks/useExpirePosition.ts` — new file, `useExpirePosition` hook
- `src/preload/index.d.ts` — add `expirePosition` to the `api` type declaration (if this file exists)

**Red — tests to write:**

- No unit tests needed for this thin adapter layer; the IPC contract is verified by service layer tests; the component test in area 8 will verify the hook wires correctly

**Green — implementation:**

- `ExpireCspPayload`: `{ position_id: string; expiration_date_override?: string }`
- `ExpireCspResponse`: shape matching `plans/us-5/contracts/expire-csp.md` success response
- `expirePosition(payload: ExpireCspPayload): Promise<ExpireCspResponse>` — calls `window.api.expirePosition({ positionId: payload.position_id, expirationDateOverride: payload.expiration_date_override })`, maps errors via `mapIpcErrors` on failure
- `useExpirePosition`: TanStack Query `useMutation` wrapping `expirePosition`, `onSuccess` invalidates `['positions']` query key

**Refactor — cleanup to consider:**

- Verify `IPC_TO_FORM_FIELD` map — no form fields for this action, so no mapping entries needed

**Acceptance criteria covered:**

- N/A (infrastructure for component → IPC communication)

---

### 8. Install shadcn `Sheet` Component + Build `ExpirationSheet`

**Files to create or modify:**

- `src/renderer/src/components/ui/sheet.tsx` — added via shadcn CLI
- `src/renderer/src/components/ExpirationSheet.tsx` — new file
- `src/renderer/src/components/ExpirationSheet.test.tsx` — new file

**Pre-step — install the Sheet component:**

`components.json` already exists at the project root (created as part of US-5 setup). Run from the project root:

```bash
pnpm dlx shadcn@latest add sheet --yes
```

This installs `@radix-ui/react-dialog` and writes exactly one file: `src/renderer/src/components/ui/sheet.tsx`. It does **not** touch `index.css` or any other existing files. Verified safe with `--dry-run`.

After adding, read `src/renderer/src/components/ui/sheet.tsx` and confirm the exported primitives: `Sheet`, `SheetPortal`, `SheetOverlay`, `SheetContent`, `SheetHeader`, `SheetFooter`, `SheetTitle`, `SheetDescription`, `SheetClose`.

**Red — tests to write** (`ExpirationSheet.test.tsx`):

- Renders nothing when `open={false}`
- With `open={true}` and state `'confirmation'`: `SheetTitle` "Expire CSP Worthless" is present; summary rows visible (Position, Contracts, "Put Open → Complete", "expire · no fill price", Final P&L "+$250.00 (100% captured)"); amber warning "This cannot be undone."; Cancel `Button` and "Confirm Expiration" `Button` both render
- Clicking Cancel calls `onClose`
- `SheetClose` (×) button dismisses the sheet — verify `onClose` is called
- Clicking "Confirm Expiration" calls `mutation.mutate` with `{ position_id: positionId }`
- While `mutation.isPending`: "Confirm Expiration" button is `disabled` and shows "Confirming..."
- On `mutation.isError`: an `Alert` (or styled error div) with the error message from the API renders inside the sheet body
- After success, sheet switches to `'success'` state: `SheetTitle` "{ticker} Expired Worthless" visible; P&L amount "+$250" visible; "Open new wheel on AAPL" button present; "View full position history" link present
- Clicking "Open new wheel on AAPL" calls `navigate('/new?ticker=AAPL')`
- Clicking "View full position history" calls `onClose`

**Green — implementation:**

Based on Screen 2 (confirmation) and Screen 3 (success) from `docs/epics/01-stories/US-5-mockups.html`.

`ExpirationSheet` props:

```typescript
{
  open: boolean
  positionId: string
  ticker: string
  strike: string           // e.g. '180.0000'
  expiration: string       // YYYY-MM-DD
  contracts: number
  totalPremiumCollected: string
  onClose: () => void
}
```

Internal state: `sheetState: 'confirmation' | 'success'`, `successResult: ExpireCspResponse | null`

**Component skeleton:**

```tsx
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter, SheetClose } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'

<Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
  <SheetContent side="right" className="w-[400px] flex flex-col gap-0 p-0">
    <SheetHeader className="px-6 py-5 border-b border-[var(--wb-border)]">
      <p className="...eyebrow styles...">
        {sheetState === 'confirmation' ? 'Record Expiration' : 'Complete'}
      </p>
      <SheetTitle className="...title styles...">
        {sheetState === 'confirmation' ? 'Expire CSP Worthless' : `${ticker} Expired Worthless`}
      </SheetTitle>
      <SheetDescription className="...subtitle styles...">
        {ticker} PUT ${formatStrike(strike)} · {formatDate(expiration)}
      </SheetDescription>
    </SheetHeader>

    <div className="flex-1 overflow-y-auto px-6 py-5">
      {sheetState === 'confirmation' ? <ConfirmationBody ... /> : <SuccessBody ... />}
    </div>

    {sheetState === 'confirmation' && (
      <SheetFooter className="px-6 py-4 border-t border-[var(--wb-border)] flex gap-2.5">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          className="flex-1"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate({ position_id: positionId })}
        >
          {mutation.isPending ? 'Confirming...' : 'Confirm Expiration'}
        </Button>
      </SheetFooter>
    )}
  </SheetContent>
</Sheet>
```

**Shadcn composition rules to follow (from the shadcn skill):**

- `SheetTitle` is required in every `SheetContent` — always present (accessibility)
- No manual `z-index` on the Sheet — `SheetContent` handles its own stacking context
- Use `Button` component from `@/components/ui/button` for all footer and action buttons, not raw `<button>` elements
- Use `cn()` from `@/lib/utils` for conditional class names
- Use semantic color tokens (`text-muted-foreground`, `border`) where they match; fall back to `var(--wb-*)` CSS variables for the project's custom design tokens

**Sheet body — confirmation state** (Screen 2):

- Summary card (styled `div`): rows for Position, Contracts, Phase transition ("Put Open → Complete"), Leg recorded ("expire · no fill price"), Final P&L highlighted row "+${totalPremiumCollected} (100% captured)" with green gradient background
- Amber warning block: "**This cannot be undone.** The position will be closed and marked complete. Full leg history is preserved."
- Error block (red, only if `mutation.isError`): error message from API response

**Sheet body — success state** (Screen 3):

- P&L display block (centered, green): label "Final P&L", large amount "+${finalPnl}", sub-text "100% premium captured · {contracts} contract{s}"
- Summary card: rows Leg recorded ("expire · {expDate}"), Phase ("Complete"), Status ("Closed")
- "What's next?" label (muted, uppercase, small)
- Shortcut button: "Open new wheel on {ticker}" with sub "Ticker pre-filled · continue the cycle" — `onClick={() => navigate('/new?ticker=' + ticker)}`
- Dismiss link: "View full position history" — `onClick={onClose}`

On `mutation.onSuccess(result)`: set `successResult = result`, set `sheetState = 'success'`

**Refactor — cleanup to consider:**

- Extract `SummaryRow` sub-component if the row pattern is used in both confirmation and success bodies
- Verify all `var(--wb-*)` color token references exist in the project's global CSS

**Acceptance criteria covered:**

- "Post-expiration offers shortcut to open new wheel on same ticker"
- "clicking it navigates to the New Wheel form with ticker pre-filled as AAPL"
- All error scenarios surfaced in the sheet before the user can navigate away

---

### 9. `PositionDetailPage` Integration

**Files to create or modify:**

- `src/renderer/src/pages/PositionDetailPage.tsx` — add "Record Expiration →" button and `ExpirationSheet`

**Red — tests to write** (`src/renderer/src/pages/PositionDetailPage.test.tsx`):

- When `position.phase === 'CSP_OPEN'`: "Record Expiration →" button is rendered (use `getByText` or `getByTestId`)
- Clicking "Record Expiration →" renders the `ExpirationSheet` (check for sheet title "Expire CSP Worthless")
- When `position.phase === 'WHEEL_COMPLETE'` and `closedDate` is set: no "Record Expiration →" button; "Closed on {date}" banner visible

**Green — implementation:**

Based on Screen 1 from `docs/epics/01-stories/US-5-mockups.html`:

In `PositionDetailPage`:

1. Add `const [showExpiration, setShowExpiration] = useState(false)` import
2. In the position header area, add action buttons row when `position.phase === 'CSP_OPEN'`:
   - "Record Expiration →" button (teal, `data-testid="record-expiration-btn"`) — `onClick={() => setShowExpiration(true)}`
3. Render `<ExpirationSheet>` when `showExpiration && activeLeg && costBasisSnapshot`:
   - `open={showExpiration}`
   - `positionId={position.id}`
   - `ticker={position.ticker}`
   - `strike={activeLeg.strike}`
   - `expiration={activeLeg.expiration}`
   - `contracts={activeLeg.contracts}`
   - `totalPremiumCollected={costBasisSnapshot.totalPremiumCollected}`
   - `onClose={() => setShowExpiration(false)}`

The existing `CloseCspForm` section remains — the expiration action and the close-early action are separate. In the final UI, both coexist on `CSP_OPEN` (matching Screen 1 which shows "Roll", "Close Early", and "Record Expiration →" buttons in the header).

**Refactor — cleanup to consider:**

- Consider whether the `CloseCspForm` inline section should also move to a sheet for consistency; but do not refactor it unless the story explicitly requires it

**Acceptance criteria covered:**

- "Position disappears from active positions after expiration" (phase badge flips to WHEEL_COMPLETE, closed date shown)
- "the AAPL position shows the WHEEL_COMPLETE phase badge"

---

### 10. `NewWheelPage` / `NewWheelForm`: Pre-fill Ticker from URL

**Files to create or modify:**

- `src/renderer/src/pages/NewWheelPage.tsx` — read `ticker` from search string via `useSearch()`; pass as `defaultTicker` to `NewWheelForm`
- `src/renderer/src/components/NewWheelForm.tsx` — add optional `defaultTicker?: string` prop; pass to `useForm` `defaultValues`

**Red — tests to write** (`src/renderer/src/components/NewWheelForm.test.tsx`):

- When `defaultTicker="AAPL"` is passed, the ticker input is pre-populated with "AAPL"
- When no `defaultTicker` is passed, the ticker input is empty (existing behavior unchanged)

**Green — implementation:**

- In `NewWheelPage`: `const search = useSearch()` (from `wouter`); `const defaultTicker = new URLSearchParams(search).get('ticker') ?? undefined`; pass `defaultTicker` to `<NewWheelForm>`
- In `NewWheelForm`: add `defaultTicker?: string` to props; add `defaultValues: { ticker: defaultTicker ?? '' }` to `useForm` options

**Refactor — cleanup to consider:**

- Ensure the `defaultTicker` prop does not break the existing form reset behavior (RHF's `defaultValues` are used for initial render only, which is correct here)

**Acceptance criteria covered:**

- "clicking it navigates to the New Wheel form with ticker pre-filled as AAPL"

---

### 11. `PositionsListPage` + `PositionCard`: Active/Closed Grouping

**Files to create or modify:**

- `src/renderer/src/pages/PositionsListPage.tsx` — split positions into active and closed groups; render with section headers "Active" / "Closed"
- `src/renderer/src/components/PositionCard.tsx` — add `isClosed?: boolean` prop for de-emphasis styling; show "Final P&L" label for closed positions; render `WHEEL_COMPLETE` badge in green

**Red — tests to write** (`src/renderer/src/pages/PositionsListPage.test.tsx` or `PositionCard.test.tsx`):

- A `WHEEL_COMPLETE` / `CLOSED` position card renders with "Final P&L" label (not "Premium")
- A `WHEEL_COMPLETE` card has reduced opacity styling (`data-testid="position-card-closed"` or similar)
- The list renders "Active" section header above active positions and "Closed" section header above closed positions when at least one closed position exists

**Green — implementation:**

Based on Screen 5 from `docs/epics/01-stories/US-5-mockups.html`:

In `PositionsListPage`:

- Split `positions` by `status`: `activePositions = positions.filter(p => p.status === 'ACTIVE')`, `closedPositions = positions.filter(p => p.status === 'CLOSED')`
- Render "Active" section header + `activePositions.map(p => <PositionCard .../>)`
- If `closedPositions.length > 0`: render "Closed" section header + `closedPositions.map(p => <PositionCard ... isClosed={true}/>)`

In `PositionCard`:

- Accept `isClosed?: boolean` prop
- Apply `opacity: 0.55` to card when `isClosed`
- When `isClosed` (or when `status === 'CLOSED'`): show "Final P&L" label with green value instead of "Premium" label
- WHEEL_COMPLETE phase badge: green color (`var(--wb-green)` / `#3de07e`) with no pulse animation, "Complete" text with "✓" prefix

**Refactor — cleanup to consider:**

- The phase badge color/label maps in `PositionDetailPage` and `PositionCard` may be independently maintained — verify consistency or extract to a shared constant

**Acceptance criteria covered:**

- "When the trader views the positions list, Then the AAPL position shows the WHEEL_COMPLETE phase badge"
- "the position status is closed"
