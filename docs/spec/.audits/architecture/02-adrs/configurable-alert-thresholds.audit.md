---
page: docs/spec/architecture/02-adrs/configurable-alert-thresholds.md
audited_at: 2026-09-28
findings: 0
---

# Audit: docs/spec/architecture/02-adrs/configurable-alert-thresholds.md

## Verified (7)

- ✓ `resolveProfitTarget(override, defaultPercent)` in `src/main/core/profit-target.ts:6`; `resolveManagementWindowDte(override, defaultDte)` in `src/main/core/alerts.ts:28`.
- ✓ Used by the alert engine `evaluatePosition` — `src/main/core/alerts.ts:304-311`.
- ✓ Used by the positions-list badge — `src/renderer/src/components/PositionCard.tsx:4,44`.
- ✓ Used by the position-detail overrides panel — `src/renderer/src/components/PositionAlertOverridesForm.tsx:4-5,32,36`.
- ✓ Global defaults in `app_settings` keys `alert_default_profit_target_percent` / `alert_default_management_window_dte` via `appSettings.get`/`set` — `src/main/services/alert-defaults.ts:13,15-16,29-30,49`.
- ✓ Fallback to hard-coded constants `DEFAULT_PROFIT_TARGET_PERCENT` / `DEFAULT_MANAGEMENT_WINDOW_DTE` — `alert-defaults.ts:3-4`.
- ✓ Migration `010_add_management_window_dte_override.sql` adds nullable `positions.management_window_dte_override INTEGER`.

## Drift (0)

## Unverifiable (1)

- ? "Saving a new global default changes ... simultaneously" — behavioural rationale; consistent with the shared resolvers above.

## Missing files (0)

- (none) — `plans/us-57-58/research.md`, `plans/us-57-58/data-model.md`, `../../features/us-57-58-configurable-alert-thresholds.md`, `../../domain/alerts.md`, `./profit-target-nullable-column.md` exist.
