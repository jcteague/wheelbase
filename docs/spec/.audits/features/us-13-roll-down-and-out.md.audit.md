---
page: docs/spec/features/us-13-roll-down-and-out.md
audited_at: 2026-09-28
findings: 2
---

# Audit: docs/spec/features/us-13-roll-down-and-out.md

Page is explicitly **plan-only**. Planned-but-absent items are expected, not drift; only claims
about the _current_ (US-12 baseline) code are audited as drift.

## Verified (10)

- ✓ Status claim: `RollCspInput` has no `currentStrike`/`newStrike` (`src/main/core/lifecycle.ts:353-359`)
- ✓ Status claim: `src/renderer/src/lib/rollType.ts` does not exist
- ✓ Status claim: no `rollCount` on `positions:get` — the only `rollCount` in `src/` is the renderer leg-history summary (`src/renderer/src/lib/rollGroups.ts:43`)
- ✓ `must_not_be_earlier` does not exist in `src/`; US-12's `must_be_after_current` is still the live code (`lifecycle.ts:372`)
- ✓ `plans/us-13/` has been removed, as stated
- ✓ Planned e2e `e2e/roll-csp-down-and-out.spec.ts` does not exist (consistent with plan-only)
- ✓ `RollCspPayloadSchema` still declares `newStrike: z.number().positive().optional()` (`src/main/schemas.ts:333,348`)
- ✓ Service defaults `newStrike` to the active leg's strike when omitted (`src/main/services/roll-csp-position.ts:34`)
- ✓ Current debit copy is still US-12's "This roll costs more to close than the new premium provides" (`src/renderer/src/components/RollCspForm.tsx:81`)
- ✓ Linked `mockups/us-12-13-roll-csp-form.mdx`, `./us-12-roll-csp.md`, `docs/spec/.extracts/us-12.md`, `../domain/wheel-lifecycle.md`, `../domain/cost-basis.md`, `../contracts/ipc-handlers.md`, `../schema/tables.md` exist

## Drift (2)

- ✗ Lines 27, 49, 70 name the existing US-12 service variable `formattedNewStrike`; the code calls it `newStrikeFormatted` (`src/main/services/roll-csp-position.ts:34`). Suggested fix: rename in page.
- ✗ Lines 43, 55, 71 describe the current US-12 roll-type helper as an "inline 3-arg helper used by `RollCspSheet`". The live helper is a shared **2-arg** `getRollTypeLabel(currentStrike, newStrike)` in `src/renderer/src/lib/rolls.ts:25`, already consumed by `RollCspForm.tsx:107` and `RollCspSuccess.tsx:33`. Suggested fix: describe the baseline as the 2-arg `rolls.ts` helper (and consider extending it there rather than a new `rollType.ts`).

## Unverifiable (3)

- ? All "What is planned" / AC / planned-source-file content — design intent for unimplemented work.
- ? Open questions referencing `plan.md`, `research.md`, `data-model.md`, `contracts/positions-roll-csp.md` — the plan dir is deleted, so those citations cannot be checked.
- ? Partial overlap: `calculateRollBasis` already adds a strike delta for different-strike CSP rolls (`src/main/core/costbasis.ts:259-262`) — whether that was US-13 work is not determinable from code; the page's "absent" status is about the lifecycle/`rollType`/`rollCount` pieces and remains accurate.

## Missing files (0)
