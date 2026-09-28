---
page: docs/spec/architecture/02-adrs/alert-rule-registry.md
audited_at: 2026-09-28
findings: 2
---

# Audit: docs/spec/architecture/02-adrs/alert-rule-registry.md

## Verified (6)

- ✓ Ordered `RULES: RuleDefinition[]` registry with `code`, `urgency`, `test`, `summary` — `src/main/core/alerts.ts:207-213,232`.
- ✓ `evaluatePosition` is a two-pass loop over the registry (skips via `flatMap`, matches via `filter`) — `alerts.ts:302-332`.
- ✓ `EXPIRATION_IMMINENT` (high) tests `dte >= 0 && dte <= EXPIRATION_IMMINENT_MAX_DTE`; `EXPIRATION_IMMINENT_MAX_DTE = 5` — `alerts.ts:21,233-240`.
- ✓ `MANAGEMENT_WINDOW` (medium) tests `dte > EXPIRATION_IMMINENT_MAX_DTE && dte <= managementWindowDte` (now `resolved.managementWindowDte`) — `alerts.ts:241-250`.
- ✓ `DEFAULT_MANAGEMENT_WINDOW_DTE = 21` — `alerts.ts:24`; override seam used via `resolveManagementWindowDte` — `alerts.ts:303-307`.
- ✓ Named constants `MISSING_DTE`, `QUICK_ACTION_REVIEW` — `alerts.ts:41,43`.

## Drift (2)

- ✗ Line 7 says each entry carries a `requiresDte` flag. No `requiresDte` exists in `src/`; each `RuleDefinition` instead has an optional `missingData?: (input) => string | null` guard — `src/main/core/alerts.ts:211`. Suggested fix: replace `requiresDte` with the `missingData` guard.
- ✗ Line 9 says, in the present tense, "The registry ships two built-in rules". It now ships six: `EXPIRATION_IMMINENT`, `MANAGEMENT_WINDOW`, `PROFIT_TARGET`, `STRIKE_PROXIMITY`, `EARNINGS_PROXIMITY`, `COVERED_CALL_BREACH` — `alerts.ts:234,242,252,268,276,293`. Suggested fix: frame as "shipped with two in US-50" or list the current six.

## Unverifiable (1)

- ? Open/closed rationale and "louder" alert rationale — narrative.

## Missing files (0)

- (none) — `src/main/core/alerts.ts`, `../../features/us-50-alert-engine.md`, `../../features/us-52-expiration-imminent-alert.md`, `../../domain/alerts.md` exist.
