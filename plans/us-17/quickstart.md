# Quickstart: US-17 — Reject Roll in Invalid Phase

## Prerequisites

- Node.js and pnpm installed
- `pnpm install` completed
- `better-sqlite3` rebuilt for system Node: `pnpm rebuild better-sqlite3`

## No Migrations Required

US-17 adds no new database schema. Existing migrations are sufficient.

## Running Tests

### Unit + Integration Tests

```bash
pnpm test
```

Key test files for this story:

- `src/main/core/lifecycle.test.ts` — lifecycle engine phase rejection
- `src/main/services/roll-csp-position.test.ts` — CSP roll service rejection
- `src/main/services/roll-cc-position.test.ts` — CC roll service rejection
- `src/renderer/src/components/PositionDetailActions.test.tsx` — button visibility

### E2E Tests

```bash
# First rebuild for Electron if needed:
npx electron-rebuild -f -w better-sqlite3

pnpm test:e2e
```

E2E test file: `e2e/reject-roll-invalid-phase.spec.ts`

## Passing Criteria

- All existing tests continue to pass (no regressions)
- New parameterized tests cover all 9 non-rollable phases for `rollCsp`
- New parameterized tests cover all 9 non-rollable phases for `rollCc`
- Renderer tests verify roll button visibility/absence for representative phases
- E2E tests verify each acceptance criterion
