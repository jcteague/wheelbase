# Quickstart: US-6 — Record CSP Assignment

---

## Prerequisites

Phase 1 (US-1 through US-5) must be complete. The following must be passing before starting:

```bash
pnpm test       # all unit + integration tests green
pnpm typecheck  # no TypeScript errors
```

---

## DB Migration

A new migration file is required. The migration runner in `src/main/db/migrate.ts` discovers and runs files in `migrations/` in filename order. The new file must be:

```
migrations/003_rename_option_type_to_instrument_type.sql
```

SQLite does not support `ALTER TABLE ... RENAME COLUMN` before version 3.25.0. Check the bundled SQLite version:

```bash
node -e "const db = require('better-sqlite3')(':memory:'); console.log(db.pragma('compile_options', { simple: false }).find(o => o.compile_options?.includes('VERSION')))"
```

If the version supports `RENAME COLUMN`, use it directly. If not, the migration must recreate the table. The migration runner will apply this automatically when the app starts in dev or test mode.

After writing the migration, rebuild `better-sqlite3` for both targets:

```bash
npx electron-rebuild -f -w better-sqlite3   # for Electron
pnpm rebuild better-sqlite3                  # for Vitest (system Node)
```

---

## Running the Tests

### Unit + integration tests (Vitest)

```bash
pnpm test
```

Tests to look for during development:
- `src/main/core/lifecycle.test.ts` — `recordAssignment` engine tests
- `src/main/core/costbasis.test.ts` — `calculateAssignmentBasis` engine tests
- `src/main/services/assign-csp-position.test.ts` — service integration tests

### E2E tests (Playwright Electron)

Must be run from a GUI terminal (iTerm/Terminal.app), not from Claude Code's shell:

```bash
pnpm test:e2e
```

E2E tests for this story live in `e2e/csp-assignment.spec.ts`.

---

## Passing Criteria

All tests pass with:

```
pnpm test       → 0 failures
pnpm typecheck  → 0 errors
pnpm lint       → 0 errors
pnpm test:e2e   → 0 failures (run from GUI terminal)
```

---

## Seed Data

No manual seed data is required. The E2E tests create positions programmatically via the "Open new wheel" form, then exercise the assignment sheet against the created position.
