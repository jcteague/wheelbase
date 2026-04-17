# Refactor Phase Results: US-15 Areas 1 & 2

## Automated Simplification

- code-simplifier agent run: skipped — scope was mechanical propagation, not quality improvements

## Manual Refactorings Performed

### 1. Propagate `rollChainId` to all `LegRecord` construction sites

**Files modified:**

- `src/main/services/get-position.ts` — `mapActiveLeg`: added `rollChainId: null` (activeLeg comes from position JOIN which doesn't include roll_chain_id column)
- `src/main/services/positions.ts` — CSP_OPEN leg: `rollChainId: null`
- `src/main/services/assign-csp-position.ts` — ASSIGN leg: `rollChainId: null`
- `src/main/services/close-covered-call-position.ts` — CC_CLOSE leg: `rollChainId: null`
- `src/main/services/close-csp-position.ts` — CSP_CLOSE leg: `rollChainId: null`
- `src/main/services/expire-cc-position.ts` — CC_EXPIRED leg: `rollChainId: null`
- `src/main/services/expire-csp-position.ts` — EXPIRE leg: `rollChainId: null`
- `src/main/services/open-covered-call-position.ts` — CC_OPEN leg: `rollChainId: null`
- `src/main/services/record-call-away-position.ts` — CALLED_AWAY leg: `rollChainId: null`
- `src/main/services/roll-csp-position.ts` — ROLL_FROM + ROLL_TO legs: `rollChainId` (the variable)
- `src/main/services/roll-cc-position.ts` — ROLL_FROM + ROLL_TO legs: `rollChainId` (the variable)

**Reason:** `LegRecord` gained a required `rollChainId: string | null` field. Every service that constructs a `LegRecord` inline needed the field added. Roll services use the actual UUID; all other services use `null`.

### 2. Update test fixtures

**Files modified:**

- `src/renderer/src/components/LegHistoryTable.test.tsx` — added `rollChainId: null` to `CSP_OPEN_LEG` base fixture
- `src/renderer/src/pages/PositionDetailPage.test.tsx` — added `rollChainId: null` to two `activeLeg` fixture objects

## Test Execution Results

```
Test Files  70 passed (70)
Tests       701 passed (701)
```

## Quality Checks

- ✅ `pnpm test` passed (701 tests, 0 failures)
- ✅ `pnpm lint` passed
- ✅ `pnpm typecheck` passed

## Remaining Tech Debt

- `mapActiveLeg` in `get-position.ts` sets `rollChainId: null` even for ROLL_TO active legs (where the DB has a real UUID). The activeLeg is used only for displaying current strike/expiration/premium in the position header — not for the timeline. If a future feature needs activeLeg.rollChainId, the GET_QUERY join needs `l.roll_chain_id` added.
