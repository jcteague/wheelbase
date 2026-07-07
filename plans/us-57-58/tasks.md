# US-57 & US-58 — Global Alert Thresholds + Per-Position Overrides — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off

---

## Layer 1 — Foundation (no cross-area dependencies)

> These areas can be started immediately and run in parallel.

### Area 1 — Schema: per-position management-window override column

- [x] **[Red]** Confirm migration runner coverage — no new test file
  - Run `pnpm test` and confirm `runMigrations()` still applies cleanly against a fresh test DB (existing migration-runner tests already assert every migration in the directory applies without error); no dedicated migration unit test required, matching the US-33/005 precedent
- [x] **[Green]** Implement — `migrations/010_add_management_window_dte_override.sql` _(depends on: Area 1 Red ✓)_

  ```sql
  ALTER TABLE positions
    ADD COLUMN management_window_dte_override INTEGER;
  ```

  - Run `pnpm test` — migration applies cleanly

- [x] **[Refactor]** `/refactor` — `migrations/010_add_management_window_dte_override.sql` _(depends on: Area 1 Green ✓)_
  - Nothing expected to change — single-statement migration matching `005_add_profit_target_percent.sql` exactly
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 2 — Core engine: resolved-thresholds resolution

- [x] **[Red]** Write failing tests — `src/main/core/profit-target.test.ts`, `src/main/core/alerts.test.ts`
  - `src/main/core/profit-target.test.ts`:
    - `resolveProfitTarget(null, 40)` returns `40` (explicit default overrides hardcoded 50)
    - `resolveProfitTarget(25, 40)` returns `25` (per-position override still wins over passed-in default)
    - `resolveProfitTarget(null)` (no second arg) still returns `50` — backward compatibility
  - `src/main/core/alerts.test.ts` (extend `makeInput` factory with `managementWindowDteOverride: null` default so all existing tests keep compiling):
    - New `describe('evaluatePosition — resolved thresholds (US-57/58)')`:
      - `makeInput({ dte: 16, managementWindowDte: 14 })` → no `MANAGEMENT_WINDOW` match (global default applies, no override)
      - `makeInput({ dte: 16, managementWindowDte: 21, managementWindowDteOverride: 10 })` → no `MANAGEMENT_WINDOW` match (override 10 wins over default 21, 16 > 10)
      - `makeInput({ dte: 16, managementWindowDte: 21, managementWindowDteOverride: 30 })` → `MANAGEMENT_WINDOW` matches (override 30 wins, 16 <= 30)
      - `PROFIT_TARGET` matches at 45% captured when `profitTargetPercentOverride: null, profitTargetPercentDefault: 40` (global default applies)
      - `PROFIT_TARGET` does not match when `profitTargetPercentOverride: 60, profitTargetPercentDefault: 40` at 45% captured (override wins over lower global default)
      - Confirm pre-existing default-50 tests still pass unmodified
  - Run `pnpm test src/main/core/profit-target.test.ts src/main/core/alerts.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/profit-target.ts`, `src/main/core/alerts.ts` _(depends on: Area 2 Red ✓)_
  - `profit-target.ts`: `resolveProfitTarget(override: number | null, defaultPercent: number = DEFAULT_PROFIT_TARGET_PERCENT): number { return override === null ? defaultPercent : override }`
  - `alerts.ts`:
    - Add `resolveManagementWindowDte(override: number | null, defaultDte: number = DEFAULT_MANAGEMENT_WINDOW_DTE): number { return override === null ? defaultDte : override }` next to `DEFAULT_MANAGEMENT_WINDOW_DTE`
    - `AlertEvaluationInput` gains `managementWindowDteOverride: number | null` and `profitTargetPercentDefault?: number` (existing `managementWindowDte?: number` unchanged — additive, no rename)
    - Add `interface ResolvedThresholds { managementWindowDte: number; profitTargetPercent: number }`
    - Change `RuleDefinition.test` to `(input: AlertEvaluationInput, resolved: ResolvedThresholds) => boolean`
    - `MANAGEMENT_WINDOW.test`: `(input, resolved) => input.dte !== null && input.dte > EXPIRATION_IMMINENT_MAX_DTE && input.dte <= resolved.managementWindowDte`
    - `PROFIT_TARGET.test`: `(input, resolved) => capturedPercent(input).gte(resolved.profitTargetPercent)` — drop the direct `resolveProfitTarget` call
    - `evaluatePosition`: compute `resolved: ResolvedThresholds` per `data-model.md`, pass `resolved` into `rule.test(input, resolved)`
  - Run `pnpm test src/main/core/profit-target.test.ts src/main/core/alerts.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/core/profit-target.ts`, `src/main/core/alerts.ts` _(depends on: Area 2 Green ✓)_
  - Confirm `resolveProfitTarget`'s import in `alerts.ts` is still needed and the old direct-call reference inside `PROFIT_TARGET.test` is fully removed
  - Check the "Inert defaults" comments in `alerts.test.ts`'s `makeInput` still read correctly with the new field
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 3 — Global alert-defaults service + IPC (US-57 backend)

