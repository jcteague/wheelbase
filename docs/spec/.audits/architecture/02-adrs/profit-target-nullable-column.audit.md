---
page: docs/spec/architecture/02-adrs/profit-target-nullable-column.md
audited_at: 2026-09-28
findings: 2
---

# Audit: profit-target-nullable-column.md

## Verified (7)

- ✓ `positions.profit_target_percent INTEGER` nullable via `migrations/005_add_profit_target_percent.sql:1-2`.
- ✓ `resolveProfitTarget(override: number | null, defaultPercent: number = DEFAULT_PROFIT_TARGET_PERCENT)` with explicit `override === null` check — `src/main/core/profit-target.ts:6-11`.
- ✓ `DEFAULT_PROFIT_TARGET_PERCENT = 50` — `profit-target.ts:4`.
- ✓ Saved global default key `alert_default_profit_target_percent` in `app_settings`, via `getAlertDefaults` / `saveAlertDefaults` — `src/main/services/alert-defaults.ts:15, 28, 37`.
- ✓ `app_settings` created in `migrations/006_add_credential_settings.sql:13`.
- ✓ Callers thread the default: alert engine `src/main/core/alerts.ts:308`, list badge `src/renderer/src/components/PositionCard.tsx:44`, detail overrides form `src/renderer/src/components/PositionAlertOverridesForm.tsx:32`.
- ✓ "Superseded by" section links `configurable-alert-thresholds.md` and `us-57-58-configurable-alert-thresholds.md`, both present — supersession is recorded, not drift.

## Drift (0)

None.

## Unverifiable (1)

- ? US-33 AC rationale and deferral of `app_settings` at US-33 time — history.

## Missing files (2)

- ✗ Source `plans/us-33/research.md` — `plans/us-33/` no longer exists.
- ✗ Source `plans/us-33/data-model.md` — same.
