// [US-101] The PMCC opening rules that relate the two legs — the single source shared by the
// engine's `openPmcc` and the renderer's PMCC entry form schema, so the two cannot drift.
// [US-104] Likewise the short-call roll's date and no-change rules, shared by
// `rollPmccShortCall` and the renderer's Roll Short Call schema.
// [US-105] And the LEAPS roll's rules, shared by `rollPmccLeaps` and the Roll LEAPS schema.
// [US-115] And a subsequent short call's rules, shared by `sellPmccShort` and the Sell Short
// Call schema.
// Pure: no database, broker or logging imports.
import Decimal from 'decimal.js'
import { format, isBefore, parseISO } from 'date-fns'
import type {
  PmccField,
  PmccFilledLegTerms,
  PmccLegTerms,
  PmccShortCallTerms,
  RollPmccLeapsInput,
  RollPmccShortCallInput
} from './lifecycle'

/** The leg values the cross-leg rules read. `undefined` marks a value that is not yet decided
 *  (a form field mid-edit); every rule that reads it is skipped. */
export interface PmccCrossLegValues {
  strike: string | undefined
  expiration: string | undefined
  fillPrice: string | undefined
  fillDate: string | undefined
}

export interface PmccCrossLegInput {
  long: PmccCrossLegValues
  short: PmccCrossLegValues
  /** ISO date the fill and expiration dates are judged against. */
  referenceDate: string
}

/** The fields the opening cross-leg rules report on. */
export type PmccCrossLegField = Extract<
  PmccField,
  | 'long.fillDate'
  | 'short.fillDate'
  | 'long.expiration'
  | 'short.expiration'
  | 'short.strike'
  | '__pair__'
>

/** A broken rule: the field it reports on, a stable code and the trader-facing message. */
export interface PmccIssue<F extends string = PmccCrossLegField> {
  field: F
  code: string
  message: string
}

/** What a broken cross-leg rule reports; the field is supplied where the rule is checked. */
type PmccRule = Pick<PmccIssue, 'code' | 'message'>

/** A contract must expire strictly after it was filled — shared by `openPmcc` and the PMCC short-call roll (US-104). */
export const EXPIRATION_NOT_AFTER_FILL = {
  code: 'expiration_not_after_fill',
  message: 'Expiration must be after the fill date.'
} as const satisfies PmccRule

/** A short call must sit above its LEAPS strike — US-101's entry and US-115's later sale. */
export const SHORT_STRIKE_NOT_ABOVE_LONG = {
  code: 'strike_not_above_long',
  message: 'Short-call strike must be above the LEAPS strike.'
} as const satisfies PmccRule

/** An opening fill cannot be after the day it is judged on — US-101's entry and US-115's sale. */
export const FILL_DATE_IN_FUTURE = {
  code: 'cannot_be_future',
  message: 'Fill date cannot be in the future.'
} as const satisfies PmccRule

/** An opening leg cannot be an already-expired contract — US-101's entry and US-115's sale. */
export const EXPIRED_CONTRACT = {
  code: 'expired_contract',
  message: 'Use an unexpired contract for opening a current position.'
} as const satisfies PmccRule

/** A short call cannot be filled before the LEAPS that covers it — US-101's entry and US-115's sale. */
export const LEAPS_AFTER_SHORT = {
  code: 'long_after_short',
  message: 'LEAPS must be acquired no later than the short-call fill.'
} as const satisfies PmccRule

/** A roll must move the strike, the expiration, or both — shared by both PMCC rolls (US-104, US-105). */
export const ROLL_NO_CHANGE = {
  code: 'no_change',
  message: 'Roll must change the strike, the expiration, or both'
} as const satisfies PmccRule

// US-102 — PMCC coverage comparator: a short call is covered only while it expires strictly
// before its LEAPS. One predicate, reported from whichever side moved.

/** A short call is covered only if both calendar dates are valid and it expires before the LEAPS. */
export const shortExpiresBeforeLeaps = (shortExpiration: string, longExpiration: string): boolean =>
  isBefore(parseISO(shortExpiration), parseISO(longExpiration))

/** Reported against the short call — by `openPmcc` and the PMCC short-call roll (US-104). */
export const SHORT_NOT_BEFORE_LONG = {
  code: 'short_not_before_long',
  message: 'Short call must expire before the LEAPS call.'
} as const satisfies PmccRule

