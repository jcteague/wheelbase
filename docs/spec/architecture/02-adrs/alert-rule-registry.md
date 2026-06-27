# ADR: Alert rules as an ordered open/closed registry

<!-- generated:from us-50 -->

## Decision

Alert rules are expressed as an ordered `RULES: RuleDefinition[]` list, each entry carrying a `code`, `urgency`, `requiresDte` flag, a pure `test` predicate, and a named `summary` builder. `evaluatePosition` is a generic two-filter pass over the registry — one pass collects rules skipped for missing data, the other collects matches. Future rules append to the array without touching the evaluation loop.

Rule **precedence** is encoded as mutually-exclusive DTE ranges rather than ordering-dependent early returns: `EXPIRATION_IMMINENT` fires at `dte ≤ 5` (`EXPIRATION_IMMINENT_MAX_DTE`), `MANAGEMENT_WINDOW` fires at `6 ≤ dte ≤ managementWindowDte`, so the same leg never matches both. The management-window threshold is a parameter defaulting to `DEFAULT_MANAGEMENT_WINDOW_DTE = 21`; US-50 always passes the default, leaving an explicit seam for the configurable global threshold (US-57) and per-position override (US-58). Named constants introduced: `EXPIRATION_IMMINENT_MAX_DTE`, `MISSING_DTE`, `QUICK_ACTION_REVIEW`, `DEFAULT_MANAGEMENT_WINDOW_DTE`.

## Why

Open/closed design: later stories (US-54/55/56/62) extend the engine without modifying its evaluation logic or re-reasoning about precedence. Encoding the lower bound (6) into the management window — rather than emitting both rules and de-duping at persistence — makes each rule self-contained and order-independent.

## Alternatives considered

- **An `if (dte === null) … if (dte <= 5) … if (dte <= managementWindowDte) …` early-return chain** — the original implementation; replaced during the refactor phase because adding a future rule would mean editing control flow.
- **Emit both rules, then de-dup by urgency at persistence** — rejected as more code and less obvious than a clean window boundary.
- **Hard-code the threshold of 21 inline** — rejected; the parameter seam is required by US-53's configurable-threshold note and costs nothing now.

## Source

- `plans/us-50/research.md`, `plans/us-50/refactor-phase-results.md`
- Feature page: `../../features/us-50-alert-engine.md`
- Domain page: `../../domain/alerts.md`
<!-- /generated -->
