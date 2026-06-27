---
page: docs/spec/architecture/02-adrs/action-buttons-phase-gated.md
audited_at: 2026-06-27
findings: 3
---

# Audit: action-buttons-phase-gated.md

## Verified (4)

- ✓ `PositionDetailActions` component exists and conditionally renders by phase — `src/renderer/src/components/PositionDetailActions.tsx`.
- ✓ `HOLDING_SHARES` shows "Open Covered Call →" — `PositionDetailActions.tsx:75` (gated additionally on `hasCostBasis`).
- ✓ `CC_OPEN` shows "Close CC Early →" and DTE-gated "Record Expiration →" (`phase === 'CC_OPEN' && ccExpired`) — `PositionDetailActions.tsx:53,68`.
- ✓ `CSP_OPEN` shows "Roll CSP →", "Record Assignment →", "Record Expiration →" — `PositionDetailActions.tsx:82-99`; buttons carry `data-testid` (`roll-csp-btn`, `record-assignment-btn`, etc.) per the convention.

## Drift (2)

- ✗ Page lists `CSP_OPEN` as showing "`Close Early →`" among its buttons (line 9), but `PositionDetailActions` renders no such button on `CSP_OPEN` — the early-close path is a separate `CloseCspForm` component (`src/renderer/src/components/CloseCspForm.tsx`), not a header action button. Suggested fix: drop "Close Early →" from the `CSP_OPEN` button list or note it is rendered by `CloseCspForm`, not `PositionDetailActions`.
- ✗ Page's `CC_OPEN` button list (line 11) omits "Roll CC →" and "Record Call-Away →", both of which the component renders on `CC_OPEN` — `PositionDetailActions.tsx:54,62`. Suggested fix: add `Roll CC →` and `Record Call-Away →` to the `CC_OPEN` examples.

## Unverifiable (1)

- ? "This is a UI-layer gate on top of the authoritative lifecycle engine guard ... backend still rejects illegal transitions" — narrative rationale; not mechanically audited here.

## Missing files (0)

None checked failed.