/** Reported against a replacement LEAPS — by the PMCC LEAPS roll (US-105). */
export const LONG_NOT_AFTER_SHORT = {
  code: 'long_not_after_short',
  message: 'LEAPS call must expire after the short call.'
} as const satisfies PmccRule

// PMCC strike ordering: the short strike sits strictly above the LEAPS strike.

/** Shared by `openPmcc` (entry side) and the PMCC LEAPS roll (roll side, US-105). */
export const shortStrikeAboveLeaps = (shortStrike: string, longStrike: string): boolean =>
  new Decimal(shortStrike).gt(longStrike)

/** The LEAPS roll's strike rule (US-105): its code, and its message naming the open short strike. */
export const STRIKE_NOT_BELOW_SHORT_CODE = 'strike_not_below_short' as const

export const leapsStrikeNotBelowShortMessage = (shortStrike: string): string =>
  `LEAPS strike must be below the short-call strike ($${new Decimal(shortStrike).toFixed(2)}).`

const SIDES = ['long', 'short'] as const

const issueIf = <F extends string>(broken: boolean, field: F, rule: PmccRule): PmccIssue<F>[] =>
  broken ? [{ field, ...rule }] : []

/**
 * Every broken cross-leg rule, in the order `openPmcc` checks them (rules 10–16 of
 * data-model §4); `openPmcc` throws the first. ISO dates compare as strings.
 */
export function pmccCrossLegIssues({ long, short, referenceDate }: PmccCrossLegInput): PmccIssue[] {
  const legs = { long, short }
  const perLeg = (
    check: (leg: PmccCrossLegValues, side: (typeof SIDES)[number]) => PmccIssue[]
  ): PmccIssue[] => SIDES.flatMap((side) => check(legs[side], side))

  return [
    ...perLeg(({ fillDate }, side) =>
      issueIf(
        // Stryker disable next-line ConditionalExpression: equivalent — the guard only narrows the type; comparing undefined with `<`, `>` or `<=` is already false
        fillDate !== undefined && fillDate > referenceDate,
        `${side}.fillDate`,
        FILL_DATE_IN_FUTURE
      )
    ),
    ...issueIf(
      long.fillDate !== undefined && short.fillDate !== undefined && long.fillDate > short.fillDate,
      'short.fillDate',
      LEAPS_AFTER_SHORT
    ),
    // Expired is checked first: with fill dates on the reference date, a past expiration is also
    // on/before the fill, and the expired-contract message is the one the trader needs.
    ...perLeg(({ expiration }, side) =>
      issueIf(
        // Stryker disable next-line ConditionalExpression: equivalent — the guard only narrows the type; comparing undefined with `<`, `>` or `<=` is already false
        expiration !== undefined && expiration < referenceDate,
        `${side}.expiration`,
        EXPIRED_CONTRACT
      )
    ),
    ...perLeg(({ expiration, fillDate }, side) =>
      issueIf(
        expiration !== undefined && fillDate !== undefined && expiration <= fillDate,
        `${side}.expiration`,
        EXPIRATION_NOT_AFTER_FILL
      )
    ),
    ...issueIf(
      long.expiration !== undefined &&
        short.expiration !== undefined &&
        !shortExpiresBeforeLeaps(short.expiration, long.expiration),
      'short.expiration',
      SHORT_NOT_BEFORE_LONG
    ),
    ...issueIf(
      long.strike !== undefined &&
        short.strike !== undefined &&
        !shortStrikeAboveLeaps(short.strike, long.strike),
      'short.strike',
      SHORT_STRIKE_NOT_ABOVE_LONG
    ),
    ...issueIf(
      long.fillPrice !== undefined &&
        short.fillPrice !== undefined &&
        new Decimal(long.fillPrice).minus(short.fillPrice).lte(0),
      '__pair__',
      { code: 'not_net_debit', message: 'This PMCC entry requires a net debit before fees.' }
    )
  ]
}

/** The open short call being rolled and its LEAPS — the facts the roll rules judge against. */
export interface PmccShortRollContext {
  openShort: PmccShortCallTerms
  leapsExpiration: string
}

