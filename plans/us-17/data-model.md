# Data Model: US-17 — Reject Roll in Invalid Phase

## No New Entities

US-17 adds no new entities, fields, or migrations. All required data structures already exist.

## Relevant Existing Entities

### WheelPhase (enum)

Defined in `src/main/core/types.ts` as a Zod enum:

| Phase               | Rollable? | Roll CSP? | Roll CC? |
| ------------------- | --------- | --------- | -------- |
| `CSP_OPEN`          | Yes       | ✅        | ❌       |
| `HOLDING_SHARES`    | No        | ❌        | ❌       |
| `CC_OPEN`           | Yes       | ❌        | ✅       |
| `CSP_EXPIRED`       | No        | ❌        | ❌       |
| `CSP_CLOSED_PROFIT` | No        | ❌        | ❌       |
| `CSP_CLOSED_LOSS`   | No        | ❌        | ❌       |
| `CC_EXPIRED`        | No        | ❌        | ❌       |
| `CC_CLOSED_PROFIT`  | No        | ❌        | ❌       |
| `CC_CLOSED_LOSS`    | No        | ❌        | ❌       |
| `WHEEL_COMPLETE`    | No        | ❌        | ❌       |

### Validation Error Shape

Returned by lifecycle engine and surfaced through IPC:

```typescript
{
  field: '__phase__',
  code: 'invalid_phase',
  message: string  // varies by function
}
```

**Error messages:**

- `rollCsp` → `"Position is not in CSP_OPEN phase"`
- `rollCc` → `"No open covered call on this position"`

### Phase-to-Action Mapping (Renderer)

Already implemented in `PositionDetailActions.tsx`. Roll buttons are conditionally rendered:

- `phase === 'CSP_OPEN'` → show "Roll CSP →" button
- `phase === 'CC_OPEN'` → show "Roll CC →" button
- All other phases → no roll button rendered
