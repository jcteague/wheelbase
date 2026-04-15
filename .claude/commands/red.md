---
description: 'Write failing tests for TDD red phase (test-first development)'
---

# Red Phase: Write Failing Tests

## User Input

```
$ARGUMENTS
```

## Outline

You are implementing the **RED phase** of Test-Driven Development for Wheelbase (Option Wheel Manager). Your goal is to write comprehensive failing tests that define the expected behaviour before any implementation exists.

### Phase 1: Setup and Prerequisites

1. **Locate Feature Artifacts**
   - Find the relevant user story file(s) under `phase-1-stories/`
   - Find the feature plan under `plans/<feature-dir>/` — look for `plan.md` or `tasks.md`
   - Read and internalise all available artifacts before writing any tests

2. **Read and Understand Requirements**
   - Read the user story for acceptance criteria and edge cases
   - Read the plan for architecture decisions and planned file structure
   - Identify which layer(s) are affected:
     - **Core engines** — `src/main/core/` (pure TypeScript, no db/broker imports)
     - **Service layer** — `src/main/services/`
     - **IPC handlers** — `src/main/ipc/`
     - **Renderer components** — `src/renderer/src/components/`
     - **Renderer hooks** — `src/renderer/src/hooks/`

3. **Identify Test Scope**
   - Classify tests by type:
     - **Unit tests** (pure engine logic) — colocated with source, e.g. `src/main/core/*.test.ts`
     - **Service integration tests** — `src/main/services/*.test.ts` (in-memory SQLite)
     - **IPC handler tests** — `src/main/ipc/*.test.ts`
     - **Frontend component tests** — `src/renderer/src/**/*.test.tsx` (Vitest + @testing-library/react)
   - Note which existing test files need updates

### Test Granularity

**Unit and integration tests are implementation-driven** — they are fine-grained and cover individual code paths, validation rules, and edge cases. There is no 1:1 relationship between unit tests and ACs; a single AC may require many unit tests to cover all the logic it depends on.

**E2e tests are AC-driven** — there is exactly one `it()` per AC bullet from the user story. E2e test names must mirror the AC language directly so it is immediately clear which AC is covered. Do not lump multiple ACs into a single e2e test. When writing e2e tests, list every AC from the story and write a test for each one before considering the red phase done.

---

### Phase 2: Write Failing Tests

4. **Test File Structure**
   - Place unit tests alongside the source file (e.g. `src/main/core/lifecycle.test.ts`)
   - Follow naming: `<module>.test.ts` or `<module>.test.tsx`
   - Use `describe` / `it` / `expect` from Vitest
   - For async tests, use `async`/`await` — no special decorator needed

5. **Write Test Cases**
   - Write tests that describe EXPECTED behaviour, not current behaviour
   - Cover:
     - Happy path
     - Edge cases (zero premiums, multiple rolls, negative cost basis)
     - Error / invalid input conditions
   - Follow project conventions:
     - **TypeScript**: Vitest + `@testing-library/react` for components
     - Descriptive test names: `calculates cost basis after CSP premium collection`

6. **Core Engine Test Guidelines** (most critical for Phase 1)
   - Import ONLY from `src/main/core/*` — never from `src/main/db`, `src/main/services`, or `src/main/integrations`
   - Pass plain typed objects and primitives; never connect to the database
   - Verify exact numeric results using `decimal.js` — compare with `.equals()` or `.toFixed(4)`
   - Test every valid lifecycle phase transition and every illegal transition that must raise

7. **Add Test Documentation**
   - Link test to user story: `# [US-301] Calculate effective cost basis`
   - Document any fixtures or test data factories needed

### Phase 3: Verify Tests Fail for the Right Reason

8. **Run Tests**
   - `pnpm test` — runs all Vitest tests
   - To run a specific file: `pnpm test src/main/core/lifecycle.test.ts`

9. **Every Test Must Fail Because the Feature Doesn't Exist Yet**
   - **CRITICAL**: This is a hard gate. Do not proceed until every new test fails for the correct reason.
   - Acceptable failures:
     - `ReferenceError` / module-not-found — implementation file doesn't exist yet
     - Type error — function or type not yet defined
     - Assertion error — implementation is stubbed and returns wrong result
   - **Unacceptable failures — fix immediately and re-run:**
     - Syntax errors in the test file itself
     - Broken imports caused by test setup mistakes
     - Fixture errors or missing test dependencies
     - Any failure caused by a bug in the test, not the missing feature
   - Keep fixing and re-running until the only failures are "feature not implemented yet"

10. **Document Test Results**
    - Create `plans/<feature-dir>/red-phase-results.md` with:
      - Feature directory path and linked artifacts (story file, plan file)
      - List of all test files created/modified (absolute paths)
      - Summary of what behaviours are tested
      - Key function/class signatures being tested (so green phase can create the right interfaces)
      - Any non-obvious test design decisions or assumptions
      - Pytest output showing failures
      - Explicit confirmation that every failure is due to missing implementation, not test bugs

### Phase 4: Review and Handoff

11. **Prepare for Green Phase**
    - Ensure all new test files are saved and importable
    - Document any assumptions made (e.g., data shapes, rounding rules)
    - Ready to hand off to implementation (green phase)

## Guidelines

### Testing Principles

1. **Test Behaviour, Not Implementation**
   - Focus on WHAT the code should do, not HOW it does it
   - Test public interfaces (functions, HTTP endpoints, rendered output)
   - Use black-box testing mindset

