---
story: us-57-58
kind: feature
parent: null
topics: [alerts, settings]
status: planned
---

# Implementation Plan: US-57 & US-58 — Global Alert Thresholds + Per-Position Overrides

## Summary

Adds configurable global defaults for the profit-target percentage and management-window DTE (US-57), stored in the existing `app_settings` key/value table and edited from the Settings page, plus a per-position override of the same two thresholds (US-58), stored on a new nullable `positions.management_window_dte_override` column alongside the existing `profit_target_percent` column and edited from the position-detail page. Both stories share one pure resolution helper pair (`resolveProfitTarget`, new `resolveManagementWindowDte`) so the alert engine, the positions-list `TARGET` badge, and both new forms apply identical override-then-default logic. Done means all eight Gherkin scenarios (four US-57 + four US-58) pass as named e2e tests, the scheduled `evaluateAlerts` job reads the saved global defaults on every tick, and saving one story's settings never mutates the other's storage.

## Supporting Documents

Read these before starting implementation — they contain the decisions, data model, and API contracts:

- **User Stories & Acceptance Criteria:** `docs/epics/07-stories/US-57-global-alert-thresholds.md`, `docs/epics/07-stories/US-58-position-alert-overrides.md`
- **Research & Design Decisions:** `plans/us-57-58/research.md`
- **Data Model & Resolution Logic:** `plans/us-57-58/data-model.md`
- **API Contracts:** `plans/us-57-58/contracts/settings-get-alert-defaults.md`, `plans/us-57-58/contracts/settings-save-alert-defaults.md`, `plans/us-57-58/contracts/positions-save-alert-overrides.md`
- **Quickstart & Verification:** `plans/us-57-58/quickstart.md`
- **Mockups:** `mockups/us-57-global-alert-thresholds.mdx` (Settings page — Field rows, Engine Preview panel, saved banner), `mockups/us-58-position-alert-overrides.mdx` (position detail — Tone banner, Field rows, Effective Alert Logic panel)

## Prerequisites

Already in place, reused as-is:

- `app_settings(key, value, updated_at)` table + `appSettings.get`/`appSettings.set` (`src/main/services/app-settings.ts`) — no new migration needed for US-57.
- `positions.profit_target_percent` nullable column (migration 005, US-33), already flowing through `positions:list` → `PositionListItem.profitTargetPercent`.
- `resolveProfitTarget` (`src/main/core/profit-target.ts`), `DEFAULT_MANAGEMENT_WINDOW_DTE` + `MANAGEMENT_WINDOW`/`PROFIT_TARGET` rules (`src/main/core/alerts.ts`), and the `evaluateAlerts` service's existing injectable `managementWindowDte` parameter (`src/main/services/evaluate-alerts.ts`).
- `handleIpcCall` envelope (`src/main/ipc/utils.ts`), `ValidationError` (`src/main/core/lifecycle.ts`), React Hook Form + Zod resolver convention (`src/renderer/src/components/CloseCspForm.tsx` as reference).
- Alert-evaluation scheduler job registered in `src/main/index.ts:219-228` — its handler body changes in Area 5, but the `scheduler.register` cadence/registration itself is untouched.

## Implementation Areas

### 1. Schema — per-position management-window override column

**Files to create or modify:**

- `migrations/010_add_management_window_dte_override.sql` — new migration

**Red — tests to write** (in `src/main/db/migrate.test.ts` if a per-migration test pattern exists there, otherwise verified transitively by every service test in Areas 4-5 that seeds the column; no dedicated migration unit test is required per the US-33/005 precedent, which added no migration-specific test either):

- No new test file — confirm via `pnpm test` that `runMigrations()` still applies cleanly against a fresh test DB (existing migration-runner tests already assert every migration in the directory applies without error)

**Green — implementation:**

- `migrations/010_add_management_window_dte_override.sql`:
  ```sql
  ALTER TABLE positions
    ADD COLUMN management_window_dte_override INTEGER;
  ```

**Refactor — cleanup to consider:**

- None — single-statement migration matching the existing `005_add_profit_target_percent.sql` pattern exactly.

**Acceptance criteria covered:**

- Infrastructure only — enables persistence for US-58's override scenarios in later areas.

---

### 2. Core engine — resolved-thresholds resolution

**Files to create or modify:**

- `src/main/core/profit-target.ts` — add a `defaultPercent` parameter to `resolveProfitTarget`
- `src/main/core/profit-target.test.ts` — extend with cases passing an explicit non-50 default
- `src/main/core/alerts.ts` — add `resolveManagementWindowDte`, extend `AlertEvaluationInput`, add `ResolvedThresholds`, change `RuleDefinition.test` signature, update `MANAGEMENT_WINDOW` and `PROFIT_TARGET` rule bodies, update `evaluatePosition`
- `src/main/core/alerts.test.ts` — extend `makeInput` factory defaults; new `describe` blocks for the resolution behavior

**Red — tests to write:**

In `src/main/core/profit-target.test.ts`:

