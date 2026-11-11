# Data Model: US-109 — PMCC leg timeline

No table, column or migration changes. Everything here is derived from `legs` at read time.

## 1. Engine input

File: `src/main/core/pmcc-timeline.ts`.

| Entity              | Fields                                                         | Notes                                                  |
| ------------------- | -------------------------------------------------------------- | ------------------------------------------------------ |
| `ContractRef`       | `strike`, `expiration`                                         | 4-dp money string, `YYYY-MM-DD`                        |
| `Fill`              | `ContractRef` + `pricePerShare`                                | 4-dp money string                                      |
| `PmccTimelineEvent` | `kind`, `date`, `seq`, `contracts`, plus per-kind fields below | `seq` is the ledger's fill-date-then-`createdAt` index |
| `PmccTimelineInput` | `events`, `valuationDate`, `closedDate: string \| null`        |                                                        |

Per-kind fields:

| `kind`        | Extra fields                                                                                                             | Built from                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `LEAPS_OPEN`  | `contract: Fill`, `contribution`                                                                                         | `LEAPS_OPEN` leg                                                                               |
| `LEAPS_ROLL`  | `from: Fill`, `to: Fill`, `closedOn`, `openedOn`, `contribution`                                                         | roll chain where `isShortCallRoll` is false                                                    |
| `LEAPS_CLOSE` | `contract: Fill`, `contribution`                                                                                         | `LEAPS_CLOSE` leg                                                                              |
| `SHORT_OPEN`  | `contract: Fill`, `contribution`                                                                                         | `SHORT_CALL_OPEN` leg                                                                          |
| `SHORT_ROLL`  | `from: Fill`, `to: Fill`, `contribution`                                                                                 | roll chain where `isShortCallRoll` is true                                                     |
| `SHORT_END`   | `outcome: 'EXPIRED' \| 'CLOSED' \| 'ASSIGNED'`, `contract: ContractRef`, `pricePerShare: string \| null`, `contribution` | `SHORT_CALL_EXPIRED` / `SHORT_CALL_CLOSE` / `SHORT_CALL_ASSIGNED` leg; price only for `CLOSED` |
| `UNKNOWN`     | `role: string`                                                                                                           | any other role, or an unpaired roll leg; no contribution                                       |

`contribution` is the `PmccContribution` (`side`, `cashPerShare`, `contracts`, `fees`) the US-103
ledger assigns that event.

## 2. Engine output

`PmccTimeline`:

| Field            | Type                  | Rule                                               |
| ---------------- | --------------------- | -------------------------------------------------- |
| `leapsContracts` | number                | contracts of the last `LEAPS_OPEN` or `LEAPS_ROLL` |
| `start`          | date                  | date of the first LEAPS event                      |
| `windowEnd`      | date                  | `closedDate ?? valuationDate`                      |
| `valuationDate`  | date                  | as given                                           |
| `closedDate`     | date or null          | as given                                           |
| `leapsTrack`     | `PmccLeapsTrack`      | below                                              |
| `cycles`         | `PmccCycle[]`         | oldest first, numbered from 1                      |
| `gaps`           | `PmccGap[]`           | oldest first                                       |
| `summary`        | `PmccTimelineSummary` | below                                              |

`PmccLeapsTrack`: `current: ContractRef` (the LEAPS held now, or last held), `costPerShare`
(ledger `leapsCostPerShare`), `rows: PmccLeapsRow[]`.

`PmccLeapsRow`, by `kind`:

