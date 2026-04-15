# Implementation Plan: US-9 — Record CC Expiring Worthless

## Summary

Implements the covered call expiry flow: when a CC_OPEN position's option expires worthless, the trader records the event, an EXPIRE leg is written, and the position transitions back to HOLDING_SHARES (still active, still holding shares). A right-side sheet with confirmation and success states guides the trader, ending with a nudge and CTA to sell the next CC.

## Supporting Documents

- **User Story & Acceptance Criteria:** `docs/epics/02-stories/US-9-record-cc-expiring-worthless.md`
- **Mockup:** `mockups/us-9-record-cc-expiring-worthless.mdx`
- **Research & Design Decisions:** `plans/us-9/research.md`
- **Data Model:** `plans/us-9/data-model.md`
- **API Contract:** `plans/us-9/contracts/expire-cc.md`
- **Quickstart & Verification:** `plans/us-9/quickstart.md`

## Prerequisites

- **US-7 (open covered call)** must be merged into this branch before implementation. Commit `9fb1928` on local `main` adds `openCoveredCall` in `lifecycle.ts`, `openCoveredCallPosition` service, `positions:open-cc` IPC handler, `OpenCcPayloadSchema`, and the updated `PositionDetailActions` component.
- **US-8 (close CC early)** is in progress in a separate worktree. US-9 does not depend on US-8.

## Implementation Areas

---

### 1. `expireCc` Lifecycle Engine Function

**Files to create or modify:**

- `src/main/core/lifecycle.ts` — add `ExpireCcInput`, `ExpireCcResult`, and `expireCc`

**Red — tests to write** (`src/main/core/lifecycle.test.ts`):

- Returns `{ phase: 'HOLDING_SHARES' }` when `currentPhase === 'CC_OPEN'` and `referenceDate >= expirationDate`
- Throws `ValidationError` with `field='__phase__'`, `code='invalid_phase'`, `message='No open covered call on this position'` when `currentPhase !== 'CC_OPEN'` (e.g. `HOLDING_SHARES`)
- Throws `ValidationError` with `field='expiration'`, `code='too_early'`, `message='Cannot record expiration before the expiration date (2026-02-21)'` when `referenceDate < expirationDate` (message must include the actual date string)
- Throws the too_early error when `referenceDate === expirationDate` minus 1 day (boundary case)
- Does NOT throw when `referenceDate === expirationDate` exactly (boundary passing case)

**Green — implementation:**

- Add `ExpireCcInput` interface: `{ currentPhase: WheelPhase; expirationDate: string; referenceDate: string }`
- Add `ExpireCcResult` interface: `{ phase: 'HOLDING_SHARES' }`
- Add `expireCc(input: ExpireCcInput): ExpireCcResult` — validates phase (`!== 'CC_OPEN'`), validates date (`referenceDate < expirationDate`), returns `{ phase: 'HOLDING_SHARES' }`
- Error message format: `` `Cannot record expiration before the expiration date (${input.expirationDate})` ``

**Refactor — cleanup to consider:**

- Extract a `requirePhase` helper if the pattern repeats across `expireCsp` and `expireCc` — but only if it genuinely reduces duplication without adding abstraction for one case.

**Acceptance criteria covered:**

- AC 3: Reject expiration before the expiration date
- AC 4: Reject expiration when not in CC_OPEN phase

---

### 2. Schemas: `ExpireCcPayloadSchema` and `ExpireCcPositionResult`

**Files to create or modify:**

- `src/main/schemas.ts` — add schema, payload type, and result interface

**Red — tests to write** (`src/main/schemas.test.ts`):

- `ExpireCcPayloadSchema.parse({ positionId: validUUID })` succeeds
- `ExpireCcPayloadSchema.parse({ positionId: 'not-a-uuid' })` throws ZodError
- `ExpireCcPayloadSchema.parse({ positionId: validUUID, expirationDateOverride: '2026-02-21' })` succeeds

**Green — implementation:**

