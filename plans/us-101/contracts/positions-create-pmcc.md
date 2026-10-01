# Contract: positions:create-pmcc

## Purpose

Records a new PMCC position — one position row, a `LEAPS_OPEN` BUY leg, a `SHORT_CALL_OPEN` SELL
leg and the `PMCC_OPEN` cost-basis snapshot — atomically, after validating the entry with the pure
`openPmcc` engine.

## Request

```typescript
const PmccLegPayloadSchema = z.object({
  underlying: z.string(),
  instrumentType: z.enum(['PUT', 'CALL']),
  deliverableShares: z.number(), // no .int(): rule 4 is the engine's
  strike: z.number(),
  expiration: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a valid date (YYYY-MM-DD)'),
  contracts: z.number(),
  fillPrice: z.number(), // required; message per leg, see error table
  fillDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a valid date (YYYY-MM-DD)'),
  fees: z.number()
})

export const CreatePmccPositionPayloadSchema = z.object({
  strategy: z.literal('PMCC'),
  ticker: z.string(),
  long: PmccLegPayloadSchema,
  short: PmccLegPayloadSchema,
  accountId: z.string().optional(),
  thesis: z.string().optional(),
  notes: z.string().optional()
})
```

`strategy` is redundant on a PMCC-only channel and is kept so a later
`z.discriminatedUnion('strategy', …)` can merge the create payloads without a wire change. Numeric
bounds (`contracts` integer, `deliverableShares === 100`, positive strikes and fills, non-negative
fees) are the engine's, so Zod carries none of them.

Example (the AC fixture):

```json
{
  "strategy": "PMCC",
  "ticker": "XYZ",
  "long": {
    "underlying": "XYZ",
    "instrumentType": "CALL",
    "deliverableShares": 100,
    "strike": 80,
    "expiration": "2027-09-17",
    "contracts": 1,
    "fillPrice": 25.0,
    "fillDate": "2026-09-14",
    "fees": 0
  },
  "short": {
    "underlying": "XYZ",
    "instrumentType": "CALL",
    "deliverableShares": 100,
    "strike": 110,
    "expiration": "2026-10-16",
    "contracts": 1,
    "fillPrice": 2.0,
    "fillDate": "2026-09-14",
    "fees": 0
  }
}
```

## Response (success)

```typescript
{
  ok: true,
  // Literal narrowing is in the type (data-model §5), as for OpenCcPositionResult and the roll results.
  position: PositionRecord & { strategyType: 'PMCC'; phase: 'PMCC_OPEN'; status: 'ACTIVE'; closedDate: null },
                                            // openedDate: long.fillDate
  longLeg: LegRecord & { legRole: 'LEAPS_OPEN'; action: 'BUY'; instrumentType: 'CALL'; fillPrice: string },
                                            // fees: '0.0000'
  shortLeg: LegRecord & { legRole: 'SHORT_CALL_OPEN'; action: 'SELL'; instrumentType: 'CALL'; fillPrice: string },
  costBasisSnapshot: CostBasisSnapshotRecord & { triggerEvent: 'PMCC_OPEN'; finalPnl: null },
                                            // basisPerShare: '23.0000', totalPremiumCollected: '200.0000'
  openingDebit: {
    leapsCost: '2500.0000',
    shortCredit: '200.0000',
    fees: '0.0000',
    initialNetDebit: '2300.0000',
    netDebitBeforeFees: '2300.0000',
    basisPerShare: '23.0000',
    strikeWidthPerShare: '30.0000',
    debitToWidthPercent: '76.6667'
  }
}
```

`LegRecord` gains `fees: string` (4 dp) for every handler that returns legs (`positions:get`,
`positions:create`, the roll/close handlers) — wheel legs read `'0.0000'`. The preload
`IpcCreatePmccPositionResult` mirrors the literals above (as `IpcRollCspResult` mirrors
`phase: 'CSP_OPEN'`).

## Error codes

