# ADR: Profit target — nullable column + hard-coded default constant

<!-- generated:from us-33,us-57-58 -->

## Decision

`positions.profit_target_percent INTEGER` is added as a nullable column via migration `005_add_profit_target_percent.sql`. A pure helper `resolveProfitTarget(override: number | null, defaultPercent: number = DEFAULT_PROFIT_TARGET_PERCENT): number` (in `src/main/core/profit-target.ts`) returns the override when non-null (explicit `=== null` check so `0` is a real override, not falsy-coalesced) and the supplied default otherwise, falling back to the hard-coded `DEFAULT_PROFIT_TARGET_PERCENT = 50` when no default is passed. The `defaultPercent` parameter is additive — every pre-US-57/58 call site still compiles and behaves identically without passing it.

As of US-57, the "global default" is no longer only the hard-coded constant: a saved override lives in the existing `app_settings` key/value table under `alert_default_profit_target_percent`, read via `getAlertDefaults` and written via `saveAlertDefaults` (`src/main/services/alert-defaults.ts`). When a row is present, its value is threaded through as `resolveProfitTarget`'s `defaultPercent` argument by every caller (alert engine, positions-list badge, position-detail panel); when absent, the constant remains the effective default. (An `app_settings` table was added in migration `006_add_credential_settings.sql` for unrelated credential/settings storage; US-57 is the profit target's first use of it.)

## Why

US-33 has no AC for setting the override — only for reading the effect of having one. A constant satisfies every AC and the per-position override satisfies the "AAPL has a per-position profit target of 25%" scenario. Centralising in `resolveProfitTarget` means a settings UI replaces the effective default in exactly one place without changing the function's signature; the column was already in the schema before that UI existed.

## Alternatives considered

- **`app_settings` key/value table (at US-33 time)** — adds storage and IPC surface for a feature without a story; deferred until US-57 actually needed a settings UI.
- **Env var** — no end-user control without a settings UI.

## Source

- `plans/us-33/research.md`
- `plans/us-33/data-model.md`
- Feature page: `../../features/us-33-option-mid-pnl.md`
<!-- /generated -->

## Superseded by

US-57/US-58 added the saved global default described above. See [configurable-alert-thresholds](./configurable-alert-thresholds.md) for the full three-tier resolution precedence (override → saved global default → constant) shared by both alert thresholds, and `../../features/us-57-58-configurable-alert-thresholds.md` for the feature page.
