# Quickstart: US-16 — Cost Basis After Sequential Rolls

## Prerequisites

No new migrations or seed data are required. The existing DB schema is sufficient.

Rebuild `better-sqlite3` if you haven't recently:

```bash
npx electron-rebuild -f -w better-sqlite3   # for Electron (pnpm dev / pnpm build)
pnpm rebuild better-sqlite3                 # for system Node (pnpm test via Vitest)
```

Run electron-rebuild first, then the system rebuild.

---

## Running the Tests

All new tests live in existing test files — no new files need to be created:

| File                                            | What's tested                                                                                                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/main/core/costbasis.test.ts`               | Unit tests for `calculateRollBasis` (CSP different-strike, sequential rolls) and `calculateAssignmentBasis` (roll-net label, correct net-credit calculation) |
| `src/main/services/roll-csp-position.test.ts`   | Integration tests for `rollCspPosition` with strike changes and sequential rolls                                                                             |
| `src/main/services/roll-cc-position.test.ts`    | Integration tests for `rollCcPosition` confirming CC strike has no basis impact                                                                              |
| `src/main/services/assign-csp-position.test.ts` | Integration tests for `assignCspPosition` verifying basis + waterfall after prior CSP rolls                                                                  |
| `e2e/cost-basis-sequential-rolls.spec.ts`       | E2E AC-driven tests (requires a GUI terminal)                                                                                                                |

Run unit + integration tests:

```bash
pnpm test
```

All tests (including pre-existing ones) must pass before the task is complete.

Run E2E tests (must be in a GUI terminal — iTerm or Terminal.app, not Claude Code's shell):

```bash
pnpm test:e2e
```

---

## Passing Criteria

- `pnpm test` exits 0 with all tests green, including:
  - `calculateRollBasis` → CSP same-strike roll, CSP roll-down ($50→$47), CSP roll with net debit, CC roll (ignores strike), multi-contract CSP roll, three sequential CSP rolls
  - `calculateAssignmentBasis` → assignment after CSP roll uses net credit ($47.30, not $46.50), waterfall shows "Roll #1 credit: $0.70"
  - `rollCspPosition` service → roll-down updates basis using strike delta
  - `assignCspPosition` service → assignment after 2 CSP rolls carries correct basis ($46.70 for 3-roll scenario)
- `pnpm lint` exits 0 (no ESLint errors)
- `pnpm typecheck` exits 0 (no TypeScript errors)
- `pnpm test:e2e` — all 9 AC scenarios pass

---

## Key Numbers to Verify

| Scenario                                               | Expected `basisPerShare` | Expected `totalPremiumCollected` |
| ------------------------------------------------------ | ------------------------ | -------------------------------- |
| CSP open $50, premium $2.00                            | $48.00                   | $200.00                          |
| After roll #1 (net credit $0.70)                       | $47.30                   | $270.00                          |
| After roll #2 (net credit $0.80)                       | $46.50                   | $350.00                          |
| After roll #3 (net debit $0.20)                        | $46.70                   | $330.00                          |
| After CSP roll-down $50→$47 (net credit $0.30)         | $44.70                   | $230.00                          |
| After CC roll (net credit $0.80, starting from $45.80) | $45.00                   | (increases by $80)               |
