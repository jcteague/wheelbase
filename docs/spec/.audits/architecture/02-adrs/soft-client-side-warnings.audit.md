---
page: docs/spec/architecture/02-adrs/soft-client-side-warnings.md
audited_at: 2026-06-27
findings: 1
---

# Audit: soft-client-side-warnings.md

## Verified (4)

- ✓ Future assignment date warning is client-side and non-blocking — `src/renderer/src/components/AssignmentSheet.tsx:122` (`<AlertBox variant="warning">This date is in the future — are you sure?</AlertBox>`).
- ✓ Cost-basis guardrail on CC open is a pure helper — `src/renderer/src/components/openCcGuardrail.ts:24` (`computeGuardrail(strikeStr, basisStr)`), consumed in `OpenCoveredCallSheet.tsx:37,105` (rendered, not gating submit).
- ✓ Guardrail messages match the ADR — `openCcGuardrail.ts:32` ("...lock in a loss of $X/share if called away") and `:38` ("...at your cost basis — you would break even...").
- ✓ `AssignCspPayloadSchema` accepts any ISO date string (no `max(today)` rule) — `src/main/schemas.ts:183-185` (`assignmentDate: z.string().regex(IsoDateRegex, ...)`, regex-only).

## Drift (1)

- ✗ Page lists "Future CC fill date" and "Zero CC premium ($0.00 — are you sure?)" as implemented soft warnings, but neither was found in the covered-call sheet/form. `OpenCoveredCallSheet.tsx` only has a _hard_ "Premium is required" error (`:42`) and the cost-basis guardrail (`:37`); no `fillDate > today` warning and no `premium === 0` "$0.00" warning exist (grep across `src/renderer/src/` for "in the future"/"Premium is $0"/"$0.00" returns only the `AssignmentSheet` future-date case). Suggested fix: drop the CC future-fill-date and zero-premium examples from the ADR, or implement them.

## Unverifiable (2)

- ? "Hard validation (negative price, contracts exceeding shares-held, fill-date before open) is enforced by the lifecycle engine" — engine-side enforcement claim, not audited in this page's scope.
- ? "AlertBox colour token discriminates gold/info-blue" — design-token claim; `variant="warning"` confirmed on the assignment case, full palette mapping narrative.

## Missing files (0)

- Extract/feature references only.
