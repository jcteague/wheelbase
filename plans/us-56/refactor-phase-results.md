# Refactor Phase Results: US-56 — Earnings-Proximity Alert

## Automated Simplification

- code-simplifier agent run: **passed** (scoped to the five US-56 Layer 1 files)
- Applied: tightened `EarningsProximityInput` to `Pick<…, 'daysToEarnings' | 'expiration'>` (dropped unused `dte` — the predicate reads the full input inline, only the summary helper uses the slice); simplified `resolveTicker` to return just the date instead of echoing the input ticker through a tuple.
- `finnhub-credentials.ts` and both test files: no changes needed.
- The Layer 2/3 diffs (service wiring, e2e block) were reviewed manually — small enough that a second agent pass would have been disproportionate.

## Manual Refactorings Performed

### 1. Reuse — EARNINGS_PROXIMITY `missingData` guard

**File**: `src/main/core/alerts.ts`
**Before**: nested ternary re-implementing the dte null-check inline
**After**: `missingDteReason(input) ?? (input.daysToEarnings === null ? MISSING_EARNINGS_DATE : null)`
**Reason**: reuses the existing shared guard exactly as the plan's constraint asked ("extract a shared guard only if it reads identically").

### 2. Remove duplication — shared `LoggerLike`

**Files**: `src/main/logger.ts`, `src/main/integrations/finnhub-earnings.ts`, `src/main/services/evaluate-alerts.ts`
**Before**: identical `type LoggerLike = Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>` defined locally in two modules that US-56 now connects
**After**: one exported `LoggerLike` in `src/main/logger.ts`, imported by both
**Reason**: the injection-surface type belongs next to the logger it narrows.

### 3. Remove duplication — shared `FetchEarnings` seam type

**Files**: `src/main/services/evaluate-alerts.ts` (now exports it), `src/main/services/evaluate-alerts-test-utils.ts` (imports it)
**Before**: the same function type declared in both the service and the test utils
**After**: service owns and exports the seam; test utils import it
**Reason**: single owner for the injection contract.

## Considered and declined

- **`toEvaluationInput` marketContext object** — left flat per the plan (call site reads fine; the three lookup maps have distinct value types so they cannot be silently swapped).
- **Splitting `alerts.ts` / `evaluate-alerts.ts` on the ~200-line gate** — both are cohesive single-concern files (rule registry per the registry ADR; one orchestration path); splitting would be churn against the registry pattern.
- **US-56 e2e test names lack the `AC:` prefix** used by US-50/53/54/55 — deliberate: the plan's AC-audit table pins these exact Gherkin-mirroring names.
- **`vi.mock` Finnhub guard duplicated in both service test files** — required; `vi.mock` is hoisted per-module and cannot be shared through a helper.

## Test Execution Results

Full suite: **1526 passed / 0 failed** (138 files).

## Quality Checks

- ✅ `pnpm test` (no regressions)
- ✅ `pnpm lint`
- ✅ `pnpm typecheck`
- ✅ `pnpm format`

## Files touched (production)

- `src/main/core/alerts.ts`
- `src/main/integrations/finnhub-earnings.ts`
- `src/main/services/evaluate-alerts.ts`
- `src/main/logger.ts`

## E2E coverage added or modified

- `src/main/services/evaluate-alerts.e2e.test.ts` — US-56 block, 4 scenarios (added in Red; unchanged by refactor)

## Remaining Tech Debt

- [ ] Singular/plural summary wording ("Earnings in 1 days") — shared limitation with the DTE summaries; fix both together if ever addressed.