- Add `ExpireCcPayloadSchema = z.object({ positionId: z.string().uuid(), expirationDateOverride: z.string().optional() })`
- Add `export type ExpireCcPayload = z.infer<typeof ExpireCcPayloadSchema>`
- Add `ExpireCcPositionResult` interface (see `plans/us-9/contracts/expire-cc.md` for exact shape): position with `phase: 'HOLDING_SHARES'`, `status: 'ACTIVE'`, `closedDate: null`; `leg: LegRecord`; `costBasisSnapshot: CostBasisSnapshotRecord`; `sharesHeld: number`

**Refactor — cleanup to consider:**

- Check for naming consistency with `ExpireCspPayload` / `ExpireCspPositionResult`.

**Acceptance criteria covered:**

- Foundational for all other areas.

---

### 3. `expire-cc-position` Service

**Files to create or modify:**

- `src/main/services/expire-cc-position.ts` — new file
- `src/main/services/positions.ts` — add `export { expireCcPosition } from './expire-cc-position'`

**Red — tests to write** (`src/main/services/expire-cc-position.test.ts`):

- Happy path: given a CC_OPEN position with `expirationDateOverride = expirationDate`, returns result with `position.phase = 'HOLDING_SHARES'`, `position.status = 'ACTIVE'`, `position.closedDate = null`
- Happy path: the returned `leg` has `legRole = 'EXPIRE'`, `action = 'EXPIRE'`, `instrumentType = 'CALL'`, `premiumPerContract = '0.0000'`, `fillPrice = null`, `fillDate = expirationDate`
- Happy path: returns `sharesHeld = 100` for 1-contract position (ASSIGN leg contracts × 100)
- Happy path: the `cost_basis_snapshots` table has NOT gained a new row (snapshot count is unchanged)
- Happy path: the `positions` row has `phase = 'HOLDING_SHARES'`, `status = 'ACTIVE'`, `closed_date = NULL`
- Error: throws `ValidationError` with `code = 'not_found'` when positionId doesn't exist
- Error: throws `ValidationError` with `code = 'invalid_phase'` and `message = 'No open covered call on this position'` when phase is `HOLDING_SHARES`
- Error: throws `ValidationError` with `code = 'too_early'` when `expirationDateOverride` is one day before the CC expiration
- Error: throws `ValidationError` with `code = 'no_active_leg'` when there is no CC_OPEN leg (edge case)

**Green — implementation:**

- `expireCcPosition(db, positionId, payload: ExpireCcPayload): ExpireCcPositionResult`
- Load `positionDetail` via `getPosition(db, positionId)` — throw `not_found` if null
- Set `referenceDate = payload.expirationDateOverride ?? today`
- Set `recordedDate = payload.expirationDateOverride ?? openLeg.expiration`
- Call `expireCc({ currentPhase, expirationDate: openLeg.expiration, referenceDate })` — propagates ValidationError
- Validate `openLeg` exists (guard against no active CC leg)
- Find ASSIGN leg from `positionDetail.legs` for `sharesHeld` computation
- In a DB transaction: INSERT EXPIRE leg (CALL, role EXPIRE, action EXPIRE, premium 0.0000, fill_price NULL, fill_date = recordedDate); UPDATE positions SET phase = 'HOLDING_SHARES', updated_at = now WHERE id = positionId (do NOT set closed_date or status)
- Return `{ position: {..., phase: 'HOLDING_SHARES', status: 'ACTIVE', closedDate: null}, leg: ..., costBasisSnapshot: positionDetail.costBasisSnapshot, sharesHeld: assignLeg.contracts * 100 }`
- Log: `logger.debug` inputs; `logger.info` completion with `{ positionId, phase: 'HOLDING_SHARES', sharesHeld }`

**Refactor — cleanup to consider:**

- Check for duplication with `expire-csp-position.ts` in the date handling pattern — extract a helper only if ≥3 uses emerge.

**Acceptance criteria covered:**

