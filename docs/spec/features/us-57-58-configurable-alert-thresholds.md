# US-57 & US-58: Configurable alert thresholds

<!-- generated:from us-57-58 -->

## Summary

Adds configurable global defaults for the profit-target percentage and management-window DTE (US-57), stored in the existing `app_settings` key/value table and edited from the Settings page, plus a per-position override of the same two thresholds (US-58), stored on a new nullable `positions.management_window_dte_override` column alongside the existing `profit_target_percent` column and edited from the position-detail page. Both stories share one pure resolution helper pair (`resolveProfitTarget`, new `resolveManagementWindowDte`) so the alert engine, the positions-list `TARGET` badge, and both new forms apply identical override-then-default logic. The scheduled `evaluateAlerts` job reads the saved global defaults on every tick, and saving one story's settings never mutates the other's storage.

(Source: `docs/epics/07-stories/US-57-global-alert-thresholds.md`, `docs/epics/07-stories/US-58-position-alert-overrides.md`, via `plans/us-57-58/plan.md`)

## Acceptance criteria

All eight ACs have exactly one named e2e test:

**US-57 (global defaults)**

- Trader saves new global defaults
- Existing positions without overrides pick up the new defaults
- Invalid settings are rejected inline
- Saving global defaults does not overwrite per-position overrides

**US-58 (per-position overrides)**

- Trader saves per-position overrides
- Other positions continue using the global defaults
- Trader clears overrides and reverts to global defaults
- Invalid override values are rejected inline

(Source: `plans/us-57-58/plan.md` AC Audit table)

## What was built

**Global defaults (US-57).** Two new `app_settings` rows — `alert_default_profit_target_percent` (`1..99`, absent → `50`) and `alert_default_management_window_dte` (`6..45`, absent → `21`) — read/written through the existing `appSettings.get`/`appSettings.set` helpers (`src/main/services/app-settings.ts`). No migration was needed. A new `AlertDefaultsSection` on the Settings page edits both via a React Hook Form + Zod-resolver form, backed by the new `settings:get-alert-defaults` / `settings:save-alert-defaults` IPC channels and `src/main/services/alert-defaults.ts` (`getAlertDefaults`, `saveAlertDefaults`).

**Per-position overrides (US-58).** A new nullable `management_window_dte_override INTEGER` column was added to `positions` via migration `010_add_management_window_dte_override.sql`, mirroring the existing `profit_target_percent` column from US-33. A new `PositionAlertOverridesForm` on the position-detail page edits both override fields together behind a single "Custom alert thresholds active" toggle, backed by the new `positions:save-alert-overrides` IPC channel and `src/main/services/save-position-alert-overrides.ts`. Setting both fields to `null` in one write reverts the position to inheriting the global defaults.

**Shared resolution.** `resolveManagementWindowDte(override, defaultDte = DEFAULT_MANAGEMENT_WINDOW_DTE)` was added next to the existing `resolveProfitTarget` in `src/main/core/alerts.ts`, both now taking an explicit `default` parameter instead of a hard-coded constant. `evaluatePosition` resolves both thresholds once per position into a `ResolvedThresholds` object and passes it to every rule's `test`, so `PROFIT_TARGET` reads `resolved.profitTargetPercent` instead of resolving it inline. The renderer gained a `useAlertDefaults()` hook (backed by `settings:get-alert-defaults`), lifted once per page tree (e.g. `PositionsListPage.tsx`) and threaded into `PositionCard.tsx`'s `deriveRowDisplay` so the `TARGET` badge and the alert engine always agree on the current global default.

`AlertEvaluationInput` gained two new fields additively — `managementWindowDteOverride: number | null` and `profitTargetPercentDefault?: number` — without renaming the existing `managementWindowDte` field, so the ~20 pre-existing call sites in `alerts.test.ts` kept passing unmodified.

## Architecture decisions

