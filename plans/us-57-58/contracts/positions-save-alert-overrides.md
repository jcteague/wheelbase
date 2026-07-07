# Contract: positions:save-alert-overrides

## Purpose

Saves or clears a single position's per-position profit-target and management-window overrides. Passing `null` for both fields clears them (position reverts to inheriting the global defaults); passing numbers sets both.

## Request

```typescript
z.object({
  positionId: z.string().min(1),
  profitTargetPercent: z
    .number()
    .int()
    .min(1, 'Profit target must be between 1 and 99')
    .max(99, 'Profit target must be between 1 and 99')
    .nullable(),
  managementWindowDte: z
    .number()
    .int()
    .min(6, 'Management window must be between 6 and 45 DTE')
    .max(45, 'Management window must be between 6 and 45 DTE')
    .nullable()
})
```

## Response (success)

```typescript
{
  ok: true
  position: {
    id: string
    profitTargetPercent: number | null
    managementWindowDteOverride: number | null
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
| `__root__`            | `not_found`      | `Position not found`                             |
| `__root__`            | `internal_error` | `An unexpected error occurred`                   |

Both fields are validated (when non-null) before the `UPDATE positions` write — an invalid request writes nothing (US-58 Scenario: "Invalid override values are rejected inline ... no overrides are saved").

## Source

- Handler: `src/main/ipc/positions.ts` (`registerPositionsHandlers`)
- Service: `src/main/services/save-position-alert-overrides.ts` (`savePositionAlertOverrides`)
