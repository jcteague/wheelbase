# ADR: One named pure function per lifecycle transition
<!-- generated:from us-4, us-5, us-6, us-7, us-8, us-9, us-12 -->

## Decision

Each wheel-phase transition is implemented as its own named function in `src/main/core/lifecycle.ts` (`closeCsp`, `expireCsp`, `recordAssignment`, `openCoveredCall`, `closeCoveredCall`, `expireCc`, `rollCsp`). The function name describes the domain action; the function returns the next `phase` (and any other derived state) or throws `ValidationError`. Cost basis follows the same shape: `calculateInitialCspBasis`, `calculateCspClose`, `calculateCspExpiration`, `calculateAssignmentBasis`, `calculateCcOpenBasis`, `calculateCcClose`, `calculateRollBasis`.

## Context / Why

- The lifecycle engine is a state machine; each transition has different inputs, validation rules, and result shapes. A single `transition(phase, action, ...)` dispatcher would obscure those differences and force a large discriminated union.
- Named functions read naturally at call sites (`closeCoveredCall({ currentPhase, ... })`) and are individually testable with focused fixtures.
- The pattern composes: shared validators (`requirePositiveStrike`, `requirePositivePremium`, `requirePositiveClosePrice`) are extracted as private helpers when ≥ 2 transitions need them.

## Alternatives considered

- **Single `transition(phase, event, payload)` dispatcher** — rejected; hides the per-transition input contracts and produces an unwieldy union return type.
- **Folding closely-related operations together** (e.g. reusing `calculateCspClose` with `closePrice=0` for expiration) — rejected because the "zero" branch distorts derived metrics like `pnlPercentage`.

## Consequences

- Adding a new lifecycle transition is a strictly additive change: new input/result types + new function + new tests.
- IPC channel names follow the same one-verb-per-transition pattern (`positions:close-csp`, `positions:expire-csp`, `positions:assign-csp`, `positions:open-cc`, `positions:close-cc-early`, `positions:expire-cc`, `positions:roll-csp`) — see ADR [ipc-channel-naming](./ipc-channel-naming.md).
- The lifecycle file grows linearly with the number of transitions; private helpers are extracted only when duplication is real (≥ 2 callers).

## Sources

- [extract: us-4](../../.extracts/us-4.md) — `closeCsp` signature
- [extract: us-5](../../.extracts/us-5.md) — ADR "Cost basis calculation is its own function, not reusing `calculateCspClose` with closePrice=0"
- [extract: us-6](../../.extracts/us-6.md) — `recordAssignment` signature
- [extract: us-7](../../.extracts/us-7.md) — ADR "New lifecycle function `openCoveredCall()` instead of overloading an existing one"
- [extract: us-8](../../.extracts/us-8.md) — ADR "New lifecycle function `closeCoveredCall()` (own state-machine function)" and ADR "Dedicated `calculateCcClose()` instead of reusing `calculateCspClose()`"
- [extract: us-9](../../.extracts/us-9.md) — ADR "New lifecycle function `expireCc()` returns `HOLDING_SHARES`, not `WHEEL_COMPLETE`"
- [extract: us-12](../../.extracts/us-12.md) — `rollCsp` + `calculateRollBasis`
- [feature: us-4-close-csp](../../features/us-4-close-csp.md)
- [feature: us-5-expire-csp](../../features/us-5-expire-csp.md)
- [feature: us-6-record-assignment](../../features/us-6-record-assignment.md)
- [feature: us-7-open-covered-call](../../features/us-7-open-covered-call.md)
- [feature: us-8-close-cc-early](../../features/us-8-close-cc-early.md)
- [feature: us-9-expire-cc](../../features/us-9-expire-cc.md)
- [feature: us-12-roll-csp](../../features/us-12-roll-csp.md)
<!-- /generated -->
