---
page: docs/spec/features/us-13-roll-down-and-out.md
audited_at: 2026-06-27
findings: 3
---

# Audit: docs/spec/features/us-13-roll-down-and-out.md

The page declares itself **plan-only / not yet implemented** (line 5). The audit
confirms that claim still holds at the engine level: the US-13-specific changes
to `rollCsp` and the new `rollType.ts` module are genuinely absent.

## Verified (5)

- ✓ "plan-only" claim holds for `rollCsp`: `RollCspInput` (`src/main/core/lifecycle.ts:353-359`)
  has **no** `currentStrike` / `newStrike` fields; `rollCsp` (`:365-382`) still uses the
  US-12 `newExpiration <= currentExpiration` rule with code `must_be_after_current` (`:373`)
  and has **no** `no_change` check and **no** positive-strike check — i.e. none of the
  US-13 §"What is planned" engine work has landed. (NB: the `no_change` / `currentStrike` /
  `newStrike` symbols that exist at lines 386-412 belong to `rollCc` / US-14, not `rollCsp`.)
- ✓ Planned new module `src/renderer/src/lib/rollType.ts` is ABSENT (Glob). The
  4-arg `getRollTypeLabel` it describes does not exist; the live `getRollTypeLabel`
  in `src/renderer/src/lib/rolls.ts:25` is still the US-12 2-arg version
  (`getRollTypeLabel(currentStrike, newStrike)`), exactly as the page implies.
- ✓ Planned `rollCount` field is ABSENT from `get-position.ts` and `schemas.ts`
  (grep for `rollCount` in both returns nothing) — consistent with "not yet implemented".
- ✓ Planned E2E spec `e2e/roll-csp-down-and-out.spec.ts` is ABSENT (Glob), as the
  page's "none verified against the working tree" caveat states.
- ✓ All `./` and `../`-relative spec links resolve: `./us-12-roll-csp.md`,
  `../domain/wheel-lifecycle.md`, `../contracts/ipc-handlers.md`,
  `../domain/cost-basis.md`, `../schema/tables.md` all exist.

## Drift (1)

- ✗ Page line 5 claims `plans/us-13/` "contains `plan.md`, `research.md`,
  `data-model.md`, `contracts/positions-roll-csp.md`, and `quickstart.md`". The
  directory **no longer exists** (`ls plans/us-13/` → "no such directory"). The
  plan artifacts the page points readers to are gone. Suggested fix: update the
  Status note to reflect that the plan dir has been removed (or restore it), and
  drop the "Re-run `/update-spec us-13`" instruction since there is no plan dir to
  re-extract.

## Unverifiable (1)

- ? The page's "Open questions" about overlap with US-12's already-shipped
  active-leg fix and error-code reconciliation are design-intent notes, not
  mechanically verifiable claims about current code.

## Missing files (1)

- ✗ `plans/us-13/` and all artifacts cited in the Status note and "Planned source
  files" section do not exist on disk. (This is expected for genuinely
  unimplemented work, but the page asserts the plan dir is present — see Drift.)

Summary: page does NOT over-claim implementation — the "plan-only" status is
accurate at the code level. The only real drift is the stale claim that the
`plans/us-13/` directory still exists.