- `resolveProfitTarget(null, 40)` returns `40` (explicit default overrides the hardcoded 50)
- `resolveProfitTarget(25, 40)` returns `25` (per-position override still wins over the passed-in default)
- `resolveProfitTarget(null)` (no second arg) still returns `50` — backward compatibility

In `src/main/core/alerts.test.ts` (extend `makeInput` with `managementWindowDteOverride: null` in the returned defaults so every existing test keeps compiling and behaving identically):

- New `describe('evaluatePosition — resolved thresholds (US-57/58)')` block:
  - `makeInput({ dte: 16, managementWindowDte: 14 })` (global default 14, no override) → no match at dte 16 (14 < 16, falls into neither the imminent nor the now-narrower window — confirms the batch-level default still applies when no override is set)
  - `makeInput({ dte: 16, managementWindowDte: 21, managementWindowDteOverride: 10 })` → no `MANAGEMENT_WINDOW` match (per-position override of 10 wins over the batch default of 21, and 16 > 10)
  - `makeInput({ dte: 16, managementWindowDte: 21, managementWindowDteOverride: 30 })` → `MANAGEMENT_WINDOW` matches (override of 30 wins, 16 <= 30)
  - `makeInput({ ...profitTargetPercentOverride: null, profitTargetPercentDefault: 40, currentOptionMid capturing 45% })` → `PROFIT_TARGET` matches at 45% captured (global default 40 applies, no per-position override)
  - `makeInput({ profitTargetPercentOverride: 60, profitTargetPercentDefault: 40, capturing 45% })` → `PROFIT_TARGET` does not match (override of 60 wins over the lower global default; 45% < 60%)
  - Omitting both `managementWindowDteOverride` isn't possible (factory always supplies it) — instead assert `makeInput({ profitTargetPercentDefault: undefined })` behaves exactly as the pre-existing default-50 tests already assert (no new assertion needed beyond confirming existing tests still pass)

**Green — implementation:**

- `src/main/core/profit-target.ts`:
  ```typescript
  export function resolveProfitTarget(
    override: number | null,
    defaultPercent: number = DEFAULT_PROFIT_TARGET_PERCENT
  ): number {
    return override === null ? defaultPercent : override
  }
  ```
- `src/main/core/alerts.ts`:
  - Add `export function resolveManagementWindowDte(override: number | null, defaultDte: number = DEFAULT_MANAGEMENT_WINDOW_DTE): number { return override === null ? defaultDte : override }` next to `DEFAULT_MANAGEMENT_WINDOW_DTE`
  - `AlertEvaluationInput` gains `managementWindowDteOverride: number | null` and `profitTargetPercentDefault?: number` (existing `managementWindowDte?: number` field unchanged — see research.md ADR "additive, no rename")
  - Add `interface ResolvedThresholds { managementWindowDte: number; profitTargetPercent: number }`
  - Change `RuleDefinition.test` to `(input: AlertEvaluationInput, resolved: ResolvedThresholds) => boolean`
  - `MANAGEMENT_WINDOW.test`: `(input, resolved) => input.dte !== null && input.dte > EXPIRATION_IMMINENT_MAX_DTE && input.dte <= resolved.managementWindowDte`
  - `PROFIT_TARGET.test`: `(input, resolved) => capturedPercent(input).gte(resolved.profitTargetPercent)` (drop the direct `resolveProfitTarget(input.profitTargetPercentOverride)` call — resolution now happens once in `evaluatePosition`)
  - `evaluatePosition`: replace the current `const managementWindowDte = input.managementWindowDte ?? DEFAULT_MANAGEMENT_WINDOW_DTE` line with the `resolved: ResolvedThresholds` computation shown in `data-model.md`, and pass `resolved` (not the bare number) into `rule.test(input, resolved)` in the `matches` filter

**Refactor — cleanup to consider:**

- Confirm `resolveProfitTarget`'s import in `alerts.ts` is still needed (it is — called once in `evaluatePosition`) and that the now-unused direct reference inside the old `PROFIT_TARGET.test` body is fully removed, not left dead
- Check the two "Inert defaults" comments in `alerts.test.ts`'s `makeInput` still read correctly with the new field added

**Acceptance criteria covered:**

- Predicate-level truth of the resolution precedence underlying every US-57/US-58 scenario: override wins when present, global default applies when absent, and the two thresholds resolve independently of each other.

---

### 3. Global alert-defaults service + IPC (US-57 backend)

**Files to create or modify:**

- `src/main/services/alert-defaults.ts` — new: `getAlertDefaults(db)`, `saveAlertDefaults(db, input)`
- `src/main/services/alert-defaults.test.ts` — new
- `src/main/schemas.ts` — add `SaveAlertDefaultsPayloadSchema`
- `src/main/ipc/settings.ts` — add `settings:get-alert-defaults`, `settings:save-alert-defaults` handlers
- `src/main/ipc/settings.test.ts` — extend

**Red — tests to write:**

In `src/main/services/alert-defaults.test.ts` (real in-memory test DB per existing service-test convention):