- [x] **[Red]** Write failing tests — `src/main/services/alert-defaults.test.ts` (new), `src/main/ipc/settings.test.ts`
  - `src/main/services/alert-defaults.test.ts`:
    - `getAlertDefaults(db)` on fresh DB returns `{ profitTargetPercent: 50, managementWindowDte: 21 }`
    - `saveAlertDefaults(db, { profitTargetPercent: 40, managementWindowDte: 14 })` persists both; subsequent `getAlertDefaults(db)` returns `{ 40, 14 }`
    - `saveAlertDefaults(db, { profitTargetPercent: 0, managementWindowDte: 14 })` throws `ValidationError('profitTargetPercent', ..., 'Profit target must be between 1 and 99')`, leaves `app_settings` unchanged
    - `saveAlertDefaults(db, { profitTargetPercent: 40, managementWindowDte: 100 })` throws management-window `ValidationError`, writes neither row (assert `profitTargetPercent` unchanged too)
    - Boundary: `1`, `99`, `6`, `45` all accepted without throwing
  - `src/main/ipc/settings.test.ts`:
    - `settings:get-alert-defaults` returns `{ ok: true, defaults: { profitTargetPercent, managementWindowDte } }`
    - `settings:save-alert-defaults` with valid payload returns `{ ok: true, defaults }`
    - `settings:save-alert-defaults` with `profitTargetPercent: 0` returns `{ ok: false, errors: [{ field: 'profitTargetPercent', message: 'Profit target must be between 1 and 99' }] }`
  - Run `pnpm test src/main/services/alert-defaults.test.ts src/main/ipc/settings.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/alert-defaults.ts` (new), `src/main/schemas.ts`, `src/main/ipc/settings.ts` _(depends on: Area 3 Red ✓)_
  - `alert-defaults.ts`: `getAlertDefaults(db)`, `saveAlertDefaults(db, input)` per `plan.md` Area 3 (keys `alert_default_profit_target_percent` / `alert_default_management_window_dte` via `appSettings.get`/`set`; bounds `1-99` / `6-45`; `logger.info` on save)
  - `schemas.ts`: `SaveAlertDefaultsPayloadSchema` (int, `1-99` / `6-45`, exact AC messages)
  - `ipc/settings.ts`: register `settings:get-alert-defaults`, `settings:save-alert-defaults` via `handleIpcCall`
  - Run `pnpm test src/main/services/alert-defaults.test.ts src/main/ipc/settings.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/alert-defaults.ts`, `src/main/ipc/settings.ts` _(depends on: Area 3 Green ✓)_
  - Decide whether `alertDefaults`'s two functions should be curried with `db` at registration time (matching `createSettingsService`) or passed raw `db`-taking functions — match whichever reads closer to the existing `registerSettingsHandlers` call site; avoid a second settings-service-factory pattern for two functions
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — Backend wiring (depends on Layer 1)

> These areas can run in parallel with each other **after** their Layer 1 dependencies are complete.

### Area 4 — Per-position alert-overrides service + IPC (US-58 backend)

**Requires:** Area 1 Green ✓ (migration column must exist)

