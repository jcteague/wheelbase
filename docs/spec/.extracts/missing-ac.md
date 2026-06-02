---
plan: missing-ac
source: plans/missing-ac/
extracted_at: 2026-05-30
status: complete
---

# Extract: missing-ac

## Summary

This is a multi-story remediation plan that closes four acceptance-criteria gaps left unimplemented across three already-shipped stories. No new entities, IPC channels, schemas, or migrations are introduced — every fix layers onto behavior already wired in earlier work. Gap 1 (US-3) restores the leg-history table by extending `getPosition` to return the full `legs` array (chronological by `fill_date ASC, created_at ASC`) and rendering a "Leg History" `SectionCard` on `PositionDetailPage`. Gap 2 (US-3) renders the existing-but-unused `position.thesis` and `position.notes` strings in a "Notes" `SectionCard` (skipped when both are null). Gap 3 (US-4) adds an optional `fill_date` input to `CloseCspForm` so users can actually trigger the lifecycle engine's already-implemented `closeFillDate >= openFillDate` and `closeFillDate <= expiration` checks, including server-side error mapping back to the form field. Gap 4 (US-5) removes the always-present `expiration_date_override` argument from `ExpirationSheet`'s mutate call so the service's `referenceDate` defaults to today — which makes the existing `too_early` guard surface its error message instead of being silently bypassed. Suggested execution order in the plan: 4 → 2 → 3 → 1a → 1b (smallest/safest first). (Source: `plans/missing-ac/plan.md`)

## Architecture Decisions

### ADR: Surface the full legs list via the existing `getPosition` query, not a new IPC channel
- **Decision:** Add a second SQL query to `getPosition` service (`SELECT * FROM legs WHERE position_id = ? ORDER BY fill_date ASC, created_at ASC`) and return it as a new `legs: LegRecord[]` field on `GetPositionResult`. Keep `activeLeg` and `costBasisSnapshot` exactly as they are.
- **Why:** US-3's AC requires leg history "in chronological order"; `getPosition` already hydrates the detail page, and the renderer hook/API pass-through chain already exists. Adding a sibling field on the existing return shape is strictly additive and avoids a new IPC channel for what is essentially a fan-out of the same query.
- **Alternatives considered:** A new `legs:list-by-position` IPC channel (extra surface area for no payoff; the detail page is the only consumer); eager-loading legs as a join inside the existing position query (mixes shapes and complicates `activeLeg` selection).
- **Source:** `plans/missing-ac/plan.md` §Gap 1 / Area 1a

### ADR: Notes/thesis render is renderer-only — data already flows
- **Decision:** Fix Gap 2 entirely inside `PositionDetailPage`; do not change `getPosition`, the renderer API adapter, or the IPC schema.
- **Why:** `getPosition` already returns `position.notes` and `position.thesis`; the renderer API and hooks already pass them through. The only missing piece is the JSX that renders them. Touching anything below the component layer would be unnecessary churn.
- **Alternatives considered:** None — the root cause is a rendering gap, not a data gap.
- **Source:** `plans/missing-ac/plan.md` §Gap 2

### ADR: Gap 2 — render Notes section only when at least one of thesis/notes is non-null
- **Decision:** Add a single "Notes" `SectionCard` to the bottom of `PositionDetailPage` that renders the `thesis` and `notes` strings when present, and is omitted from the DOM entirely when both fields are null.
- **Why:** Avoids an empty card on the majority of positions (where neither field has data) while still satisfying the US-3 AC "the thesis and notes sections are visible" when the trader has entered them.
- **Alternatives considered:** Always render the card with em-dashes for missing values (visual noise for the common case).
- **Source:** `plans/missing-ac/plan.md` §Gap 2 / Green