- `getAlertDefaults(db)` on a fresh DB returns `{ profitTargetPercent: 50, managementWindowDte: 21 }` (no `app_settings` rows yet)
- `saveAlertDefaults(db, { profitTargetPercent: 40, managementWindowDte: 14 })` persists both, and a subsequent `getAlertDefaults(db)` returns `{ 40, 14 }`
- `saveAlertDefaults(db, { profitTargetPercent: 0, managementWindowDte: 14 })` throws `ValidationError('profitTargetPercent', ..., 'Profit target must be between 1 and 99')` and leaves `app_settings` unchanged (verify via `getAlertDefaults` still returning the prior saved value)
- `saveAlertDefaults(db, { profitTargetPercent: 40, managementWindowDte: 100 })` throws the management-window `ValidationError` with the exact AC message, and writes neither row (assert `profitTargetPercent` unchanged too — no partial write)
- Boundary: `saveAlertDefaults` accepts `1`, `99`, `6`, `45` without throwing

In `src/main/ipc/settings.test.ts`:

- `settings:get-alert-defaults` returns `{ ok: true, defaults: { profitTargetPercent, managementWindowDte } }`
- `settings:save-alert-defaults` with valid payload returns `{ ok: true, defaults }`
- `settings:save-alert-defaults` with `profitTargetPercent: 0` returns `{ ok: false, errors: [{ field: 'profitTargetPercent', message: 'Profit target must be between 1 and 99' }] }` via the Zod path through `handleIpcCall`

**Green — implementation:**

- `src/main/services/alert-defaults.ts`:

  ```typescript
  import { DEFAULT_PROFIT_TARGET_PERCENT } from '../core/profit-target'
  import { DEFAULT_MANAGEMENT_WINDOW_DTE } from '../core/alerts'
  import { ValidationError } from '../core/lifecycle'
  import { appSettings } from './app-settings'

  const PROFIT_TARGET_KEY = 'alert_default_profit_target_percent'
  const MANAGEMENT_WINDOW_KEY = 'alert_default_management_window_dte'

  export type AlertDefaults = { profitTargetPercent: number; managementWindowDte: number }

  export function getAlertDefaults(db: Database.Database): AlertDefaults {
    const profit = appSettings.get(db, PROFIT_TARGET_KEY)
    const window = appSettings.get(db, MANAGEMENT_WINDOW_KEY)
    return {
      profitTargetPercent: profit !== undefined ? Number(profit) : DEFAULT_PROFIT_TARGET_PERCENT,
      managementWindowDte: window !== undefined ? Number(window) : DEFAULT_MANAGEMENT_WINDOW_DTE
    }
  }

  export function saveAlertDefaults(db: Database.Database, input: AlertDefaults): AlertDefaults {
    if (input.profitTargetPercent < 1 || input.profitTargetPercent > 99) {
      throw new ValidationError(
        'profitTargetPercent',
        'out_of_range',
        'Profit target must be between 1 and 99'
      )
    }
    if (input.managementWindowDte < 6 || input.managementWindowDte > 45) {
      throw new ValidationError(
        'managementWindowDte',
        'out_of_range',
        'Management window must be between 6 and 45 DTE'
      )
    }
    appSettings.set(db, PROFIT_TARGET_KEY, String(input.profitTargetPercent))
    appSettings.set(db, MANAGEMENT_WINDOW_KEY, String(input.managementWindowDte))
    logger.info({ ...input }, 'alert_defaults_saved')
    return getAlertDefaults(db)
  }
  ```

- `src/main/schemas.ts`: `SaveAlertDefaultsPayloadSchema = z.object({ profitTargetPercent: z.number().int().min(1, 'Profit target must be between 1 and 99').max(99, 'Profit target must be between 1 and 99'), managementWindowDte: z.number().int().min(6, 'Management window must be between 6 and 45 DTE').max(45, 'Management window must be between 6 and 45 DTE') })`
- `src/main/ipc/settings.ts`: add `alertDefaults: Pick<..., 'getAlertDefaults' | 'saveAlertDefaults'>` (or a plain `{ getAlertDefaults, saveAlertDefaults }` param object) to `SettingsHandlersDependencies`, register:
  ```typescript
  ipcMain.handle('settings:get-alert-defaults', () =>
    handleIpcCall('settings_get_alert_defaults_unhandled_error', () => ({
      defaults: alertDefaults.getAlertDefaults()
    }))
  )
  ipcMain.handle('settings:save-alert-defaults', (_, payload: unknown) =>
    handleIpcCall('settings_save_alert_defaults_unhandled_error', () => {
      const parsed = SaveAlertDefaultsPayloadSchema.parse(payload)
      logger.debug(parsed, 'settings_save_alert_defaults_requested')
      return { defaults: alertDefaults.saveAlertDefaults(parsed) }
    })
  )
  ```

**Refactor — cleanup to consider:**

