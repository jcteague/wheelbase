# Quickstart: US-7 — Open Covered Call

## Prerequisites

- Node.js 20+
- `pnpm` installed
- Dependencies installed: `pnpm install`
- better-sqlite3 rebuilt for system Node: `pnpm rebuild better-sqlite3`

## Running Tests

### Unit + Integration (Vitest)

```bash
pnpm test
```

All existing tests plus new US-7 tests must pass.

### Specific test files for US-7

```bash
# Lifecycle engine tests
pnpm test src/main/core/lifecycle.test.ts

# Cost basis engine tests
pnpm test src/main/core/costbasis.test.ts

# Service layer tests
pnpm test src/main/services/open-covered-call-position.test.ts

# IPC handler tests (if added)
pnpm test src/main/ipc/positions.test.ts
```

### E2E Tests (Playwright Electron)

E2E tests must run from a GUI terminal (iTerm/Terminal.app), not from Claude Code's shell.

```bash
# Build first
pnpm build

# Run all e2e tests
pnpm test:e2e

# Run only the CC e2e test
pnpm test:e2e e2e/open-covered-call.spec.ts
```

## No Migration Required

US-7 uses existing tables (`positions`, `legs`, `cost_basis_snapshots`). No new migration needed.

## No Seed Data Required

E2E tests create their own positions via the UI (open CSP → assign → open CC). Unit/integration tests use `makeTestDb()` from `src/main/test-utils.ts`.

## Verification Checklist

```bash
pnpm test        # All unit + integration tests pass
pnpm lint        # No lint errors
pnpm typecheck   # No TypeScript errors
```
