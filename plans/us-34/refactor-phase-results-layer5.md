# Refactor Phase Results: US-34 Layer 5 — E2E Tests

## Automated Simplification

- code-simplifier agent run: skipped (targeted manual refactoring was more appropriate for test fixtures)

## Manual Refactorings Performed

### 1. Remove Unused Constants

**File**: `e2e/position-cockpit.spec.ts`
**Before**: `const PREMIUM = 3.5` and `const CONTRACTS = 1` declared at module level
**After**: Both removed
**Reason**: Neither was referenced anywhere in the 24 tests — position creation hardcodes the same values inline in `seedPosition`.

### 2. Consolidate Duplicate Snapshot Fixtures

**File**: `e2e/position-cockpit.spec.ts`
**Before**: Three extra snapshot constants with identical values to existing ones:

```typescript
const SNAP_DELTA_GREEN = makeSnapshot('2.40', '2.60', '2.50', '-0.15') // = SNAP_HOLD
const SNAP_DELTA_GOLD = makeSnapshot('2.40', '2.60', '2.50', '-0.35') // = SNAP_WATCH
const SNAP_DELTA_RED = makeSnapshot('2.40', '2.60', '2.50', '-0.52') // = SNAP_CONSIDER_ROLL
```

**After**: Removed the three duplicates; delta-color tests (18, 19, 20) now reference `SNAP_HOLD`, `SNAP_WATCH`, and `SNAP_CONSIDER_ROLL` respectively with inline comments clarifying the delta value and expected color.
**Reason**: Duplicate constants with different names for the same fixture make test intent harder to follow and create false impression that different data is needed.

### 3. Remove Redundant Explicit `quotes` in All Tests

**File**: `e2e/position-cockpit.spec.ts`
**Before**: Every `launchWithMocks(dbPath, { ... })` call passed `quotes: { AAPL: AAPL_QUOTE }` explicitly.
**After**: All 24 tests omit the `quotes` key — the helper's default (`opts.quotes ?? { AAPL: AAPL_QUOTE }`) is identical.
**Reason**: The default already supplies `AAPL: AAPL_QUOTE`; explicit repetition obscures which tests intentionally use a non-default quote.

### 4. Simplify "No Market Data" Tests to No-Arg Form

**File**: `e2e/position-cockpit.spec.ts`
**Before**: Six tests passed both `optionSnapshots: {}` and `quotes: { AAPL: AAPL_QUOTE }` explicitly:

- AC-1 no data, AC-8 no-active-leg, AC-10 CloseCspForm, AC-10 Notes, US-34 Greeks unavailable, US-34 HOLDING_SHARES
  **After**: All six call `launchWithMocks(dbPath)` with no options object — both defaults (`{}` snapshots and `AAPL` quote) apply automatically.
  **Reason**: No-arg form makes it immediately clear these tests don't depend on any market data, and the comment on each test explains why.

### 5. Add Comment to `launchWithMocks` documenting defaults

**File**: `e2e/position-cockpit.spec.ts`
**Before**: No comment on default behavior.
**After**: Added a brief JSDoc-style comment above the function explaining that `quotes` defaults to `{ AAPL: AAPL_QUOTE }` and `optionSnapshots` defaults to `{}`.
**Reason**: Makes it clear to future readers why so few tests pass options.

## Quality Checks

- ✅ `pnpm lint` passed (0 errors, 0 warnings after prettier fix)
- ✅ `pnpm typecheck` passed
- ✅ `pnpm test` — E2E file is not picked up by Vitest (expected; it imports playwright and lives in `e2e/`)
- ⚠️ `pnpm test:e2e` — cannot be run from Claude Code's shell; requires GUI terminal (iTerm/Terminal.app)

## Remaining Tech Debt

None identified.

## Notes

All refactorings applied in a single rewrite pass. The 24 tests and their logic are completely intact — only constants and `launchWithMocks` call signatures changed.
