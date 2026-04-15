# Quickstart: Extract Sheet Primitives

## Prerequisites

No migrations, seed data, or new dependencies required. This is a pure renderer refactor.

## Running Tests

```bash
# Unit + integration tests (run after every change)
pnpm test

# Type checking
pnpm typecheck

# Lint
pnpm lint

# E2E tests (run after completing all migrations to verify no visual regressions)
pnpm build && pnpm test:e2e
```

## Verification Strategy

1. After creating `Sheet.tsx` + `Sheet.test.tsx`: `pnpm test` (new tests pass)
2. After migrating each sheet component: `pnpm test` (existing sheet tests still pass)
3. After all migrations complete: `pnpm build && pnpm test:e2e` (full regression check)
4. Final: `pnpm typecheck && pnpm lint` (no type errors or lint violations)

## Key Files

| File                                                   | Role                                                      |
| ------------------------------------------------------ | --------------------------------------------------------- |
| `src/renderer/src/components/ui/Sheet.tsx`             | New shared primitives                                     |
| `src/renderer/src/components/ui/Sheet.test.tsx`        | New primitive tests                                       |
| `src/renderer/src/components/CloseCcEarlySheet.tsx`    | First migration target (simplest)                         |
| `src/renderer/src/components/ExpirationSheet.tsx`      | Second migration target                                   |
| `src/renderer/src/components/CcExpirationSheet.tsx`    | Third migration target                                    |
| `src/renderer/src/components/AssignmentSheet.tsx`      | Fourth migration target                                   |
| `src/renderer/src/components/CallAwaySheet.tsx`        | Fifth migration target                                    |
| `src/renderer/src/components/OpenCoveredCallSheet.tsx` | Sixth migration target (has OpenCcSheetHeader to replace) |
| `src/renderer/src/components/RollCspSheet.tsx`         | Seventh migration target (420px width)                    |
| `src/renderer/src/components/OpenCcSheetHeader.tsx`    | Delete after OpenCoveredCallSheet migration               |
