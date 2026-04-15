# Quickstart: US-12 — Roll Open CSP Out

## Prerequisites

No migrations are needed — `roll_chain_id` column and `ROLL_FROM`/`ROLL_TO` leg roles already exist in the schema.

## Run Unit + Integration Tests

```bash
pnpm test
```

Tests for US-12 live in:

- `src/main/core/lifecycle.test.ts` — `rollCsp` lifecycle function
- `src/main/core/costbasis.test.ts` — `calculateRollBasis` function
- `src/main/services/roll-csp-position.test.ts` — service integration (uses in-memory SQLite)
- `src/main/ipc/positions.test.ts` — IPC handler
- `src/renderer/src/components/RollCspSheet.test.tsx` — sheet component
- `src/renderer/src/hooks/useRollCsp.test.ts` — hook (if written)
- `src/renderer/src/components/PositionDetailActions.test.tsx` — action button

## Run E2E Tests

> Must be run from a GUI terminal (iTerm/Terminal.app), not from Claude Code's shell.

```bash
pnpm test:e2e
```

E2E tests for US-12 live in `e2e/csp-roll.spec.ts`.

## Passing Criteria

- `pnpm test` — all tests green, no skips
- `pnpm lint` — zero lint errors
- `pnpm typecheck` — zero TypeScript errors

## Seed Data for Manual Testing

1. Launch the app with `pnpm dev`
2. Create a new CSP position (AAPL, strike $180, expiration 2026-04-18, 1 contract, premium $3.50)
3. On the position detail page, click "Roll CSP →"
4. Enter: cost to close $1.20, new premium $2.80, new expiration 2026-05-16
5. Verify net credit preview shows "+$1.60/contract ($160.00 total)" in green
6. Click "Confirm Roll" and verify the success state