- Check whether `alertDefaults`'s two functions should be curried with `db` at registration time (matching how `settings.ts`'s service is constructed with `db` baked in via `createSettingsService`) or passed the raw `db`-taking functions directly — prefer whichever reads closer to the existing `registerSettingsHandlers` call site in `src/main/index.ts`; avoid introducing a second settings-service-factory pattern for two functions.

**Acceptance criteria covered:**

- Backend half of all four US-57 scenarios: "Trader saves new global defaults", "Existing positions... pick up the new defaults" (data availability — engine wiring is Area 5), "Invalid settings are rejected inline" (validation + no partial write), "Saving global defaults does not overwrite per-position overrides" (this service never touches `positions`).

---

### 4. Per-position alert-overrides service + IPC (US-58 backend)

**Files to create or modify:**

- `src/main/services/save-position-alert-overrides.ts` — new: `savePositionAlertOverrides(db, positionId, input)`
- `src/main/services/save-position-alert-overrides.test.ts` — new
- `src/main/services/get-position.ts` — extend `GET_QUERY` and `PositionRecord` mapping with the two override fields
- `src/main/services/get-position.test.ts` — extend
- `src/main/schemas.ts` — add `SaveAlertOverridesPayloadSchema`; extend `PositionRecord` with `profitTargetPercent: number | null` and `managementWindowDteOverride: number | null`
- `src/main/ipc/positions.ts` — add `positions:save-alert-overrides` handler
- `src/main/ipc/positions.test.ts` — extend

**Red — tests to write:**

In `src/main/services/save-position-alert-overrides.test.ts` (seed a position via existing test-db helpers):

- `savePositionAlertOverrides(db, posId, { profitTargetPercent: 25, managementWindowDte: 14 })` writes both columns; a subsequent `getPosition(db, posId).position` shows `profitTargetPercent: 25, managementWindowDteOverride: 14`
- `savePositionAlertOverrides(db, posId, { profitTargetPercent: null, managementWindowDte: null })` clears both columns back to `NULL` (US-58 Scenario 3 — "Use global defaults")
- `savePositionAlertOverrides(db, posId, { profitTargetPercent: 100, managementWindowDte: 14 })` throws the profit-target `ValidationError` and leaves both columns unchanged (no partial write) — assert via a follow-up `getPosition` read
- `savePositionAlertOverrides(db, posId, { profitTargetPercent: 25, managementWindowDte: 60 })` throws the management-window `ValidationError` with the exact AC message
- `savePositionAlertOverrides(db, 'nonexistent-id', { profitTargetPercent: 25, managementWindowDte: 14 })` throws a not-found error (mirrors the existing `getPosition` null-row handling used elsewhere)
- Boundary: `1`, `99`, `6`, `45` all accepted without throwing

In `src/main/services/get-position.test.ts`:

- A position seeded with `profit_target_percent = 25, management_window_dte_override = 10` returns those exact values on `position.profitTargetPercent` / `position.managementWindowDteOverride`
- A position with both columns `NULL` returns `profitTargetPercent: null, managementWindowDteOverride: null`

In `src/main/ipc/positions.test.ts`:

- `positions:save-alert-overrides` with a valid payload returns `{ ok: true, position: { id, profitTargetPercent, managementWindowDteOverride } }`
- `positions:save-alert-overrides` with `managementWindowDte: 60` returns `{ ok: false, errors: [...] }` with the exact management-window message

**Green — implementation:**

- `src/main/services/save-position-alert-overrides.ts`:

  ```typescript
  export type SavePositionAlertOverridesInput = {
    profitTargetPercent: number | null
    managementWindowDte: number | null
  }

  export function savePositionAlertOverrides(
    db: Database.Database,
    positionId: string,
    input: SavePositionAlertOverridesInput
  ): {
    id: string
    profitTargetPercent: number | null
    managementWindowDteOverride: number | null
  } {
    if (
      input.profitTargetPercent !== null &&
      (input.profitTargetPercent < 1 || input.profitTargetPercent > 99)
    ) {
      throw new ValidationError(
        'profitTargetPercent',
        'out_of_range',
        'Profit target must be between 1 and 99'
      )
    }
    if (
      input.managementWindowDte !== null &&
      (input.managementWindowDte < 6 || input.managementWindowDte > 45)
    ) {
      throw new ValidationError(
        'managementWindowDte',
        'out_of_range',
        'Management window must be between 6 and 45 DTE'
      )
    }
    const result = db
      .prepare(
        'UPDATE positions SET profit_target_percent = ?, management_window_dte_override = ?, updated_at = ? WHERE id = ?'
      )
      .run(
        input.profitTargetPercent,
        input.managementWindowDte,
        new Date().toISOString(),
        positionId
      )
    if (result.changes === 0) {
      throw new ValidationError('__root__', 'not_found', 'Position not found')
    }
    logger.info({ positionId, ...input }, 'position_alert_overrides_saved')
    return {
      id: positionId,
      profitTargetPercent: input.profitTargetPercent,
      managementWindowDteOverride: input.managementWindowDte
    }
  }
  ```