- AC 1: EXPIRE leg recorded, phase changes to HOLDING_SHARES
- AC 3: Reject before expiration date
- AC 4: Reject when not in CC_OPEN

---

### 4. IPC Handler `positions:expire-cc`

**Files to create or modify:**

- `src/main/ipc/positions.ts` — register new handler inside `registerPositionsHandlers`

**Red — tests to write** (`src/main/ipc/positions.test.ts`):

- `positions:expire-cc` with valid UUID payload → calls `expireCcPosition` and returns `{ ok: true, position, leg, costBasisSnapshot, sharesHeld }`
- `positions:expire-cc` with non-UUID `positionId` → returns `{ ok: false, errors: [{ code: 'invalid_string' }] }` (Zod parse failure)
- `positions:expire-cc` where service throws `ValidationError` → returns `{ ok: false, errors: [{field, code, message}] }`

**Green — implementation:**

- Import `ExpireCcPayloadSchema` and `expireCcPosition` (once exported from `services/positions.ts`)
- Add to `registerPositionsHandlers`:
  ```typescript
  ipcMain.handle('positions:expire-cc', (_, payload: unknown) =>
    handleIpcCall('positions_expire_cc_unhandled_error', () => {
      const parsed = ExpireCcPayloadSchema.parse(payload)
      return expireCcPosition(db, parsed.positionId, parsed)
    })
  )
  ```

**Refactor — cleanup to consider:**

- Naming consistency with existing handler labels (`positions_expire_csp_unhandled_error` pattern).

**Acceptance criteria covered:**

- Enables all AC scenarios at the IPC boundary.

---

### 5. Preload Wiring

**Files to create or modify:**

- `src/preload/index.ts` — add `expireCc` method
- `src/preload/index.d.ts` — add type declaration

**Red — tests to write:**

- No unit tests for preload wiring (integration tested via IPC handler tests + E2e).

**Green — implementation:**

- In `src/preload/index.ts`, add to the `api` object:
  ```typescript
  expireCc: (payload: unknown) => ipcRenderer.invoke('positions:expire-cc', payload)
  ```
- In `src/preload/index.d.ts`, add to the `api` type declaration (follow the existing shape for `expirePosition`):
  ```typescript
  expireCc: (payload: unknown) => Promise<{ ok: boolean; [key: string]: unknown }>
  ```

**Refactor — cleanup to consider:**

- Check naming consistency with `expirePosition` (CSP) and `openCoveredCall` (US-7).

**Acceptance criteria covered:**

- Bridges IPC to renderer for all AC scenarios.

---

### 6. API Adapter: `expireCc` Function and Types

**Files to create or modify:**

- `src/renderer/src/api/positions.ts` — add `ExpireCcPayload`, `ExpireCcResponse`, and `expireCc`

**Red — tests to write** (`src/renderer/src/api/positions.test.ts`):

- `expireCc({ position_id: uuid })` calls `window.api.expireCc` with `{ positionId: uuid, expirationDateOverride: undefined }`
- `expireCc({ position_id: uuid, expiration_date_override: '2026-02-21' })` maps the snake_case field to `expirationDateOverride`
- When `window.api.expireCc` returns `{ ok: false, errors: [{field: '__phase__', ...}] }`, `expireCc` throws an `ApiError` with `status: 400` and `body.detail` containing the mapped error
- When `window.api.expireCc` returns `{ ok: true, position, leg, costBasisSnapshot, sharesHeld }`, `expireCc` resolves with the result

**Green — implementation:**

- Add `ExpireCcPayload = { position_id: string; expiration_date_override?: string }`
- Add `ExpireCcResponse` type (see `plans/us-9/contracts/expire-cc.md`)
- Add `expireCc(payload: ExpireCcPayload): Promise<ExpireCcResponse>` following the same error-mapping pattern as `expirePosition`

**Refactor — cleanup to consider:**

- Check for duplication with `expirePosition` (CSP) — the two functions are structurally identical except for the method name and types.

**Acceptance criteria covered:**

- Enables renderer-layer integration tests and E2e.

