# US-13 Quickstart

## Prerequisites

- US-12 must be merged to `main` first (provides roll infrastructure)
- Node.js, pnpm installed
- `better-sqlite3` rebuilt for system Node (see CLAUDE.md)

## Setup

```bash
cd ~/my-stuff/wheelbase
pnpm install
pnpm rebuild better-sqlite3   # if needed for Vitest
```

No new migrations required — US-13 uses existing schema.

## Running Tests

```bash
# All tests (unit + integration)
pnpm test

# Run only US-13 related tests
pnpm test -- --grep "roll.*csp|roll.*type|roll.*count"

# Specific test files
pnpm test src/main/core/lifecycle.test.ts
pnpm test src/main/services/roll-csp-position.test.ts
pnpm test src/renderer/src/components/RollCspSheet.test.ts
pnpm test src/renderer/src/lib/rollType.test.ts

# Full verification
pnpm test && pnpm lint && pnpm typecheck
```

## E2E Tests

E2E tests must be run from a GUI terminal (iTerm/Terminal.app), not from Claude Code's shell:

```bash
pnpm test:e2e
```

## Seed Data for Manual Testing

No seed script exists. To test manually:
1. `pnpm dev` to launch the app
2. Create a new wheel (AAPL, $180 strike, 2026-04-18 expiration, $3.50 premium)
3. Open the roll form from the position detail page
4. Enter a different strike to test roll-down/roll-up behavior
