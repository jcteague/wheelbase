# ADR: Pure core engines (lifecycle, cost basis)
<!-- generated:from us-2, us-4, us-5, us-6, us-7, us-8, us-9, us-12 -->

## Decision

Domain logic for wheel lifecycle transitions (`src/main/core/lifecycle.ts`) and cost-basis math (`src/main/core/costbasis.ts`) is implemented as pure functions. The engines do not import `better-sqlite3`, the Alpaca SDK, the IPC layer, or anything else with side effects. Every value the engine needs (`currentPhase`, `openFillDate`, `expirationDate`, `referenceDate`, `prevBasisPerShare`, premium-leg arrays, etc.) is passed in by the caller; engines return plain result objects or throw `ValidationError`.

The service layer is the only place that bridges the engines with the DB: it queries the position + active leg + latest snapshot, calls the engine with those values, then writes the result back inside a single transaction.

## Context / Why

- Lifecycle transitions and cost-basis calculations are the heart of the wheel domain; they must be unit-tested without spinning up SQLite or mocking the broker.
- Date and decimal validation (close ≥ open, assignment ≥ open, expire ≥ reference, contracts ≤ shares-held) is consistent across every story; centralising it in pure functions keeps the rules in one place and avoids the same guards being scattered across services.
- Architecture rule from `CLAUDE.md`: "`src/main/core/` engines have no DB or broker imports — they take plain values and return results."
- Pure functions compose cleanly: `rollCsp` reuses `requirePositiveStrike` / `requirePositivePremium` extracted from `openWheel` / `openCoveredCall`; `closeCsp` and `closeCoveredCall` share `requirePositiveClosePrice`.

## Alternatives considered

- **Inline validation inside the service layer** — rejected because it scatters domain rules across services that already mix DB I/O with logic.
- **Engines that take a DB handle and self-query** — rejected; breaks testability and couples domain logic to persistence.

## Consequences

- Each lifecycle transition adds one named pure function (`closeCsp`, `expireCsp`, `recordAssignment`, `openCoveredCall`, `closeCoveredCall`, `expireCc`, `rollCsp`) — see ADR [named-lifecycle-functions](./named-lifecycle-functions.md).
- Services must do one read query before the transaction to gather the context values the engine needs (open-leg `fillDate`, `expiration`, ASSIGN-leg `contracts`, latest snapshot).
- No logging is added to core engines — they remain pure.
- Engine tests are fast (no DB setup) and run independently of integration tests.

## Sources

- [extract: us-2](../../.extracts/us-2.md) — ADR "Active leg selection per position" (service-layer DB query feeding pure logic)
- [extract: us-4](../../.extracts/us-4.md) — ADR "Date validation ownership (lifecycle engine vs service layer)"
- [extract: us-5](../../.extracts/us-5.md) — ADR "Lifecycle validation lives in the pure core engine"
- [extract: us-6](../../.extracts/us-6.md) — ADR "Date validation parameters mirror `closeCsp` / `expireCsp`"
- [extract: us-7](../../.extracts/us-7.md) — ADR "Fill date validation in the lifecycle engine"
- [extract: us-8](../../.extracts/us-8.md) — ADR "Fill-date validation bounds (lifecycle engine)"
- [extract: us-9](../../.extracts/us-9.md) — ADR "New lifecycle function `expireCc()` returns `HOLDING_SHARES`"
- [extract: us-12](../../.extracts/us-12.md) — ADR "Cost basis after roll computed in pure engine"
- [feature: us-4-close-csp](../../features/us-4-close-csp.md)
- [feature: us-5-expire-csp](../../features/us-5-expire-csp.md)
- [feature: us-6-record-assignment](../../features/us-6-record-assignment.md)
- [feature: us-7-open-covered-call](../../features/us-7-open-covered-call.md)
- [feature: us-8-close-cc-early](../../features/us-8-close-cc-early.md)
- [feature: us-9-expire-cc](../../features/us-9-expire-cc.md)
- [feature: us-12-roll-csp](../../features/us-12-roll-csp.md)
<!-- /generated -->