---

### 7. `useExpireCoveredCall` Hook

**Files to create or modify:**

- `src/renderer/src/hooks/useExpireCoveredCall.ts` — new file

**Red — tests to write:**

- No isolated unit test needed — the hook is a thin wrapper over TanStack Query `useMutation`. Behaviour is covered by component tests in Area 8 and E2e.

**Green — implementation:**

- Following `src/renderer/src/hooks/useExpirePosition.ts` exactly:
  ```typescript
  export function useExpireCoveredCall(options?: {
    onSuccess?: (data: ExpireCcResponse) => void
  }): ReturnType<typeof useMutation<ExpireCcResponse, ApiError, ExpireCcPayload>> {
    const queryClient = useQueryClient()
    return useMutation({
      mutationFn: expireCc,
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: positionQueryKeys.all })
        options?.onSuccess?.(data)
      }
    })
  }
  ```

**Refactor — cleanup to consider:**

- None expected — hook is intentionally minimal.

**Acceptance criteria covered:**

- Wires the mutation for areas 8 and 9.

---

### 8. `CcExpirationSheet` Component

**Files to create or modify:**

- `src/renderer/src/components/CcExpirationSheet.tsx` — new file
- `src/renderer/src/components/CcExpirationSheet.test.tsx` — new file

**Red — tests to write** (`src/renderer/src/components/CcExpirationSheet.test.tsx`):

- Confirmation state renders with position summary: "AAPL CALL $182.00 · Feb 21, 2026", contracts, expiration date, phase transition "Call Open → Holding" (PhaseBadge values), "Premium captured: +$230.00 (100%)" highlighted row
- Confirmation state renders irrevocable warning: "This cannot be undone."
- Confirmation state renders Cancel and "Confirm Expiration" footer buttons
- Clicking "Confirm Expiration" calls `useExpireCoveredCall.mutate` with `{ position_id: positionId }`
- Success state renders green hero card with "+$230.00 premium captured (100%)"
- Success state renders "Still Holding: 100 shares of AAPL" badge inside the hero card
- Success state renders result summary: leg recorded row (expire · Feb 21, 2026), Phase badge (HOLDING_SHARES), shares still held, CC premium collected highlighted row
- Success state renders strategic nudge: `"Many traders wait 1–3 days before selling the next covered call — avoid chasing premium right at expiration."` inside an info AlertBox
- Success state renders "Sell New Covered Call on AAPL →" FormButton
- Clicking "Sell New Covered Call on AAPL →" calls `onClose`

**Green — implementation:**

Implement `CcExpirationSheet` as a right-side 400px sheet rendered via `createPortal` into `document.body`, following the exact structure of `ExpirationSheet.tsx` with these differences:

Props:

```typescript
interface CcExpirationSheetProps {
  open: boolean
  positionId: string
  ticker: string
  strike: string
  expiration: string // YYYY-MM-DD
  expirationDisplay: string // e.g. "Feb 21, 2026"
  contracts: number
  premiumPerContract: string // e.g. "2.3000"
  sharesHeld: number // passed from PositionDetailPage
  onClose: () => void
}
```

State: `successState: boolean` (true after mutation succeeds — all display data comes from props).

**Confirmation state** (matches mockup `confirmation` screen):

- Header eyebrow: `"Record Expiration"` (color: `var(--wb-text-secondary)`)
- Header title: `"Expire Covered Call Worthless"`
- Header subtitle: `"CALL $${strike} · ${expirationDisplay}"`
- Body: `SectionCard` with summary rows (no header): Position (`AAPL CALL $182.00 · Feb 21`), Contracts, Expiration date, Phase transition (`PhaseBadge CC_OPEN` → `PhaseBadge HOLDING_SHARES`), Leg recorded (`expire · no fill price`), and a highlight row "Premium captured: +$X.XX (100%)" with green gradient background
- Warning: `AlertBox variant="warning"`: `"This cannot be undone."` + `"The position will transition back to Holding Shares. Full leg history is preserved."`
- Footer: `Button variant="outline"` Cancel + `FormButton` "Confirm Expiration" (disabled while `isPending`)

