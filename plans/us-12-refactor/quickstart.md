# Quickstart: US-12 Refactor

## Prerequisites

No migrations or new dependencies needed. This is a pure refactor of existing code.

## Running Tests

```bash
# All unit + integration tests
pnpm test

# Specific test files relevant to this refactor
pnpm test src/main/services/list-positions.test.ts
pnpm test src/main/services/get-position.test.ts
pnpm test src/renderer/src/lib/rolls.test.ts
pnpm test src/renderer/src/components/RollCspSheet.test.tsx

# Lint and typecheck
pnpm lint
pnpm typecheck
```

## Passing Criteria

1. All existing tests continue to pass (no regressions)
2. New tests pass for:
   - Active leg resolution returns `ROLL_TO` leg for rolled positions in list view
   - `getRollTypeLabel` returns correct labels for up/down/out rolls
   - `computeNetCreditDebit` returns correct credit/debit calculations
   - RollCspSheet form validation via Zod schema matches existing behavior
3. `pnpm lint` and `pnpm typecheck` clean