/** The roll's own values. `undefined` marks one not yet decided (a form field mid-edit); every
 *  rule that reads it is skipped. */
export interface PmccShortRollInput extends PmccShortRollContext {
  fillDate: string | undefined
  newStrike: string | undefined
  newExpiration: string | undefined
}

/** The fields the roll rules report on; `__roll__` is the no-change rule's, which no input owns. */
export type PmccShortRollField =
  | Extract<keyof RollPmccShortCallInput, 'fillDate' | 'newExpiration'>
  | '__roll__'

/**
 * Every broken short-call roll rule, in the order `rollPmccShortCall` checks them (rules 3, 3b
 * and 7–10 of research.md's rule table): fill date on/after the open short's fill → on/before its expiration →
 * LEAPS coverage → on/after the current expiration → after the roll fill → changed. ISO dates
 * compare as strings.
 */
export function pmccShortRollIssues({
  openShort,
  leapsExpiration,
  fillDate,
  newStrike,
  newExpiration
}: PmccShortRollInput): PmccIssue<PmccShortRollField>[] {
  return [
    ...issueIf(fillDate !== undefined && fillDate < openShort.fillDate, 'fillDate', {
      code: 'close_date_before_open',
      message: 'Fill date cannot be before the short call open date'
    }),
    // Mirrors closeCoveredCall: a short call cannot be bought back after it has expired.
    ...issueIf(fillDate !== undefined && fillDate > openShort.expiration, 'fillDate', {
      code: 'close_date_after_expiration',
      message: 'Fill date cannot be after the short call expiration date'
    }),
    ...issueIf(
      newExpiration !== undefined && !shortExpiresBeforeLeaps(newExpiration, leapsExpiration),
      'newExpiration',
      SHORT_NOT_BEFORE_LONG
    ),
    ...issueIf(
      newExpiration !== undefined && newExpiration < openShort.expiration,
      'newExpiration',
      {
        code: 'must_be_on_or_after_current',
        message: `Replacement expiration must be on or after the current expiration (${format(parseISO(openShort.expiration), 'MMM d, yyyy')})`
      }
    ),
    // An already-expired replacement would be recorded as the open short call forever.
    ...issueIf(
      newExpiration !== undefined && fillDate !== undefined && newExpiration <= fillDate,
      'newExpiration',
      EXPIRATION_NOT_AFTER_FILL
    ),
    ...issueIf(
      newStrike !== undefined &&
        newExpiration === openShort.expiration &&
        new Decimal(newStrike).eq(openShort.strike),
      '__roll__',
      ROLL_NO_CHANGE
    )
  ]
}

/** The open LEAPS being rolled, the open short it must keep covering (`null` when none) and the
 *  position's last recorded event date, which the roll cannot precede (and which is never before
 *  the LEAPS' own fill, so the LEAPS' fill date itself is not needed). */
export interface PmccLeapsRollContext {
  currentLeaps: PmccLegTerms
  openShort: PmccLegTerms | null
  lastEventDate: string
}

/** The roll's own values the rules read. */
type PmccLeapsRollValue = Extract<
  keyof RollPmccLeapsInput,
  'fillDate' | 'newStrike' | 'newExpiration'
>

/** The context plus the roll's own values. `undefined` marks one not yet decided (a form field
 *  mid-edit); every rule that reads it is skipped. */
export type PmccLeapsRollInput = PmccLeapsRollContext & {
  [K in PmccLeapsRollValue]: RollPmccLeapsInput[K] | undefined
}

/** The fields the LEAPS roll rules report on; `__roll__` is the no-change rule's. */
export type PmccLeapsRollField = PmccLeapsRollValue | '__roll__'

/** The latest fill date among a position's legs — the last event a roll cannot precede. ISO
 *  dates compare as strings; `''` (before every date) when there are no legs. */
export const latestFillDate = (legs: readonly { fillDate: string }[]): string =>
  legs.reduce((latest, { fillDate }) => (fillDate > latest ? fillDate : latest), '')