- `src/main/services/get-position.ts`: add `profit_target_percent`, `management_window_dte_override` to `PositionRow` and `GET_QUERY`'s `p.` column list; map into `position.profitTargetPercent`, `position.managementWindowDteOverride` in the `PositionRecord` construction
- `src/main/schemas.ts`: extend `PositionRecord`; add `SaveAlertOverridesPayloadSchema` mirroring `SaveAlertDefaultsPayloadSchema` but with `positionId: z.string().min(1)` and both numeric fields `.nullable()`
- `src/main/ipc/positions.ts`: add
  ```typescript
  ipcMain.handle('positions:save-alert-overrides', (_, payload: unknown) =>
    handleIpcCall('positions_save_alert_overrides_unhandled_error', () => {
      const parsed = SaveAlertOverridesPayloadSchema.parse(payload)
      return { position: savePositionAlertOverrides(db, parsed.positionId, parsed) }
    })
  )
  ```

**Refactor — cleanup to consider:**

- Confirm the `UPDATE ... WHERE id = ?` + `result.changes === 0` not-found pattern doesn't already exist as a shared helper elsewhere in `services/positions.ts` — reuse it if so, otherwise leave this one local (single use doesn't justify extraction)
- Leave the existing `test:set-position-profit-target` handler untouched — it serves a different story's (US-33) e2e test and seeds without validation on purpose; do not merge it into the new validated handler

**Acceptance criteria covered:**

- Backend half of all four US-58 scenarios: "Trader saves per-position overrides", "Other positions continue using the global defaults" (data availability — engine wiring is Area 5), "Trader clears overrides" (both-null write), "Invalid override values are rejected inline" (validation + no partial write).

---

### 5. Service wiring — evaluateAlerts consumes the new column and global defaults

**Files to create or modify:**

- `src/main/services/evaluate-alerts.ts` — add the new column to `EvaluableRow`/`EVALUABLE_QUERY`/`toEvaluationInput`; add `profitTargetPercentDefault` to `EvaluateAlertsInput`
- `src/main/services/evaluate-alerts-test-utils.ts` — extend seed helpers to accept `managementWindowDteOverride`
- `src/main/services/evaluate-alerts.test.ts` — new wiring tests
- `src/main/index.ts` — scheduler handler reads `getAlertDefaults(db)` on every tick instead of relying on hardcoded constants

**Red — tests to write** (in `src/main/services/evaluate-alerts.test.ts`):

- A seeded CC_OPEN position with `management_window_dte_override = 10` and `dte = 16`, called with `managementWindowDte: 21` (batch default) → no `MANAGEMENT_WINDOW` row (override of 10 wins, 16 > 10 means it's actually past the window — pick concrete numbers that clearly demonstrate override-wins: e.g. override `30`, dte `16` → row created; override `10`, dte `16` → no row)
- A seeded position with `profit_target_percent = null`, `evaluateAlerts` called with `profitTargetPercentDefault: 30`, and a snapshot yielding 35% captured → `PROFIT_TARGET` row created (global default of 30 applies, not the hardcoded 50)
- A seeded position with `profit_target_percent = 60` (override) and the same `profitTargetPercentDefault: 30` and 35% captured → no `PROFIT_TARGET` row (override of 60 wins over the lower global default)
- Omitting `managementWindowDte`/`profitTargetPercentDefault` entirely reproduces today's hardcoded-default behavior (regression guard — existing tests in this file that don't pass these params must keep passing unmodified)

**Green — implementation:**

- `EvaluableRow` gains `management_window_dte_override: number | null`; `EVALUABLE_QUERY` SELECT adds `p.management_window_dte_override`
- `toEvaluationInput` signature gains no new parameter (it already receives the full `row`) — add `managementWindowDteOverride: row.management_window_dte_override` and `profitTargetPercentDefault` (threaded from the new `evaluateAlerts` parameter, same as `managementWindowDte` already is) to the returned `AlertEvaluationInput`
- `EvaluateAlertsInput` gains `profitTargetPercentDefault?: number`; `evaluateAlerts`'s destructured params gain `profitTargetPercentDefault = DEFAULT_PROFIT_TARGET_PERCENT` alongside the existing `managementWindowDte = DEFAULT_MANAGEMENT_WINDOW_DTE`
- `src/main/index.ts`: change the `ALERT_EVAL_JOB_NAME` handler from `async () => evaluateAlerts({ db, provider: marketDataFactory.create() })` to:
  ```typescript
  handler: async () => {
    const { profitTargetPercent, managementWindowDte } = getAlertDefaults(db)
    return evaluateAlerts({
      db,
      provider: marketDataFactory.create(),
      managementWindowDte,
      profitTargetPercentDefault: profitTargetPercent
    })
  }
  ```

**Refactor — cleanup to consider:**

- `toEvaluationInput`'s parameter list was already flagged in the US-56 plan as a candidate for grouping into one object "only if the call site reads worse than before" — re-evaluate now that it's grown by one more field; group only if it genuinely improves readability, per that same standing note
- Verify `evaluate-alerts-test-utils.ts` seed helpers follow the existing naming convention when adding `managementWindowDteOverride` support