| `kind`     | Fields                                                                        |
| ---------- | ----------------------------------------------------------------------------- |
| `PURCHASE` | `date`, `contract: Fill`, `total`, `dteAtFill`, `basisAfter`                  |
| `ROLL`     | `number`, `date`, `from`, `to`, `net: PmccNet`, `coverage`, `basisAfter`      |
| `CLOSE`    | `date`, `contract: Fill`, `total` (no basis: the terminal figure is US-120's) |
| `UNKNOWN`  | `date`, `role`                                                                |

`coverage` on a roll: `{ unbroken: true; extensionDays }` when `openedOn <= closedOn`, else
`{ unbroken: false; gapDays; extensionDays }`. `extensionDays` is old expiration to new
expiration; `gapDays` is `closedOn` to `openedOn`.

`PmccNet`: `direction: 'credit' | 'debit' | 'even'`, `perShare`, `total` (both unsigned).

`PmccCycle`:

| Field                       | Rule                                                                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `number`                    | 1-based, one per `SHORT_OPEN`; a roll never starts a cycle                                                           |
| `openedOn`, `opening: Fill` | the `SHORT_OPEN`                                                                                                     |
| `current: ContractRef`      | the last roll's `to`, else the opening contract                                                                      |
| `dteAtOpen`                 | `openedOn` to the opening expiration                                                                                 |
| `rollCount`                 | `SHORT_ROLL` events in the cycle                                                                                     |
| `netPerShare`, `netTotal`   | signed; negated sum of the cycle's contribution dollars; per share divides by `100 × leapsContracts`                 |
| `basisAfter`                | ledger basis after the cycle's last event in timeline order                                                          |
| `flag`                      | `{ daysPastLeaps, leapsExpiration }` when `current.expiration` is after `leapsTrack.current.expiration`, else `null` |
| `rows: PmccCycleRow[]`      | in timeline order                                                                                                    |
| status                      | `{ status: 'OPEN'; daysSoFar; dteRemaining }` or `{ status: 'ENDED'; outcome; endedOn; daysHeld }`                   |

`PmccCycleRow`, by `kind`: `OPEN` (`date`, `contract: Fill`, `total`, `fees`), `ROLL`
(`number` within the cycle, `date`, `from`, `to`, `net: PmccNet`), `UNKNOWN` (`date`, `role`),
`END` (`date`, `outcome`, `contract`, `pricePerShare`, `total`; the last two null unless
`CLOSED`).

Every row built from a known event (all but `UNKNOWN`) also carries `fees`, that event's fees in
4-dp dollars, so the renderer can show them when non-zero.

`PmccGap`: `afterCycle: number | null`, `beforeCycle: number | null`, `from`, `to`, `days`.

| Gap          | When                                                         |
| ------------ | ------------------------------------------------------------ |
| Leading      | `start` is before the first cycle's `openedOn`               |
| Between      | cycle N ended before cycle N+1 opened                        |
| Trailing     | no cycle is open and the last cycle ended before `windowEnd` |
| Whole window | there are no cycles (`start` to `windowEnd`)                 |

`PmccTimelineSummary`:

| Field                                                        | Rule                                                              |
| ------------------------------------------------------------ | ----------------------------------------------------------------- |
| `cycleCount`, `closedCount`, `openCount`                     |                                                                   |
| `realizedPerShare`, `realizedTotal`                          | sum of ended cycles' nets                                         |
| `averagePerShare`, `averageTotal`                            | realized ÷ `closedCount`; `null` when `closedCount` is 0          |
| `openCreditPerShare`                                         | sum of open cycles' nets; `null` when none is open                |
| `leapsRollNetPerShare`                                       | signed sum of LEAPS roll nets; `null` when there is no LEAPS roll |
| `totalDays`, `uncoveredDays`, `coveredDays`                  | `start` to `windowEnd`; sum of gap days; the difference           |
| `shortCreditsPerShare`, `leapsCostPerShare`, `basisPerShare` | from `calculatePmccLedger` over every contribution                |

## 3. Validation rules from the acceptance criteria

- A roll extends its cycle. Cycle count equals the number of `SHORT_OPEN` events.
- An open cycle is never counted in `realized`.
- `UNKNOWN` rows change no total.
- All day counts are whole calendar days between two `YYYY-MM-DD` values
  (`differenceInCalendarDays(parseISO(b), parseISO(a))`).
- Money is `decimal.js`, `ROUND_HALF_UP`, 4-dp strings; rounding to 2 dp happens in the
  renderer only.

## 4. Renderer display model

File: `src/renderer/src/lib/pmcc-timeline-display.ts`. Pure string builders over `PmccTimeline`,
one per piece of AC copy (drawer meta, track header, cycles header, cycle header, net label,
coverage cell, gap row, flag, summary stats, reconciliation line). No arithmetic beyond
formatting.

## 5. Reference fixture (the story's Background)

`src/main/core/test-fixtures/pmcc-timeline-events.ts` holds the XYZ history as plain literals.
1 contract, fees `$0.00`, valuation date 2027-08-13.

| Event           | Date                    | Detail                                         | Basis after |
| --------------- | ----------------------- | ---------------------------------------------- | ----------- |
| LEAPS bought    | 2026-09-14              | $80 · 2027-09-17 @ 25.00                       | 25.00       |
| Cycle 1 sold    | 2026-09-14              | $110 · 2026-10-16 @ 2.00                       | 23.00       |
| Cycle 1 expired | 2026-10-16              |                                                | 23.00       |
| Cycle 2 sold    | 2026-10-23              | $108 · 2026-11-20 @ 1.80                       | 21.20       |
| Cycle 2 roll    | 2026-11-06              | buy 3.00, sell $112 · 2026-12-18 @ 2.40        | 21.80       |
| Cycle 2 expired | 2026-12-18              |                                                | 21.80       |
| Cycle 3         | 2027-01-04 → 2027-02-05 | $112 @ 1.70, expired                           | 20.10       |
| Cycle 4         | 2027-02-08 → 2027-03-12 | $114 @ 1.55, expired                           | 18.55       |
| Cycle 5         | 2027-03-15 → 2027-04-02 | $114 · 2027-04-16 @ 2.20, bought back 0.55     | 16.90       |
| Cycle 6         | 2027-04-05 → 2027-05-07 | $116 @ 1.75, expired                           | 15.15       |
| Cycle 7         | 2027-05-07 → 2027-06-18 | $116 @ 1.75, expired                           | 13.40       |
| Cycle 8 sold    | 2027-06-22              | $112 · 2027-07-16 @ 2.40                       | 11.00       |
| LEAPS roll #1   | 2027-07-09              | sell $80 @ 26.00, buy $85 · 2028-01-21 @ 23.50 | 8.50        |
| Cycle 8 expired | 2027-07-16              |                                                | 8.50        |
| Cycle 9 sold    | 2027-07-23              | $118 · 2027-08-20 @ 1.95, open                 | 6.55        |

Gaps: 7, 17, 3, 3, 3, 0, 4, 7 days = 44 uncovered of 333; 289 covered.

## Type Design

All new types are in `src/main/core/pmcc-timeline.ts` unless noted.

| Type                                                               | Construct                                                                                                   | What it buys                                                                                                                                    |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `PmccTimelineEvent`                                                | Discriminated union on `kind`                                                                               | An `UNKNOWN` event cannot carry a contribution, and a roll cannot lack its `from`/`to`; the engine's `switch` is exhaustive                     |
| `PmccShortOutcome`                                                 | String-literal union `'EXPIRED' \| 'CLOSED' \| 'ASSIGNED'`                                                  | One list shared by the event, the cycle and the row                                                                                             |
| `PmccCycle`                                                        | Intersection of a common shape with a union on `status`                                                     | An open cycle has `dteRemaining` and no outcome; an ended cycle has an outcome and `endedOn`; "open with a terminal outcome" is unrepresentable |
| `PmccLeapsRow`, `PmccCycleRow`                                     | Discriminated unions on `kind`                                                                              | A `CLOSE` row has no `basisAfter`; an `END` row's price is only meaningful for `CLOSED`                                                         |
| Roll `coverage`                                                    | Union on `unbroken`                                                                                         | `gapDays` exists only when coverage broke                                                                                                       |
| `PmccNet`                                                          | Plain object                                                                                                | —                                                                                                                                               |
| `PmccTimeline`, `PmccLeapsTrack`, `PmccGap`, `PmccTimelineSummary` | Plain object types                                                                                          | Plain types — no advanced constructs needed                                                                                                     |
| `GetPositionResult.pmccTimeline` (`src/main/schemas.ts`)           | `PmccTimeline \| null` imported from core                                                                   | The IPC response type is the engine's type, not a copy                                                                                          |
| `TestPmccSeedPositionPayload` (`src/main/schemas.ts`)              | `z.infer` of `TestPmccSeedPositionPayloadSchema`, which reuses `TestLegRowSchema`                           | The seam's leg shape cannot drift from the existing leg-event seam                                                                              |
| Renderer props                                                     | `Pick`-derived slices of `PmccTimeline` (e.g. `PmccCycleGroup` takes one `PmccCycle` plus `leapsContracts`) | Components cannot reach totals they should not render                                                                                           |
