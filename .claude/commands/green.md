---
description: 'Implement features to make failing tests pass (TDD green phase)'
---

# Green Phase: Make Tests Pass

## User Input

```
$ARGUMENTS
```

## Outline

You are implementing the **GREEN phase** of Test-Driven Development for Wheelbase (Option Wheel Manager). Your goal is to write the minimum code necessary to make all failing tests pass.

### Phase 1: Setup and Prerequisites

1. **Locate Feature Artifacts**
   - Find the relevant user story under `phase-1-stories/`
   - Find the feature plan under `plans/<feature-dir>/`
   - Required: `plans/<feature-dir>/red-phase-results.md` — if missing, run `/red` first
   - If `red-phase-results.md` is missing, locate failing tests directly in the repo

2. **Review Test Requirements**
   - Read `red-phase-results.md` to understand which tests need to pass
   - Open each listed test file and review every assertion
   - Understand the expected data shapes, return types, and error conditions

3. **Identify Implementation Scope**
   - Determine which files need to be created or modified:
     - `src/main/core/` — pure engine functions (no DB/IPC/broker imports ever)
     - `src/main/services/` — DB access + core logic composition
     - `src/main/ipc/` — IPC handlers (thin wrappers only)
     - `src/main/db/` — migrations and DB init
     - `src/renderer/src/components/` — React 19 components (shadcn/ui)
     - `src/renderer/src/hooks/` — TanStack Query hooks
     - `src/renderer/src/api/` — IPC → hooks adapter (typed IPC calls)

### Phase 2: Implement Features

4. **Write Minimal Implementation**
   - **CRITICAL**: Write the SIMPLEST code that makes tests pass
   - Do not add features not covered by tests
   - Do not optimise prematurely
   - Do not refactor existing code — save that for the refactor phase
   - Let the tests drive every decision

5. **Follow Architecture Rules (non-negotiable)**
   - `src/main/core/` engines import ONLY `decimal.js` and other pure utilities — no `better-sqlite3`, no Alpaca SDK, no IPC
   - All Alpaca API calls stay in `src/main/integrations/alpaca.ts`
   - IPC handlers never throw to the renderer — always return `{ ok: true, ...result } | { ok: false, errors: [...] }`
   - Rolls are always stored as linked leg pairs (`roll_from_id` / `roll_to_id`) — never mutate a leg in place
   - Cost basis formula: `assignment_strike − CSP_premiums − CC_premiums + roll_debits − roll_credits`
   - Use Zod v4 for all IPC payload validation — infer TypeScript types from schemas

6. **Follow Code Conventions**
   - TypeScript strict mode throughout
   - `decimal.js` with `ROUND_HALF_UP` for all monetary values — never `number` for money
   - Functional style: pure functions over classes, `map`/`filter`/`reduce` over loops
   - No mutation — prefer returning new objects/values

7. **Enforce Single Responsibility — one file, one concern**
   - `core/` — pure domain logic only; no DB, no IPC, no Alpaca
   - `services/` — DB access + core logic composition; no IPC concerns
   - `ipc/` — thin wrappers only; validate input, call service, return result; no business logic
   - Components — presentational only; no data fetching or business logic
   - Hooks — data fetching/mutation only; no business logic
   - **Hard stop: if a file exceeds ~200 lines, split it before proceeding**

8. **Enforce Open/Closed**
   - Add new behaviour by creating new functions/modules, not editing existing engine files
   - Core engines must not grow to accommodate new callers — callers adapt, engines stay stable

9. **No Backwards Compatibility Cruft**
   - When a requirement changes, delete the old logic — do not preserve it alongside the new
   - No deprecated wrappers, `_old` suffixes, commented-out blocks, or dead code paths
   - If a function or module is no longer called after a change, delete it
   - Exception only if explicitly told to keep it

### Phase 3: Iterative Test Execution

7. **Run Tests Frequently**
   - After every small change: `pnpm test`
   - To target a specific file: `pnpm test src/main/core/lifecycle.test.ts`
   - Fix failures one at a time — do not batch unrelated changes

8. **Verify All Tests Pass**
   - All tests from the red phase must be green
   - No regressions in any previously passing tests
   - Run the full suite: `pnpm test`

### Phase 4: Quality Gates

9. **Run All Quality Checks — fix any failures before documenting**
   - `pnpm lint` — ESLint
   - `pnpm typecheck` — tsc --noEmit (strict mode)
   - Do not consider the green phase complete until all three pass: tests, lint, typecheck

### Phase 5: Documentation and Handoff

10. **Document Results**
    - Create `plans/<feature-dir>/green-phase-results.md` with:
      - Feature directory path and linked artifacts (story file, plan file, red-phase-results)
      - List of files created/modified (exact paths, purpose of each)
      - Key public interfaces implemented (function signatures, endpoints, component props)
      - Implementation approach summary
      - Any deviations from the plan and why
      - Known limitations or tech debt (primary input for refactor phase)
      - Full test execution output (all passing)

11. **Prepare for Refactor Phase**
    - Note any code smells introduced in the interest of "minimum viable"
    - Ready to hand off to refactor phase

## Guidelines

### Implementation Principles

1. **Minimum Viable Implementation**
   - Write the simplest code that passes tests
   - Don't handle edge cases not covered by tests
   - Don't add "nice to have" features
   - Don't optimise unless a test requires it

2. **Test-Driven Behaviour**
   - Run tests every 2–5 minutes of coding
   - Let failing tests tell you exactly what to build next
   - If a test passes too easily, the test may be insufficient — flag it