- [x] **[Red]** Write failing tests — `src/main/services/save-position-alert-overrides.test.ts` (new), `src/main/services/get-position.test.ts`, `src/main/ipc/positions.test.ts` _(depends on: Area 1 Green ✓)_
  - `save-position-alert-overrides.test.ts` (seed a position via existing test-db helpers):
    - `savePositionAlertOverrides(db, posId, { profitTargetPercent: 25, managementWindowDte: 14 })` writes both columns; `getPosition(db, posId).position` shows `profitTargetPercent: 25, managementWindowDteOverride: 14`
    - `savePositionAlertOverrides(db, posId, { profitTargetPercent: null, managementWindowDte: null })` clears both columns back to `NULL` (US-58 Scenario 3)
    - `savePositionAlertOverrides(db, posId, { profitTargetPercent: 100, managementWindowDte: 14 })` throws profit-target `ValidationError`, leaves both columns unchanged (no partial write)
    - `savePositionAlertOverrides(db, posId, { profitTargetPercent: 25, managementWindowDte: 60 })` throws management-window `ValidationError` with exact AC message
    - `savePositionAlertOverrides(db, 'nonexistent-id', { profitTargetPercent: 25, managementWindowDte: 14 })` throws not-found error
    - Boundary: `1`, `99`, `6`, `45` all accepted without throwing
  - `get-position.test.ts`:
    - Position seeded with `profit_target_percent = 25, management_window_dte_override = 10` returns those exact values on `position.profitTargetPercent` / `position.managementWindowDteOverride`
    - Position with both columns `NULL` returns `profitTargetPercent: null, managementWindowDteOverride: null`
  - `ipc/positions.test.ts`:
    - `positions:save-alert-overrides` with valid payload returns `{ ok: true, position: { id, profitTargetPercent, managementWindowDteOverride } }`
    - `positions:save-alert-overrides` with `managementWindowDte: 60` returns `{ ok: false, errors: [...] }` with exact message
  - Run `pnpm test src/main/services/save-position-alert-overrides.test.ts src/main/services/get-position.test.ts src/main/ipc/positions.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/save-position-alert-overrides.ts` (new), `src/main/services/get-position.ts`, `src/main/schemas.ts`, `src/main/ipc/positions.ts` _(depends on: Area 4 Red ✓)_
  - `save-position-alert-overrides.ts`: `savePositionAlertOverrides(db, positionId, input)` per `plan.md` Area 4 (validate both fields when non-null, `UPDATE positions SET profit_target_percent = ?, management_window_dte_override = ?, updated_at = ? WHERE id = ?`, throw not-found `ValidationError` on `changes === 0`, `logger.info` on success)
  - `get-position.ts`: add `profit_target_percent`, `management_window_dte_override` to `PositionRow`/`GET_QUERY`, map into `PositionRecord`
  - `schemas.ts`: extend `PositionRecord`; add `SaveAlertOverridesPayloadSchema` (mirrors `SaveAlertDefaultsPayloadSchema` + `positionId: z.string().min(1)`, both numeric fields `.nullable()`)
  - `ipc/positions.ts`: register `positions:save-alert-overrides` via `handleIpcCall`
  - Run `pnpm test src/main/services/save-position-alert-overrides.test.ts src/main/services/get-position.test.ts src/main/ipc/positions.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/save-position-alert-overrides.ts`, `src/main/services/get-position.ts`, `src/main/ipc/positions.ts` _(depends on: Area 4 Green ✓)_
  - Confirm the `UPDATE ... WHERE id = ?` + `result.changes === 0` not-found pattern doesn't already exist as a shared helper in `services/positions.ts` — reuse if so, otherwise leave local
  - Leave the existing `test:set-position-profit-target` handler untouched (US-33's e2e-only seeding handler)
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 5 — Service wiring: evaluateAlerts consumes the new column and global defaults

**Requires:** Area 1 Green ✓, Area 2 Green ✓, Area 3 Green ✓

- [x] **[Red]** Write failing tests — `src/main/services/evaluate-alerts.test.ts` _(depends on: Area 1 Green ✓, Area 2 Green ✓, Area 3 Green ✓)_
  - Seeded CC_OPEN position with `management_window_dte_override = 30`, `dte = 16`, called with `managementWindowDte: 21` (batch default) → `MANAGEMENT_WINDOW` row created (override wins)
  - Same position with `management_window_dte_override = 10` instead → no `MANAGEMENT_WINDOW` row (override wins, 16 > 10)
  - Seeded position with `profit_target_percent = null`, called with `profitTargetPercentDefault: 30`, snapshot yielding 35% captured → `PROFIT_TARGET` row created (global default 30 applies, not hardcoded 50)
  - Same position with `profit_target_percent = 60` (override) and same `profitTargetPercentDefault: 30`, 35% captured → no `PROFIT_TARGET` row (override wins over lower default)
  - Regression guard: omitting `managementWindowDte`/`profitTargetPercentDefault` entirely reproduces today's hardcoded-default behavior — existing tests in this file that don't pass these params must keep passing unmodified
  - Extend `evaluate-alerts-test-utils.ts` seed helpers to accept `managementWindowDteOverride`
  - Run `pnpm test src/main/services/evaluate-alerts.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/evaluate-alerts.ts`, `src/main/index.ts` _(depends on: Area 5 Red ✓)_
  - `EvaluableRow` gains `management_window_dte_override: number | null`; `EVALUABLE_QUERY` SELECT adds `p.management_window_dte_override`
  - `toEvaluationInput` returns `managementWindowDteOverride: row.management_window_dte_override` and threads `profitTargetPercentDefault`
  - `EvaluateAlertsInput` gains `profitTargetPercentDefault?: number`; `evaluateAlerts`'s destructured params gain `profitTargetPercentDefault = DEFAULT_PROFIT_TARGET_PERCENT`
  - `src/main/index.ts`: scheduler handler reads `const { profitTargetPercent, managementWindowDte } = getAlertDefaults(db)` and passes both into `evaluateAlerts({...})` on every tick, per `plan.md` Area 5
  - Run `pnpm test src/main/services/evaluate-alerts.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/evaluate-alerts.ts`, `src/main/services/evaluate-alerts-test-utils.ts` _(depends on: Area 5 Green ✓)_
  - Re-evaluate whether `toEvaluationInput`'s parameter list (flagged in the US-56 plan as a candidate for grouping) should now be grouped into one object — only if the call site reads worse than before
  - Verify `evaluate-alerts-test-utils.ts` seed helpers follow the existing naming convention for `managementWindowDteOverride`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 6 — Renderer: Global Alert Defaults section on the Settings page (US-57)

**Requires:** Area 3 Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/pages/SettingsPage.test.tsx` _(depends on: Area 3 Green ✓)_
  - Renders a new `region` labeled "Alert Defaults" showing loaded `profitTargetPercent`/`managementWindowDte` (mock `useAlertDefaults` returning `{ profitTargetPercent: 50, managementWindowDte: 21 }`)
  - Editing both fields to `40`/`14` and clicking "Save alert defaults" calls the save mutation with `{ profitTargetPercent: 40, managementWindowDte: 14 }` and shows "Alert defaults saved" banner
  - Entering `0`/`0` shows both inline errors ("Profit target must be between 1 and 99", "Management window must be between 6 and 45 DTE") and disables Save — client-side Zod validation, no IPC call made
  - A server-side rejection (mutation rejects with field errors) surfaces the same inline messages (mirrors `CloseCspForm`'s `ApiFieldError` handling)
  - Run `pnpm test src/renderer/src/pages/SettingsPage.test.tsx` — all new tests must fail
- [x] **[Green]** Implement _(depends on: Area 6 Red ✓)_
  - Bridge `settings:get-alert-defaults`/`settings:save-alert-defaults` through `src/main/schemas.ts`, `src/preload/index.d.ts`, `src/preload/index.ts` (follow the `settings:get-credential-status` chain)
  - `src/renderer/src/api/settings.ts`: `getAlertDefaults()`, `saveAlertDefaults(payload)`, `AlertDefaults` type
  - `src/renderer/src/hooks/settingsQueryKeys.ts`: add `alertDefaults: ['settings', 'alert-defaults'] as const`
  - `src/renderer/src/hooks/useSettings.ts`: `useAlertDefaults()` query, `useSaveAlertDefaults()` mutation (invalidates `settingsQueryKeys.alertDefaults`)
  - `src/renderer/src/pages/SettingsPage.tsx`: new `AlertDefaultsSection` component matching `mockups/us-57-global-alert-thresholds.mdx` — two labeled fields via `useForm({ resolver: zodResolver(alertDefaultsSchema) })` (bounds `1-99`/`6-45`, exact AC messages), "Save alert defaults" disabled when `!formState.isValid`, "Reset" button, static "Engine Preview" JSX (not tied to live data); insert section adjacent to "Broker"
  - Run `pnpm test src/renderer/src/pages/SettingsPage.test.tsx` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/pages/SettingsPage.tsx` _(depends on: Area 6 Green ✓)_
  - Check whether inline-error rendering duplicates an existing shared pattern (e.g. `<FieldError>`) — reuse if present, otherwise leave inline (second occurrence still doesn't justify extraction per `CLAUDE.md`)
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — Renderer position-detail integration (depends on Layer 2)

### Area 7 — Renderer: Per-Position Alert Overrides panel + badge consistency (US-58)

**Requires:** Area 2 Green ✓, Area 4 Green ✓, Area 6 Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/pages/PositionDetailPage.test.tsx`, `src/renderer/src/components/PositionCard.test.tsx` (if present) _(depends on: Area 2 Green ✓, Area 4 Green ✓, Area 6 Green ✓)_
  - `PositionDetailPage.test.tsx` (or a new co-located test for `PositionAlertOverridesForm`):
    - With `profitTargetPercent: null, managementWindowDteOverride: null`, renders `inherit` state: label "Using global defaults", fields pre-filled with resolved global values
    - Enabling "custom alerts", setting `25`/`14`, clicking "Save overrides" calls the mutation with `{ positionId, profitTargetPercent: 25, managementWindowDte: 14 }` and shows "Custom alert thresholds active"
    - With overrides active, clicking "Use global defaults" calls the mutation with `{ positionId, profitTargetPercent: null, managementWindowDte: null }` and reverts label to "Using global defaults" (US-58 Scenario 3)
    - Entering `100`/`60` shows both inline errors matching exact AC strings and disables "Save overrides"
  - Badge consistency (extend whichever test file covers `PositionCard`'s `TARGET` badge, likely `PositionsListPage.test.tsx`):
    - With a saved global default of `40` (mock `useAlertDefaults`) and no per-position override, a position at 42% captured shows the `TARGET` badge; at 38% it does not
  - Run `pnpm test src/renderer/src/pages/PositionDetailPage.test.tsx` (and `PositionCard.test.tsx`/`PositionsListPage.test.tsx` as applicable) — all new tests must fail
- [x] **[Green]** Implement _(depends on: Area 7 Red ✓)_
  - Bridge `positions:save-alert-overrides` through schema/preload chain (follow `positions:close-csp`); extend `IpcPositionRecord` with the two new fields
  - `src/renderer/src/api/positions.ts`: extend detail type with `profitTargetPercent`, `managementWindowDteOverride`; add `saveAlertOverrides(payload)`
  - `src/renderer/src/hooks/usePositions.ts` (or sibling hook file): `useSaveAlertOverrides()` mutation invalidating the position-detail query
  - `src/renderer/src/components/PositionAlertOverridesForm.tsx` (new): `Tone` banner (gold `active` / blue `inheriting`), two `Field` rows editable only when "custom alerts" toggle is on, "Save overrides"/"Use global defaults" buttons, `useForm({ resolver: zodResolver(overridesSchema) })` with identical bounds/messages as Area 6; "Effective Alert Logic" read-only panel computed via `resolveProfitTarget`/`resolveManagementWindowDte` fed with the position's own override + `useAlertDefaults()`
  - `src/renderer/src/components/PositionCard.tsx`: `deriveRowDisplay` reads the resolved global default (call `useAlertDefaults()` once at the list-page level, e.g. `PositionsListPage.tsx`, pass resolved default down — not per-row)
  - `src/renderer/src/pages/PositionDetailContent.tsx`: render `PositionAlertOverridesForm`, near `PositionCockpit` or as its own `SectionCard`
  - Run `pnpm test src/renderer/src/pages/PositionDetailPage.test.tsx` (and badge tests) — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/PositionAlertOverridesForm.tsx`, `src/renderer/src/pages/SettingsPage.tsx`, `src/renderer/src/components/PositionCard.tsx` _(depends on: Area 7 Green ✓)_
  - `PositionAlertOverridesForm` and Area 6's `AlertDefaultsSection` share an identical bounds schema (`1-99`/`6-45`) — extract a single shared Zod schema (e.g. `alertThresholdsSchema` in a shared renderer lib module) now that both exist
  - Confirm `useAlertDefaults()` is called once per page tree, not once per `PositionCard` row
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — E2E Tests

**Requires:** All Green tasks from Layers 1-3 ✓ (Areas 1-7)

### Area 8 — E2E Tests

- [x] **[Red]** Write failing e2e tests — `src/main/services/evaluate-alerts.e2e.test.ts` _(depends on: Area 1 Green ✓, Area 2 Green ✓, Area 3 Green ✓, Area 4 Green ✓, Area 5 Green ✓, Area 6 Green ✓, Area 7 Green ✓)_
  - New `describe('US-57 acceptance', ...)` and `describe('US-58 acceptance', ...)` blocks, one `it()` per AC, names mirroring Gherkin language
  - AC coverage:
    - US-57 "Trader saves new global defaults" → `it('applies the saved global defaults to future evaluations of positions without overrides')`
    - US-57 "Existing positions without overrides pick up the new defaults" → `it('saves new global defaults and future alert evaluations use them for positions without overrides')`
    - US-57 "Invalid settings are rejected inline" → `it('rejects invalid global default values without saving them')`
    - US-57 "Saving global defaults does not overwrite per-position overrides" → `it('does not overwrite an existing per-position override when global defaults are saved')`
    - US-58 "Trader saves per-position overrides" → `it('saves per-position overrides and future evaluations for that position use them')`
    - US-58 "Other positions continue using the global defaults" → `it('leaves other positions on the global defaults when one position has overrides')`
    - US-58 "Trader clears overrides and reverts to global defaults" → `it('clears overrides and reverts the position to the global defaults')`
    - US-58 "Invalid override values are rejected inline" → `it('rejects invalid per-position override values without saving them')`
  - Each seeds a real in-memory DB via `makeTestDb()`, calls real services directly (`saveAlertDefaults`/`savePositionAlertOverrides`), runs `evaluateAlerts`, asserts through `readAlertRows`/`getPosition`
  - Run `pnpm test src/main/services/evaluate-alerts.e2e.test.ts` — all new tests must fail
- [x] **[Green]** Make e2e tests pass _(depends on: Area 8 Red ✓)_
  - No production code expected — this area is verification. Any failure here is fixed in the area that owns the defect (1-7)
  - Run `pnpm test src/main/services/evaluate-alerts.e2e.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` e2e tests _(depends on: Area 8 Green ✓)_
  - Consolidate repeated pinned-value seeding (positions with specific override columns) into `evaluate-alerts-test-utils.ts`, following the US-52 e2e-helper-consolidation precedent
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Post-completion

- [x] Run the full checklist: `pnpm test && pnpm lint && pnpm typecheck && pnpm format`
- [x] Run `/update-spec us-57-58` so `docs/spec/domain/alerts.md` gains the resolved-thresholds section and configurable-defaults note, and the US-33 spec page's "1..100" bounds comment is reconciled to the actual 1-99 AC bounds this plan ships

---

## Completion Checklist

- [x] All Red tasks complete (tests written and failing for the right reason)
- [x] All Green tasks complete (all tests passing)
- [x] All Refactor tasks complete (lint + typecheck clean)
- [x] E2E tests cover every AC (see AC Audit table in `plan.md`)
- [x] `pnpm test && pnpm lint && pnpm typecheck` — all clean