### ADR: Gap 3 — `fill_date` validation already lives in the lifecycle engine; only the form needs to change
- **Decision:** Add the optional `fill_date` input strictly in the renderer (`CloseCspForm`). Do not modify `closeCsp` (lifecycle), `closeCspPosition` (service), the `positions:close-csp` IPC handler, or `CloseCspPayloadSchema` — all of these already accept and validate `fillDate`.
- **Why:** The backend pipeline already enforces `close_date_before_open` and `close_date_after_expiration`. The reason the AC was failing is that the form never offered a way to send a non-default fill date, so the service defaulted to today and never tripped the guards. Surfacing the input is the entire fix.
- **Alternatives considered:** Re-validating fill-date bounds in a client-side Zod schema (duplicates server logic; loses the server's authoritative bounds derived from the actual open leg).
- **Source:** `plans/missing-ac/plan.md` §Gap 3 / Root cause

### ADR: Gap 3 — pass open-leg context into `CloseCspForm` via props, not a new fetch
- **Decision:** Add `openFillDate: string` and `expiration: string` to `CloseCspFormProps` and source them from `activeLeg` in `PositionDetailPage`, which already loads them.
- **Why:** `PositionDetailPage` already has the open-leg fill date and expiration in scope from its `usePosition` call. Re-fetching inside the form would duplicate state and risk staleness; prop-drilling two strings is trivial.
- **Alternatives considered:** Have the form call `usePosition` itself (redundant fetch); shove the values onto a context (over-engineered for one form).
- **Source:** `plans/missing-ac/plan.md` §Gap 3 / Green

### ADR: Gap 3 — server-side `fillDate` field errors map back onto the form field
- **Decision:** Extend the existing IPC error-to-form-field mapping so that a server error with `field: 'fillDate'` is surfaced on the form's `fill_date` input (using the snake_case form field name that the renderer uses).
- **Why:** The `close_date_before_open` and `close_date_after_expiration` errors are emitted by the service with `field: 'fillDate'`. Without the mapping, the form would either swallow the message or render it on the wrong field.
- **Alternatives considered:** Client-side date guards (duplicates business logic, see prior ADR).
- **Source:** `plans/missing-ac/plan.md` §Gap 3 / Green

### ADR: Gap 4 — remove the override entirely instead of conditionally passing it
- **Decision:** In `ExpirationSheet.handleConfirmExpiration`, change the mutation payload from `{ position_id: positionId, expiration_date_override: expiration }` to `{ position_id: positionId }`. Do not conditionally include the override based on user input or "today vs expiration" logic.
- **Why:** The service uses the override as `referenceDate`; passing the option's own expiration date always satisfies `referenceDate >= expirationDate` and silently disables the `too_early` check. With the override removed, the service falls back to today's date and the existing guard fires correctly. The plan classifies this as "a one-line fix + test."
- **Alternatives considered:** Conditional override (still defeats the date guard whenever the user invokes it before expiration); removing the override field from the IPC contract altogether (out of scope and unrelated to the AC).
- **Source:** `plans/missing-ac/plan.md` §Gap 4 / Root cause + Green

### ADR: Gap 4 — surface server-side `too_early` error inline in the sheet body
- **Decision:** The sheet displays the server error message ("Cannot record expiration before the expiration date") inline in the sheet body when the mutation rejects.
- **Why:** Without this, the user gets no signal that the gated transition was refused. The error already comes back with the right message text from the service; only display wiring is required.
- **Alternatives considered:** Toast/snackbar (project pattern is in-sheet errors for sheet-driven flows, per US-5 refactor decisions).
- **Source:** `plans/missing-ac/plan.md` §Gap 4 / Red + Green

## Contracts

No new contracts. All contract shapes referenced below are unchanged from their original story extracts; this plan only adjusts one field on one existing IPC response and removes one parameter from one renderer mutate call.

### `positions:get` (US-4 extract, additive change)
- **Type:** IPC handler (modified return shape)
- **Shape (change only):**
  ```typescript
  // GetPositionResult — adds `legs` alongside existing fields
  {
    position: PositionRecord
    activeLeg: LegRecord | null
    costBasisSnapshot: (CostBasisSnapshotRecord & { finalPnl: string | null }) | null
    legs: LegRecord[]                   // NEW — all legs for this position,
                                        //       ordered by fill_date ASC, created_at ASC
  }
  ```
- **Source:** `plans/missing-ac/plan.md` §Gap 1 / Area 1a
- **Implementation:** `src/main/services/get-position.ts`, `src/main/schemas.ts`

### `CloseCspForm` props (renderer)
- **Type:** other (React component props, extended)
- **Shape (change only):**
  ```typescript
  // CloseCspFormProps additions
  {
    // ...existing props
    openFillDate: string   // NEW — ISO date string of the CSP_OPEN leg
    expiration: string     // NEW — ISO date string of the option's expiration
  }

  // Zod form schema additions
  closeCspSchema = z.object({
    close_price_per_contract: z.coerce.number().positive(...),
    fill_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()   // NEW
  })
  ```
- **Source:** `plans/missing-ac/plan.md` §Gap 3 / Green
- **Implementation:** `src/renderer/src/components/CloseCspForm.tsx`

### `ExpirationSheet` mutate payload (renderer)
- **Type:** other (renderer mutation call, narrowed)
- **Shape (change only):**
  ```typescript
  // Before (the bug):
  mutate({ position_id: positionId, expiration_date_override: expiration })

  // After:
  mutate({ position_id: positionId })
  ```
- **Source:** `plans/missing-ac/plan.md` §Gap 4 / Green
- **Implementation:** `src/renderer/src/components/ExpirationSheet.tsx`

## Schema Changes

No database schema changes. No migrations. The plan is explicit that every fix is a layer-restricted change on top of behavior already shipped.

- `GetPositionResult` (TypeScript / Zod) gains a `legs: LegRecord[]` field. (Source: `plans/missing-ac/plan.md` §Gap 1 / Area 1a)
- `closeCspSchema` (renderer Zod form schema) gains an optional `fill_date` string field. (Source: `plans/missing-ac/plan.md` §Gap 3 / Green)
- No changes to `positions`, `legs`, `cost_basis_snapshots`, or any IPC payload schemas in `src/main/schemas.ts` beyond `GetPositionResult`.

## Acceptance Criteria

### Gap 1 — US-3 leg history (Source: `docs/epics/01-stories/US-3-position-detail.md`, restated in `plans/missing-ac/plan.md`)

- Scenario: Display position detail with single opening leg — the leg history shows one entry with columns action, type, strike, premium, date.
- Scenario: Leg history displays in chronological order — given a wheel with two legs (open then close), the open leg appears first and the close leg second.

### Gap 2 — US-3 notes/thesis (Source: `docs/epics/01-stories/US-3-position-detail.md`)

- Scenario: Notes and thesis are displayed when present — given a wheel on AAPL with thesis "Bullish on services revenue" and notes "Selling at support level", the thesis and notes sections are visible with the entered text.

### Gap 3 — US-4 close-CSP fill date (Source: `docs/epics/01-stories/US-4-close-csp-early.md`)

- Scenario: Reject close with invalid fill date — when the trader submits a close with fill date before the open leg's fill date, a validation error appears: "Close date cannot be before the open date".
- Scenario: Reject close with fill date after expiration — when the trader submits a close with fill date 2026-04-18 (after expiration 2026-04-17), a validation error appears: "Close date cannot be after expiration date".
- Existing US-4 background continues to apply: AAPL CSP, strike $180.00, expiration 2026-04-17, contracts 1, premium $2.50, phase `CSP_OPEN`.

### Gap 4 — US-5 expiration-date guard (Source: `docs/epics/01-stories/US-5-record-csp-expiration.md`)

- Scenario: Reject expiration before expiration date — given today is 2026-04-10 (before expiration 2026-04-17), when the trader attempts to record the CSP as expired, a validation error appears: "Cannot record expiration before the expiration date".
- Scenario: Allow expiration on the expiration date itself — given today is 2026-04-17 (the expiration date), when the trader records the CSP as expired, the expiration is recorded successfully.

### Plan-level Red-phase assertions (operational ACs added by the remediation plan)

These are written as test specs in the plan and serve as the verifiable acceptance criteria for the fix itself:

- `getPosition` returns `legs` with both entries in chronological order (`fill_date ASC, created_at ASC`) for a position with two legs. (Source: `plans/missing-ac/plan.md` §Gap 1 / Area 1a Red)
- Mocking `usePosition` with two legs causes both to render in DOM order in `PositionDetailPage` (open first, close second). (Source: `plans/missing-ac/plan.md` §Gap 1 / Area 1b Red)
- Mocking `usePosition` with `thesis="Bullish on services revenue"` and `notes="Selling at support level"` causes both strings to appear in the rendered output. (Source: `plans/missing-ac/plan.md` §Gap 2 Red)
- `CloseCspForm` renders a fill-date field; submitting a fill date before the open leg's fill date shows "Close date cannot be before the open date"; submitting after expiration shows "Close date cannot be after expiration date". (Source: `plans/missing-ac/plan.md` §Gap 3 Red)
- `ExpirationSheet.mutate` is called with `{ position_id: positionId }` only — no `expiration_date_override` key. When the mutation rejects with "Cannot record expiration before the expiration date", the message is rendered in the sheet body. (Source: `plans/missing-ac/plan.md` §Gap 4 Red)

## Decisions & Tradeoffs

- This is a **multi-story remediation**, not a new feature: Gap 1 + Gap 2 patch US-3, Gap 3 patches US-4, Gap 4 patches US-5. The plan's wiki output should therefore roll into the existing US-3 / US-4 / US-5 feature pages rather than stand alone. (Source: `plans/missing-ac/plan.md` summary)
- "**No refactoring, no extras**" — the plan's stated scope rule. Refactor phases are explicitly marked "None" for Gaps 2, 3, and 4, and "Keep PositionDetailPage under 200 lines; extract `LegHistoryTable` component if needed" for Gap 1b. The 200-line ceiling is the only refactor signal in the entire plan. (Source: `plans/missing-ac/plan.md` §Gap 1b / Refactor)
- Leg-history ordering is `fill_date ASC, created_at ASC` — using `created_at` as a tiebreaker handles the case of two legs filled on the same date (e.g. a same-day roll). This matches the US-3 Technical Note "Eager-load or join legs ordered by fill_date ASC, created_at ASC." (Source: `plans/missing-ac/plan.md` §Gap 1a / Green, `docs/epics/01-stories/US-3-position-detail.md`)
- Notes/thesis section is **conditionally rendered**: omitted entirely when both fields are null, rather than rendering an empty card with placeholders. (Source: `plans/missing-ac/plan.md` §Gap 2 / Green)
- Gap 3's `fill_date` is intentionally **optional** in the renderer Zod schema — leaving it blank should continue to default to today server-side. The schema regex is `/^\d{4}-\d{2}-\d{2}$/`, matching the existing project convention from US-4. (Source: `plans/missing-ac/plan.md` §Gap 3 / Green)
- Gap 3 surfaces date-range errors from the server (not the client). The server returns errors with `field: 'fillDate'`, which the existing IPC error-to-form-field mapper translates to the form's `fill_date` field. (Source: `plans/missing-ac/plan.md` §Gap 3 / Green, cross-reference: us-4 extract's "Error field mapping" block)
- Gap 4 trades **one line of code** to fix a subtle bug: the existing `referenceDate` defaults to today inside `expireCsp()`, but the renderer was overriding it with the option's own expiration date — which always satisfies `referenceDate >= expirationDate` and disabled the guard. (Source: `plans/missing-ac/plan.md` §Gap 4 / Root cause + Green)
- **Execution dependencies and order:** Area 1b depends on Area 1a (needs `legs` in the API response); Areas 2, 3, and 4 have no new dependencies. Suggested order: **4 → 2 → 3 → 1a → 1b** (smallest/safest first, most complex last). (Source: `plans/missing-ac/plan.md` §Execution Order)
- No mention of a refactor-phase results document — this plan is small enough to omit one. The TDD cycle is Red → Green only for Gaps 2, 3, and 4; Gap 1b allows an optional `LegHistoryTable` extraction if the page would otherwise exceed 200 lines.

