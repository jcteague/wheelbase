# ADR: Phase-aware active-leg SQL subquery (`activeLegSubquery`)

<!-- generated:from us-12, us-12-refactor -->

## Decision

The "current open leg" of a position is resolved via a shared SQL subquery exposed by `activeLegSubquery()` in `src/main/services/active-leg-sql.ts`. The subquery is phase-aware:

| Position phase   | Eligible leg roles           |
| ---------------- | ---------------------------- |
| `CSP_OPEN`       | `CSP_OPEN`, `ROLL_TO`        |
| `CC_OPEN`        | `CC_OPEN`, `ROLL_TO`         |
| All other phases | No active leg (returns null) |

Tie-breaking: `ORDER BY fill_date DESC, created_at DESC LIMIT 1`. The function returns a string SQL fragment (no parameters; it references `p.id` and `p.phase` from the outer query). It is used by both `list-positions.ts` and `get-position.ts` so the two queries can never drift.

## Context / Why

- Before US-12, `list-positions.ts` queried for `CSP_OPEN | CC_OPEN` only and missed `ROLL_TO` legs entirely. After a roll, the position list showed `null` strike/expiration. The correct logic existed in `get-position.ts`; extracting it eliminated the inconsistency.
- The phase column on `positions` is the cheap discriminator: it tells the query which leg roles can be active without having to derive that from leg history.
- An SQL fragment (rather than a parameterised function or a TypeScript post-filter) keeps the join in one efficient query and avoids N+1 risk for the list view.

## Alternatives considered

- **Persist an `is_active` or `superseded_at` column on `legs`** — rejected; over-engineering for a query-level concern; would require a schema migration.
- **TypeScript post-filter on the legs array** — rejected; less efficient and easy to get wrong (e.g. forgetting the tie-breaker).
- **Inline the subquery in each caller** — what existed before refactor; rejected as duplication-prone.

## Consequences

- Adding a new "open" leg role (e.g. for a future strategy) requires updating `activeLegSubquery()` in one place.
- The helper lives in `src/main/services/` (not `core/`) because it's SQL, not pure domain logic.
- Regression coverage: `list-positions.test.ts` includes "rolled CSP shows ROLL_TO leg's strike/expiration" tests so the bug can't return silently.

## Sources

- [extract: us-12](../../.extracts/us-12.md) — ADR "Active-leg query must include ROLL_TO (post-review fix)"
- [extract: us-12-refactor](../../.extracts/us-12-refactor.md) — ADR "Active Leg SQL Centralization"
- [feature: us-12-roll-csp](../../features/us-12-roll-csp.md)
<!-- /generated -->
