// [US-101] The PMCC opening rules that relate the two legs — the single source shared by the
// engine's `openPmcc` and the renderer's PMCC entry form schema, so the two cannot drift.
// [US-104] Likewise the short-call roll's date and no-change rules, shared by
// `rollPmccShortCall` and the renderer's Roll Short Call schema.
// Pure: no database, broker or logging imports.
import Decimal from 'decimal.js'
import { format, parseISO } from 'date-fns'
import type { PmccField, PmccShortCallTerms, RollPmccShortCallInput } from './lifecycle'

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

/** The coverage rule's issue — shared by `openPmcc` and the PMCC short-call roll (US-104). */
export const SHORT_NOT_BEFORE_LONG = {
  code: 'short_not_before_long',
  message: 'Short call must expire before the LEAPS call.'
} as const satisfies PmccRule

/** A contract must expire strictly after it was filled — shared by `openPmcc` and the PMCC short-call roll (US-104). */
export const EXPIRATION_NOT_AFTER_FILL = {
  code: 'expiration_not_after_fill',
  message: 'Expiration must be after the fill date.'
} as const satisfies PmccRule

/** A short call is covered only if it expires strictly before the LEAPS. ISO dates compare as strings. */
export const shortExpiresBeforeLeaps = (shortExpiration: string, longExpiration: string): boolean =>
  shortExpiration < longExpiration

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
      issueIf(fillDate !== undefined && fillDate > referenceDate, `${side}.fillDate`, {
        code: 'cannot_be_future',
        message: 'Fill date cannot be in the future.'
      })
    ),
    ...issueIf(
      long.fillDate !== undefined && short.fillDate !== undefined && long.fillDate > short.fillDate,
      'short.fillDate',
      {
        code: 'long_after_short',
        message: 'LEAPS must be acquired no later than the short-call fill.'
      }
    ),
    // Expired is checked first: with fill dates on the reference date, a past expiration is also
    // on/before the fill, and the expired-contract message is the one the trader needs.
    ...perLeg(({ expiration }, side) =>
      issueIf(expiration !== undefined && expiration < referenceDate, `${side}.expiration`, {
        code: 'expired_contract',
        message: 'Use an unexpired contract for opening a current position.'
      })
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
        new Decimal(short.strike).lte(long.strike),
      'short.strike',
      {
        code: 'strike_not_above_long',
        message: 'Short-call strike must be above the LEAPS strike.'
      }
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
      { code: 'no_change', message: 'Roll must change the strike, the expiration, or both' }
    )
  ]
}
