# Research: US-57 & US-58 — Global Alert Thresholds + Per-Position Overrides

## Why combined

US-58's Background and Dependencies both assume US-57's global defaults already exist ("Given the global defaults are profit target 50% and management window 21 DTE"), and both stories' Technical Notes say to "reuse the same schema bounds and default-resolution helper." Building the shared resolution logic (`resolveProfitTarget`, a new `resolveManagementWindowDte`, and the `app_settings`-backed global-defaults service) once and consuming it from both the Settings page (US-57) and the position-detail override form (US-58) avoids doing the threshold-resolution work twice. There is no scenario where US-58 ships without US-57 underneath it.

## What already exists (confirmed by reading source, not assumed)

- `positions.profit_target_percent` — nullable `INTEGER` column, added in migration `005_add_profit_target_percent.sql` (US-33). Currently **read-only**: no IPC handler edits it; only a test-only `test:set-position-profit-target` handler (`src/main/ipc/positions.ts:138`) exists, used by `e2e/option-pnl.spec.ts` to seed the column directly for US-33's AC-5. That test-only handler is untouched by this plan — it seeds a raw value without validation for a different story's e2e test, whereas US-58 ships a validated, real handler alongside it.
- `resolveProfitTarget(override: number | null): number` (`src/main/core/profit-target.ts`) — pure, returns hardcoded `DEFAULT_PROFIT_TARGET_PERCENT = 50` when `override === null`. Called from `src/main/core/alerts.ts` (PROFIT_TARGET rule) and `src/renderer/src/components/PositionCard.tsx` (`TargetBadge`/`deriveRowDisplay`).
- `DEFAULT_MANAGEMENT_WINDOW_DTE = 21` and the `MANAGEMENT_WINDOW` rule live in `src/main/core/alerts.ts`. `AlertEvaluationInput.managementWindowDte?: number` is already a **batch-level** call parameter (not per-position); `evaluatePosition` falls back to the constant when absent. No per-position override field or DB column exists for this yet.
- `app_settings` is a generic key/value table with a `get(db, key)` / `set(db, key, value)` service (`src/main/services/app-settings.ts`), already used for `active_broker_environment` (`src/main/services/settings.ts`). This is the natural, no-new-table home for the two US-57 global defaults — same pattern the US-33 ADR ("no `app_settings` table" for the _per-position_ override) explicitly did not rule out for genuinely global settings.
- `registerSettingsHandlers` (`src/main/ipc/settings.ts`) is the existing settings IPC surface, wired in `src/main/index.ts`. US-57's Technical Notes say to extend this rather than add a standalone page — matches existing structure exactly.
- `evaluateAlerts` (`src/main/services/evaluate-alerts.ts`) already accepts an injectable `managementWindowDte` and reads `positions.profit_target_percent` per row into `profitTargetPercentOverride`. The scheduler registration in `src/main/index.ts:219-228` currently calls `evaluateAlerts({ db, provider })` with no threshold overrides (relies on hardcoded defaults) — this is the wiring point that must start reading the saved global defaults on every tick.
- `getPosition` (`src/main/services/get-position.ts`) does **not** currently select `profit_target_percent` into `PositionRecord` at all — only `positions:list` exposes it (`PositionListItem.profitTargetPercent`). The position-detail page (US-58's mockup surface) therefore has no current data source for either override field; both must be added to `GET_QUERY`/`PositionRecord`.
- Discrepancy noted: the US-33 spec page says "Valid non-null range when an edit IPC eventually ships: 1..100 inclusive" but the actual US-57/US-58 Gherkin ACs say "Profit target must be between 1 and 99". This plan follows the AC text (1–99) as authoritative; `/update-spec` after this plan ships will reconcile the spec page.

## Architecture Decisions

### ADR: Global alert defaults live in `app_settings`, not a new table

- **Decision:** Store the two US-57 global defaults as two rows in the existing `app_settings` key/value table (`alert_default_profit_target_percent`, `alert_default_management_window_dte`), read/written through the existing `appSettings.get`/`appSettings.set` helpers. No new migration for US-57.
- **Why:** `app_settings` already exists precisely for singleton app-wide config (`active_broker_environment`); adding a two-column dedicated table would duplicate that pattern for no benefit. Absence of a row means "use the built-in default," which is exactly the Background AC ("current defaults are profit target 50% and management window 21 DTE") with zero data migration.
- **Alternatives considered:** A new `alert_defaults` table with typed columns — rejected as needless ceremony for two scalars that already have a working key/value home.

### ADR: Per-position management-window override is a new nullable column, mirroring US-33's profit-target column

- **Decision:** Add `management_window_dte_override INTEGER` (nullable) to `positions` via a new migration `010_add_management_window_dte_override.sql`. `NULL` means "inherit the global default," identical semantics to the existing `profit_target_percent` column.
- **Why:** US-33/US-57 already established this exact nullable-column-on-`positions` pattern for profit target; reusing it for the second override keeps both fields symmetric or an app_settings key/value entry.
- **Alternatives considered:** A separate `position_alert_overrides` table keyed by `position_id` — rejected; it would require a join everywhere `profit_target_percent` is already inlined into `positions` queries, for no behavioral difference (still a 1:1, always-present-or-null relationship).

### ADR: Resolve both thresholds once per position inside `evaluatePosition`, not per-rule

- **Decision:** `evaluatePosition` computes a single `ResolvedThresholds { managementWindowDte: number; profitTargetPercent: number }` at the top (via `resolveManagementWindowDte` and `resolveProfitTarget`), and passes it as the second argument to `RuleDefinition.test`. The `PROFIT_TARGET` rule's `test` reads `resolved.profitTargetPercent` instead of calling `resolveProfitTarget` itself.
- **Why:** Both rules that need a configurable threshold (`MANAGEMENT_WINDOW`, `PROFIT_TARGET`) now need to combine a per-position override with a batch-level global default. Resolving once keeps the resolution logic in one place instead of duplicating the override-vs-default ternary inside each rule, and keeps `RuleDefinition.test`'s signature uniform across all five rules.
- **Alternatives considered:** Keep `resolveProfitTarget` called inline inside the `PROFIT_TARGET` rule's `test` (as today) and only add the DTE resolution — rejected for asymmetry: one rule would resolve its own threshold, the other would receive a pre-resolved value, for no reason other than incremental laziness.

### ADR: New fields are additive and default-safe — no rename of existing `AlertEvaluationInput` fields

- **Decision:** Add `managementWindowDteOverride: number | null` (per-position, new) and `profitTargetPercentDefault?: number` (batch-level global default, new, optional) to `AlertEvaluationInput`. The existing `managementWindowDte?: number` field is untouched and keeps meaning "the effective global default for this batch."
- **Why:** `alerts.test.ts` has ~20 call sites passing `managementWindowDte: <n>` today (US-50/52/53-56). Renaming that field to disambiguate it from the new per-position override would touch every one of those tests for a purely cosmetic reason. Naming the new fields `...Override` (nullable, per-position) and `...Default` (optional, batch-level) is self-documenting without renaming anything, and every new field defaults to a value that reproduces today's behavior exactly (`managementWindowDteOverride: null`, `profitTargetPercentDefault: undefined → DEFAULT_PROFIT_TARGET_PERCENT`), so all existing tests keep passing unmodified.
- **Alternatives considered:** Rename `managementWindowDte` → `managementWindowDteDefault` for perfect symmetry — rejected as churn without behavior change; the `Override`/bare-default naming is unambiguous once both fields exist side by side.

### ADR: The `resolveProfitTarget` / `resolveManagementWindowDte` helpers grow a second `default` parameter instead of reading global state

- **Decision:** `resolveProfitTarget(override: number | null, defaultPercent: number = DEFAULT_PROFIT_TARGET_PERCENT): number`. New `resolveManagementWindowDte(override: number | null, defaultDte: number = DEFAULT_MANAGEMENT_WINDOW_DTE): number` is added next to `DEFAULT_MANAGEMENT_WINDOW_DTE` in `src/main/core/alerts.ts` (same module as the constant and the rules that consume it — `profit-target.ts` stays a one-constant, one-function module as today).
- **Why:** Keeps both functions pure (`src/main/core/` has no DB/IPC imports) while letting every caller — the engine, the renderer badge, future forms — supply whatever global default is currently in effect. The default parameter value means every existing call site (renderer `PositionCard.tsx`, existing `alerts.test.ts` cases) keeps compiling and behaving identically without passing the new argument.
- **Alternatives considered:** Have `resolveProfitTarget` itself query `app_settings` — rejected outright; it would violate the pure-core-engine rule (no DB imports in `src/main/core/`) that every other engine in this codebase follows.

### ADR: The renderer `TargetBadge`/`PositionCard` reads the same global default the engine uses

- **Decision:** Add a `useAlertDefaults()` renderer hook (backed by a new `settings:get-alert-defaults` IPC channel) and pass its `profitTargetPercent` into `resolveProfitTarget(item.profitTargetPercent ?? null, alertDefaults.profitTargetPercent)` in `PositionCard.tsx`'s `deriveRowDisplay`.
- **Why:** US-57's Technical Notes are explicit: "Profit-target resolution should continue to flow through a single helper so badges, alerts, and future forms all share the same defaulting logic." Without this, saving a new global default (e.g. 40%) would change the alert engine's behavior but leave the positions-list `TARGET` badge silently checking against the stale hardcoded 50% — a visible inconsistency the story's own notes rule out.
- **Alternatives considered:** Leave the badge on the hardcoded constant and scope this purely to the alert engine — rejected; it directly contradicts the story's stated technical constraint and would ship a visibly inconsistent UI.

## Open Questions

None — all unknowns resolved from existing code/spec precedent. Proceed to Phase 1.