**Success state** (matches mockup `success` screen):

- Header eyebrow: `"Complete"` (color: `var(--wb-green)`)
- Header title: `"AAPL CC Expired Worthless"` (use `ticker` prop)
- Header subtitle: `"CALL $${strike} · ${expirationDisplay}"`
- Body section 1 — green hero card: caption `"Premium Captured"` (green, small caps), large `"+$${totalPremium}"` (font-size 40, green), sub-line `"100% premium captured · {contracts} contract"`, "Still Holding" inline badge (sky blue background) showing `"{sharesHeld} shares of {ticker}"`
- Body section 2 — result summary `SectionCard` (no header): rows for "Leg recorded" (expire · expirationDisplay), "Phase" (PhaseBadge HOLDING_SHARES), "Shares still held" (sharesHeld, sky blue), "CC premium collected" (+$totalPremium, green, highlight row)
- Body section 3 — strategic nudge: `AlertBox variant="info"` containing `"💡 Many traders wait 1–3 days before selling the next covered call — avoid chasing premium right at expiration."`
- Body section 4 — "What's next?" caption (uppercase, muted)
- Body section 5 — `FormButton` `"Sell New Covered Call on {ticker} →"` full width, onClick = onClose
- Body section 6 — `"View full position history"` underline button, onClick = onClose

Helpers: compute `totalPremium = (parseFloat(premiumPerContract) * contracts * 100).toFixed(0)` for display.

Use `fmtDate(expiration)` from `../lib/format` when `expirationDisplay` is not passed and format fallback is needed.

**Refactor — cleanup to consider:**

- Extract shared sheet-chrome JSX (header, footer, overlay, scrim) into a local helper if ExpirationSheet duplication exceeds ~30 lines.

**Acceptance criteria covered:**

- AC 1: success screen shows "+$230.00 premium captured (100%)" and "Sell New Covered Call" CTA
- AC 2: success screen shows full premium collected
- AC 5: strategic nudge text and "Sell New Covered Call on AAPL →" CTA visible

---

### 9. `PositionDetailPage` and `PositionDetailActions` Wiring

**Files to create or modify:**

- `src/renderer/src/components/PositionDetailActions.tsx` — add `onRecordCcExpiration` prop and CC_OPEN button
- `src/renderer/src/pages/PositionDetailPage.tsx` — add CC expiry context state and `CcExpirationSheet`

**Red — tests to write** (`src/renderer/src/pages/PositionDetailPage.test.tsx`):

- When `position.phase === 'CC_OPEN'` and `computeDte(activeLeg.expiration) <= 0`, renders a button with `data-testid="record-cc-expiration-btn"` containing text "Record Expiration →"
- When `position.phase === 'CC_OPEN'` and `computeDte(activeLeg.expiration) > 0` (not yet expired), does NOT render `data-testid="record-cc-expiration-btn"`
- When `position.phase === 'HOLDING_SHARES'`, does NOT render `data-testid="record-cc-expiration-btn"`
- Clicking `record-cc-expiration-btn` opens the `CcExpirationSheet` (renders `data-testid="cc-expiration-sheet"`)

**Green — implementation:**

`PositionDetailActions`:

- Add `onRecordCcExpiration: () => void` and `ccExpired: boolean` props
- When `phase === 'CC_OPEN'` and `ccExpired`, render:
  ```tsx
  <button
    data-testid="record-cc-expiration-btn"
    className="wb-teal-button"
    onClick={onRecordCcExpiration}
    style={actionButtonStyle}
  >
    Record Expiration →
  </button>
  ```

`PositionDetailPage`:

