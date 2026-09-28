---
page: docs/spec/features/us-57-58-configurable-alert-thresholds.md
audited_at: 2026-09-28
findings: 34
---

# Audit: docs/spec/features/us-57-58-configurable-alert-thresholds.md

## Verified (29)

- ✓ `app_settings` keys `alert_default_profit_target_percent` / `alert_default_management_window_dte` — `src/main/services/alert-defaults.ts:15-16`
- ✓ Absent → defaults 50 / 21 via `DEFAULT_PROFIT_TARGET_PERCENT` / `DEFAULT_MANAGEMENT_WINDOW_DTE` — `src/main/services/alert-defaults.ts:28-35`; constants at `src/main/core/profit-target.ts:4`, `src/main/core/alerts.ts:24`
- ✓ Read/written through `appSettings.get`/`appSettings.set` — `src/main/services/alert-defaults.ts:29-30,51-52`; `src/main/services/app-settings.ts` exists
- ✓ Ranges 1..99 and 6..45 — `src/main/core/alert-thresholds.ts:6-9`
- ✓ Both values validated before either row is written — `src/main/services/alert-defaults.ts:39-52`
- ✓ `getAlertDefaults` / `saveAlertDefaults` exported — `src/main/services/alert-defaults.ts:28,38`
- ✓ `settings:get-alert-defaults` returns `{ defaults }` via `handleIpcCall` — `src/main/ipc/settings.ts:141-145`
- ✓ `settings:save-alert-defaults` Zod-parses `SaveAlertDefaultsPayloadSchema` — `src/main/ipc/settings.ts:147-153`; schema in `src/main/schemas.ts:~460-471`
- ✓ `positions:save-alert-overrides` registered — `src/main/ipc/positions.ts:146`, service import at line 31
- ✓ `SaveAlertOverridesPayloadSchema` `{ positionId, profitTargetPercent: 1-99 | null, managementWindowDte: 6-45 | null }` — `src/main/schemas.ts:474-488`
- ✓ `savePositionAlertOverrides` exported — `src/main/services/save-position-alert-overrides.ts:23`
- ✓ Preload bridges `saveAlertOverrides`, `getAlertDefaults`, `saveAlertDefaults` — `src/preload/index.ts:30,49-50`
- ✓ Migration `010_add_management_window_dte_override.sql` adds nullable `management_window_dte_override INTEGER` to `positions`
- ✓ `get-position.ts` reads `management_window_dte_override` — `src/main/services/get-position.ts:32,180`
- ✓ `resolveManagementWindowDte(override, defaultDte = DEFAULT_MANAGEMENT_WINDOW_DTE)` — `src/main/core/alerts.ts:28-33`
- ✓ `resolveProfitTarget(override, defaultPercent = DEFAULT_PROFIT_TARGET_PERCENT)` — `src/main/core/profit-target.ts:6-11`
- ✓ `evaluatePosition` builds `ResolvedThresholds` once and passes it to `rule.test(input, resolved)` — `src/main/core/alerts.ts:201-204,302-322`
- ✓ `PROFIT_TARGET` reads `resolved.profitTargetPercent` — `src/main/core/alerts.ts:263`
- ✓ `AlertEvaluationInput` has `managementWindowDteOverride: number | null` and `profitTargetPercentDefault?: number`, and keeps `managementWindowDte?` — `src/main/core/alerts.ts:58-59,65`
- ✓ Scheduler handler reads `getAlertDefaults(db)` each tick and passes both defaults — `src/main/index.ts:297-304`
- ✓ `useAlertDefaults()` hook — `src/renderer/src/hooks/useSettings.ts:107`; used in `src/renderer/src/pages/PositionsListPage.tsx:22,159`
- ✓ `PositionCard.deriveRowDisplay` resolves the target with `profitTargetDefault` — `src/renderer/src/components/PositionCard.tsx:39-44`
- ✓ `AlertDefaultsSection` on Settings page — `src/renderer/src/pages/SettingsPage.tsx:372,682`
- ✓ `PositionAlertOverridesForm` with "Custom alert thresholds active" toggle — `src/renderer/src/components/PositionAlertOverridesForm.tsx:94`; mounted in `src/renderer/src/pages/PositionDetailContent.tsx:57`
- ✓ Eight AC tests: `describe('US-57 acceptance')` (4) and `describe('US-58 acceptance')` (4) — `src/main/services/evaluate-alerts.e2e.test.ts:730-813, 831-953`
- ✓ All listed source files exist (25 paths checked, incl. `settingsQueryKeys.ts`, `usePositions.ts`, `api/settings.ts`, `api/positions.ts`)
- ✓ Linked ADRs exist: `configurable-alert-thresholds.md`, `profit-target-nullable-column.md`
- ✓ Linked features `us-50-alert-engine.md`, `us-33-option-mid-pnl.md` and `../domain/alerts.md` exist
- ✓ Cited sources `docs/epics/07-stories/US-57-…md`, `US-58-…md`, `plans/us-57-58/plan.md` exist

## Drift (2)

- ✗ The page says `resolveManagementWindowDte` "was added next to the existing `resolveProfitTarget` in `src/main/core/alerts.ts`". `resolveProfitTarget` is defined in `src/main/core/profit-target.ts:6`; `alerts.ts` only imports it (`src/main/core/alerts.ts:7`). The contracts bullet repeats the same co-location. Suggested fix: cite `profit-target.ts` for `resolveProfitTarget`.
- ✗ The architecture decision says `RuleDefinition.test`'s signature is kept uniform "across all five rules". The registry now has six rules (`COVERED_CALL_BREACH`, US-62, added) — `src/main/core/alerts.ts:12-18,232-296`.

## Unverifiable (3)

- ? "~20 pre-existing call sites in `alerts.test.ts` kept passing unmodified" — historical.
- ? "saving one story's settings never mutates the other's storage" — structurally plausible (separate keys vs `positions` column) but a behavioural claim; covered by a US-57 test at `evaluate-alerts.e2e.test.ts:813`.
- ? The supersession claim about `profit-target-nullable-column` ADR wording — doc-to-doc, not code.

## Missing files (0)
