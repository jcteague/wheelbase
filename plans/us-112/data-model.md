# Data Model: US-112 — IVR on the PMCC position card

No schema change, no migration. This story adds one field to an existing IPC projection and a
pure renderer module. Fixture numbers at the bottom are the ones the Linear scenarios and the
mockup use.

## 1. `PositionListItem` (amended) — `src/main/schemas.ts`

```ts
export interface PositionListItem {
  // …every existing field unchanged…
  /** [US-112] Freshness-assessed IV rank of the underlying, joined once per ticker.
   *  `null` → never collected, unreadable, or the IVR read failed for this list call.
   *  Carried on every item; only the PMCC card renders it until US-88. */
  ivRank: AssessedIvRank | null
}
```

`AssessedIvRank` is the existing type in `src/main/core/ivr-freshness.ts`:

```ts
{
  value: string
  observedAt: string
  ageTradingDays: number
  state: IvRankState
}
// US-121 amends this to { value: string | null; percentile; low; high; … } — the field passes
// through unchanged; this story does not touch the shape.
```

Mirrors: `IpcPositionListItem.ivRank: IpcIvRank | null` in `src/preload/index.d.ts` (the `IpcIvRank`
interface already exists at line ~405); `PositionListItem.ivRank: ScreenerIvRank | null` in
`src/renderer/src/api/positions.ts` (the renderer's existing mirror type in `api/screener.ts`).

## 2. `listPositions` options — `src/main/services/list-positions.ts`

```ts
export type ListPositionsOptions = { now?: Date } // default new Date(); tests pin it
export function listPositions(db, options: ListPositionsOptions = {}): PositionListItem[]
```

Read path, in order, all synchronous:

1. `LIST_QUERY` rows (unchanged).
2. `tickers = [...new Set(rows.map(r => r.ticker))]`.
3. `readIvrOrEmpty(db, tickers, now)`:
   - `calendar = readTradingCalendar(db, now)`
   - `lastEarnings = readLastEarningsFromStore(db, tickers)` (new, §3)
   - `getAssessedIvrByUnderlying(db, tickers, { now, calendar, lastEarnings })`
   - any throw → `logger.warn({ err, tickers }, 'positions_ivr_read_failed')` → `new Map()`
4. Each item gets `ivRank: ivrByTicker.get(row.ticker.toUpperCase()) ?? null`.

Sort order unchanged.

## 3. `readLastEarningsFromStore` (new export) — `src/main/services/earnings-dates.ts`

```ts
/** Store-only projection of each ticker's last known print. Never fetches. A ticker with
 *  no row → `undefined` (unknown), which the freshness engine treats as "no known print". */
export function readLastEarningsFromStore(
  db: Database.Database,
  tickers: string[]
): Map<string, string | null | undefined>
```

Built from the existing private `readRows` and `storedLastPrint(row, now)` — the `now` argument
is the same clock `listPositions` passes. Semantics identical to the `last` half of
`getEarningsCalendar`'s stored fallback, minus the refresh.

## 4. Renderer: `src/renderer/src/lib/ivr-context.ts` (new, pure)

```ts
export const IVR_LOW_MAX = 30 // value <  30 → 'low'
export const IVR_HIGH_MIN = 60 // value >  60 → 'high'
export type IvrZone = 'low' | 'mid' | 'high'
export function ivrZone(value: string): IvrZone // Decimal compare; 30 and 60 are 'mid'

export const ZONE_WORD: Record<IvrZone, string> = { low: 'thin', mid: 'fair', high: 'rich' }
export const ZONE_TONE: Record<IvrZone, ContextTone> = {
  low: 'gold',
  mid: 'neutral',
  high: 'green'
}

export type ContextTone = 'green' | 'gold' | 'neutral' | 'muted'

export type IvrContextInput = {
  ivRank: ScreenerIvRank | null
  hasShortCall: boolean
  leapsInRollWindow: boolean // US-108's ◆ (US-107's 60-day threshold)
  earningsBeforeShortExpiry: boolean // US-108's ⚑ (US-56's predicate)
  nextEarnings: string | null // for the event-driven sentence
}

export type ContextReading = { status: string; tone: ContextTone; text: string }

type ContextRule = {
  status: string
  tone: ContextTone
  test: (i: IvrContextInput & { zone: IvrZone }) => boolean
  text: (i: IvrContextInput & { zone: IvrZone }) => string
}
```

### Unusable readings (shared by both registries, evaluated first)

| `ivRank`                     | status              | tone  | text                                                      |
| ---------------------------- | ------------------- | ----- | --------------------------------------------------------- |
| `null`                       | `n/a`               | muted | `no IV rank collected`                                    |
| `value === null` (US-121)    | `n/a`               | muted | `rank withheld — flat 52-week window`                     |
| `state: 'stale'`             | `Stale`             | muted | `{age} old — collect a fresh reading before acting on it` |
| `state: 'expired'`           | `Expired`           | muted | `last reading {age} ago — collection has been failing`    |
| `state: 'predates_earnings'` | `Predates earnings` | muted | `observed before the last print — IV has re-priced since` |

`{age}` is `tradingDaysLabel(ageTradingDays)` from `lib/ivr-tooltip.ts`.

### `SHORT_CALL_CONTEXT` (ordered; first match wins)

| #   | status                | tone    | test                                  | text                                                                      |
| --- | --------------------- | ------- | ------------------------------------- | ------------------------------------------------------------------------- |
| 1   | `RICH · EVENT-DRIVEN` | gold    | zone high ∧ earningsBeforeShortExpiry | `IV re-prices after the {nextEarnings} print — don't anchor on it`        |
| 2   | `RICH`                | green   | zone high ∧ hasShortCall              | `premium is rich — a roll up-and-out collects more than usual`            |
| 3   | `RICH`                | green   | zone high                             | `premium is rich — sell the next short call into it`                      |
| 4   | `THIN`                | gold    | zone low ∧ hasShortCall               | `premium is thin — the next cycle pays less; consider a longer DTE`       |
| 5   | `THIN`                | gold    | zone low                              | `premium is thin — wait, or go longer DTE, before selling the next short` |
| 6   | `FAIR`                | neutral | always                                | `premium is fair — run the usual cycle`                                   |

### `LEAPS_CONTEXT` (ordered; first match wins)

| #   | status                 | tone    | test                          | text                                                                 |
| --- | ---------------------- | ------- | ----------------------------- | -------------------------------------------------------------------- |
| 1   | `PRICEY · WINDOW OPEN` | gold    | zone high ∧ leapsInRollWindow | `the window beats IV — roll on DTE, not on price`                    |
| 2   | `PRICEY TO ROLL`       | gold    | zone high                     | `IV inflates the LEAPS mark and any roll — some of this P&L is vega` |
| 3   | `ROLL NOW`             | green   | zone low ∧ leapsInRollWindow  | `cheap time inside the 60-day window — a roll locks in low IV`       |
| 4   | `CHEAP TO ROLL`        | green   | zone low                      | `extending the LEAPS is cheap while IV is low`                       |
| 5   | `FAIR`                 | neutral | always                        | `no IV edge either way on the LEAPS`                                 |

Exported resolvers: `shortCallContext(input): ContextReading`, `leapsContext(input): ContextReading`,
and `faceZoneLabel(input): { word: string; tone: ContextTone }` — the zone word for usable readings in
**the short-call context's tone** (so an event-driven rich reading is gold on the face, not green),
`TIER_TITLE[state]` muted otherwise, `n/a` muted for null.

## 5. Renderer components

- `IvrFaceCell` (`src/renderer/src/components/pmcc/IvrFaceCell.tsx`): eyebrow `IVR`, `IvrCell`
  (reused as-is — numeral, ring, tooltip, `data-ivr-state`), sub-line from `faceZoneLabel`.
  `data-testid="pmcc-ivr-face"`, `data-zone="low|mid|high|none"`. Renders `—` with no ring on a
  closed card.
- `IvrContextCells` (`src/renderer/src/components/pmcc/IvrContextCells.tsx`): two tier-2 cells in
  US-108's cell primitive — `Short-call IV context` / `LEAPS IV context`, each
  `data-testid="pmcc-ivr-context-short" | "pmcc-ivr-context-leaps"`, `data-status`, `data-tone`.

## 6. Validation rules from the acceptance criteria

- Zone edges: 29.9 → low, 30 → mid, 60 → mid, 60.1 → high (Decimal compare on the string).
- Context sentences only for `fresh` / `aging` (via `isUsableIvrState`); every other state → `—`
  row per the unusable table.
- The event-driven qualifier fires only from the boolean the card already computed for ⚑; the
  module never re-derives the earnings predicate.
- A closed card shows no IVR and no context.
- Wheel items carry `ivRank` and render nothing new.

## 7. Fixtures (Linear scenarios + mockup)

Background is US-108's: valuation 2026-11-06 ET, XYZ at $104.20, LEAPS $80 2027-09-17, short
$108 2026-11-20 (14 DTE), no earnings known unless stated.

| preset            | value | ageTradingDays | state             | extra                                | face sub          | short status           | LEAPS status         |
| ----------------- | ----- | -------------- | ----------------- | ------------------------------------ | ----------------- | ---------------------- | -------------------- |
| rich-fresh        | 62    | 1              | fresh             |                                      | rich              | RICH                   | PRICEY TO ROLL       |
| fair-fresh        | 45    | 1              | fresh             |                                      | fair              | FAIR                   | FAIR                 |
| thin-fresh        | 22    | 1              | fresh             |                                      | thin              | THIN                   | CHEAP TO ROLL        |
| edge-30 / edge-60 | 30/60 | 1              | fresh             |                                      | fair              | FAIR                   | FAIR                 |
| edge-29.9 / 60.1  |       | 1              | fresh             |                                      | thin/rich         | THIN / RICH            | CHEAP / PRICEY       |
| rich-earnings     | 62    | 1              | fresh             | valuation 2026-11-16, earnings 11-18 | rich              | RICH · EVENT-DRIVEN    | PRICEY TO ROLL       |
| thin-roll-window  | 22    | 1              | fresh             | valuation 2027-07-20, LEAPS 59d      | thin              | THIN                   | ROLL NOW             |
| rich-roll-window  | 62    | 1              | fresh             | valuation 2027-07-20, LEAPS 59d      | rich              | RICH                   | PRICEY · WINDOW OPEN |
| leaps-only-rich   | 62    | 1              | fresh             | no short call (US-108 leaps-only)    | rich              | RICH (next-short text) | PRICEY TO ROLL       |
| aging             | 62    | 2              | aging             |                                      | rich              | RICH                   | PRICEY TO ROLL       |
| stale             | 62    | 5              | stale             |                                      | Stale             | Stale · —              | Stale · —            |
| expired           | 62    | 12             | expired           |                                      | Expired           | Expired · —            | Expired · —          |
| predates-earnings | 62    | 1              | predates_earnings | last print after the observation     | Predates earnings | — · predates           | — · predates         |
| none              | —     | —              | null              |                                      | n/a               | n/a                    | n/a                  |
| closed            | 62    | 1              | fresh             | status CLOSED                        | —                 | (no tier 2)            | (no tier 2)          |
