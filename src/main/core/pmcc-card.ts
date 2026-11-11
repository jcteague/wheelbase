// Pure PMCC position-card engine [US-108]: the tier-2 cues (breakeven, max if called,
// short extrinsic, premium recovered) and the signal registry that turns a card's plain
// values into ranked action states and header awareness tags. No DB, broker, or logger imports.

import Decimal from 'decimal.js'
import { isWideSpread, spreadPercentOfMid, type SpreadInput } from '../../shared/option-spread'
import {
  PMCC_LEAPS_ROLL_WINDOW_MAX_DTE,
  earningsProximitySummary,
  expirationImminentSummary,
  formatStrike,
  isEarningsProximate,
  isExpirationImminent,
  isInLeapsRollWindow,
  isInManagementWindow,
  isNumeric,
  isPmccAssignmentRisk,
  managementWindowSummary,
  percentBelowStrike,
  pmccAssignmentRiskTooltip,
  priceDirection,
  type EarningsProximityInput,
  type PmccAssignmentRiskInput
} from './alerts'
import { toFiniteDecimal } from './finite-decimal'

// Stryker disable next-line ObjectLiteral,CallExpression: equivalent — decimal.js defaults to ROUND_HALF_UP and the option-spread import above already sets it
Decimal.set({ rounding: Decimal.ROUND_HALF_UP })

/** LEAPS delta below which the long leg no longer tracks as synthetic stock. */
export const LEAPS_DELTA_FLOOR = 0.6

export function pmccBreakeven(leapsStrike: string, basisPerShare: string): string {
  return new Decimal(leapsStrike).plus(basisPerShare).toFixed(4)
}

export interface PmccMaxIfCalledInput {
  shortStrike: string
  leapsStrike: string
  basisPerShare: string
  shortContracts: number
}

export function pmccMaxIfCalled(input: PmccMaxIfCalledInput): string {
  return new Decimal(input.shortStrike)
    .minus(input.leapsStrike)
    .minus(input.basisPerShare)
    .times(100)
    .times(input.shortContracts)
    .toFixed(4)
}

export interface ShortExtrinsicInput {
  mid: string | null
  price: string | null
  strike: string
}

export function shortExtrinsic({ mid, price, strike }: ShortExtrinsicInput): string | null {
  if (mid === null || price === null) return null
  const intrinsic = Decimal.max(0, new Decimal(price).minus(strike))
  return new Decimal(mid).minus(intrinsic).toFixed(4)
}

/** The recovery meter's fill: the ledger percent as a fraction, clamped to [0, 1]. */
export function premiumRecoveredFraction(percent: string | null): number | null {
  if (percent === null) return null
  return Decimal.min(1, Decimal.max(0, new Decimal(percent).div(100))).toNumber()
}

/** Which leg an action state marks: the LEAPS, or one short call by its leg id. */
export type PmccLegRef = { side: 'LONG' } | { side: 'SHORT'; legId: string }

type NonEmpty<T> = readonly [T, ...T[]]

/** The legs an action state marks — always at least one. */
type PmccLegRefs = NonEmpty<PmccLegRef>

// Lane order on a position card, lowest (worst) first. The source of truth for the wheel
// card's lanes too; 0 (✕) and 3 (◆) are PMCC-only lanes.
const LANE_BELOW_BREAKEVEN = 0
export const LANE_RED_ASSIGNMENT = 1
export const LANE_GOLD_ASSIGNMENT = 2
const LANE_ROLL_WINDOW = 3
export const LANE_EXPIRING = 4
export const LANE_MANAGEMENT_WINDOW = 5

export type PmccLaneRank =
  | typeof LANE_BELOW_BREAKEVEN
  | typeof LANE_RED_ASSIGNMENT
  | typeof LANE_GOLD_ASSIGNMENT
  | typeof LANE_ROLL_WINDOW
  | typeof LANE_EXPIRING
  | typeof LANE_MANAGEMENT_WINDOW

export type PmccTone = 'red' | 'gold'

type PmccActionCode =
  | 'BELOW_BREAKEVEN'
  | 'ASSIGNMENT_RISK'
  | 'ROLL_WINDOW'
  | 'EXPIRING'
  | 'MANAGEMENT_WINDOW'

type PmccAwarenessCode = 'EARNINGS' | 'DELTA_FLOOR' | 'WIDE_SPREAD'

export type PmccActionGlyph = '✕' | '▲' | '◆' | '◷'
export type PmccTagGlyph = '⚑' | 'δ' | '⚠'

export type PmccStatusWord =
  | 'BELOW BREAKEVEN'
  | 'ASSIGNMENT RISK'
  | 'ROLL WINDOW'
  | 'EXPIRING'
  | 'MANAGEMENT WINDOW'

