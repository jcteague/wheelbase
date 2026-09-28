---
page: docs/spec/architecture/02-adrs/alert-engine-pure-matches-skips.md
audited_at: 2026-09-28
findings: 1
---

# Audit: docs/spec/architecture/02-adrs/alert-engine-pure-matches-skips.md

## Verified (5)

- ✓ `evaluatePosition(input): PositionEvaluation` returning `{ matches, skipped }` — `src/main/core/alerts.ts:107-110,302,332`.
- ✓ No DB/broker/logger imports — imports are only `decimal.js`, `./costbasis`, `./profit-target`, `./types` (`src/main/core/alerts.ts:5-8`; header comment line 3).
- ✓ `SkippedRule { ruleCode, reason }` — `src/main/core/alerts.ts:102-105`; missing `dte` yields a skip via `missingDteReason` rather than a throw.
- ✓ Each rule is a small pure predicate in the `RULES` registry — `src/main/core/alerts.ts:232-300`.
- ✓ Service logs skips at DEBUG — `logger.debug(..., 'alert_rule_skipped')` at `src/main/services/evaluate-alerts.ts:258-261`.

## Drift (0)

## Unverifiable (1)

- ? "Not throwing on missing data keeps one rule's missing input from aborting evaluation of the rest" — rationale; consistent with each rule's `missingData` guard preceding `test`.

## Missing files (1)

- ✗ Source `plans/us-50/research.md` does not exist.
