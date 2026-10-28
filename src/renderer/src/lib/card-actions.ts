// Maps management-queue rows onto a wheel card's action lanes: which rules the
// card surfaces, with what glyph, status word and tone, in what order.

import {
  isNumeric,
  priceDirection,
  strikeProximitySummary,
  type PriceVsStrikeInput
} from '../../../main/core/alerts'

export type CardTone = 'red' | 'gold'

// Lane order on the card, lowest first. 0 and 3 are reserved for US-108's
// ✕ and ◆ lanes.
export const LANE_RED_ASSIGNMENT = 1
export const LANE_GOLD_ASSIGNMENT = 2
export const LANE_EXPIRING = 4
export const LANE_MANAGEMENT_WINDOW = 5

type AssignmentRank = typeof LANE_RED_ASSIGNMENT | typeof LANE_GOLD_ASSIGNMENT

export type LaneRank = AssignmentRank | typeof LANE_EXPIRING | typeof LANE_MANAGEMENT_WINDOW

export type StatusWord = 'CALL BREACHED' | 'STRIKE PROXIMITY' | 'EXPIRING' | 'MANAGEMENT WINDOW'

export interface CardAction {
  glyph: '▲' | '◷'
  statusWord: StatusWord
  tone: CardTone
  rank: LaneRank
  summary: string
}

export type QueueRowForCard = Pick<ManagementQueueItem, 'ruleCode' | 'summary'>

export type QueueRowForPosition = Pick<ManagementQueueItem, 'positionId'> & QueueRowForCard

/** What a lane needs to know about the position: its live price and option strike. */
export interface LaneContext {
  price: string | null
  strike: string | null
}

interface WheelLane {
  glyph: CardAction['glyph']
  statusWord: StatusWord
  tone: (ctx: LaneContext) => CardTone
  rank: (tone: CardTone) => LaneRank
  summary: (ctx: LaneContext, row: QueueRowForCard) => string
}

/** The live price against the strike, when both parse; null leaves the stored alert in charge. */
function livePriceVsStrike({ price, strike }: LaneContext): PriceVsStrikeInput | null {
  return isNumeric(price) && isNumeric(strike) ? { strike, currentUnderlyingPrice: price } : null
}

function isBelowStrike(ctx: LaneContext): boolean {
  const live = livePriceVsStrike(ctx)
  return live !== null && priceDirection(live) === 'below'
}

/** Words from the same live price as the tone, so a red lane never reads "above". */
function strikeProximityLaneSummary(ctx: LaneContext, row: QueueRowForCard): string {
  const live = livePriceVsStrike(ctx)
  return live === null ? row.summary : strikeProximitySummary(live)
}

function storedSummary(_ctx: LaneContext, row: QueueRowForCard): string {
  return row.summary
}

function assignmentLane(tone: CardTone): AssignmentRank {
  return tone === 'red' ? LANE_RED_ASSIGNMENT : LANE_GOLD_ASSIGNMENT
}

// Keyed by rule code so a lane can't name an unknown rule or appear twice;
// codes without an entry (PROFIT_TARGET, EARNINGS_PROXIMITY, PMCC_*) are not
// shown on a wheel card.
export const WHEEL_LANES: Readonly<Partial<Record<QueueRowForCard['ruleCode'], WheelLane>>> = {
  COVERED_CALL_BREACH: {
    glyph: '▲',
    statusWord: 'CALL BREACHED',
    tone: () => 'red',
    rank: assignmentLane,
    summary: storedSummary
  },
  STRIKE_PROXIMITY: {
    glyph: '▲',
    statusWord: 'STRIKE PROXIMITY',
    tone: (ctx) => (isBelowStrike(ctx) ? 'red' : 'gold'),
    rank: assignmentLane,
    summary: strikeProximityLaneSummary
  },
  EXPIRATION_IMMINENT: {
    glyph: '◷',
    statusWord: 'EXPIRING',
    tone: () => 'gold',
    rank: () => LANE_EXPIRING,
    summary: storedSummary
  },
  MANAGEMENT_WINDOW: {
    glyph: '◷',
    statusWord: 'MANAGEMENT WINDOW',
    tone: () => 'gold',
    rank: () => LANE_MANAGEMENT_WINDOW,
    summary: storedSummary
  }
}

/** The card's actions for one position's queue rows, by lane order (stable). */
export function rankWheelActions(rows: QueueRowForCard[], ctx: LaneContext): CardAction[] {
  return rows
    .flatMap((row): CardAction[] => {
      const lane = WHEEL_LANES[row.ruleCode]
      if (!lane) return []
      const tone = lane.tone(ctx)
      return [
        {
          glyph: lane.glyph,
          statusWord: lane.statusWord,
          tone,
          rank: lane.rank(tone),
          summary: lane.summary(ctx, row)
        }
      ]
    })
    .sort((a, b) => a.rank - b.rank)
}

export function formatActionLine(action: CardAction): string {
  return `${action.glyph} ${action.statusWord} · ${action.summary}`
}

/**
 * Each wheel position's card actions, keyed by position id. Only positions in `ctxById` are
 * considered; a position whose rows all lack a wheel lane gets no entry.
 */
export function actionsByPosition(
  rows: QueueRowForPosition[],
  ctxById: ReadonlyMap<string, LaneContext>
): ReadonlyMap<string, CardAction[]> {
  return new Map(
    [...ctxById].flatMap(([positionId, ctx]): [string, CardAction[]][] => {
      const actions = rankWheelActions(
        rows.filter((row) => row.positionId === positionId),
        ctx
      )
      return actions.length > 0 ? [[positionId, actions]] : []
    })
  )
}
