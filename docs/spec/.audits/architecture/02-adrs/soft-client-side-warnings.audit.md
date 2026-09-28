---
page: docs/spec/architecture/02-adrs/soft-client-side-warnings.md
audited_at: 2026-09-28
findings: 1
---

# Audit: soft-client-side-warnings.md

## Verified (7)

- ✓ Future assignment date warning "This date is in the future — are you sure?" as `AlertBox variant="warning"` in `AssignmentSheet` — `src/renderer/src/components/AssignmentSheet.tsx:123`.
- ✓ Cost-basis guardrail messages ("below your cost basis — you would lock in a loss of $X.XX/share if called away", "at your cost basis — you would break even") — `src/renderer/src/components/openCcGuardrail.ts:29-40`.
- ✓ Pure helper `computeGuardrail(strike, basis)` in `openCcGuardrail.ts` — line 24; consumed by `OpenCoveredCallSheet.tsx:7,37`.
- ✓ Gold warning vs info-blue for positive outcome — `OpenCcForm.tsx:92-98`; `AlertBox` variants `warning` → `--wb-gold`, `info` → `--wb-sky` (`src/renderer/src/components/ui/AlertBox.tsx:14-23`).
- ✓ "Current state" note: no future-fill-date or zero-premium CC soft warning exists — grep for `fillDate >`/`premium === 0`/"are you sure" in `components/` finds only the assignment-date warning.
- ✓ `AssignCspPayloadSchema` accepts any ISO date (regex only, no ≤ today rule) — `src/main/schemas.ts:209-212`.
- ✓ Linked extracts (us-6, us-7) and feature pages exist.

## Drift (0)

None.

## Unverifiable (1)

- ? "The submit button is never disabled by a soft warning" and "hard validation … enforced by the lifecycle engine" — `FormButton` usage in `OpenCcForm.tsx:160` and `AssignmentSheet.tsx:140` shows pending-state only, but not exhaustively audited across every form.

## Missing files (0)

None.
