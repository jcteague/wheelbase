# Design System Migration — Session Notes

**Date:** 2026-04-10  
**Stopped at:** Layer 3 Green phase — rate limit hit after dispatching all 7 agents

---

## What Was Completed This Session

### Layer 1, 2 (all complete before session start)

All checked off in tasks.md.

### Layer 3 — Red Phase (completed this session)

All 7 Red tasks are checked off in tasks.md:

- ✓ Area 4 — ExpirationSheet (3 new failing tests added to `ExpirationSheet.test.tsx`)
- ✓ Area 5 — CcExpirationSheet (3 new failing tests added to `CcExpirationSheet.test.tsx`)
- ✓ Area 6 — AssignmentSheet (3 new failing tests added to `AssignmentSheet.test.tsx`)
- ✓ Area 7 — OpenCc Suite (new files: `OpenCcForm.test.tsx`, `OpenCcSuccess.test.tsx`)
- ✓ Area 8 — RollCsp Suite (new files: `RollCspForm.test.tsx`, `RollCspSuccess.test.tsx`)
- ✓ Area 9 — CloseCcEarly Suite (new files: `CloseCcEarlyForm.test.tsx`, `CloseCcEarlySuccess.test.tsx`)
- ✓ Area 10 — CallAway Suite (new files: `CallAwayForm.test.tsx`, `CallAwaySuccess.test.tsx`)

---

## Where to Resume

**Next step:** Layer 3 Green phase — all 7 areas unblocked, can run in parallel.

Run:

```
/implement-plan design-system/plan.md green
```

Or to run only Layer 3:

```
/implement-plan design-system/plan.md layer-3
```

The 7 Green agents were dispatched but immediately hit the rate limit — **no component files were modified**. All component files still use inline styles. The failing tests are in place and ready.

### Green tasks to run (in parallel):

| Area    | Component file(s)                                 | Test file(s)                                                | Instances |
| ------- | ------------------------------------------------- | ----------------------------------------------------------- | --------- |
| Area 4  | `ExpirationSheet.tsx`                             | `ExpirationSheet.test.tsx`                                  | ~20       |
| Area 5  | `CcExpirationSheet.tsx`                           | `CcExpirationSheet.test.tsx`                                | 22        |
| Area 6  | `AssignmentSheet.tsx`                             | `AssignmentSheet.test.tsx`                                  | 41        |
| Area 7  | `OpenCcForm.tsx`, `OpenCcSuccess.tsx`             | `OpenCcForm.test.tsx`, `OpenCcSuccess.test.tsx`             | 7 + 17    |
| Area 8  | `RollCspForm.tsx`, `RollCspSuccess.tsx`           | `RollCspForm.test.tsx`, `RollCspSuccess.test.tsx`           | 15 + 8    |
| Area 9  | `CloseCcEarlyForm.tsx`, `CloseCcEarlySuccess.tsx` | `CloseCcEarlyForm.test.tsx`, `CloseCcEarlySuccess.test.tsx` | 21 + 20   |
| Area 10 | `CallAwayForm.tsx`, `CallAwaySuccess.tsx`         | `CallAwayForm.test.tsx`, `CallAwaySuccess.test.tsx`         | 38 + 31   |

---

## Key Notes for Green Phase

- Reference `plans/design-system/data-model.md` for inline style → Tailwind token mappings
- `fontFamily: MONO` → `font-wb-mono` everywhere
- Conditional P&L colors: `pnl >= 0 ? 'text-wb-green' : 'text-wb-red'` (static class strings, Tailwind-safe)
- `linear-gradient` backgrounds may remain inline if not expressible as Tailwind utilities
- After Green: 7 Refactor tasks remain, then Layer 4 E2E tests

---

## Test Notes from Red Agents

**Common pattern issue:** Tests walk up from text nodes using `closest('div[class]')`. When the target element has no class but a parent `SheetBody` does, the test finds `SheetBody` instead. This was intentional in the Red phase — the tests will pass once the target elements get their own Tailwind classes.

**Area 7 note:** The leg summary card tests use `<section>` element queries (what `SectionCard` renders) to avoid false-positives from `SheetCloseButton` which already has `border-wb-border` classes.