- Global defaults live in the existing `app_settings` key/value table, not a new dedicated table — no migration, absence of a row means "use the built-in default" → [configurable-alert-thresholds](../architecture/02-adrs/configurable-alert-thresholds.md)
- Per-position management-window override is a new nullable column mirroring US-33's `profit_target_percent` column, not a separate overrides table → [configurable-alert-thresholds](../architecture/02-adrs/configurable-alert-thresholds.md)
- Both thresholds are resolved once per position inside `evaluatePosition`, not per-rule, keeping `RuleDefinition.test`'s signature uniform across all five rules → [configurable-alert-thresholds](../architecture/02-adrs/configurable-alert-thresholds.md)
- New `AlertEvaluationInput` fields are additive (`...Override` nullable per-position, `...Default` optional batch-level) rather than renaming the existing `managementWindowDte` field, avoiding churn across ~20 existing test call sites → [configurable-alert-thresholds](../architecture/02-adrs/configurable-alert-thresholds.md)
- `resolveProfitTarget` / `resolveManagementWindowDte` grow a second `default` parameter rather than reading global state themselves, keeping `src/main/core/` free of DB imports → [configurable-alert-thresholds](../architecture/02-adrs/configurable-alert-thresholds.md)
- The renderer `TargetBadge`/`PositionCard` reads the same global default the engine uses, via a new `useAlertDefaults()` hook, so saving a new global default never leaves the positions-list badge checking a stale hardcoded value → [configurable-alert-thresholds](../architecture/02-adrs/configurable-alert-thresholds.md)

This plan supersedes two claims in [profit-target-nullable-column](../architecture/02-adrs/profit-target-nullable-column.md): "no `app_settings` row/key is used for the profit target" and the hard-coded `DEFAULT_PROFIT_TARGET_PERCENT` default are both now superseded — the profit target's global default lives in `app_settings` and is resolved via a defaulted parameter rather than a fixed constant. See [configurable-alert-thresholds](../architecture/02-adrs/configurable-alert-thresholds.md) for the current design.

See also the [Alerts domain page](../domain/alerts.md), which documents `MANAGEMENT_WINDOW` and `PROFIT_TARGET`'s thresholds as "default 21" / "default 50%" — those defaults are now trader-configurable rather than fixed constants, per this plan.

## Contracts touched

- `settings:get-alert-defaults` — new IPC handler, no request payload; returns `{ ok: true, defaults: { profitTargetPercent, managementWindowDte } }`. Handler `src/main/ipc/settings.ts`; service `src/main/services/alert-defaults.ts` (`getAlertDefaults`).
- `settings:save-alert-defaults` — new IPC handler; Zod payload `{ profitTargetPercent: 1-99, managementWindowDte: 6-45 }`, both validated before either `app_settings` row is written. Handler `src/main/ipc/settings.ts`; service `src/main/services/alert-defaults.ts` (`saveAlertDefaults`).
- `positions:save-alert-overrides` — new IPC handler; Zod payload `{ positionId, profitTargetPercent: 1-99 | null, managementWindowDte: 6-45 | null }`; passing `null` for both clears the overrides. Handler `src/main/ipc/positions.ts`; service `src/main/services/save-position-alert-overrides.ts` (`savePositionAlertOverrides`).
- `resolveManagementWindowDte(override: number | null, defaultDte = DEFAULT_MANAGEMENT_WINDOW_DTE): number` — new pure helper in `src/main/core/alerts.ts`, alongside the extended `resolveProfitTarget(override, defaultPercent = DEFAULT_PROFIT_TARGET_PERCENT)`.
- `evaluatePosition` — now computes a `ResolvedThresholds` object once per position and passes it as the second argument to `RuleDefinition.test`.
- See [US-50: Scheduled alert-rule evaluation engine](./us-50-alert-engine.md) for the engine this plan's resolved thresholds feed into, and [US-33: Show current option mid-price and unrealized P&L](./us-33-option-mid-pnl.md) for the original `profit_target_percent` column and `resolveProfitTarget` this plan extends.

## Source files

- `migrations/010_add_management_window_dte_override.sql`
- `src/main/core/profit-target.ts`
- `src/main/core/alerts.ts`
- `src/main/services/alert-defaults.ts`
- `src/main/services/save-position-alert-overrides.ts`
- `src/main/services/get-position.ts`
- `src/main/services/evaluate-alerts.ts`
- `src/main/services/evaluate-alerts.e2e.test.ts`
- `src/main/services/evaluate-alerts-test-utils.ts`
- `src/main/schemas.ts`
- `src/main/ipc/settings.ts`
- `src/main/ipc/positions.ts`
- `src/main/index.ts`
- `src/preload/index.ts`
- `src/preload/index.d.ts`
- `src/renderer/src/api/settings.ts`
- `src/renderer/src/api/positions.ts`
- `src/renderer/src/hooks/settingsQueryKeys.ts`
- `src/renderer/src/hooks/useSettings.ts`
- `src/renderer/src/hooks/usePositions.ts`
- `src/renderer/src/pages/SettingsPage.tsx`
- `src/renderer/src/components/PositionAlertOverridesForm.tsx`
- `src/renderer/src/pages/PositionDetailContent.tsx`
- `src/renderer/src/components/PositionCard.tsx`
- `src/renderer/src/pages/PositionsListPage.tsx`

<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
