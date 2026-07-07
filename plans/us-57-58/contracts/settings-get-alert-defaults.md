# Contract: settings:get-alert-defaults

## Purpose

Returns the current global alert-threshold defaults (profit target percent and management-window DTE), falling back to the built-in constants when no `app_settings` rows have been saved yet.

## Request

No payload.

## Response (success)

```typescript
{
  ok: true
  defaults: {
    profitTargetPercent: number // 1-99, defaults to 50 when unset
    managementWindowDte: number // 6-45, defaults to 21 when unset
  }
}
```

## Error codes

Only the standard envelope errors apply (`__root__` / `internal_error`). This handler performs no parsing of caller input, so it cannot produce a validation error.

## Source

- Handler: `src/main/ipc/settings.ts` (`registerSettingsHandlers`)
- Service: `src/main/services/alert-defaults.ts` (`getAlertDefaults`)