3. **Functional Style**
   - Prefer pure functions that take input and return output
   - Keep side effects (DB writes, API calls) at the boundary layers
   - Core engine functions must remain pure and side-effect-free

### Wheelbase-Specific Implementation Rules

4. **Core Engines (`src/main/core/`)**
   - Accept plain typed objects as input; return plain typed objects or primitives
   - `lifecycle.ts`: pure state machine — given current phase + event, return new phase or throw `PhaseTransitionError`
   - `costbasis.ts`: pure calculation — given a list of legs, return `Decimal`
   - `alerts.ts`: pure rule evaluator — given position data, return list of alert objects

5. **Phase State Machine**
   - Valid transitions: `CSP_OPEN → HOLDING_SHARES`, `HOLDING_SHARES → CC_OPEN`, `CC_OPEN → HOLDING_SHARES` (CC expired/closed), `CC_OPEN → EXITED` (shares called away)
   - Roll transitions keep the same phase but create a new linked leg pair
   - All other transitions must raise `PhaseTransitionError`

6. **Database Layer (`src/main/services/`)**
   - Use `better-sqlite3` synchronous API — no async needed
   - Monetary columns stored as TEXT (4 decimal places), loaded as `Decimal` via `decimal.js`
   - Migrations live in `migrations/` and run via the custom runner in `src/main/db/migrate.ts`
   - Never expose raw DB rows to the renderer — map to typed domain objects in the service layer

7. **IPC Handlers (`src/main/ipc/`)**
   - Validate all incoming payloads with Zod v4 — parse, don't cast
   - Call the service layer — no DB or business logic directly in handlers
   - Always return `{ ok: true, ...result }` or `{ ok: false, errors: string[] }` — never throw

8. **Renderer (React 19)**
   - TanStack Query for all server state (fetching, caching, invalidation)
   - React Hook Form + Zod resolver for all forms
   - shadcn/ui for all UI components
   - Wouter with `useHashLocation` for routing — never `BrowserRouter` (breaks in Electron `file://`)
   - No direct IPC calls in components — go through hooks in `src/renderer/src/hooks/`

## Error Conditions

- **ERROR**: `red-phase-results.md` doesn't exist → run `/red` first
- **ERROR**: Tests still fail after implementation → debug and fix; do not document until green
- **ERROR**: New failures appear in previously passing tests → fix regressions immediately
- **ERROR**: Core engine file imports from `src/main/db` or `src/main/integrations` → architectural violation, fix immediately
- **ERROR**: Lint or typecheck fails → fix before marking phase complete

## Success Criteria

- ✅ Every test from the red phase is now passing
- ✅ No regressions in previously passing tests
- ✅ `pnpm lint` passes with no errors
- ✅ `pnpm typecheck` passes with no errors
- ✅ Implementation follows architecture rules (pure engines, isolated Alpaca, linked roll pairs, decimal.js money)
- ✅ Results documented in `plans/<feature-dir>/green-phase-results.md`
- ✅ Ready to proceed to REFACTOR phase

## Output

After completing the green phase, create `plans/<feature-dir>/green-phase-results.md`:

````markdown
# Green Phase Results: [Feature Name]

## Feature Context

- **Feature directory**: `plans/<feature-dir>/`
- **User story**: `phase-1-stories/<story-file>.md`
- **Plan file**: `plans/<feature-dir>/plan.md`
- **Red phase results**: `plans/<feature-dir>/red-phase-results.md`

## Implementation Files Created/Modified

- `src/main/core/costbasis.ts` — cost basis calculation engine
- `src/main/core/lifecycle.ts` — phase state machine
- `src/main/services/positions.ts` — position CRUD and cost basis persistence
- `src/main/ipc/positions.ts` — IPC handler for position operations
- `src/renderer/src/components/PositionCard.tsx` — position summary component

## Public Interfaces Implemented

Exact signatures created — refactor phase should not change these without re-running tests:

```typescript
// src/main/core/costbasis.ts
export function calculateCostBasis(legs: Leg[]): Decimal

// src/main/core/lifecycle.ts
export function transition(currentPhase: WheelPhase, event: PhaseEvent): WheelPhase
export class PhaseTransitionError extends Error {}
export enum WheelPhase { CSP_OPEN = 'CSP_OPEN', HOLDING_SHARES = 'HOLDING_SHARES', ... }

// IPC channels
// 'positions:create' → { ok: true, position: Position } | { ok: false, errors: string[] }
// 'positions:list'   → { ok: true, positions: Position[] }
```

## Implementation Summary

### Approach

[Brief explanation of implementation approach]

### Key Design Decisions

- **Decision 1**: Rationale
- **Decision 2**: Rationale

### Deviations from Plan

[Any deviations from the original plan and why]

## Test Execution Results

```bash
pnpm test

PASS src/main/core/costbasis.test.ts (4 tests)
PASS src/main/core/lifecycle.test.ts (6 tests)
PASS src/main/ipc/positions.test.ts (3 tests)

13 passed, 0 failed
```

## Quality Checks

- ✅ `pnpm test` passed
- ✅ `pnpm lint` passed
- ✅ `pnpm typecheck` passed

## Known Limitations / Tech Debt

[Code smells, shortcuts taken, or areas needing refactoring — this is the primary input for the refactor phase]

## Handoff to Refactor Phase

To resume: run `/refactor [feature-name]`. Refactor phase should:
1. Read this file to find implementation files and known tech debt
2. Run `make test` to confirm baseline is green before touching anything
3. Focus refactoring on files listed above and issues in "Known Limitations / Tech Debt"

## Notes

[Any additional context, challenges, or learnings]
````
