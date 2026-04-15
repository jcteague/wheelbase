# Fix UTC Date Bug & Simplify Date Handling

## Context

`new Date().toISOString().slice(0, 10)` is used ~50 times across the codebase to get "today" as `YYYY-MM-DD`. This converts to UTC first, so after ~5pm PDT "today" becomes "tomorrow". This causes:

1. Positions created in the evening display dates 1 day ahead
2. Assignment form rejects today's date because UTC "today" > local "today"

Additionally, the 35-char expression is scattered everywhere — convoluted and error-prone.

**Fix:** Use `date-fns/format(new Date(), 'yyyy-MM-dd')` which returns the local date. Wrap in a `localToday()` utility.

## Decisions

- **No shared source directory** — main and renderer have separate tsconfigs, so create one utility per realm
- **`computeDte()` stays unchanged** — its UTC math is correct (both sides use UTC, offsets cancel)
- **No shadcn component changes** — `date-picker.tsx` is untouched
- **Re-export `isoDate` from test-utils** — avoids renaming across all test files
- **E2E helpers get inline `date-fns` call** — they can't import from `src/main/`

## Changes

### 1. New: `src/main/dates.ts` + `src/main/dates.test.ts`

```ts
import { format, addDays } from 'date-fns'

export function localToday(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export function localDate(offsetDays: number): string {
  return format(addDays(new Date(), offsetDays), 'yyyy-MM-dd')
}
```

Test: fake timers at 10pm local (= next day UTC), assert local date returned.

### 2. New: `src/renderer/src/lib/dates.ts` + `src/renderer/src/lib/dates.test.ts`

Same two functions, same tests. Separate file for renderer tsconfig scope.

### 3. Update 8 service files

Replace `const today = new Date().toISOString().slice(0, 10)` with `const today = localToday()`:

- `src/main/services/positions.ts`
- `src/main/services/open-covered-call-position.ts`
- `src/main/services/close-csp-position.ts`
- `src/main/services/expire-csp-position.ts`
- `src/main/services/expire-cc-position.ts`
- `src/main/services/roll-csp-position.ts`
- `src/main/services/roll-cc-position.ts`
- `src/main/services/close-covered-call-position.ts`

### 4. Update test utilities

- `src/main/test-utils.ts` — rewrite `isoDate()` to delegate to `localDate()`
- `src/main/core/lifecycle.test.ts` — replace inline `isoDate()` with import from `../dates`
- `src/main/services/positions.test.ts` — replace inline pattern
- `src/main/services/close-csp-position.test.ts` — replace inline pattern
- `src/main/services/close-covered-call-position.test.ts` — replace inline pattern
- `src/main/services/roll-cc-position.test.ts` — replace inline pattern

### 5. Update 2 renderer components

- `src/renderer/src/components/AssignmentSheet.tsx:45` — `localToday()` instead of `new Date().toISOString().slice(0, 10)`
- `src/renderer/src/components/CloseCcEarlySheet.tsx:39,68` — same replacement

### 6. Update E2E helpers

- `e2e/helpers.ts:75` — use `format(new Date(), 'yyyy-MM-dd')` from date-fns directly
- Remaining E2E spec files with inline pattern (~25 instances across 8 files)

## Verification

```bash
pnpm test        # unit + integration
pnpm lint
pnpm typecheck
pnpm format
```
