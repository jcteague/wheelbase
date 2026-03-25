# Quickstart: US-8 — Close Covered Call Early

## Prerequisites

No new migrations are required. The `legs` table already supports `CC_CLOSE` leg role and `BUY` action. The `positions` table already supports `HOLDING_SHARES` phase.

## Running Tests

```bash
# All unit + integration tests (Vitest)
pnpm test

# Watch mode during development
pnpm test --watch

# Run only the files relevant to this story
pnpm test src/main/core/lifecycle.test.ts
pnpm test src/main/core/costbasis.test.ts
pnpm test src/main/services/close-covered-call-position.test.ts
pnpm test src/main/ipc/positions.test.ts
pnpm test src/renderer/src/hooks/useCloseCoveredCallEarly.test.ts
pnpm test src/renderer/src/components/CloseCcEarlySheet.test.tsx
```

## Rebuild Note

If `better-sqlite3` native bindings are out of sync after a fresh clone or dependency change:

```bash
npx electron-rebuild -f -w better-sqlite3   # for Electron (pnpm dev / build)
pnpm rebuild better-sqlite3                 # for system Node (pnpm test)
```

## E2E Tests

E2E tests must be run from a GUI terminal (iTerm2 / Terminal.app), not from Claude Code's shell:

```bash
pnpm test:e2e
```

To run only the US-8 spec:

```bash
pnpm test:e2e --grep "close covered call early"
```

## Expected Passing Criteria

After Red → Green → Refactor for all areas:

- `pnpm test` — all tests pass (zero failures)
- `pnpm lint` — zero ESLint errors
- `pnpm typecheck` — zero TypeScript errors
- Business-event INFO log emitted: `covered_call_closed_early` with `positionId` and `phase: 'HOLDING_SHARES'`

## Seed / Setup Notes for Integration Tests

Integration tests use an in-memory SQLite database seeded by the existing test helpers in `src/main/services/*.test.ts`. To reach a `CC_OPEN` state for close tests, the helper sequence is:

1. `createPosition(db, ...)` → `CSP_OPEN`
2. `assignCspPosition(db, ...)` → `HOLDING_SHARES`
3. `openCoveredCallPosition(db, ...)` → `CC_OPEN`
4. Then call the new `closeCoveredCallPosition(db, ...)` under test.