- Add `ccExpCtx` state: `{ activeLeg, snapshot } | null`
- Compute `ccExpired = activeLeg ? computeDte(activeLeg.expiration) <= 0 : false`
- Pass `onRecordCcExpiration` and `ccExpired` to `PositionDetailActions`
- In `onRecordCcExpiration`: set `ccExpCtx = { activeLeg, snapshot: costBasisSnapshot }`
- Include `ccExpCtx` in the blur condition alongside `expirationCtx`, `assignmentCtx`, `openCcCtx`
- After all existing sheets, render:
  ```tsx
  {
    ccExpCtx?.activeLeg && (
      <CcExpirationSheet
        open
        positionId={position.id}
        ticker={position.ticker}
        strike={ccExpCtx.activeLeg.strike}
        expiration={ccExpCtx.activeLeg.expiration}
        expirationDisplay={fmtDate(ccExpCtx.activeLeg.expiration)}
        contracts={ccExpCtx.activeLeg.contracts}
        premiumPerContract={ccExpCtx.activeLeg.premiumPerContract}
        sharesHeld={assignLeg?.contracts ? assignLeg.contracts * 100 : 0}
        onClose={() => setCcExpCtx(null)}
      />
    )
  }
  ```
- Derive `assignLeg = legs.find(l => l.legRole === 'ASSIGN')` from position legs

**Refactor — cleanup to consider:**

- If `PositionDetailActions` grows beyond ~60 lines, extract per-phase action groups into sub-components.

**Acceptance criteria covered:**

- AC 1: "Record Expiration →" button is visible in position detail header when phase = CC_OPEN and today ≥ CC expiration

---

### 10. E2e Tests

**Files to create or modify:**

- `e2e/cc-expiration.spec.ts` — new file

**Red — tests to write** (one test per AC, AC language in test name):

- `"records CC expiration worthless: position transitions to HOLDING_SHARES and EXPIRE leg is created"`
  - Flow: create position → assign → open CC (expiration today) → click "Record Expiration →" → confirm → assert phase badge shows "Holding" → assert leg history table has an EXPIRE row with fill_date = today and premium $0.00
  - Covers AC 1: "the position phase changes back to HOLDING_SHARES" and "an EXPIRE leg is recorded"

- `"records CC expiration worthless: success screen shows +$230.00 premium captured (100%)"`
  - Flow: same setup → after confirm → assert hero card text "+$230.00" and "100% premium captured"
  - Covers AC 1 (success screen assertion) and AC 2: "Full premium kept in the success state"

- `"rejects expiration attempt before the expiration date"`
  - Flow: create position → assign → open CC with expiration tomorrow → navigate to position detail → assert "Record Expiration →" button is NOT visible (DTE > 0 guard prevents it)
  - Covers AC 3: "Reject expiration before the expiration date"

- `"rejects CC expiration when position is not in CC_OPEN phase"`
  - Flow: create position → assign (HOLDING_SHARES) → navigate to position detail → "Record Expiration →" is NOT visible → attempt IPC call directly with HOLDING_SHARES position → returns error "No open covered call on this position"
  - Covers AC 4: "Reject expiration when not in CC_OPEN phase"

- `"success state shows strategic nudge and sell-next-CC CTA"`
  - Flow: create position → assign → open CC (expiration today) → confirm expiration → assert info AlertBox contains "Many traders wait 1–3 days before selling the next covered call" → assert "Sell New Covered Call on AAPL →" button visible → click it → sheet closes → position detail shows HOLDING_SHARES
  - Covers AC 5: "Success state shows strategic nudge before sell-next-CC CTA"

**Green — implementation:**

- Use `_electron` Playwright API to launch the app (follow `e2e/csp-flow.spec.ts` or `e2e/csp-assignment.spec.ts` for setup pattern)
- IPC calls for fixture setup go through `electronApp.evaluate` or the `window.api` bridge
- Use `page.getByTestId` for button selectors; use `page.getByText` for asserting sheet content

**Refactor — cleanup to consider:**

- Extract CC fixture setup (create → assign → open-CC) into a shared helper if it's used across multiple e2e files.

**Acceptance criteria covered:**

- AC 1, 2, 3, 4, 5 — one dedicated test per AC scenario
