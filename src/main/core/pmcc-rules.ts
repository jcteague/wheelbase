// [US-101] The PMCC opening rules that relate the two legs — the single source shared by the
// engine's `openPmcc` and the renderer's PMCC entry form schema, so the two cannot drift.
// Pure: no database, broker or logging imports.
import Decimal from 'decimal.js'
import type { PmccField } from './lifecycle'

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

export interface PmccIssue {
  field: Extract<
    PmccField,
    | 'long.fillDate'
    | 'short.fillDate'
    | 'long.expiration'
    | 'short.expiration'
    | 'short.strike'
    | '__pair__'
  >
  code: string
  message: string
}

const SIDES = ['long', 'short'] as const

const issueIf = (
  broken: boolean,
  field: PmccIssue['field'],
  code: string,
  message: string
): PmccIssue[] => (broken ? [{ field, code, message }] : [])

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
        fillDate !== undefined && fillDate > referenceDate,
        `${side}.fillDate`,
        'cannot_be_future',
        'Fill date cannot be in the future.'
      )
    ),
    ...issueIf(
      long.fillDate !== undefined && short.fillDate !== undefined && long.fillDate > short.fillDate,
      'short.fillDate',
      'long_after_short',
      'LEAPS must be acquired no later than the short-call fill.'
    ),
    // Expired is checked first: with fill dates on the reference date, a past expiration is also
    // on/before the fill, and the expired-contract message is the one the trader needs.
    ...perLeg(({ expiration }, side) =>
      issueIf(
        expiration !== undefined && expiration < referenceDate,
        `${side}.expiration`,
        'expired_contract',
        'Use an unexpired contract for opening a current position.'
      )
    ),
    ...perLeg(({ expiration, fillDate }, side) =>
      issueIf(
        expiration !== undefined && fillDate !== undefined && expiration <= fillDate,
        `${side}.expiration`,
        'expiration_not_after_fill',
        'Expiration must be after the fill date.'
      )
    ),
    ...issueIf(
      long.expiration !== undefined &&
        short.expiration !== undefined &&
        short.expiration >= long.expiration,
      'short.expiration',
      'short_not_before_long',
      'Short call must expire before the LEAPS call.'
    ),
    ...issueIf(
      long.strike !== undefined &&
        short.strike !== undefined &&
        new Decimal(short.strike).lte(long.strike),
      'short.strike',
      'strike_not_above_long',
      'Short-call strike must be above the LEAPS strike.'
    ),
    ...issueIf(
      long.fillPrice !== undefined &&
        short.fillPrice !== undefined &&
        new Decimal(long.fillPrice).minus(short.fillPrice).lte(0),
      '__pair__',
      'not_net_debit',
      'This PMCC entry requires a net debit before fees.'
    )
  ]
}