export interface PmccSignalShort {
  legId: string
  strike: string
  dte: number
  expiration: string
}

/** Plain values the card already holds. `shorts` is sorted by dte, nearest first. */
export interface PmccSignalInput {
  leaps: { strike: string; dte: number; delta: string | null; spread: SpreadInput | null }
  shorts: readonly PmccSignalShort[]
  price: string | null
  basisPerShare: string
  managementWindowDte: number
  daysToEarnings: number | null
}

/**
 * An action state, typed by what it matched. `match` finds the leg (and the values the copy
 * reads) or returns `null`; every other function takes that match, so none can run on an
 * input where the state does not fire.
 */
interface PmccActionDefinition<M extends object> {
  code: PmccActionCode
  glyph: PmccActionGlyph
  statusWord: PmccStatusWord
  match: (input: PmccSignalInput) => M | null
  legs: (match: M) => PmccLegRefs
  tone: (match: M) => PmccTone
  rank: (match: M) => PmccLaneRank
  /** The strip text after `WORD ·`. */
  reason: (match: M) => string
  /** The leg mark title. */
  tooltip: (match: M) => string
}

/** An awareness tag, typed by what it matched — a header glyph and its title only. */
interface PmccAwarenessDefinition<M extends object> {
  code: PmccAwarenessCode
  glyph: PmccTagGlyph
  name: string
  match: (input: PmccSignalInput) => M | null
  /** The header tag title. */
  tooltip: (match: M) => string
}

/** An action state: a strip lane, a leg highlight and the card edge. */
interface PmccActionSignal {
  tier: 'action'
  code: PmccActionCode
  glyph: PmccActionGlyph
  statusWord: PmccStatusWord
  /** The action this state shows, or `null` when it does not fire. */
  evaluate: (input: PmccSignalInput) => PmccAction | null
}

/** An awareness tag: a header glyph only — it can carry no lane, leg or strip text. */
interface PmccAwarenessSignal {
  tier: 'awareness'
  code: PmccAwarenessCode
  glyph: PmccTagGlyph
  name: string
  /** The tag this signal shows, or `null` when it does not fire. */
  evaluate: (input: PmccSignalInput) => PmccTag | null
}

export type PmccSignalDefinition = PmccActionSignal | PmccAwarenessSignal

export interface PmccAction {
  glyph: PmccActionGlyph
  statusWord: PmccStatusWord
  tone: PmccTone
  rank: PmccLaneRank
  summary: string
  tooltip: string
  legs: PmccLegRefs
}

export interface PmccTag {
  glyph: PmccTagGlyph
  name: string
  tone: 'gold'
  tooltip: string
}

export interface PmccSignals {
  actions: PmccAction[]
  awareness: PmccTag[]
}

/** Closes over the definition's match type, so the registry can hold every action state. */
function defineAction<M extends object>(definition: PmccActionDefinition<M>): PmccActionSignal {
  const { code, glyph, statusWord } = definition
  return {
    tier: 'action',
    code,
    glyph,
    statusWord,
    evaluate: (input) => {
      const match = definition.match(input)
      if (match === null) return null
      return {
        glyph,
        statusWord,
        tone: definition.tone(match),
        rank: definition.rank(match),
        summary: definition.reason(match),
        tooltip: definition.tooltip(match),
        legs: definition.legs(match)
      }
    }
  }
}

/** Closes over the definition's match type, so the registry can hold every awareness tag. */
function defineAwareness<M extends object>(
  definition: PmccAwarenessDefinition<M>
): PmccAwarenessSignal {
  const { code, glyph, name } = definition
  return {
    tier: 'awareness',
    code,
    glyph,
    name,
    evaluate: (input) => {
      const match = definition.match(input)
      if (match === null) return null
      return { glyph, name, tone: 'gold', tooltip: definition.tooltip(match) }
    }
  }
}

// ---------------------------------------------------------------------------
// Named match and copy helpers — each match reads only the slice of the input it needs,
// and each copy helper reads only its match.
// ---------------------------------------------------------------------------

type ShortsInput = Pick<PmccSignalInput, 'shorts'>
type LeapsInput = Pick<PmccSignalInput, 'leaps'>
type BreakevenInput = Pick<PmccSignalInput, 'leaps' | 'shorts' | 'basisPerShare'>
type AssignmentRiskSignalInput = Pick<PmccSignalInput, 'shorts' | 'price'>
type ManagementWindowSignalInput = Pick<PmccSignalInput, 'shorts' | 'managementWindowDte'>
type EarningsSignalInput = Pick<PmccSignalInput, 'shorts' | 'daysToEarnings'>
type LeapsSignal = PmccSignalInput['leaps']

