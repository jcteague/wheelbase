# Design System Migration — Session Handoff

_Last updated: 2026-04-11_

## Current Test Status

**2 tests failing** in `src/renderer/src/components/RollCspSuccess.test.tsx`:

- `credit roll hero display container has bg-wb-green-dim class`
- `debit roll hero display container has bg-wb-gold-dim class`

**Root cause:** `className="font-wb-mono"` was added to the inner hero label `<div>` in `RollCspSuccess.tsx` during a MONO refactor. This breaks the test's `label.closest('div[class]')` traversal — it now stops at the inner div instead of climbing to the outer `bg-wb-green-dim` / `bg-wb-gold-dim` card div.

**Fix already applied, needs verification:**

- `RollCspSuccess.tsx` line ~86: currently has `fontFamily: 'var(--font-wb-mono)'` inline (no className on the inner div)
- MONO import already removed
- Just needs `pnpm test` to confirm 665 pass

---

## What Was Completed This Session

- Fixed 2 `CallAwaySuccess` test failures (`getByText('Wheel Complete', { selector: 'div' })`)
- Checked off all 7 Layer 3 Green tasks in `tasks.md`
- MONO → `font-wb-mono` done in: `ExpirationSheet.tsx`, `AssignmentSheet.tsx`, `RollCspForm.tsx`
- `RollCspSuccess.tsx`: MONO import removed, regression introduced (see above — fix applied, needs test run)
- Area 5 agent (CcExpirationSheet): extracted `CcExpirationSuccess` + `CcExpirationConfirm` sub-components, used `Caption` component, removed MONO — **applied to main repo, 665 tests confirmed**
- Area 7 agent (OpenCc suite): converted inline styles to Tailwind in `OpenCcForm.tsx` and `OpenCcSuccess.tsx`, removed MONO — **applied to main repo, 665 tests confirmed**

---

## Remaining Work (in order)

### Immediate — Fix Regression

1. Run `pnpm test` to confirm `RollCspSuccess` tests now pass with the `var(--font-wb-mono)` inline approach

### Layer 3 Refactors (not yet applied to main repo)

2. **`CallAwayForm.tsx`** — 9 `fontFamily: MONO` usages remain; remove MONO import
3. **`CallAwaySuccess.tsx`** — 2 `fontFamily: MONO` usages remain; remove MONO import
4. **Area 8 — RollCsp suite**: `SummaryRow` component is duplicated between `RollCspForm.tsx` and `RollCspSuccess.tsx` — extract to `src/renderer/src/components/ui/SummaryRow.tsx`
5. **Area 9 — CloseCcEarly suite**: `CloseCcEarlyForm.tsx` and `CloseCcEarlySuccess.tsx` still have inline layout styles that could use Tailwind classes; the worktree agent found ~95 lines of reductions

### Layer 2 Remaining

6. **Area 14 Refactor** — still `[ ]` in tasks.md; files: `Stat.tsx`, `Breadcrumb.tsx`, `NavItem.tsx`, `PhaseBadge.tsx`, `PositionDetailActions.tsx`, single-instance primitives

### Layer 4

7. **Area 15 — E2E Tests** — Red/Green/Refactor for `e2e/design-system.spec.ts`; covers 7 ACs from `docs/issues/design-system-tailwind-migration.md`

---

## Notes for Next Session

- The 7 background refactor agents all ran in **isolated worktrees cut from HEAD** (not the working directory). All Green migration changes were unstaged, so the worktrees had the pre-migration code. Only Areas 5 and 7 happened to work on the main repo directly.
- Do NOT cherry-pick from any worktree branches — they contain changes to the old pre-migration code.
- `SectionCard.tsx` still imports and uses `MONO` — that's Layer 2 Area 14 scope, not Layer 3.