2. **Follow TDD Best Practices**
   - Write the simplest test that will fail
   - One assertion per test when possible
   - Arrange-Act-Assert pattern
   - Test names describe expected behaviour

3. **Test Independence**
   - Each test must run independently, in any order
   - No shared mutable state between tests
   - Use Vitest `beforeEach` / `afterEach` for setup/teardown
   - Mock external dependencies (DB, Alpaca) at the boundary

### Wheelbase-Specific Testing Rules

4. **Core Engines are Pure — Test Them as Such**
   - `lifecycle.ts`, `costbasis.ts`, `alerts.ts` accept plain typed objects and return results
   - No database connection, no Alpaca client — these tests run without any I/O
   - If you find yourself needing DB in a core engine test, something is wrong with the design

5. **Cost Basis Math Precision**
   - Use `decimal.js` for all monetary calculations in tests
   - Compare with `.equals()` or `.toFixed(4)` — never use floating point equality
   - Test the formula explicitly: `assignment_strike − CSP_premiums − CC_premiums + roll_debits − roll_credits`

6. **Lifecycle State Machine**
   - Test every valid transition: `CSP_OPEN → HOLDING_SHARES`, `HOLDING_SHARES → CC_OPEN`, etc.
   - Test every illegal transition raises the appropriate exception
   - Test roll transitions: CSP roll, CC roll

7. **IPC Handler Tests**
   - Call the handler's underlying service directly with an in-memory SQLite database
   - Verify the `{ ok: true, ...result }` / `{ ok: false, errors: [...] }` response shape
   - Never throw from a handler — test that errors are caught and returned as `ok: false`

8. **Alpaca Isolation**
   - Mock `src/main/integrations/alpaca` at the module level with `vi.mock()`
   - Never import the Alpaca SDK in tests directly
   - Integration-layer tests go in `src/main/integrations/` (separate from core)

## Error Conditions

- **ERROR**: User story or plan doesn't exist → request these documents first
- **ERROR**: Tests pass immediately → implementation already exists (skip red phase or add more tests)
- **ERROR**: Any test fails for a reason other than missing implementation → fix the test, re-run; do not proceed until clean
- **ERROR**: Core engine test imports from `src/main/db` or `src/main/integrations` → architectural violation, fix the test design

## Success Criteria

- ✅ All new test files created and properly structured
- ✅ Tests comprehensively cover specified behaviours and edge cases
- ✅ Every new test fails — and every failure is because the feature is not yet implemented
- ✅ Zero test failures caused by bugs in the tests themselves
- ✅ Test names clearly describe expected behaviour
- ✅ Core engine tests have zero database or broker dependencies
- ✅ Test output documented in `plans/<feature-dir>/red-phase-results.md`
- ✅ Ready to proceed to GREEN phase

## Output

After completing the red phase, create `plans/<feature-dir>/red-phase-results.md`:

````markdown
# Red Phase Results: [Feature Name]

## Feature Context

- **Feature directory**: `plans/<feature-dir>/`
- **User story**: `phase-1-stories/<story-file>.md`
- **Plan file**: `plans/<feature-dir>/plan.md`

## Test Files Created/Modified

- `src/main/core/costbasis.test.ts` — cost basis math and roll handling
- `src/main/core/lifecycle.test.ts` — phase transition state machine
- `src/main/ipc/positions.test.ts` — IPC handler response contracts

## Interfaces Under Test

List every public function, class, or endpoint the tests import or call. Green phase must create exactly these:

```typescript
// src/main/core/costbasis.ts
export function calculateCostBasis(legs: Leg[]): Decimal

// src/main/core/lifecycle.ts
export function transition(currentPhase: WheelPhase, event: PhaseEvent): WheelPhase
export class PhaseTransitionError extends Error {}

// src/main/ipc/positions.ts (IPC channels)
// 'positions:create' → { ok: true, position: Position } | { ok: false, errors: string[] }
// 'positions:list'   → { ok: true, positions: Position[] }
```

## Test Coverage Summary

### Core Engine Tests (src/main/core/)

- [x] Cost basis is assignment strike when no premiums collected
- [x] CSP premium reduces cost basis
- [x] CC premium further reduces cost basis
- [x] Roll credit reduces cost basis; roll debit increases it
- [x] Illegal phase transition throws PhaseTransitionError

### IPC Handler Tests (src/main/ipc/)

- [x] positions:create returns ok:true with created position
- [x] positions:list returns ok:true with array of positions

## Test Design Assumptions

[Non-obvious decisions made while writing tests — e.g., "Decimal precision to 4 dp", "roll debit is positive, roll credit is negative in the Leg model"]

## Test Execution Results

```bash
pnpm test

FAIL src/main/core/costbasis.test.ts
  ● calculateCostBasis › reduces cost basis by CSP premium
    ReferenceError: calculateCostBasis is not defined

FAIL src/main/core/lifecycle.test.ts
  ● transition › CSP_OPEN to HOLDING_SHARES is a valid transition
    ReferenceError: transition is not defined

2 failed, 0 passed
```

## Verification

- ✅ Every test fails because the feature doesn't exist yet — not due to test bugs
- ✅ No syntax errors in test files
- ✅ No fixture or import errors caused by test setup mistakes

## Handoff to Green Phase

To resume: run `/green [feature-name]`. Green phase should:

1. Read this file to find all test files and the exact interfaces to implement
2. Read `plans/<feature-dir>/plan.md` for architecture decisions
3. Implement only the interfaces listed under "Interfaces Under Test"

## Notes

[Any clarifications or open questions]
````
