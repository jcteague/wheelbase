# Contract: screener:get-criteria

## Purpose

Return the trader's persisted screening criteria, falling back to the shipped defaults when nothing has been saved or the stored document is unreadable.

## Request

```typescript
// No payload — no Zod request schema, matching `screener:results`.
undefined
```

## Response (success)

```typescript
{
  ok: true
  criteria: {
    deltaMin: string // e.g. '0.20'
    deltaMax: string // e.g. '0.30'
    dteMin: number
    dteMax: number
    minOpenInterest: number
    maxSpreadPercent: string // e.g. '10'
    maxSpreadAbsolute: string // e.g. '0.10' — read-only, no input in the sheet
    maxUnderlyingPrice: string | null // null = ceiling disabled
    minIvRank: string | null // null = floor disabled
    earningsHandling: 'exclude' | 'flag'
  }
}
```

Never absent and never partial: an unsaved, missing, or corrupt row resolves to `DEFAULT_SCREENING_CRITERIA` (see the read path in `../data-model.md`).

## Error codes

Only the standard envelope errors apply. There is no payload to reject, and every storage failure mode degrades to the defaults rather than erroring, so `__root__` / `internal_error` is the sole realistic row.

| field      | code             | message                        |
| ---------- | ---------------- | ------------------------------ |
| `__root__` | `internal_error` | `An unexpected error occurred` |

## Source

- Handler: `src/main/ipc/screener.ts`
- Service: `src/main/services/screening-criteria.ts`
