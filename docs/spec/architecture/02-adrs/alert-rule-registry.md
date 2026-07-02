# ADR: Alert rules as an ordered open/closed registry

<!-- generated:from us-50,us-52 -->

## Decision

Alert rules are expressed as an ordered `RULES: RuleDefinition[]` list, each entry carrying a `code`, `urgency`, `requiresDte` flag, a pure `test` predicate, and a named `summary` builder. `evaluatePosition` is a generic two-filter pass over the registry — one pass collects rules skipped for missing data, the other collects matches. Future rules append to the array without touching the evaluation loop.

The registry ships two built-in rules: `EXPIRATION_IMMINENT` (high urgency) matching `0 <= dte <= 5`, and `MANAGEMENT_WINDOW` (medium urgency) matching `dte > 5 && dte <= managementWindowDte`. Rule **precedence** is encoded as **mutually exclusive DTE ranges** rather than ordering-dependent early returns: because the two windows never overlap, the same leg never matches both rules. `EXPIRATION_IMMINENT` uses a fixed built-in bound `EXPIRATION_IMMINENT_MAX_DTE = 5` and does **not** depend on `managementWindowDte`. The management-window threshold is a parameter defaulting to `DEFAULT_MANAGEMENT_WINDOW_DTE = 21`; US-50/US-52 always pass the default, leaving an explicit seam for the configurable global threshold (US-57) and per-position override (US-58). Named constants introduced: `EXPIRATION_IMMINENT_MAX_DTE`, `MISSING_DTE`, `QUICK_ACTION_REVIEW`, `DEFAULT_MANAGEMENT_WINDOW_DTE`.

## Why

Open/closed design: later stories (US-54/55/56/62) extend the engine without modifying its evaluation logic or re-reasoning about precedence. Encoding the lower bound (`dte > 5`) into the management window — rather than emitting both rules and de-duping at persistence — makes each rule self-contained, order-independent, and easy to regression-test. The expiration-imminent alert is "louder" than a routine management reminder, so keeping it a distinct fixed-threshold rule preserves the rule contract while the management window remains separately configurable.

## Alternatives considered

- **An `if (dte === null) … if (dte <= 5) … if (dte <= managementWindowDte) …` early-return chain** — the original implementation; replaced during US-50's refactor phase because adding a future rule would mean editing control flow and re-reasoning about precedence.
- **Emit both rules inside 5 DTE, then de-dup by urgency at persistence** — rejected as more code and less obvious than a clean window boundary, and it complicates persistence while weakening the per-rule contract.
- **Reuse `managementWindowDte` for the expiration-imminent bound (or make it configurable now)** — rejected; `DTE <= 5` is fixed for this epic and must stay distinct from the later configurable management-window behavior (US-57/US-58).
- **Hard-code the threshold of 21 inline** — rejected; the parameter seam is required by US-53's configurable-threshold note and costs nothing now.

## Source

- `src/main/core/alerts.ts` — verified: `EXPIRATION_IMMINENT_MAX_DTE = 5`; `EXPIRATION_IMMINENT.test` is `input.dte !== null && input.dte >= 0 && input.dte <= EXPIRATION_IMMINENT_MAX_DTE`; `MANAGEMENT_WINDOW.test` is `input.dte > EXPIRATION_IMMINENT_MAX_DTE && input.dte <= managementWindowDte`
- Feature pages: `../../features/us-50-alert-engine.md`, `../../features/us-52-expiration-imminent-alert.md`
- Domain page: `../../domain/alerts.md`
<!-- /generated -->