/** A replacement LEAPS must outlast the open short and sit at a strike below it. */
function leapsShapeIssues(
  openShort: PmccLegTerms,
  newStrike: string | undefined,
  newExpiration: string | undefined
): PmccIssue<PmccLeapsRollField>[] {
  return [
    ...issueIf(
      newExpiration !== undefined && !shortExpiresBeforeLeaps(openShort.expiration, newExpiration),
      'newExpiration',
      LONG_NOT_AFTER_SHORT
    ),
    ...issueIf(
      newStrike !== undefined && !shortStrikeAboveLeaps(openShort.strike, newStrike),
      'newStrike',
      {
        code: STRIKE_NOT_BELOW_SHORT_CODE,
        message: leapsStrikeNotBelowShortMessage(openShort.strike)
      }
    )
  ]
}

const beforeLastEvent = (lastEventDate: string): PmccRule => ({
  code: 'before_last_event',
  message: `Fill date cannot be before the last recorded event (${format(parseISO(lastEventDate), 'MMM d, yyyy')})`
})

/**
 * Every broken LEAPS roll rule, in the order `rollPmccLeaps` checks them: fill date on/before the
 * LEAPS' expiration → on/after the last recorded event → covers the open short → strike below the
 * open short → after the roll fill → changed. The two shape rules are skipped with no open short.
 * ISO dates compare as strings.
 */
export function pmccLeapsRollIssues({
  currentLeaps,
  openShort,
  lastEventDate,
  fillDate,
  newStrike,
  newExpiration
}: PmccLeapsRollInput): PmccIssue<PmccLeapsRollField>[] {
  return [
    ...issueIf(fillDate !== undefined && fillDate > currentLeaps.expiration, 'fillDate', {
      code: 'close_date_after_expiration',
      message: 'Fill date cannot be after the LEAPS expiration date'
    }),
    // A back-dated roll would sort before later legs: the latest snapshot would stay stale and
    // the shape rules would judge today's short rather than the one open on the fill date. The
    // last event is never before the LEAPS' own fill, so this also keeps the roll after it.
    // Built only when broken: the message formats the date, and `''` (no legs) is not one.
    ...(fillDate !== undefined && fillDate < lastEventDate
      ? issueIf(true, 'fillDate', beforeLastEvent(lastEventDate))
      : []),
    // The shape rules guard the open short; with none open there is nothing to cover.
    ...(openShort === null ? [] : leapsShapeIssues(openShort, newStrike, newExpiration)),
    // An already-expired replacement would be recorded as the open LEAPS forever.
    ...issueIf(
      newExpiration !== undefined && fillDate !== undefined && newExpiration <= fillDate,
      'newExpiration',
      EXPIRATION_NOT_AFTER_FILL
    ),
    ...issueIf(
      newStrike !== undefined &&
        newExpiration === currentLeaps.expiration &&
        new Decimal(newStrike).eq(currentLeaps.strike),
      '__roll__',
      ROLL_NO_CHANGE
    )
  ]
}

// [US-115] Selling a subsequent short call against an open LEAPS.

/** The fields a subsequent short call's rules report on — the form's own fields. */
export type PmccSubsequentShortField = 'contracts' | 'fillDate' | 'expiration' | 'strike'

/** The sale's own values. `undefined` marks one not yet decided (a form field mid-edit); every
 *  rule that reads it is skipped. */
export type PmccSubsequentShortValues = {
  [K in 'strike' | 'expiration' | 'fillDate']: string | undefined
} & { contracts: number | undefined }

/** The facts the sale is judged against: the live LEAPS, the day the previous short call was
 *  retired (`null` when none was ever sold) and today. */
export interface PmccSubsequentShortContext {
  leaps: PmccFilledLegTerms & { contracts: number }
  previousShortRetiredOn: string | null
  today: string
}

export type PmccSubsequentShortInput = PmccSubsequentShortContext & {
  short: PmccSubsequentShortValues
}

/** The binding fill-date floor: the previous short's retirement or the LEAPS fill. */
export type PmccFillDateFloor =
  | { kind: 'previousShort'; date: string }
  | { kind: 'leaps'; date: string }

/** Only one short call can be open on a PMCC at a time; an open one is rolled, not added to. */
export const SHORT_CALL_ALREADY_OPEN = {
  code: 'short_call_already_open',
  message: 'This PMCC already has an open short call — roll it instead.'
} as const satisfies PmccRule

