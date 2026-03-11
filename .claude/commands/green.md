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
     - `backend/app/core/` — pure engine functions (no db/broker imports ever)
     - `backend/app/api/routes/` — FastAPI route handlers
     - `backend/app/models/` — SQLAlchemy ORM models
     - `backend/app/db/` — session / migration support
     - `frontend/src/components/` — Preact components
     - `frontend/src/hooks/` — TanStack Query + signal hooks
     - `frontend/src/api/` — typed fetch wrappers

### Phase 2: Implement Features

4. **Write Minimal Implementation**
   - **CRITICAL**: Write the SIMPLEST code that makes tests pass
   - Do not add features not covered by tests
   - Do not optimise prematurely
   - Do not refactor existing code — save that for the refactor phase
   - Let the tests drive every decision

5. **Follow Architecture Rules (non-negotiable)**
   - `backend/app/core/` engines import ONLY Python stdlib and `app.core.*` siblings — no SQLAlchemy, no alpaca-py
   - All Alpaca API calls stay in `backend/app/integrations/alpaca.py`
   - Rolls are always stored as linked leg pairs (`roll_from` / `roll_to`) — never mutate a leg in place
   - Cost basis formula: `assignment_strike − CSP_premiums − CC_premiums + roll_debits − roll_credits`

6. **Follow Code Conventions**
   - Python: type-annotated, `Decimal` for all monetary values, functional style over classes where practical
   - TypeScript: strict mode, pure functions, Zustand only for cross-view state
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
   - After every small change: `cd backend && uv run pytest -v`
   - Fix failures one at a time — do not batch unrelated changes
   - Frontend: `cd frontend && pnpm test --run`

8. **Verify All Tests Pass**
   - All tests from the red phase must be green
   - No regressions in any previously passing tests
   - Run the full suite: `make test`

### Phase 4: Quality Gates

9. **Run All Quality Checks — fix any failures before documenting**
   - `make lint` — ruff (Python) + ESLint (TypeScript)
   - `make typecheck` — mypy (Python strict) + tsc (TypeScript strict)
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

4. **Core Engines (`backend/app/core/`)**
   - Accept plain dataclasses as input; return plain dataclasses or primitives
   - `lifecycle.py`: pure state machine — given current phase + event, return new phase or raise `PhaseTransitionError`
   - `costbasis.py`: pure calculation — given a list of legs, return `Decimal`
   - `alerts.py`: pure rule evaluator — given position data, return list of alert objects

5. **Phase State Machine**
   - Valid transitions: `CSP_OPEN → HOLDING_SHARES`, `HOLDING_SHARES → CC_OPEN`, `CC_OPEN → HOLDING_SHARES` (CC expired/closed), `CC_OPEN → EXITED` (shares called away)
   - Roll transitions keep the same phase but create a new linked leg pair
   - All other transitions must raise `PhaseTransitionError`

6. **SQLAlchemy Models**
   - Use async-compatible `DeclarativeBase`
   - `Wheel` (position), `Leg` (single option transaction), `CostBasisSnapshot`, `Alert`
   - `Leg` has optional `roll_from_id` / `roll_to_id` FKs — rolls are always pairs, never mutations
   - Monetary columns: `Numeric(10, 4)` mapped to Python `Decimal`

7. **FastAPI Routes**
   - Use `Annotated[AsyncSession, Depends(get_session)]` for DB injection
   - Return Pydantic v2 response models — never expose ORM objects directly
   - Override `get_session` in tests — never touch a real DB in API tests

8. **Frontend**
   - Preact signals for component-local reactive state
   - TanStack Query for server state (fetching, caching, invalidation)
   - Zustand only for state shared across unrelated views
   - Components under `frontend/src/components/`; page-level under `frontend/src/pages/`

## Error Conditions

- **ERROR**: `red-phase-results.md` doesn't exist → run `/red` first
- **ERROR**: Tests still fail after implementation → debug and fix; do not document until green
- **ERROR**: New failures appear in previously passing tests → fix regressions immediately
- **ERROR**: Core engine file imports from `app.db` or `app.integrations` → architectural violation, fix immediately
- **ERROR**: Lint or typecheck fails → fix before marking phase complete

## Success Criteria

- ✅ Every test from the red phase is now passing
- ✅ No regressions in previously passing tests
- ✅ `make lint` passes with no errors
- ✅ `make typecheck` passes with no errors
- ✅ Implementation follows architecture rules (pure engines, isolated Alpaca, linked roll pairs)
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

- `backend/app/core/costbasis.py` — cost basis calculation engine
- `backend/app/core/lifecycle.py` — phase state machine
- `backend/app/models/__init__.py` — Wheel, Leg, CostBasisSnapshot ORM models
- `backend/app/api/routes/positions.py` — position CRUD endpoints
- `frontend/src/components/PositionCard.tsx` — position summary component

## Public Interfaces Implemented

Exact signatures created — refactor phase should not change these without re-running tests:

```python
# backend/app/core/costbasis.py
def calculate_cost_basis(legs: list[Leg]) -> Decimal: ...

# backend/app/core/lifecycle.py
def transition(current_phase: WheelPhase, event: PhaseEvent) -> WheelPhase: ...
class PhaseTransitionError(Exception): ...
class WheelPhase(str, Enum): ...

# POST /positions → 201, GET /positions → 200 list
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
cd backend && uv run pytest -v

PASSED tests/core/test_costbasis.py::test_cost_basis_is_strike_with_no_premiums
PASSED tests/core/test_costbasis.py::test_csp_premium_reduces_cost_basis
PASSED tests/core/test_lifecycle.py::test_csp_open_to_holding_shares
PASSED tests/core/test_lifecycle.py::test_illegal_transition_raises

4 passed, 0 failed
```

## Quality Checks

- ✅ `make test` passed
- ✅ `make lint` passed
- ✅ `make typecheck` passed

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
