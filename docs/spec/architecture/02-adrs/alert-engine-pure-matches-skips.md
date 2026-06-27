# ADR: Alert engine returns matches + skips, never logs or throws

<!-- generated:from us-50 -->

## Decision

`src/main/core/alerts.ts` exposes `evaluatePosition(input): { matches: AlertMatch[]; skipped: SkippedRule[] }` as a pure function with no DB/broker/logger imports, matching the `src/main/core/` purity rule. Each built-in rule is a small pure predicate. When a rule cannot evaluate because a required input is absent (e.g. `dte === null`), the engine records a `SkippedRule { ruleCode, reason }` instead of throwing. The service layer (`evaluate-alerts.ts`) is responsible for logging skips at DEBUG.

## Why

Keeps core engines pure and side-effect-free, matching `costbasis.ts`, `lifecycle.ts`, and `profit-target.ts`. Returning structured `skipped` entries lets the service satisfy the "missing data for one rule is skipped with a debug log entry" acceptance criterion without putting logging inside core. Not throwing on missing data keeps one rule's missing input from aborting evaluation of the rest.

## Alternatives considered

- **Throw inside the engine and catch in the service** — rejected; it conflates "no data" with "bug" and complicates the pure-function contract.
- **Pass a logger into the engine** — rejected; violates the no-I/O core rule.

## Source

- `plans/us-50/research.md`
- Feature page: `../../features/us-50-alert-engine.md`
- Domain page: `../../domain/alerts.md`
<!-- /generated -->