**Acceptance criteria covered:**

- Engine-side half of US-57 Scenario 2 ("future alert evaluations use 40% and 14 DTE for positions without overrides") and US-58 Scenarios 1-2 ("future alert evaluations for AAPL use 25% and 14 DTE", "MSFT uses 50% and 21 DTE").

---

### 6. Renderer — Global Alert Defaults section on the Settings page (US-57)

**Files to create or modify:**

- `src/main/schemas.ts` / `src/preload/index.d.ts` / `src/preload/index.ts` — bridge `settings:get-alert-defaults` / `settings:save-alert-defaults` (`window.api.settings.getAlertDefaults()`, `window.api.settings.saveAlertDefaults(payload)`)
- `src/renderer/src/api/settings.ts` — `getAlertDefaults()`, `saveAlertDefaults(payload)`, `AlertDefaults` type
- `src/renderer/src/hooks/settingsQueryKeys.ts` — add `alertDefaults: ['settings', 'alert-defaults'] as const`
- `src/renderer/src/hooks/useSettings.ts` — `useAlertDefaults()` query, `useSaveAlertDefaults()` mutation (invalidates `settingsQueryKeys.alertDefaults`)
- `src/renderer/src/pages/SettingsPage.tsx` — new `AlertDefaultsSection` component + section wiring
- `src/renderer/src/pages/SettingsPage.test.tsx` — extend

**Red — tests to write** (in `SettingsPage.test.tsx`, following the existing `role="region"` section-query convention used for the Market Data / Broker sections):

