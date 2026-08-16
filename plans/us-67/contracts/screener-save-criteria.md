# Contract: screener:save-criteria

## Purpose

Validate and persist a full replacement set of screening criteria, returning the stored document so the renderer renders persisted truth rather than form state.

## Request

```typescript
// SaveScreeningCriteriaPayloadSchema in src/main/schemas.ts.
// Omits maxSpreadAbsolute — the sheet has no input for it and the service
// supplies it from DEFAULT_SCREENING_CRITERIA.
{
  deltaMin: string // '0.01'–'0.99'
  deltaMax: string // '0.01'–'0.99', strictly greater than deltaMin
  dteMin: number // integer 1–365
  dteMax: number // integer 1–365, strictly greater than dteMin
  minOpenInterest: number // integer >= 0
  maxSpreadPercent: string // '1'–'50'
  maxUnderlyingPrice: string | null // null = ceiling disabled; when set, > 0
  minIvRank: string | null // null = floor disabled; when set, '0'–'100'
  earningsHandling: 'exclude' | 'flag'
}
```

## Response (success)

```typescript
{
  ok: true
  criteria: ScreeningCriteria // the full stored document, including maxSpreadAbsolute
}
```

Identical in shape to `screener:get-criteria`'s `criteria`, so both feed one renderer type and one form `reset`.

## Error codes

Bounds and messages come from `src/main/core/screening-criteria.ts`; every message below is pinned verbatim by an e2e test.

| field                | code             | message                                         |
| -------------------- | ---------------- | ----------------------------------------------- |
| `deltaMin`           | `out_of_range`   | `Delta must be between 0.01 and 0.99`           |
| `deltaMax`           | `out_of_range`   | `Delta must be between 0.01 and 0.99`           |
| `deltaMax`           | `inverted_band`  | `Minimum delta must be less than maximum delta` |
| `dteMin`             | `out_of_range`   | `DTE must be at least 1`                        |
| `dteMax`             | `out_of_range`   | `DTE must be at most 365`                       |
| `dteMax`             | `inverted_band`  | `Minimum DTE must be less than maximum DTE`     |
| `minOpenInterest`    | `out_of_range`   | `Open interest floor cannot be negative`        |
| `maxSpreadPercent`   | `out_of_range`   | `Max spread must be between 1% and 50%`         |
| `maxUnderlyingPrice` | `out_of_range`   | `Price ceiling must be greater than zero`       |
| `minIvRank`          | `out_of_range`   | `IV rank floor must be between 0 and 100`       |
| `__root__`           | `internal_error` | `An unexpected error occurred`                  |

**Implementation note on `code`.** Per-field bounds are enforced twice — once by
`SaveScreeningCriteriaPayloadSchema` at the boundary, once by `saveScreeningCriteria`.
Zod parses first, and `handleIpcCall` maps a Zod issue's own `code` verbatim, so a
bound caught at the boundary reaches the renderer as `code: 'custom'` rather than the
`out_of_range` in the table above; only the service's `ValidationError` path emits
`out_of_range` literally. The two `inverted_band` rows are service-only and always
carry that exact code. `field` and `message` are identical on both paths, and the
sheet binds errors by `field`, so this does not change behaviour — but a consumer
must not switch on `out_of_range`.

A rejected payload persists nothing — validation runs before the single `appSettings.set`, so the results behind the sheet are unchanged (AC: "no criteria are saved / the results behind the sheet are unchanged").

## Source

- Handler: `src/main/ipc/screener.ts`
- Service: `src/main/services/screening-criteria.ts`
- Schema: `src/main/schemas.ts` (`SaveScreeningCriteriaPayloadSchema`)
- Bounds: `src/main/core/screening-criteria.ts`
