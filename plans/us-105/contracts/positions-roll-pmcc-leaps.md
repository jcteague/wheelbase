# Contract: positions:roll-pmcc-leaps

## Purpose

Atomically records a PMCC LEAPS roll as a linked `ROLL_FROM` (sell-to-close CALL) / `ROLL_TO`
(buy-to-open CALL) leg pair sharing a `roll_chain_id`, and appends the `PMCC_LEAPS_ROLL` cost-basis
snapshot through US-103's writer; the position stays `PMCC_OPEN` and any open short call is untouched.

## Request

```typescript
// Zod schema: RollPmccLeapsPayloadSchema
{
  positionId: string                     // UUID — a PMCC in PMCC_OPEN phase with an open LEAPS
  proceedsPerContract: number            // positive — sell-to-close price per share of the current LEAPS
  replacementDebitPerContract: number    // positive — buy-to-open price per share of the replacement
  newExpiration: string                  // YYYY-MM-DD; must be after the open short's expiration when one is open
  newStrike?: number                     // positive; must be below the open short's strike when one is open;
                                         // defaults server-side to the open LEAPS strike
  fillDate?: string                      // YYYY-MM-DD; defaults to today
}
```

Example (the AC's roll up & out):

```json
{
  "positionId": "11111111-1111-4111-8111-111111111111",
  "proceedsPerContract": 26.0,
  "replacementDebitPerContract": 23.5,
  "newExpiration": "2028-01-21",
  "newStrike": 85,
  "fillDate": "2027-07-09"
}
```

## Response (success)

```typescript
{
  ok: true,
  position: { id: string; ticker: string; phase: 'PMCC_OPEN'; status: 'ACTIVE' },
  rollFromLeg: LegRecord & { legRole: 'ROLL_FROM'; action: 'SELL' },  // SELL CALL $80 exp 2027-09-17 @ 26.0000, fees '0.0000'
  rollToLeg:   LegRecord & { legRole: 'ROLL_TO';   action: 'BUY' },   // BUY CALL $85 exp 2028-01-21 @ 23.5000, fees '0.0000'
  rollChainId: string,                                                 // shared by both legs
  costBasisSnapshot: CostBasisSnapshotRecord & { triggerEvent: 'PMCC_LEAPS_ROLL'; finalPnl: null },
                                                                       // basisPerShare '19.3000', totalPremiumCollected '320.0000'
  ledger: PmccLedgerResult,                                            // recomputed US-103 ledger: basisTotal '1930.0000',
                                                                       // leapsCostPerShare '22.5000', effectiveShareCost '104.3000', …
  leapsRollNumber: number                                              // 1 for the first LEAPS roll on this position
}
```

## Error codes

| field                         | code                     | message                                                                                                  |
| ----------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------- |
| `__root__`                    | `not_found`              | `Position not found`                                                                                     |
| `__root__`                    | `no_active_leg`          | `Position has no active leg` (a PMCC row with no LEAPS leg — unreachable via the app)                    |
| `__phase__`                   | `invalid_phase`          | `Position is not in PMCC_OPEN phase` (also what a wheel position id gets on this channel)                |
| `proceedsPerContract`         | `must_be_positive`       | `Proceeds from close must be greater than zero`                                                          |
| `replacementDebitPerContract` | `must_be_positive`       | `Replacement debit must be greater than zero`                                                            |
| `newStrike`                   | `must_be_positive`       | `Strike must be positive`                                                                                |
| `newExpiration`               | `long_not_after_short`   | `LEAPS call must expire after the short call.` (US-102's inverse message; skipped when no short is open) |
| `newStrike`                   | `strike_not_below_short` | `LEAPS strike must be below the short-call strike ($112.00).` (skipped when no short is open)            |
| `__roll__`                    | `no_change`              | `Roll must change the strike, the expiration, or both`                                                   |
| any Zod path                  | Zod issue code           | Zod message (e.g. `newExpiration` / `invalid_format` / `Must be a valid date (YYYY-MM-DD)`)              |
| `__root__`                    | `internal_error`         | `An unexpected error occurred` (a storage failure mid-transaction; nothing is written)                   |

Rules are checked in the order listed from `__phase__` down; the first failure is returned. There is
**no** "replacement must be on or after the current expiration" error: a replacement earlier than the
current LEAPS is accepted as long as it outlasts the open short (advisory in the renderer). The Zod
`.positive()` guards fire before the engine for `0`, with Zod's own message; the engine's messages
above are what a bypass with a negative string-formatted value or an in-app form submission reports
(the renderer schema mirrors the engine text, so the trader sees the engine's wording either way).

## Source

- Handler: `src/main/ipc/positions.ts` — `registerParsedPositionHandler(db, 'positions:roll-pmcc-leaps', 'positions_roll_pmcc_leaps_unhandled_error', RollPmccLeapsPayloadSchema, rollPmccLeapsPosition)`
- Service: `src/main/services/roll-pmcc-leaps-position.ts`
- Engine: `src/main/core/lifecycle.ts#rollPmccLeaps`; `src/main/core/pmcc-rules.ts#shortExpiresBeforeLeaps`, `#shortStrikeAboveLeaps`, `#LONG_NOT_AFTER_SHORT`, `#leapsStrikeNotBelowShortMessage`
- Open legs (US-104): `src/main/services/pmcc-ledger.ts#pmccOpenLegs`
- Snapshot writer (US-103): `src/main/services/pmcc-ledger.ts#appendPmccSnapshot`
- Preload: `src/preload/index.ts` → `rollPmccLeaps(payload)`; `src/preload/index.d.ts` → `IpcRollPmccLeapsResult`
- Renderer adapter: `src/renderer/src/api/positions.ts#rollPmccLeaps`
