# ADR: Configurable alert thresholds — shared override → global-default → constant precedence

<!-- generated:from us-57-58 -->

## Decision

Both configurable alert thresholds — profit-target percentage and management-window DTE — resolve via the identical three-tier precedence: per-position override → saved global default → hard-coded constant. This is expressed as two near-identical pure functions, `resolveProfitTarget(override, defaultPercent)` and `resolveManagementWindowDte(override, defaultDte)` (`src/main/core/profit-target.ts` / `src/main/core/alerts.ts`), reused unchanged by the alert engine (`evaluatePosition`), the positions-list `TARGET` badge (`PositionCard.tsx`), and the position-detail alert-overrides panel.

Global defaults live in two rows of the existing `app_settings` key/value table (`alert_default_profit_target_percent`, `alert_default_management_window_dte`) — no new migration for this half, reusing `appSettings.get`/`appSettings.set`. The per-position override reuses the nullable-column pattern established for profit target (see [profit-target-nullable-column](./profit-target-nullable-column.md)): a new nullable `positions.management_window_dte_override INTEGER` column added via migration `010_add_management_window_dte_override.sql`, where `NULL` means "inherit the global default."

## Why

Routing both the engine's evaluated thresholds and the UI's displayed/edited thresholds through one shared resolution rule per threshold keeps them from drifting apart — saving a new global default changes the alert engine's behavior and the positions-list badge and the position-detail panel simultaneously, with no call site left checking against a stale value. Reusing `app_settings` and the nullable-column pattern avoids inventing new infrastructure for a shape (`key → value`, `override-or-null`) the codebase already has working, proven precedent for from US-33/US-50.

## Alternatives considered

- **A separate `position_alert_overrides` table keyed by `position_id`** — rejected; it would require a join everywhere `profit_target_percent` is already inlined into `positions` queries, for no behavioral difference over a nullable column (still a 1:1, always-present-or-null relationship).
- **A new dedicated `alert_defaults` table with typed columns** — rejected as needless ceremony for two scalars that already have a working key/value home in `app_settings`.

## Source

- `plans/us-57-58/research.md`
- `plans/us-57-58/data-model.md`
- Feature page: `../../features/us-57-58-configurable-alert-thresholds.md`
- Domain page: `../../domain/alerts.md`
<!-- /generated -->
