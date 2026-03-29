# Quickstart: US-10 — Record Shares Called Away

## Prerequisites

1. `pnpm install` already run.
2. `better-sqlite3` rebuilt for both Electron and system Node:
   ```bash
   npx electron-rebuild -f -w better-sqlite3
   pnpm rebuild better-sqlite3
   ```

## Running Unit + Integration Tests

```bash
pnpm test
```

All unit and service-layer tests run via Vitest. New tests for US-10 are:

| File | What it covers |
|------|---------------|
| `src/main/core/lifecycle.test.ts` | `recordCallAway()` engine (phase guard, date validation, multi-contract guard) |
| `src/main/core/costbasis.test.ts` | `calculateCallAway()` (P&L formula, annualized return, loss scenario) |
| `src/main/services/record-call-away-position.test.ts` | Service integration (full DB round-trip: leg insert, position update, snapshot) |
| `src/main/ipc/positions.test.ts` | IPC handler registration + success/error shapes |
| `src/renderer/src/components/CallAwaySheet.test.tsx` | Sheet component (renders confirmation, transitions to success state) |

Expected: all tests pass with `pnpm test`.

## Running E2E Tests

E2E tests require a GUI terminal (iTerm2 / Terminal.app) and a production build:

```bash
pnpm build
pnpm test:e2e -- --reporter=verbose e2e/call-away.spec.ts
```

The E2E spec file is `e2e/call-away.spec.ts`. Each test launches a fresh Electron app with a temp SQLite DB.

## Seed State Required

E2E tests set up their own state. The `reachCcOpenState()` helper (shared with `close-cc-early.spec.ts`) seeds:
1. A CSP_OPEN position
2. Assignment → HOLDING_SHARES
3. Open CC → CC_OPEN

Then the call-away tests proceed from CC_OPEN.

## Passing Criteria

- `pnpm test` — 0 failures
- `pnpm lint` — 0 errors
- `pnpm typecheck` — 0 TypeScript errors
- `pnpm test:e2e` (call-away spec) — 6 tests pass covering all 6 acceptance criteria
