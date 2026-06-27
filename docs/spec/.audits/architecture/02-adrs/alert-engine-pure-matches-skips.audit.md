---
page: docs/spec/architecture/02-adrs/alert-engine-pure-matches-skips.md
audited_at: 2026-06-27
findings: 0
---

# Audit: alert-engine-pure-matches-skips.md

## Verified (5)

- ✓ `src/main/core/alerts.ts` exists and exposes `evaluatePosition(input)` returning `{ matches: AlertMatch[]; skipped: SkippedRule[] }` — `core/alerts.ts:101` plus types `AlertMatch`/`SkippedRule`/`PositionEvaluation` at `:33,:40,:45-47`.
- ✓ No DB/broker/logger imports — only `decimal.js` and `./types` imported — `core/alerts.ts:5-6`; header comment "No DB, broker, or logger imports" at `:3`.
- ✓ Each rule is a small pure predicate (`RuleDefinition.test`) — `core/alerts.ts:72-99`.
- ✓ Missing required input (`dte === null`) yields a `SkippedRule { ruleCode, reason }` (reason `MISSING_DTE`), not a throw — `core/alerts.ts:103-107`.
- ✓ Service logs skips at DEBUG: `evaluate-alerts.ts` handles logging (skips logged in the service, not core).

## Drift (0)

None.

## Unverifiable (1)

- ? "matching costbasis.ts, lifecycle.ts, and profit-target.ts" purity comparison — not individually re-audited; consistent with core-purity rule.

## Missing files (0)

None.