- Renders a new `region` labeled e.g. `Alert Defaults` showing the loaded `profitTargetPercent`/`managementWindowDte` values (mock `useAlertDefaults` returning `{ profitTargetPercent: 50, managementWindowDte: 21 }` — mirrors the mockup's `defaults` state)
- Editing both fields to `40`/`14` and clicking "Save alert defaults" calls the save mutation with `{ profitTargetPercent: 40, managementWindowDte: 14 }` and shows the "Alert defaults saved" banner (mockup's `saved` state)
- Entering `0`/`0` shows both inline errors ("Profit target must be between 1 and 99", "Management window must be between 6 and 45 DTE") and disables the Save button (mockup's `invalid` state) — client-side Zod validation, no IPC call made
- A server-side rejection (mutation rejects with the field errors) surfaces the same inline messages (defense in depth — mirrors how `CloseCspForm` surfaces `ApiFieldError`s via `setError`)

**Green — implementation:**

- Preload/schema/type bridge follows the exact chain already used for `settings:get-credential-status` (see `src/preload/index.ts:40-48`, `src/preload/index.d.ts` `IpcCredentialStatus`-equivalent block)
- `AlertDefaultsSection` component, matching `mockups/us-57-global-alert-thresholds.mdx`: two labeled fields ("Profit Target" / percent suffix, "Management Window" / DTE suffix) built with `useForm({ resolver: zodResolver(alertDefaultsSchema) })` where `alertDefaultsSchema` mirrors the IPC bounds (`z.number().int().min(1).max(99)`, `z.number().int().min(6).max(45)`) with the exact AC error messages; "Save alert defaults" submit button disabled when `!formState.isValid`; a "Reset" button (`form.reset()` back to loaded values, per the mockup) — no engine-preview panel is required by the ACs, but the mockup's "Engine Preview" copy block is static informational text, not tied to live data, so render it as static JSX
- Wire `useAlertDefaults()` for initial values (`defaultValues` via `useEffect`/`form.reset` once loaded, matching how other forms in this codebase hydrate from a query) and `useSaveAlertDefaults()` for submit; on success show a green banner "Alert defaults saved" (mirrors the `AlpacaCredentialCard` success-message pattern) for a few seconds or until the next edit
- Insert the new section into `SettingsPage.tsx` between the existing "Market Data" and "Broker" sections (or after Broker — no AC dictates order; keep it adjacent to Broker since both are app-wide config, not per-position)

**Refactor — cleanup to consider:**

- Check whether the inline-error rendering duplicates a pattern already factored out (e.g. a shared `<FieldError>` component) — reuse if present, otherwise this is the second occurrence and still doesn't justify extraction on its own (see `CLAUDE.md`: no abstraction for single/dual use)

**Acceptance criteria covered:**

- Full UI half of all four US-57 scenarios: defaults display, save + banner, inline validation + disabled Save, and (implicitly, by never touching a position) the "does not overwrite per-position overrides" scenario.

---

### 7. Renderer — Per-Position Alert Overrides panel on the position detail page (US-58) + badge consistency

**Files to create or modify:**

- `src/main/schemas.ts` / `src/preload/index.d.ts` / `src/preload/index.ts` — bridge `positions:save-alert-overrides`; extend `IpcPositionRecord` with the two new fields
- `src/renderer/src/api/positions.ts` — extend `PositionDetail`/`PositionRecord`-equivalent type with `profitTargetPercent`, `managementWindowDteOverride`; add `saveAlertOverrides(payload)`
- `src/renderer/src/hooks/usePositions.ts` (or sibling hook file, matching existing per-mutation-hook convention) — `useSaveAlertOverrides()` mutation invalidating the position-detail query
- `src/renderer/src/components/PositionAlertOverridesForm.tsx` — new component, matching `mockups/us-58-position-alert-overrides.mdx`
- `src/renderer/src/pages/PositionDetailContent.tsx` — render the new form
- `src/renderer/src/hooks/useAlertDefaults` reuse (from Area 6) — needed here too, to show "Effective Alert Logic" resolved values
- `src/renderer/src/components/PositionCard.tsx` — `deriveRowDisplay` reads the global default via `useAlertDefaults()` instead of the hardcoded constant
- `src/renderer/src/pages/PositionDetailPage.test.tsx` — extend
- `src/renderer/src/components/PositionCard.test.tsx` (if present) — extend for the badge-consistency change

**Red — tests to write:**

In `PositionDetailPage.test.tsx` (or a new co-located test for `PositionAlertOverridesForm` if the existing file doesn't already cover `PositionDetailContent` sub-sections):

- With `profitTargetPercent: null, managementWindowDteOverride: null`, renders the `inherit` state: label "Using global defaults", fields pre-filled with the resolved global values (mockup's `inherit` state)
- Enabling "custom alerts", setting `25`/`14`, and clicking "Save overrides" calls the save mutation with `{ positionId, profitTargetPercent: 25, managementWindowDte: 14 }` and shows "Custom alert thresholds active" (mockup's `override` state)
- With overrides already active, clicking "Use global defaults" calls the mutation with `{ positionId, profitTargetPercent: null, managementWindowDte: null }` and reverts the label to "Using global defaults" (mockup's `cleared` state / US-58 Scenario 3)
- Entering `100`/`60` shows both inline errors matching the exact AC strings and disables "Save overrides" (mockup's `invalid` state)

For badge consistency, extend whichever test file already covers `PositionCard`'s `TARGET` badge (likely `PositionsListPage.test.tsx` per the US-33 spec's test-ID list `target-badge`):

- With a saved global default of `40` (mock `useAlertDefaults`) and no per-position override, a position at 42% captured shows the `TARGET` badge; at 38% it does not — proving the badge now reads the saved global default, not the hardcoded 50

**Green — implementation:**

- Preload/schema/type bridge follows the `positions:*` chain already used for e.g. `positions:close-csp`
- `PositionAlertOverridesForm`, matching the mockup: a `Tone` banner (gold when `active`, blue when inheriting) showing the current label; two `Field` rows (profit target percent, management window DTE) editable only when the "custom alerts" toggle/switch is on; "Save overrides" and "Use global defaults" buttons. Use `useForm({ resolver: zodResolver(overridesSchema) })` with the identical bounds/messages as Area 6's schema
- An "Effective Alert Logic" read-only panel (mirroring the mockup's second column) computed via `resolveProfitTarget`/`resolveManagementWindowDte` fed with the position's own override and the loaded global defaults from `useAlertDefaults()` — this is the renderer-side use of the same pure helpers the engine uses, per the shared-helper technical note
- `PositionCard.tsx`'s `deriveRowDisplay(item, snapshot)` gains a third parameter (or reads from a new hook call at the call site) for the resolved global default, threading `resolveProfitTarget(item.profitTargetPercent ?? null, alertDefaults.profitTargetPercent)` — call `useAlertDefaults()` once at the list-page level (e.g. `PositionsListPage.tsx`) and pass the resolved default down, rather than calling the hook per-row
- Insert `PositionAlertOverridesForm` into `PositionDetailContent.tsx`, likely near the top alongside `PositionCockpit` or as its own `SectionCard`, per the mockup's standalone section treatment (no AC dictates exact placement relative to Notes/CloseCspForm)

**Refactor — cleanup to consider:**

- `PositionAlertOverridesForm` and the Area 6 `AlertDefaultsSection` share an identical bounds schema (`1-99` / `6-45` with the same messages) — extract a single shared Zod schema (e.g. `alertThresholdsSchema` in a shared renderer lib module) once both exist, rather than defining the bounds twice
- Confirm `useAlertDefaults()` is called once per page tree, not once per `PositionCard` row (React Query dedupes by key, but prefer lifting it to avoid redundant call sites)

**Acceptance criteria covered:**

- Full UI half of all four US-58 scenarios: save overrides, other positions unaffected (implicit — this form only ever touches its own `positionId`), clear reverts to defaults, and inline validation with no save on invalid input. Also closes the badge-consistency gap called out in US-57's Technical Notes.

---

### 8. E2e Tests

**Files to create or modify:**

- `src/main/services/evaluate-alerts.e2e.test.ts` — new `describe('US-57 acceptance', ...)` and `describe('US-58 acceptance', ...)` blocks, one `it()` per AC, names mirroring the Gherkin language (matches the US-52/53-56 precedent)

**Red — tests to write** (each seeds a real in-memory DB via `makeTestDb()`, calls the real services directly — `saveAlertDefaults`/`savePositionAlertOverrides` — then runs `evaluateAlerts`, asserting through `readAlertRows`/`getPosition`):

- `describe('US-57 acceptance', ...)`:
  - `it('saves new global defaults and future alert evaluations use them for positions without overrides')` — `saveAlertDefaults(db, { profitTargetPercent: 40, managementWindowDte: 14 })`, then a seeded AAPL position (no override) at `dte: 14` produces an open `MANAGEMENT_WINDOW` row (14 <= 14, the new threshold) where it would not have under the old default of 21 vs. dte comparison — pick concrete numbers proving the new threshold is in effect, not the old one **(AC "Existing positions... pick up the new defaults")**
  - `it('rejects invalid global default values without saving them')` — `saveAlertDefaults(db, { profitTargetPercent: 0, managementWindowDte: 0 })` throws with both exact messages, and a follow-up `getAlertDefaults(db)` shows the prior values unchanged **(AC "Invalid settings are rejected inline")**
  - `it('does not overwrite an existing per-position override when global defaults are saved')` — seed MSFT with `profit_target_percent = 25`, then `saveAlertDefaults(db, { profitTargetPercent: 40, managementWindowDte: 14 })`, then `getPosition(db, msftId).position.profitTargetPercent === 25` **(AC "Saving global defaults does not overwrite per-position overrides")**
  - `it('applies the saved global defaults to future evaluations of positions without overrides')` — combined check that a fresh `evaluateAlerts` run (with `getAlertDefaults`-sourced params, exactly as `index.ts` wires it) produces the AAPL `MANAGEMENT_WINDOW`/`PROFIT_TARGET` rows using `40`/`14`, not the hardcoded `50`/`21` **(Background/AC "future alert evaluations use 40% and 14 DTE")**
- `describe('US-58 acceptance', ...)`:
  - `it('saves per-position overrides and future evaluations for that position use them')` — `savePositionAlertOverrides(db, aaplId, { profitTargetPercent: 25, managementWindowDte: 14 })`, then `evaluateAlerts` produces AAPL rows reflecting `25`/`14` **(AC "Trader saves per-position overrides")**
  - `it('leaves other positions on the global defaults when one position has overrides')` — AAPL overridden to `25`/`14`, MSFT with no override, global defaults at `50`/`21` — one `evaluateAlerts` run produces AAPL rows at `25`/`14` and MSFT rows at `50`/`21` in the same pass **(AC "Other positions continue using the global defaults")**
  - `it('clears overrides and reverts the position to the global defaults')` — AAPL overridden, then `savePositionAlertOverrides(db, aaplId, { profitTargetPercent: null, managementWindowDte: null })`, then a follow-up `evaluateAlerts` run produces rows at the global default values, not the (now-cleared) override values **(AC "Trader clears overrides and reverts to global defaults")**
  - `it('rejects invalid per-position override values without saving them')` — `savePositionAlertOverrides(db, aaplId, { profitTargetPercent: 100, managementWindowDte: 60 })` throws with both exact messages, and a follow-up `getPosition` shows no overrides were written **(AC "Invalid override values are rejected inline")**

**Green — implementation:**

- No production code — this area is verification. Any failure here is fixed in the area that owns the defect (1-7).

**Refactor — cleanup to consider:**

- Consolidate any repeated pinned-value seeding (positions with specific override columns) into `evaluate-alerts-test-utils.ts`, following the US-52 e2e-helper-consolidation precedent

**Acceptance criteria covered:**

- All eight Gherkin scenarios across both stories.

## AC Audit

| AC (Gherkin scenario)                                                   | E2e test (Area 8)                                                                                 |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| US-57: Trader saves new global defaults                                 | `applies the saved global defaults to future evaluations of positions without overrides`          |
| US-57: Existing positions without overrides pick up the new defaults    | `saves new global defaults and future alert evaluations use them for positions without overrides` |
| US-57: Invalid settings are rejected inline                             | `rejects invalid global default values without saving them`                                       |
| US-57: Saving global defaults does not overwrite per-position overrides | `does not overwrite an existing per-position override when global defaults are saved`             |
| US-58: Trader saves per-position overrides                              | `saves per-position overrides and future evaluations for that position use them`                  |
| US-58: Other positions continue using the global defaults               | `leaves other positions on the global defaults when one position has overrides`                   |
| US-58: Trader clears overrides and reverts to global defaults           | `clears overrides and reverts the position to the global defaults`                                |
| US-58: Invalid override values are rejected inline                      | `rejects invalid per-position override values without saving them`                                |

All eight ACs have exactly one named e2e test; no AC is uncovered and none are lumped together.

## Post-completion

Run the full checklist (`pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm format`), then `/update-spec us-57-58` so `docs/spec/domain/alerts.md` gains the resolved-thresholds section and configurable-defaults note, and the US-33 spec page's "1..100" bounds comment is reconciled to the actual 1-99 AC bounds this plan ships.
