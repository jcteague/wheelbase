# US-18 — Data Model

No database change. One additive field on an existing IPC read, plus renderer view models.

## 1. `ManagementQueueItem` (+ `ruleCode`)

| Field      | Type                                                                                           | Source             | Notes                                                                |
| ---------- | ---------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------- |
| `ruleCode` | `RuleCode`                                                                                     | `alerts.rule_code` | **New.** The rule that produced the row; the card maps it to a lane. |
| (existing) | `alertId`, `positionId`, `ticker`, `phase`, `urgency`, `summary`, `quickAction`, `triggeredAt` | unchanged          |                                                                      |

Preload: `ManagementQueueItem` is already an alias of the schema type (US-106); no edit.

## 2. `CardAction` (renderer view model)

```ts
type CardTone = 'red' | 'gold'

interface CardAction {
  glyph: '▲' | '◷' // US-108 adds '✕' | '◆' via the same shape
  statusWord: string // 'STRIKE PROXIMITY' | 'CALL BREACHED' | 'EXPIRING' | 'MANAGEMENT WINDOW'
  tone: CardTone
  rank: number // lane order: ▲ red 1, ▲ gold 2, EXPIRING 4, MANAGEMENT WINDOW 5 (0 and 3 reserved for US-108's ✕ and ◆)
  summary: string // the queue row's text verbatim
}
```

`rankWheelActions(rows, ctx)`:

| Input                                                        | Output                                                                                                                                                     |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rows: Pick<ManagementQueueItem, 'ruleCode' \| 'summary'>[]` | `CardAction[]` sorted by `rank` ascending, stable                                                                                                          |
| `ctx: { price: string \| null; strike: string \| null }`     | used only by `STRIKE_PROXIMITY`: `tone = price !== null && strike !== null && Decimal(price).lt(strike) ? 'red' : 'gold'`, `rank = tone === 'red' ? 1 : 2` |

Lane registry (`WHEEL_LANES`, ordered array like the alert `RULES`):

| `ruleCode`            | glyph | statusWord          | tone                 | rank  |
| --------------------- | ----- | ------------------- | -------------------- | ----- |
| `COVERED_CALL_BREACH` | ▲     | `CALL BREACHED`     | red                  | 1     |
| `STRIKE_PROXIMITY`    | ▲     | `STRIKE PROXIMITY`  | red if ITM else gold | 1 / 2 |
| `EXPIRATION_IMMINENT` | ◷     | `EXPIRING`          | gold                 | 4     |
| `MANAGEMENT_WINDOW`   | ◷     | `MANAGEMENT WINDOW` | gold                 | 5     |

Rows with any other code (`PROFIT_TARGET`, `EARNINGS_PROXIMITY`, `PMCC_*`) are dropped.

`formatActionLine(a)` → `` `${glyph} ${statusWord} · ${summary}` `` (chip tooltip lines and leg-mark tooltips).

## 3. `WheelCardDisplay` (derived per render, pure)

```ts
interface WheelCardDisplay {
  pnl: { amount: string; percentOfMax: string } | null // null: no leg, no snapshot, or closed
  pnlSubline: string // '+25.7% of max profit' | 'unavailable' | 'no option leg open' | 'closed — no live marks'
  targetReached: boolean
  pnlPercent: string
  maxProfit: string
  targetPercent: number // TargetBadge props (today's deriveRowDisplay)
  dteUrgent: boolean
  priceSubline: string // 'Nd to expiration' | 'shares held · no option leg' | 'closed'
  mark: { mid: string; wide: boolean; noBid: boolean } | 'unavailable' | null
}
```

Formulas (all existing helpers): `computeUnrealizedPnl({ entryPremium, currentMid, contracts })` → `pnl`, `pnlPercent`; `formatSignedMoney(pnl)`; percent line = sign + `formatPnlPercentForDisplay(pnlPercent)` + `% of max profit`; `isWideSpread`, `hasNoBid`; `isDteUrgent(dte)`; `resolveProfitTarget(override, default)`.

## 4. Minimal PMCC card inputs

Read straight from `PmccListItem.pmcc` (`long`, `short | null`, `basisPerShare`, `basisTotal`) and `premiumCollected`. Next-decision DTE = `short?.dte ?? long.dte` (same rule as `position-order.ts`).

## Type Design

| Type                           | File                                                 | Construct                                              | What it buys                                                                                                                          |
| ------------------------------ | ---------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `ManagementQueueItem.ruleCode` | `src/main/schemas.ts`                                | `RuleCode` (existing union)                            | A row can only name a known rule; the lane registry is `Partial<Record<RuleCode, Lane>>`, so a typo in a lane key is a compile error. |
| `CardTone`                     | `src/renderer/src/components/position-card/types.ts` | `'red' \| 'gold'` literal union                        | Every tone-keyed class map is `Record<CardTone, string>`; a third tone cannot be added without every map compiling.                   |
| `CardAccent`                   | same                                                 | `WheelPhase \| 'PMCC'`                                 | The shell's accent map is exhaustive over phases; the PMCC accent is named once.                                                      |
| `CardAction`                   | `src/renderer/src/lib/card-actions.ts`               | plain interface                                        | Shared with US-108; `ActionStrip` and `LegBlock` take `CardAction[]`, nothing about rows.                                             |
| `QueueRowForCard`              | same                                                 | `Pick<ManagementQueueItem, 'ruleCode' \| 'summary'>`   | `rankWheelActions` takes exactly the slice it reads (project convention; cannot drift from the schema).                               |
| `WheelCardDisplay`             | `src/renderer/src/lib/wheel-card-display.ts`         | plain types                                            | Plain types — no advanced constructs needed.                                                                                          |
| Grid props                     | `PositionsGrid`                                      | `actionsByPosition: ReadonlyMap<string, CardAction[]>` | Grouping is done once at the page; cards never see the queue.                                                                         |
