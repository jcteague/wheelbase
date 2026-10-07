# Contract: positions:roll-pmcc-short

## Purpose

Atomically records a PMCC short-call roll as a linked `ROLL_FROM` (buy-to-close CALL) / `ROLL_TO`
(sell-to-open CALL) leg pair sharing a `roll_chain_id`, and appends the `PMCC_SHORT_ROLL` cost-basis
snapshot through US-103's writer; the position stays `PMCC_OPEN`.

## Request

```typescript
// Zod schema: RollPmccShortCallPayloadSchema (= the shared RollPayloadBaseSchema)
{
  positionId: string                 // UUID — a PMCC in PMCC_OPEN phase with an open short call
  costToClosePerContract: number     // positive — buy-to-close price per share
  newPremiumPerContract: number      // positive — sell-to-open price per share
  newExpiration: string              // YYYY-MM-DD; current short exp ≤ newExpiration < LEAPS exp
  newStrike?: number                 // positive; defaults server-side to the open short's strike
  fillDate?: string                  // YYYY-MM-DD; defaults to today
}
```

Example (the AC's roll up & out):

```json
{
  "positionId": "11111111-1111-4111-8111-111111111111",
  "costToClosePerContract": 3.0,
  "newPremiumPerContract": 2.4,
  "newExpiration": "2026-12-18",
  "newStrike": 112,
  "fillDate": "2026-11-06"
}
```

## Response (success)

```typescript
{
  ok: true,
  position: { id: string; ticker: string; phase: 'PMCC_OPEN'; status: 'ACTIVE' },
  rollFromLeg: LegRecord & { legRole: 'ROLL_FROM'; action: 'BUY' },   // BUY CALL $108 exp 2026-11-20 @ 3.0000, fees '0.0000'
  rollToLeg:   LegRecord & { legRole: 'ROLL_TO';   action: 'SELL' },  // SELL CALL $112 exp 2026-12-18 @ 2.4000, fees '0.0000'
  rollChainId: string,                                                 // shared by both legs
  costBasisSnapshot: CostBasisSnapshotRecord & { triggerEvent: 'PMCC_SHORT_ROLL'; finalPnl: null },
                                                                       // basisPerShare '21.8000', totalPremiumCollected '320.0000'
  ledger: PmccLedgerResult,                                            // the recomputed US-103 ledger (basisTotal '2180.0000', effectiveShareCost '101.8000', …)
  shortCallRollNumber: number                                          // 1 for the first short-call roll on this position
}
```

## Error codes

| field                    | code                          | message                                                                                     |
| ------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------- |
| `__root__`               | `not_found`                   | `Position not found`                                                                        |
| `__root__`               | `no_active_leg`               | `Position has no active leg` (a PMCC row with no LEAPS leg — unreachable via the app)       |
| `__phase__`              | `invalid_phase`               | `Position is not in PMCC_OPEN phase` (also what a wheel position id gets on this channel)   |
| `__root__`               | `no_open_short_call`          | `This PMCC has no open short call to roll.`                                                 |
| `costToClosePerContract` | `must_be_positive`            | `Cost to close must be greater than zero`                                                   |
| `newPremiumPerContract`  | `must_be_positive`            | `Replacement premium must be greater than zero`                                             |
| `newStrike`              | `must_be_positive`            | `Strike must be positive`                                                                   |
| `newExpiration`          | `short_not_before_long`       | `Short call must expire before the LEAPS call.` (US-102's shared constant)                  |
| `newExpiration`          | `must_be_on_or_after_current` | `Replacement expiration must be on or after the current expiration (Nov 20, 2026)`          |
| `__roll__`               | `no_change`                   | `Roll must change the strike, the expiration, or both`                                      |
| any Zod path             | Zod issue code                | Zod message (e.g. `newExpiration` / `invalid_format` / `Must be a valid date (YYYY-MM-DD)`) |
| `__root__`               | `internal_error`              | `An unexpected error occurred` (a storage failure mid-transaction; nothing is written)      |

Rules are checked in the order listed from `__phase__` down; the first failure is returned. The
`costToClosePerContract` and `newPremiumPerContract` Zod `.positive()` guards fire before the engine
for `0`, with Zod's own message; the engine's messages above are what a bypass with a negative
string-formatted value or an in-app form submission reports (the renderer schema mirrors the engine
text, so the trader sees the engine's wording either way).

## Source

- Handler: `src/main/ipc/positions.ts` — `registerParsedPositionHandler(db, 'positions:roll-pmcc-short', 'positions_roll_pmcc_short_unhandled_error', RollPmccShortCallPayloadSchema, rollPmccShortCallPosition)`
- Service: `src/main/services/roll-pmcc-short-call-position.ts`
- Engine: `src/main/core/lifecycle.ts#rollPmccShortCall`, `src/main/core/pmcc-rules.ts#shortExpiresBeforeLeaps`
- Snapshot writer (US-103): `src/main/services/pmcc-ledger.ts#appendPmccSnapshot`
- Preload: `src/preload/index.ts` → `rollPmccShortCall(payload)`; `src/preload/index.d.ts` → `IpcRollPmccShortCallResult`
- Renderer adapter: `src/renderer/src/api/positions.ts#rollPmccShortCall`
