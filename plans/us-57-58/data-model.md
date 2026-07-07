# Data Model: US-57 & US-58 — Global Alert Thresholds + Per-Position Overrides

## Entities

### `app_settings` rows (US-57 — global defaults, no new table)

Two new keys in the existing `app_settings(key, value, updated_at)` table:

| Key                                   | Value encoding    | Bounds (validated before write) | Absent-row meaning                   |
| ------------------------------------- | ----------------- | ------------------------------- | ------------------------------------ |
| `alert_default_profit_target_percent` | integer as string | `1..99` inclusive               | `DEFAULT_PROFIT_TARGET_PERCENT = 50` |
| `alert_default_management_window_dte` | integer as string | `6..45` inclusive               | `DEFAULT_MANAGEMENT_WINDOW_DTE = 21` |

Read/written via the existing `appSettings.get(db, key)` / `appSettings.set(db, key, value)` (`src/main/services/app-settings.ts`) — no schema change to that table.

### `positions.management_window_dte_override` (US-58 — new column)

Migration `010_add_management_window_dte_override.sql`:

```sql
ALTER TABLE positions
  ADD COLUMN management_window_dte_override INTEGER;
```

- Nullable `INTEGER`, no default, no `CHECK` (validation lives in the service layer, matching the `profit_target_percent` precedent from migration 005).
- `NULL` → position inherits the global `alert_default_management_window_dte` default.
- Non-null valid range when set: `6..45` inclusive (same bounds as the global default — a per-position override narrower than the global floor would create a dead zone beneath the fixed `EXPIRATION_IMMINENT` rule's `0-5 DTE` band, which US-58's Technical Notes explicitly rule out).

### `positions.profit_target_percent` (US-33 column, now editable)

No schema change — the column already exists (migration 005). US-58 adds the first real write path (`positions:save-alert-overrides`) alongside the existing read paths (`positions:list`, and newly, `positions:get`).

## Engine shapes (`src/main/core/alerts.ts`)

### `AlertEvaluationInput` — new/changed fields

```typescript
export interface AlertEvaluationInput {
  // ...unchanged existing fields...
  managementWindowDte?: number // UNCHANGED: batch-level global default, falls back to DEFAULT_MANAGEMENT_WINDOW_DTE
  managementWindowDteOverride: number | null // NEW: positions.management_window_dte_override
  profitTargetPercentOverride: number | null // UNCHANGED: positions.profit_target_percent
  profitTargetPercentDefault?: number // NEW: batch-level global default, falls back to DEFAULT_PROFIT_TARGET_PERCENT
}
```

### `ResolvedThresholds` — new internal type

```typescript
interface ResolvedThresholds {
  managementWindowDte: number
  profitTargetPercent: number
}
```

Computed once per call inside `evaluatePosition`:

```typescript
const resolved: ResolvedThresholds = {
  managementWindowDte: resolveManagementWindowDte(
    input.managementWindowDteOverride,
    input.managementWindowDte ?? DEFAULT_MANAGEMENT_WINDOW_DTE
  ),
  profitTargetPercent: resolveProfitTarget(
    input.profitTargetPercentOverride,
    input.profitTargetPercentDefault ?? DEFAULT_PROFIT_TARGET_PERCENT
  )
}
```

`RuleDefinition.test` signature changes from `(input, managementWindowDte: number)` to `(input, resolved: ResolvedThresholds)`. Only `MANAGEMENT_WINDOW` and `PROFIT_TARGET` read from `resolved`; the other three rules ignore the second argument exactly as they ignore `managementWindowDte` today.

### `resolveProfitTarget` (`src/main/core/profit-target.ts`) — signature change

```typescript
// Before: resolveProfitTarget(override: number | null): number
export function resolveProfitTarget(
  override: number | null,
  defaultPercent: number = DEFAULT_PROFIT_TARGET_PERCENT
): number {
  return override === null ? defaultPercent : override
}
```

Backward compatible — every existing call site that omits the second argument behaves identically.

### `resolveManagementWindowDte` (new, `src/main/core/alerts.ts`)

```typescript
export function resolveManagementWindowDte(
  override: number | null,
  defaultDte: number = DEFAULT_MANAGEMENT_WINDOW_DTE
): number {
  return override === null ? defaultDte : override
}
```

## Service shapes

### `AlertDefaults` (new, `src/main/services/alert-defaults.ts`)

```typescript
export type AlertDefaults = {
  profitTargetPercent: number // 1-99
  managementWindowDte: number // 6-45
}

export function getAlertDefaults(db: Database.Database): AlertDefaults
export function saveAlertDefaults(db: Database.Database, input: AlertDefaults): AlertDefaults
```

`saveAlertDefaults` validates both bounds (throwing `ValidationError` per out-of-range field, matching the AC's exact messages) before writing either `app_settings` row — no partial write.

### `EvaluableRow` (`src/main/services/evaluate-alerts.ts`) — new column

```typescript
interface EvaluableRow {
  // ...unchanged...
  management_window_dte_override: number | null // NEW
}
```

`EVALUABLE_QUERY` SELECT gains `p.management_window_dte_override`.

### `EvaluateAlertsInput` — new field

```typescript
type EvaluateAlertsInput = {
  // ...unchanged...
  profitTargetPercentDefault?: number // NEW — threaded from getAlertDefaults() at the call site
}
```

`managementWindowDte` (already present) continues to serve as the global-default input; the scheduler handler in `src/main/index.ts` now supplies both from `getAlertDefaults(db)` instead of relying on the hardcoded constants.

### `PositionRecord` (`src/main/schemas.ts`) — new fields

```typescript
export interface PositionRecord {
  // ...unchanged...
  profitTargetPercent: number | null // NEW — sourced from positions.profit_target_percent
  managementWindowDteOverride: number | null // NEW — sourced from positions.management_window_dte_override
}
```

Sourced in `get-position.ts` by extending `GET_QUERY`'s `positions` column list (`p.profit_target_percent`, `p.management_window_dte_override`) — no join change, same row.

## Validation rules (from acceptance criteria, shared across both stories)

| Field                                  | Bounds  | Error message (exact)                            |
| -------------------------------------- | ------- | ------------------------------------------------ |
| Profit target (global or override)     | `1..99` | `Profit target must be between 1 and 99`         |
| Management window (global or override) | `6..45` | `Management window must be between 6 and 45 DTE` |

Both are enforced twice, per the Technical Notes ("Validation should be renderer-first with Zod-backed IPC validation mirroring the same bounds"): a Zod schema in the renderer form (`react-hook-form` + `zodResolver`) for inline errors, and the identical bounds again in the IPC Zod payload schema / service-layer `ValidationError` so the IPC boundary never trusts the renderer.

## State transitions

- **Global defaults**: no lifecycle — a plain upsert-by-key. Saving new values does not touch any `positions` row (US-57 Scenario: "Saving global defaults does not overwrite per-position overrides").
- **Per-position overrides**: two states, `inheriting` (`profit_target_percent IS NULL AND management_window_dte_override IS NULL` — both fields move together in the UI toggle per the mockup's single "Custom alert thresholds active" switch, but are stored as two independent nullable columns) and `custom` (both non-null). "Use global defaults" (US-58 Scenario 3) sets both columns back to `NULL` in one write.