function shortRef(short: PmccSignalShort): PmccLegRef {
  return { side: 'SHORT', legId: short.legId }
}

function shortRefs([first, ...rest]: NonEmpty<PmccSignalShort>): PmccLegRefs {
  return [shortRef(first), ...rest.map(shortRef)]
}

interface BelowBreakevenMatch {
  shorts: NonEmpty<PmccSignalShort>
  breakeven: string
}

/** Every short whose strike sits under the breakeven, in input order. */
function belowBreakevenMatch(input: BreakevenInput): BelowBreakevenMatch | null {
  const breakeven = pmccBreakeven(input.leaps.strike, input.basisPerShare)
  const [first, ...rest] = input.shorts.filter((s) => new Decimal(s.strike).lt(breakeven))
  return first === undefined ? null : { shorts: [first, ...rest], breakeven }
}

/** The copy cites the lowest strike: the largest gap under the breakeven. */
function belowBreakevenReason({ shorts, breakeven }: BelowBreakevenMatch): string {
  // Stryker disable next-line EqualityOperator: equivalent — on equal strikes either short reads the same strike and gap
  const lowest = shorts.reduce((low, s) => (new Decimal(s.strike).lt(low.strike) ? s : low))
  const gap = new Decimal(breakeven).minus(lowest.strike).toFixed(4)
  return `${formatStrike(lowest.strike)} strike is ${formatStrike(gap)} under the ${formatStrike(breakeven)} breakeven · roll up before it is called`
}

function belowBreakevenTooltip({ breakeven }: BelowBreakevenMatch): string {
  return `Short strike below breakeven ${formatStrike(breakeven)} — being called away locks in a loss`
}

interface AssignmentRiskMatch {
  short: PmccSignalShort
  risk: PmccAssignmentRiskInput
}

/**
 * The worst short the stock is within 2% below, at or above: a red one (stock at or above
 * the strike) over a gold one, then the nearest by dte.
 */
function assignmentRiskMatch(input: AssignmentRiskSignalInput): AssignmentRiskMatch | null {
  if (!isNumeric(input.price)) return null
  const matches = input.shorts
    .map((short) => ({
      short,
      risk: { strike: short.strike, currentUnderlyingPrice: input.price }
    }))
    .filter(({ risk }) => isPmccAssignmentRisk(risk))
  return matches.find((match) => assignmentRiskTone(match) === 'red') ?? matches[0] ?? null
}

function assignmentRiskTone({ risk }: AssignmentRiskMatch): PmccTone {
  return priceDirection(risk) === 'above' ? 'red' : 'gold'
}

function assignmentRiskReason({ risk }: AssignmentRiskMatch): string {
  const pct = percentBelowStrike(risk).abs().toFixed(1)
  return priceDirection(risk) === 'above'
    ? `stock ${pct}% above the ${formatStrike(risk.strike)} strike · roll or close`
    : `stock ${pct}% below the ${formatStrike(risk.strike)} strike · plan the roll`
}

function rollWindowLeaps({ leaps }: LeapsInput): LeapsSignal | null {
  return isInLeapsRollWindow(leaps.dte) ? leaps : null
}

/** The nearest short when it passes `inWindow` — a later short never counts. */
function nearestShortWhere(
  input: ShortsInput,
  inWindow: (short: PmccSignalShort) => boolean
): PmccSignalShort | null {
  return input.shorts.slice(0, 1).find(inWindow) ?? null
}

function expiringShort(input: ShortsInput): PmccSignalShort | null {
  return nearestShortWhere(input, (s) => isExpirationImminent(s.dte))
}

function managementWindowShort(input: ManagementWindowSignalInput): PmccSignalShort | null {
  return nearestShortWhere(input, (s) => isInManagementWindow(s.dte, input.managementWindowDte))
}

/** Earnings on or before the nearest short's expiration, inside the proximity window. */
function earningsBeforeExpiry({
  shorts,
  daysToEarnings
}: EarningsSignalInput): EarningsProximityInput | null {
  const short = shorts[0]
  if (short === undefined || daysToEarnings === null) return null
  return isEarningsProximate(daysToEarnings, short.dte)
    ? { daysToEarnings, expiration: short.expiration }
    : null
}

function deltaBelowFloor({ leaps }: LeapsInput): Decimal | null {
  const delta = toFiniteDecimal(leaps.delta)
  return delta !== null && delta.lt(LEAPS_DELTA_FLOOR) ? delta : null
}

function deltaFloorTooltip(delta: Decimal): string {
  return `LEAPS delta ${delta.toFixed(2)} below ${LEAPS_DELTA_FLOOR.toFixed(2)} — no longer tracking as synthetic stock`
}

