# Quickstart: US-14 — Roll Open Covered Call

## Prerequisites

- Node.js + pnpm installed
- `better-sqlite3` built for both Electron and system Node (see CLAUDE.md build notes)

## Run All Unit & Integration Tests

```bash
pnpm test
```

Tests for this story will live in:

- `src/main/core/lifecycle.test.ts` — `rollCc` lifecycle engine
- `src/main/services/roll-cc-position.test.ts` — service integration
- `src/main/ipc/positions.test.ts` — IPC handler registration
- `src/renderer/src/lib/rolls.test.ts` — `getCcRollType` and `getCcRollTypeColor` utilities
- `src/renderer/src/components/RollCcForm.test.tsx` — form rendering and below-cost-basis warning
- `src/renderer/src/components/RollCcSheet.test.tsx` — sheet open/close/schema validation
- `src/renderer/src/components/RollCcSuccess.test.tsx` — success screen rendering

## Run E2E Tests (requires built app + GUI terminal)

```bash
pnpm build      # build first
pnpm test:e2e   # must run from iTerm/Terminal.app — NOT from Claude Code's shell
```

E2E tests for this story live in: `e2e/cc-roll.spec.ts`

The E2E tests exercise the full stack: Electron → IPC → SQLite → renderer. They require a CC_OPEN position, which means each test must:

1. Create a new CSP position
2. Record assignment to reach HOLDING_SHARES
3. Open a covered call to reach CC_OPEN
4. Then interact with the roll form

See `e2e/helpers.ts` for `openPosition`, `openDetailFor`, and `selectDate` utilities.

## Expected Passing Criteria

- `pnpm test` — all tests pass (no new failures, US-14 tests all green)
- `pnpm typecheck` — no TypeScript errors
- `pnpm lint` — no ESLint errors
- `pnpm test:e2e` — all 10 E2E scenarios pass for `cc-roll.spec.ts`
