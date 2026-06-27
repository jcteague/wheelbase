---
page: docs/spec/architecture/02-adrs/alert-rule-registry.md
audited_at: 2026-06-27
findings: 1
---

# Audit: alert-rule-registry.md

## Verified (6)

- ✓ Rules expressed as an ordered `const RULES: RuleDefinition[]` — `src/main/core/alerts.ts:80`.
- ✓ `RuleDefinition` carries `code`, `urgency`, `requiresDte`, pure `test`, and `summary` builder — `core/alerts.ts:72-78`.
- ✓ `evaluatePosition` is a two-filter pass (one for skips, one for matches) over the registry — `core/alerts.ts:105-109`.
- ✓ `EXPIRATION_IMMINENT` fires at `dte <= EXPIRATION_IMMINENT_MAX_DTE` (= 5) — `core/alerts.ts:14,85-86`.
- ✓ `MANAGEMENT_WINDOW` fires at `dte > EXPIRATION_IMMINENT_MAX_DTE` and `<= managementWindowDte` (mutually exclusive ranges) — `core/alerts.ts:93-95`.
- ✓ `DEFAULT_MANAGEMENT_WINDOW_DTE = 21`, passed as default parameter — `core/alerts.ts:17,30,102`. Named constants `MISSING_DTE` (`:21`) and `QUICK_ACTION_REVIEW` (`:19`) exist.

## Drift (1)

- ✗ Page lists `EXPIRATION_IMMINENT_MAX_DTE` among "named constants introduced" (line 9) — it exists but as a module-private `const`, not exported (`core/alerts.ts:14`, `const EXPIRATION_IMMINENT_MAX_DTE = 5`, no `export`). Minor: the claim is satisfied as a named constant; only flag if the page implies it is exported. No fix required unless export status was implied.

## Unverifiable (1)

- ? "Future rules append to the array without touching the evaluation loop" / open-closed rationale — design intent, not mechanically auditable.

## Missing files (0)

None.