## Source Code References

Files to be modified (from `plans/missing-ac/plan.md`):

- `src/main/services/get-position.ts` — second SELECT for `legs`, ordered by `fill_date ASC, created_at ASC`
- `src/main/services/get-position.test.ts` — Red-phase test asserting `legs` array shape and order
- `src/main/schemas.ts` — add `legs: LegRecord[]` to `GetPositionResult`
- `src/renderer/src/api/positions.ts` — extend `PositionDetail` type with `legs`; (Gap 3) ensure `fillDate` server error maps to form `fill_date`
- `src/renderer/src/pages/PositionDetailPage.tsx` — add "Leg History" `SectionCard` (Gap 1b); add "Notes" `SectionCard` for thesis/notes (Gap 2); pass `openFillDate` and `expiration` props into `CloseCspForm` (Gap 3)
- `src/renderer/src/pages/PositionDetailPage.test.tsx` — tests for leg-history rendering and notes/thesis rendering
- `src/renderer/src/components/CloseCspForm.tsx` — optional `fill_date` input, extended `CloseCspFormProps`, extended Zod schema, payload mapping, server-error field mapping
- `src/renderer/src/components/CloseCspForm.test.tsx` — Red-phase tests for the new field and the two date-validation errors
- `src/renderer/src/components/ExpirationSheet.tsx` — drop `expiration_date_override` from `mutate(...)`
- `src/renderer/src/components/ExpirationSheet.test.tsx` — assert mutate payload shape and inline error rendering
- Optional: `src/renderer/src/components/LegHistoryTable.tsx` (extracted if `PositionDetailPage` exceeds 200 lines)

## Open Questions

- None recorded in the plan. The fix scopes are bounded, the validation logic already exists server-side for all three remediated stories, and no DB migrations or new IPC channels are required.

Deferred / out of scope (per the plan summary "no refactoring, no extras"):

- The broader `LegData` snake_case ↔ camelCase debt highlighted in earlier extracts is not addressed here — Gap 3's renderer schema continues to use `fill_date` (snake_case) on the form side while the IPC channel uses `fillDate` (camelCase).
- Editing or correcting a recorded leg is not in scope (already deferred by US-3 and US-4).
- `ExpirationSheet`'s state-reset-via-`useEffect` tech debt called out in the US-5 extract is unaffected — this plan touches only the mutate-payload line, not the sheet's lifecycle.
