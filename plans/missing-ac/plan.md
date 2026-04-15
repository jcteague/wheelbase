# Plan: Complete Missing Acceptance Criteria (US-3, US-4, US-5)

## Summary

Three stories have acceptance criteria that were planned but not fully implemented. This plan covers the exact gaps — no refactoring, no extras.

**Reference Stories:**

- `docs/epics/01-stories/US-3-position-detail.md`
- `docs/epics/01-stories/US-4-close-csp-early.md`
- `docs/epics/01-stories/US-5-record-csp-expiration.md`

---

## Gap 1 — US-3: Leg history not rendered (backend + frontend)

**Missing AC:**

> "The leg history shows one entry: action, type, strike, premium, date"
> "Leg history displays in chronological order"

**Root cause:**
`getPosition` returns only `activeLeg` (the single most recent open leg). There is no query that returns the full legs array for a position. The detail page has no leg history section.

### Area 1a: Backend — `getPosition` returns all legs

**Files:**

- `src/main/services/get-position.ts`
- `src/main/schemas.ts` — add `legs: LegRecord[]` to `GetPositionResult`

**Red:** Add test to `src/main/services/get-position.test.ts`:

- Position with two legs (open + close): `getPosition` returns `legs` array with both entries in chronological order (`fill_date ASC, created_at ASC`)

**Green:**

- Add a second query: `SELECT * FROM legs WHERE position_id = ? ORDER BY fill_date ASC, created_at ASC`
- Add `legs: LegRecord[]` to `GetPositionResult`
- Return `{ position, activeLeg, costBasisSnapshot, legs }`

**Refactor:** None required — straightforward addition.

---

### Area 1b: Frontend — Leg history table in PositionDetailPage

**Files:**

- `src/renderer/src/api/positions.ts` — add `legs` to `PositionDetail` type
- `src/renderer/src/pages/PositionDetailPage.tsx` — add leg history section
- `src/renderer/src/pages/PositionDetailPage.test.tsx` — add test

**Red:**

- Mock `usePosition` with two legs; verify both appear in the leg history in DOM order (open first, close second)

**Green:**

- Add a "Leg History" `SectionCard` below the Cost Basis section
- Render a table/list of all legs: columns — Date, Action, Type, Strike, Premium

**Refactor:** Keep PositionDetailPage under 200 lines; extract `LegHistoryTable` component if needed.

---

## Gap 2 — US-3: Notes/thesis not rendered (frontend only)

**Missing AC:**

> "Given the trader has a wheel on AAPL with thesis 'Bullish on services revenue' and notes 'Selling at support level', then the thesis and notes sections are visible"

**Root cause:**
`getPosition` already returns `position.notes` and `position.thesis`. The renderer API and hooks already pass this through. The detail page simply does not render them.

### Area 2: Frontend — Notes/thesis in PositionDetailPage

**Files:**

- `src/renderer/src/pages/PositionDetailPage.tsx`
- `src/renderer/src/pages/PositionDetailPage.test.tsx`

**Red:**

- Mock `usePosition` with `thesis="Bullish on services revenue"` and `notes="Selling at support level"`; verify both strings appear in the rendered output

**Green:**

- Add a "Notes" `SectionCard` section at the bottom of the detail page; render `thesis` and `notes` when present (skip the section if both are null)

**Refactor:** None.

---

## Gap 3 — US-4: Fill date field missing from close form (frontend)

**Missing AC:**

> "Reject close with fill date before the open leg's fill date → 'Close date cannot be before the open date'"
> "Reject close with fill date after expiration → 'Close date cannot be after expiration date'"

**Root cause:**
The lifecycle engine (`closeCsp`) and service (`closeCspPosition`) already validate fill dates. The IPC schema already accepts optional `fillDate`. The `CloseCspForm` has no fill date input, so users cannot trigger these validations. The service defaults to today.

### Area 3: Frontend — Add optional fill date to CloseCspForm

**Files:**

- `src/renderer/src/components/CloseCspForm.tsx`
- `src/renderer/src/components/CloseCspForm.test.tsx`

**Red:**

- Render `CloseCspForm`; verify a fill date field exists
- Enter a fill date before the open leg's fill date, submit; verify error "Close date cannot be before the open date" appears
- Enter a fill date after expiration, submit; verify error "Close date cannot be after expiration date" appears

**Green:**

- Add `openFillDate: string` and `expiration: string` to `CloseCspFormProps` (already available in `PositionDetailPage` from `activeLeg`)
- Add optional `fill_date` field to `closeCspSchema` (ISO date string regex, optional)
- Render a date picker or text input for fill date below the close price field
- Pass `fill_date` in the mutation payload
- Map server-side `fillDate` field errors back to the form field

**Refactor:** None.

---

## Gap 4 — US-5: Expiration date guard bypassed (frontend)

**Missing AC:**

> "Reject expiration before expiration date → 'Cannot record expiration before the expiration date'"
> "Allow expiration on the expiration date itself"

**Root cause:**
`ExpirationSheet` always passes `expiration_date_override: expiration` (the option's expiration date). The service uses this as `referenceDate`, so `referenceDate === expirationDate` always passes validation regardless of today's actual date. The date guard in `expireCsp()` is never triggered via the UI.

**Fix:**
Remove `expiration_date_override` from the `ExpirationSheet` mutation call. The service will then use today's date as `referenceDate`. If today is before the expiration date, the server rejects with `too_early` — which the sheet surfaces as an error message.

### Area 4: Frontend — Remove expiration date override from ExpirationSheet

**Files:**

- `src/renderer/src/components/ExpirationSheet.tsx`
- `src/renderer/src/components/ExpirationSheet.test.tsx`

**Red:**

- Test that `mutation.mutate` is called with `{ position_id: positionId }` only — no `expiration_date_override`
- Test that when mutation returns an error with message "Cannot record expiration before the expiration date", the error is displayed in the sheet body

**Green:**

- In `handleConfirmExpiration`, change `mutate({ position_id: positionId, expiration_date_override: expiration })` to `mutate({ position_id: positionId })`

**Refactor:** None.

---

## Execution Order

Dependencies:

- Area 1b depends on Area 1a (needs `legs` in API response)
- Area 3 depends on nothing new (backend already complete)
- Area 4 depends on nothing (one-line fix + test)
- Area 2 depends on nothing (data already flows through)

Suggested order: **4 → 2 → 3 → 1a → 1b**
(smallest/safest first, most complex last)
