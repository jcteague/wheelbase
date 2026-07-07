# Contract: settings:save-alert-defaults

## Purpose

Saves new global defaults for the profit-target percentage and management-window DTE that the alert engine uses for any position without a per-position override.

## Request

```typescript
z.object({
  profitTargetPercent: z
    .number()
    .int()
    .min(1, 'Profit target must be between 1 and 99')
    .max(99, 'Profit target must be between 1 and 99'),
  managementWindowDte: z
    .number()
    .int()
    .min(6, 'Management window must be between 6 and 45 DTE')
    .max(45, 'Management window must be between 6 and 45 DTE')
})
```

## Response (success)

```typescript
{
  ok: true
  defaults: {
    profitTargetPercent: number
    managementWindowDte: number
  }
}
```

## Error codes

| field                 | code             | message                                          |
| --------------------- | ---------------- | ------------------------------------------------ |
| `profitTargetPercent` | `too_small`      | `Profit target must be between 1 and 99`         |
| `profitTargetPercent` | `too_big`        | `Profit target must be between 1 and 99`         |
| `managementWindowDte` | `too_small`      | `Management window must be between 6 and 45 DTE` |
| `managementWindowDte` | `too_big`        | `Management window must be between 6 and 45 DTE` |
| `__root__`            | `internal_error` | `An unexpected error occurred`                   |

Both fields are validated before either `app_settings` row is written — an invalid request writes nothing (US-57 Scenario: "Invalid settings are rejected inline").

## Source

- Handler: `src/main/ipc/settings.ts` (`registerSettingsHandlers`)
- Service: `src/main/services/alert-defaults.ts` (`saveAlertDefaults`)