/** A short call cannot cover more contracts than the LEAPS holds; the message names that count. */
export const exceedsLeapsContracts = (leapsContracts: number): PmccRule => ({
  code: 'exceeds_leaps_contracts',
  message: `Cannot sell more short calls than LEAPS contracts held (${leapsContracts}).`
})

/** The next short call cannot be filled before the previous one was retired; names that day. */
export const beforePreviousShortRetired = (retiredOn: string): PmccRule => ({
  code: 'before_previous_short',
  message: `Fill date cannot be before the previous short call was retired (${retiredOn}).`
})

/**
 * The fill-date floor that binds: the later of the previous short's retirement and the live
 * LEAPS fill. A tie goes to the previous short, whose message names the date. US-120's LEAPS
 * sale reuses it, so both stories break a tie the same way. ISO dates compare as strings.
 */
export function pmccFillDateFloor({
  previousShortRetiredOn,
  leapsFillDate
}: Pick<PmccSubsequentShortContext, 'previousShortRetiredOn'> & {
  leapsFillDate: string
}): PmccFillDateFloor {
  // Stryker disable next-line ConditionalExpression: equivalent — the guard only narrows the type; `null >= <ISO date>` is already false
  return previousShortRetiredOn !== null && previousShortRetiredOn >= leapsFillDate
    ? { kind: 'previousShort', date: previousShortRetiredOn }
    : { kind: 'leaps', date: leapsFillDate }
}

/** The binding floor's rule: the previous short's dated message, or US-101's LEAPS-fill one. */
const floorRule = (floor: PmccFillDateFloor): PmccRule =>
  floor.kind === 'previousShort' ? beforePreviousShortRetired(floor.date) : LEAPS_AFTER_SHORT

/**
 * Every broken rule for a short call sold against an open LEAPS, in the order `sellPmccShort`
 * checks them (rules 7–13 of data-model §3): contracts cap → fill not in the future → fill-date
 * floor → expiration not past → expiration after the fill → expires before the LEAPS → strike
 * above the LEAPS. ISO dates compare as strings.
 */
export function pmccSubsequentShortIssues({
  leaps,
  previousShortRetiredOn,
  today,
  short: { contracts, fillDate, expiration, strike }
}: PmccSubsequentShortInput): PmccIssue<PmccSubsequentShortField>[] {
  const floor = pmccFillDateFloor({ previousShortRetiredOn, leapsFillDate: leaps.fillDate })
  return [
    ...issueIf(
      // Stryker disable next-line ConditionalExpression: equivalent — the guard only narrows the type; comparing undefined with `<`, `>` or `<=` is already false
      contracts !== undefined && contracts > leaps.contracts,
      'contracts',
      exceedsLeapsContracts(leaps.contracts)
    ),
    // Stryker disable next-line ConditionalExpression: equivalent — the guard only narrows the type; comparing undefined with `<`, `>` or `<=` is already false
    ...issueIf(fillDate !== undefined && fillDate > today, 'fillDate', FILL_DATE_IN_FUTURE),
    // Stryker disable next-line ConditionalExpression: equivalent — the guard only narrows the type; comparing undefined with `<`, `>` or `<=` is already false
    ...issueIf(fillDate !== undefined && fillDate < floor.date, 'fillDate', floorRule(floor)),
    // Expired is checked first, as US-101 orders them: it is the message the trader needs.
    // Stryker disable next-line ConditionalExpression: equivalent — the guard only narrows the type; comparing undefined with `<`, `>` or `<=` is already false
    ...issueIf(expiration !== undefined && expiration < today, 'expiration', EXPIRED_CONTRACT),
    ...issueIf(
      // Stryker disable next-line ConditionalExpression: equivalent — the guard only narrows the type; comparing undefined with `<`, `>` or `<=` is already false
      expiration !== undefined && fillDate !== undefined && expiration <= fillDate,
      'expiration',
      EXPIRATION_NOT_AFTER_FILL
    ),
    ...issueIf(
      expiration !== undefined && !shortExpiresBeforeLeaps(expiration, leaps.expiration),
      'expiration',
      SHORT_NOT_BEFORE_LONG
    ),
    ...issueIf(
      strike !== undefined && !shortStrikeAboveLeaps(strike, leaps.strike),
      'strike',
      SHORT_STRIKE_NOT_ABOVE_LONG
    )
  ]
}