/** The LEAPS spread as a percent of its mid, when it is wide. */
function wideLeapsSpreadPercent({ leaps }: LeapsInput): Decimal | null {
  return leaps.spread !== null && isWideSpread(leaps.spread)
    ? spreadPercentOfMid(leaps.spread)
    : null
}

function wideSpreadTooltip(percent: Decimal): string {
  return `LEAPS spread is ${percent.toFixed(1)}% of the mid — the P&L that depends on it is unreliable`
}

function gold(): 'gold' {
  return 'gold'
}

// ---------------------------------------------------------------------------
// Registry — ordered: action states in lane order (so the actions that fire come out
// worst first with no sort), then awareness tags in their fixed header order (⚑ δ ⚠).
// An action fires when it matches a leg to mark. EXPIRING and MANAGEMENT_WINDOW are
// exclusive by their DTE ranges.
// ---------------------------------------------------------------------------

const PMCC_SIGNALS: readonly PmccSignalDefinition[] = [
  defineAction({
    code: 'BELOW_BREAKEVEN',
    glyph: '✕',
    statusWord: 'BELOW BREAKEVEN',
    match: belowBreakevenMatch,
    legs: ({ shorts }) => shortRefs(shorts),
    tone: () => 'red',
    rank: () => LANE_BELOW_BREAKEVEN,
    reason: belowBreakevenReason,
    tooltip: belowBreakevenTooltip
  }),
  defineAction({
    code: 'ASSIGNMENT_RISK',
    glyph: '▲',
    statusWord: 'ASSIGNMENT RISK',
    match: assignmentRiskMatch,
    legs: ({ short }) => [shortRef(short)],
    tone: assignmentRiskTone,
    rank: (match) =>
      assignmentRiskTone(match) === 'red' ? LANE_RED_ASSIGNMENT : LANE_GOLD_ASSIGNMENT,
    reason: assignmentRiskReason,
    tooltip: ({ risk }) => pmccAssignmentRiskTooltip(risk)
  }),
  defineAction({
    code: 'ROLL_WINDOW',
    glyph: '◆',
    statusWord: 'ROLL WINDOW',
    match: rollWindowLeaps,
    legs: () => [{ side: 'LONG' }],
    tone: gold,
    rank: () => LANE_ROLL_WINDOW,
    reason: (leaps) =>
      `LEAPS ${leaps.dte}d left, inside the ${PMCC_LEAPS_ROLL_WINDOW_MAX_DTE}-day window · roll while it has time value`,
    tooltip: () => `LEAPS inside the ${PMCC_LEAPS_ROLL_WINDOW_MAX_DTE}-day roll window`
  }),
  defineAction({
    code: 'EXPIRING',
    glyph: '◷',
    statusWord: 'EXPIRING',
    match: expiringShort,
    legs: (short) => [shortRef(short)],
    tone: gold,
    rank: () => LANE_EXPIRING,
    reason: expirationImminentSummary,
    tooltip: expirationImminentSummary
  }),
  defineAction({
    code: 'MANAGEMENT_WINDOW',
    glyph: '◷',
    statusWord: 'MANAGEMENT WINDOW',
    match: managementWindowShort,
    legs: (short) => [shortRef(short)],
    tone: gold,
    rank: () => LANE_MANAGEMENT_WINDOW,
    reason: managementWindowSummary,
    tooltip: managementWindowSummary
  }),
  defineAwareness({
    code: 'EARNINGS',
    glyph: '⚑',
    name: 'Earnings',
    match: earningsBeforeExpiry,
    tooltip: earningsProximitySummary
  }),
  defineAwareness({
    code: 'DELTA_FLOOR',
    glyph: 'δ',
    name: 'Delta floor',
    match: deltaBelowFloor,
    tooltip: deltaFloorTooltip
  }),
  defineAwareness({
    code: 'WIDE_SPREAD',
    glyph: '⚠',
    name: 'Wide spread',
    match: wideLeapsSpreadPercent,
    tooltip: wideSpreadTooltip
  })
]

function isAction(signal: PmccSignalDefinition): signal is PmccActionSignal {
  return signal.tier === 'action'
}

function isAwareness(signal: PmccSignalDefinition): signal is PmccAwarenessSignal {
  return signal.tier === 'awareness'
}

/** Every signal that fires, in registry order: actions worst first, then the awareness tags. */
export function evaluatePmccSignals(input: PmccSignalInput): PmccSignals {
  return {
    actions: PMCC_SIGNALS.filter(isAction).flatMap((signal) => signal.evaluate(input) ?? []),
    awareness: PMCC_SIGNALS.filter(isAwareness).flatMap((signal) => signal.evaluate(input) ?? [])
  }
}