Field paths are dotted; `handleIpcCall` now joins Zod issue paths with `.` (previously only the
first segment), which is backward-compatible for every existing single-segment path.

| field                                                | code                          | message                                                     |
| ---------------------------------------------------- | ----------------------------- | ----------------------------------------------------------- |
| `ticker`                                             | `invalid_format`              | `Ticker must be 1–5 uppercase letters`                      |
| `long.underlying` / `short.underlying`               | `underlying_mismatch`         | `Both calls must have the same underlying.`                 |
| `long.instrumentType` / `short.instrumentType`       | `not_a_call`                  | `PMCC entry requires two call options.`                     |
| `long.deliverableShares` / `short.deliverableShares` | `nonstandard_deliverable`     | `This entry supports standard 100-share contracts only.`    |
| `long.contracts` / `short.contracts`                 | `must_be_positive_integer`    | `Contracts must be a positive whole number.`                |
| `short.contracts`                                    | `quantity_mismatch`           | `Opening quantities must match for this PMCC entry.`        |
| `long.strike` / `short.strike`                       | `must_be_positive`            | `Strike must be positive`                                   |
| `long.fillPrice`                                     | `invalid_type` (Zod, missing) | `Enter the actual LEAPS fill price.`                        |
| `short.fillPrice`                                    | `invalid_type` (Zod, missing) | `Enter the actual short-call fill price.`                   |
| `long.fillPrice` / `short.fillPrice`                 | `must_be_positive`            | `Actual fill price must be greater than zero.`              |
| `long.fees` / `short.fees`                           | `must_be_non_negative`        | `Fees cannot be negative.`                                  |
| `long.fillDate` / `short.fillDate`                   | `cannot_be_future`            | `Fill date cannot be in the future.`                        |
| `short.fillDate`                                     | `long_after_short`            | `LEAPS must be acquired no later than the short-call fill.` |
| `long.expiration` / `short.expiration`               | `expiration_not_after_fill`   | `Expiration must be after the fill date.`                   |
| `long.expiration` / `short.expiration`               | `expired_contract`            | `Use an unexpired contract for opening a current position.` |
| `short.expiration`                                   | `short_not_before_long`       | `Short call must expire before the LEAPS call.`             |
| `short.strike`                                       | `strike_not_above_long`       | `Short-call strike must be above the LEAPS strike.`         |
| `__pair__`                                           | `not_net_debit`               | `This PMCC entry requires a net debit before fees.`         |
| `strategy`, `*.expiration`, `*.fillDate` (malformed) | Zod issue code                | Zod message                                                 |
| `__root__`                                           | `internal_error`              | `An unexpected error occurred`                              |

The renderer maps `internal_error` (and any non-field failure) to the recovery banner
`Could not record PMCC. Your entries are preserved. Try again.` and re-enables `Record PMCC`.

## Logging

- INFO `pmcc_position_created` `{ positionId, ticker, phase, initialNetDebit }`
- INFO `pmcc_entry_rejected` `{ ticker, field, code }` (logged in the service before rethrowing the `ValidationError`)
- DEBUG `create_pmcc_position_inputs` (validated payload), `pmcc_opening_debit_calculated` (engine result), `create_pmcc_position_tx_start` / `_committed`

## Source

- Handler: `src/main/ipc/positions.ts` (`positions:create-pmcc`, thin: Zod parse + `createPmccPosition`, wrapped in `handleIpcCall`)
- Service: `src/main/services/create-pmcc-position.ts`
- Engine: `src/main/core/lifecycle.ts` (`openPmcc`), `src/main/core/costbasis.ts` (`calculatePmccOpeningDebit`)
- Preload: `src/preload/index.ts` (`createPmccPosition`), `src/preload/index.d.ts`
- Renderer adapter: `src/renderer/src/api/positions.ts` (`createPmccPosition`), hook `src/renderer/src/hooks/useCreatePmccPosition.ts`
