# Data Model: US-109 — PMCC leg timeline

No table, column or migration changes. Everything here is derived from `legs` at read time.

## 1. Engine input

File: `src/main/core/pmcc-timeline.ts`.

| Entity              | Fields                                                         | Notes                                                                                        |
| ------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `ContractRef`       | `strike`, `expiration`                                         | 4-dp money string, `YYYY-MM-DD`                                                              |
| `Fill`              | `ContractRef` + `pricePerShare`                                | 4-dp money string                                                                            |
| `PmccTimelineEvent` | `kind`, `date`, `seq`, `contracts`, plus per-kind fields below | `seq` is the ledger's fill-date-then-`createdAt` index; a `LEAPS_ROLL` has no `date` (below) |
| `PmccTimelineInput` | `events`, `valuationDate`, `closedDate: string \| null`        |                                                                                              |

Per-kind fields:

| `kind`        | Extra fields                                                                                                                                                               | Built from                                                                                                                       |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `LEAPS_OPEN`  | `contract: Fill`, `contribution`                                                                                                                                           | `LEAPS_OPEN` leg                                                                                                                 |
| `LEAPS_ROLL`  | `from: Fill`, `to: Fill`, `closedOn`, `openedOn`, `contribution`; **no `date`**                                                                                            | roll chain where `isShortCallRoll` is false; the engine dates it by the earlier of `closedOn` / `openedOn` (`timelineEventDate`) |
| `LEAPS_CLOSE` | `contract: Fill`, `contribution`                                                                                                                                           | `LEAPS_CLOSE` leg                                                                                                                |
| `SHORT_OPEN`  | `contract: Fill`, `contribution`                                                                                                                                           | `SHORT_CALL_OPEN` leg                                                                                                            |
| `SHORT_ROLL`  | `from: Fill`, `to: Fill`, `contribution`                                                                                                                                   | roll chain where `isShortCallRoll` is true                                                                                       |
| `SHORT_END`   | `contract: ContractRef`, `contribution`, and `PmccShortEnd`: `{ outcome: 'CLOSED'; pricePerShare: string }` or `{ outcome: 'EXPIRED' \| 'ASSIGNED'; pricePerShare: null }` | `SHORT_CALL_EXPIRED` / `SHORT_CALL_CLOSE` / `SHORT_CALL_ASSIGNED` leg; a close always has its price, the others never do         |
| `UNKNOWN`     | `role: string`                                                                                                                                                             | any other role, or an unpaired roll leg; no contribution                                                                         |

`contribution` is the `PmccContribution` (`side`, `cashPerShare`, `contracts`, `fees`) the US-103
ledger assigns that event.

`buildPmccTimeline(input): PmccTimeline | null` — null when the events hold no `LEAPS_OPEN` or
`LEAPS_ROLL`; the engine is the one owner of that check.

## 2. Engine output

`PmccTimeline`:

| Field           | Type                  | Rule                                                |
| --------------- | --------------------- | --------------------------------------------------- |
| `start`         | date                  | date of the first LEAPS event                       |
| `windowEnd`     | date                  | `closedDate ?? valuationDate`, never before `start` |
| `valuationDate` | date                  | as given                                            |
| `closedDate`    | date or null          | as given                                            |
| `leapsTrack`    | `PmccLeapsTrack`      | below                                               |
| `cycles`        | `PmccCycle[]`         | oldest first, numbered from 1                       |
| `gaps`          | `PmccGap[]`           | oldest first                                        |
| `summary`       | `PmccTimelineSummary` | below                                               |

Per-share figures divide by the shares of the LEAPS held now (contracts of the last `LEAPS_OPEN`
or `LEAPS_ROLL`, × 100); the count itself is not an output.

`PmccLeapsTrack`: `current: ContractRef` (the LEAPS held now, or last held), `costPerShare`
(ledger `leapsCostPerShare`), `rows: PmccLeapsRow[]`.

`PmccLeapsRow`, by `kind`:

| `kind`     | Fields                                                                        |
| ---------- | ----------------------------------------------------------------------------- |
| `PURCHASE` | `date`, `contract: Fill`, `total`, `dteAtFill`, `basisAfter`                  |
| `ROLL`     | `number`, `date`, `from`, `to`, `net: PmccNet`, `coverage`, `basisAfter`      |
| `CLOSE`    | `date`, `contract: Fill`, `total` (no basis: the terminal figure is US-120's) |
| `UNKNOWN`  | `date`, `role`                                                                |

A LEAPS-track `UNKNOWN` row is either an `UNKNOWN` event dated outside every open cycle, or a
`SHORT_ROLL` / `SHORT_END` no cycle takes, with `role` set to that event's kind. **Only an open
cycle takes a short roll or end**, chosen in this order:

1. the latest **open** cycle whose `current` contract it gives up;
2. else, if an **ended** cycle held that contract at any point — its last, its opening one or
   one it rolled through — the event is a duplicate and no cycle's;
3. else (no cycle holds that contract) the latest cycle **while it is open**; no cycle yet, or
   the latest cycle already ended, and it is no cycle's.

An ended cycle is therefore never re-ended or re-rolled: its `endedOn`, `daysHeld`, outcome, net,
rows and the gap after it stay put, and a duplicate does not land on an unrelated open cycle
either. The same contract closed and sold again later (or the same day) still routes to the new,
open cycle. An unattributed event's dollars are not dropped: they are carried in
`summary.unattributedShortPerShare`.

`coverage` on a roll: `{ unbroken: true; extensionDays }` when `openedOn <= closedOn`, else
`{ unbroken: false; gapDays; extensionDays }`. `extensionDays` is old expiration to new
expiration; `gapDays` is `closedOn` to `openedOn`.

`PmccNet`: `direction: 'credit' | 'debit' | 'even'`, `perShare`, `total` (both unsigned).

`PmccCycle`:

| Field                       | Rule                                                                                                                                                                                                                                                                                    |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `number`                    | 1-based, one per `SHORT_OPEN`; a roll never starts a cycle                                                                                                                                                                                                                              |
| `openedOn`, `opening: Fill` | the `SHORT_OPEN`                                                                                                                                                                                                                                                                        |
| `current: ContractRef`      | the last roll's `to`, else the opening contract                                                                                                                                                                                                                                         |
| `dteAtOpen`                 | `openedOn` to the opening expiration                                                                                                                                                                                                                                                    |
| `rollCount`                 | `SHORT_ROLL` events in the cycle                                                                                                                                                                                                                                                        |
| `netPerShare`, `netTotal`   | signed; negated sum of the cycle's contribution dollars; per share divides by `100 × leapsContracts`                                                                                                                                                                                    |
| `basisAfter`                | ledger basis after the cycle's last known event in timeline order; an `UNKNOWN` row never moves it                                                                                                                                                                                      |
| `flag`                      | `{ daysPastLeaps, leapsExpiration }` when the cycle's coverage ran or will run past `leapsTrack.current.expiration` — `OPEN` / `UNRECORDED`: `current.expiration` is after it; `ENDED`: `endedOn` is after it — with `daysPastLeaps` from the LEAPS expiration to that day; else `null` |
| `rows: PmccCycleRow[]`      | in timeline order                                                                                                                                                                                                                                                                       |
| status                      | `{ status: 'OPEN'; daysSoFar; dteRemaining }`, `{ status: 'UNRECORDED'; expiredOn; daysHeld }` or `{ status: 'ENDED'; outcome; endedOn; daysHeld }` (below)                                                                                                                             |

**Status.** A cycle with a terminal event (`SHORT_END`) is `ENDED`: `daysHeld` is `openedOn` to
`endedOn`. A cycle with none is measured at the **reference date** `windowEnd` (`closedDate ??
valuationDate`, never before `start`) — not the raw valuation date, so a closed position's stale
cycle stops counting at its close:

- `OPEN` while `current.expiration` is on or after `windowEnd`: `dteRemaining` is `windowEnd` to
  `current.expiration` (≥ 0; 0 on the expiration day itself) and `daysSoFar` is `openedOn` to
  `windowEnd`. A cycle sold after `windowEnd` (a local fill date ahead of New York's) is measured
  from its sale instead: `daysSoFar` 0 and `dteRemaining` = `dteAtOpen`, never more.
- `UNRECORDED` once `current.expiration` is strictly before `windowEnd`: the short has expired,
  been assigned or been bought back and the journal cannot know which until it is recorded.
  `expiredOn` is `current.expiration` and `daysHeld` is `openedOn` to `expiredOn`. It has no
  `dteRemaining` and no `outcome`, so "open with negative DTE" is unrepresentable.

The status is derived when the cycle is finalised, not during the fold: an `UNRECORDED` cycle has
no terminal event, so a later `SHORT_END` or `SHORT_ROLL` for its contract still attaches to it
(recording the expiration turns it `ENDED`/`EXPIRED` with the same `daysHeld` and gap).

`PmccCycleRow`, by `kind`: `OPEN` (`date`, `contract: Fill`, `total`, `fees`), `ROLL`
(`number` within the cycle, `date`, `from`, `to`, `net: PmccNet`), `UNKNOWN` (`date`, `role`),
`END` (`date`, `contract`, `fees`, and `PmccEndCash`: `{ outcome: 'CLOSED'; pricePerShare: string;
total: string }` or `{ outcome: 'EXPIRED' | 'ASSIGNED'; pricePerShare: null; total: null }`).

Every row built from a known event (all but `UNKNOWN`) also carries `fees`, that event's fees in
4-dp dollars, so the renderer can show them when non-zero.

`PmccGap`, a union on `kind`, each with `from`, `to` (exclusive) and `days`:
`{ kind: 'LEADING'; beforeCycle }`, `{ kind: 'BETWEEN'; afterCycle; beforeCycle }`,
`{ kind: 'TRAILING'; afterCycle }`, `{ kind: 'WHOLE_WINDOW' }`.

A cycle covers from `openedOn` until its coverage end — `endedOn` when `ENDED`, `expiredOn`
when `UNRECORDED` — and runs on to `windowEnd` while `OPEN`; both ends are capped at
`windowEnd`. Neither precedes `start`: a PMCC's short is never sold before its first LEAPS fill
(`long_after_short` on open, `close_date_before_open` on a roll). The gaps are the window's days **no** cycle covers: the complement of the
union of the cycles' coverage, so cycles that overlap (one sold before the previous ended) are
counted once and every gap lies inside the window. No gap is empty. Walking the cycles in sale
order, a gap's `afterCycle` is the cycle that covered furthest before it (the later one on a
tie) and its `beforeCycle` the cycle sold at its end.

| Gap            | When                                                                                    |
| -------------- | --------------------------------------------------------------------------------------- |
| `LEADING`      | the first cycle was sold after `start` (or on or after `windowEnd`: the gap ends there) |
| `BETWEEN`      | every cycle sold so far stopped covering before the next cycle was sold                 |
| `TRAILING`     | no cycle covers at `windowEnd`: the one that covered furthest stopped before it         |
| `WHOLE_WINDOW` | no cycle was ever sold (`start` to `windowEnd`)                                         |

Background valued 2027-08-24 with cycle 9 unrecorded: trailing gap
`{ kind: 'TRAILING', afterCycle: 9, from: '2027-08-20', to: '2027-08-24', days: 4 }`; 296 of 344
days covered, 48 uncovered — the same coverage as when cycle 9's assignment or expiration is
recorded. Valued on 2027-08-20 itself, cycle 9 is `OPEN` with `dteRemaining` 0 and there is no
trailing gap (296 of 340, 44 uncovered).

Window-end and overlap examples: LEAPS bought 2027-06-01, short sold 2027-06-06, valued
2027-06-05 → one `LEADING` gap `2027-06-01 → 2027-06-05`, 4 days; `uncoveredDays` 4,
`coveredDays` 0. XYZ LEAPS with cycle 1 ($120 · 2027-03-19, sold 2027-01-04) open and cycle 2
($115, sold 2027-01-10) expired 2027-01-29, valued 2027-02-10 → only the 112-day leading gap;
37 of 149 days covered.

`PmccTimelineSummary`:

| Field                                                        | Rule                                                                                                                                                        |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cycleCount`, `closedCount`                                  | `closedCount` is `ENDED` cycles                                                                                                                             |
| `open: { count; creditPerShare } \| null`                    | the `OPEN` and `UNRECORDED` cycles and the sum of their nets (an unrecorded credit is not realized); `null` when there is none — both figures or neither    |
| `realizedPerShare`, `realizedTotal`                          | sum of ended cycles' nets                                                                                                                                   |
| `average: { perShare; total } \| null`                       | realized ÷ `closedCount`, per share and in dollars; `null` when `closedCount` is 0 — both figures or neither                                                |
| `leapsRollNetPerShare`                                       | signed sum of LEAPS roll nets; `null` when there is no LEAPS roll                                                                                           |
| `unattributedShortPerShare`                                  | signed sum (credit positive) of the `SHORT_ROLL` / `SHORT_END` events no cycle takes (above), summed in dollars and divided once; `null` when there is none |
| `totalDays`, `uncoveredDays`, `coveredDays`                  | `start` to `windowEnd`; sum of gap days; the difference — `0 ≤ coveredDays ≤ totalDays`                                                                     |
| `shortCreditsPerShare`, `leapsCostPerShare`, `basisPerShare` | from `calculatePmccLedger` over every contribution                                                                                                          |

Realized + open + unattributed = `shortCreditsPerShare` (exact in dollars). The reconciliation
line adds `+ unattributed $X` only when `unattributedShortPerShare` is non-null; otherwise it is
unchanged. A negative amount in that line reads with the U+2212 minus (`−$0.61`), like the rest
of the section.

A valuation date before the first LEAPS fill (the user's local date ahead of New York's) gives
an empty window, not a negative one: `windowEnd` is `start`, `totalDays` 0, and an open cycle's
`daysSoFar` is 0.

## 3. Validation rules from the acceptance criteria

- A roll extends its cycle. Cycle count equals the number of `SHORT_OPEN` events.
- An open cycle is never counted in `realized`, nor is a cycle past its expiration with no
  recorded outcome: it counts as open until its outcome is recorded.
- `UNKNOWN` rows change no figure: no total, no summary field and no cycle footer.
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

| Type                                                          | Construct                                                                                                                                                             | What it buys                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PmccTimelineEvent`                                           | Discriminated union on `kind`                                                                                                                                         | An `UNKNOWN` event cannot carry a contribution, and a roll cannot lack its `from`/`to`; the engine's `switch` is exhaustive                                                                                                                                                 |
| `PmccShortOutcome`                                            | String-literal union `'EXPIRED' \| 'CLOSED' \| 'ASSIGNED'`                                                                                                            | One list shared by the event, the cycle and the row                                                                                                                                                                                                                         |
| `SHORT_END` event (`PmccShortEnd`), `END` row (`PmccEndCash`) | Nested union on `outcome`; `PmccEndCash` is derived from `PmccShortEnd` by a distributive conditional type (each outcome plus a `total` typed as its `pricePerShare`) | A close always carries its buyback price (and the row its total); an expiry or assignment cannot carry one, so "closed with no price" and "expired with a price" do not type-check, the renderer needs no fallback for them, and the event and the row cannot drift         |
| `LEAPS_ROLL` event                                            | No `date` field; `timelineEventDate` derives it                                                                                                                       | A roll dated other than the earlier of its two fills is unrepresentable                                                                                                                                                                                                     |
| `PmccGap`                                                     | Discriminated union on `kind` (`LEADING` / `BETWEEN` / `TRAILING` / `WHOLE_WINDOW`)                                                                                   | Each kind has exactly the neighbours it renders; "a gap after nothing and before nothing" exists only as `WHOLE_WINDOW`                                                                                                                                                     |
| `PmccCycle`                                                   | Intersection of a common shape with a union on `status` (`OPEN` / `UNRECORDED` / `ENDED`)                                                                             | An open cycle has `dteRemaining` and no outcome; an unrecorded cycle has `expiredOn` and `daysHeld` but neither `dteRemaining` nor an outcome; an ended cycle has an outcome and `endedOn`; "open with a terminal outcome" and "open with negative DTE" are unrepresentable |
| `PmccLeapsRow`, `PmccCycleRow`                                | Discriminated unions on `kind`                                                                                                                                        | A `CLOSE` row has no `basisAfter`; an `END` row narrows further on `outcome` (above)                                                                                                                                                                                        |
| Roll `coverage`                                               | Union on `unbroken`                                                                                                                                                   | `gapDays` exists only when coverage broke                                                                                                                                                                                                                                   |
| `PmccNet`                                                     | Plain object                                                                                                                                                          | —                                                                                                                                                                                                                                                                           |
| `PmccTimeline`, `PmccLeapsTrack`, `PmccTimelineSummary`       | Plain object types                                                                                                                                                    | Plain types — no advanced constructs needed                                                                                                                                                                                                                                 |
| `PmccTimelineSummary.average`, `.open`                        | `{ perShare; total } \| null`, `{ count; creditPerShare } \| null`                                                                                                    | Each pair exists together or not at all; "per share but no total" or "a count but no credit" does not type-check, so the renderer needs one null check                                                                                                                      |
| `PositionDetailResult.pmccTimeline` (`src/main/schemas.ts`)   | `GetPositionResult` + `pmccTimeline: PmccTimeline \| null` imported from core                                                                                         | The `positions:get` response type is the engine's type, not a copy; `GetPositionResult`, which the write services share, has no timeline                                                                                                                                    |
| `TestPmccSeedPositionPayload` (`src/main/schemas.ts`)         | `z.infer` of `TestPmccSeedPositionPayloadSchema`, which reuses `TestLegRowSchema`                                                                                     | The seam's leg shape cannot drift from the existing leg-event seam                                                                                                                                                                                                          |
| Renderer props                                                | `Pick`-derived slices of `PmccTimeline` (e.g. `PmccCycleGroup` takes one `PmccCycle`)                                                                                 | Components cannot reach totals they should not render                                                                                                                                                                                                                       |
