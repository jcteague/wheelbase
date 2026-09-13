/**
 * [US-96] The pure verdict engine behind the bench.
 *
 * One watchlist entry carries up to three entry conditions — a price target, an IV-rank
 * trigger, and a post-earnings gate. This module turns those conditions plus the day's
 * snapshot values into a per-gate verdict, with no I/O of any kind, so the same rules can
 * later answer an alert without a page being open.
 *
 * The rule that shapes every gate: an unknown never decides anything. A missing quote or a
 * reading too old to trust yields `unknown`, never a quiet pass — a stock only reaches
 * "meets criteria" on evidence, not on the absence of a refusal.
 */
import Decimal from 'decimal.js'
import { differenceInCalendarDays, parseISO } from 'date-fns'

import { isUsableState, type AssessedIvRank, type IvRankState } from './ivr-freshness'
import type { EarningsLookup } from './screener'
import { etDateOf } from './trading-calendar'

export type GateVerdict = 'met' | 'unmet' | 'unknown' | 'none'

export type Gate = {
  verdict: GateVerdict
  /** Trader-facing reason when the gate is unmet or unknown; null for met/none. */
  label: string | null
}

export type EntryVerdict = {
  price: Gate
  iv: Gate
  earnings: Gate
}

/** Everything the engine needs for one entry — plain values, no I/O. */
export type EntrySignalInput = {
  conditions: {
    ownBelowPrice: string | null // 4dp TEXT
    ivrTrigger: number | null
    postEarningsOnly: boolean
  }
  price: string | null // quote price, null when the quote failed
  ivRank: AssessedIvRank | null
  earnings: EarningsLookup
  now: Date
}

export type EarningsDisplay =
  | { kind: 'date'; date: string; daysUntil: number; withinWindow: boolean }
  | { kind: 'unknown' }

/** How near a print has to be to be worth a caution on the row. Inclusive: a report seven
 *  days out is still inside the window, because the trader's next entry would straddle it. */
const EARNINGS_WINDOW_DAYS = 7

const met: Gate = { verdict: 'met', label: null }
const none: Gate = { verdict: 'none', label: null }
const unmet = (label: string): Gate => ({ verdict: 'unmet', label })
const unknown = (label: string): Gate => ({ verdict: 'unknown', label })

function priceGate(ownBelowPrice: string | null, price: string | null): Gate {
  if (ownBelowPrice === null) return none
  if (price === null) return unknown('Price unavailable')

  const target = new Decimal(ownBelowPrice)
  const last = new Decimal(price)
  if (last.lessThanOrEqualTo(target)) return met

  // `Decimal.toString()` trims "170.0000" to "170" and "170.5000" to "170.5" — the same trim
  // the `≤ $170` condition tag uses, so the reason names the target as the trader wrote it.
  return unmet(`Price $${last.toFixed(2)} above $${target.toString()} target`)
}

/** Why an unusable reading cannot answer the question. States absent here — `expired`
 *  today — have nothing more specific to say than that there is no reading to judge on,
 *  which is also what a ticker we have never collected shows. */
const IV_UNKNOWN_LABEL: Partial<Record<IvRankState, string>> = {
  stale: 'IV too old to judge',
  predates_earnings: 'IV predates earnings'
}

function ivGate(trigger: number | null, reading: AssessedIvRank | null): Gate {
  if (trigger === null) return none
  if (reading === null) return unknown('IV unavailable')
  // `isUsableState` is the one authority on which readings may decide anything, so this gate
  // asks it rather than keeping a second list of states that can drift away from it.
  if (!isUsableState(reading.state)) {
    return unknown(IV_UNKNOWN_LABEL[reading.state] ?? 'IV unavailable')
  }

  // `Decimal`, not a float compare: this is the same stored 1dp value the screener's own
  // IV-rank floor tests with `Decimal`, and one threshold rule judged two different ways is
  // how the two quietly disagree at a boundary.
  return new Decimal(reading.value).greaterThanOrEqualTo(trigger) ? met : unmet('IV low')
}

/**
 * Calendar days from today to `date`, counted on the Eastern day both the market and the
 * earnings calendar speak in. Comparing the raw instant would put a late-evening ET moment
 * on the following UTC day and report one day too few.
 */
function daysUntilEarnings(date: string, now: Date): number {
  return differenceInCalendarDays(parseISO(date), parseISO(etDateOf(now)))
}

/** The earnings line shown on every stock, gate or no gate — a past or missing date reads as
 *  unknown so nothing is silently treated as clear. */
export function earningsDisplay(earnings: EarningsLookup, now: Date): EarningsDisplay {
  if (earnings.status !== 'found') return { kind: 'unknown' }

  const daysUntil = daysUntilEarnings(earnings.date, now)
  // An unreadable date or clock yields NaN, and every comparison against NaN is false — so
  // without this guard the window check below falls through and the gate reports `met`.
  // That inverts the rule this whole module is built on: an unknown decides nothing, and a
  // date nobody can parse is the least qualified thing there is to clear a trader into a print.
  if (Number.isNaN(daysUntil) || daysUntil < 0) return { kind: 'unknown' }

  return {
    kind: 'date',
    date: earnings.date,
    daysUntil,
    withinWindow: daysUntil <= EARNINGS_WINDOW_DAYS
  }
}

function earningsGate(postEarningsOnly: boolean, earnings: EarningsLookup, now: Date): Gate {
  if (!postEarningsOnly) return none

  // The gate reads the very line the row shows, so a row reporting a print in three days can
  // never sit beside a gate that passed.
  const display = earningsDisplay(earnings, now)
  // A date we cannot confirm is a caution, not a pass: the gate exists precisely to keep the
  // trader out of an unpriced print.
  if (display.kind === 'unknown') return unknown('Earnings date unknown')

  const { daysUntil, withinWindow } = display
  if (!withinWindow) return met
  if (daysUntil === 0) return unmet('Earnings today')

  return unmet(`Earnings in ${daysUntil} ${daysUntil === 1 ? 'day' : 'days'}`)
}

export function evaluateEntry(input: EntrySignalInput): EntryVerdict {
  return {
    price: priceGate(input.conditions.ownBelowPrice, input.price),
    iv: ivGate(input.conditions.ivrTrigger, input.ivRank),
    earnings: earningsGate(input.conditions.postEarningsOnly, input.earnings, input.now)
  }
}

/** A gate holds the stock back while it is `unmet` or `unknown` — the absence of a refusal
 *  is not a pass, so an unknown blocks exactly as an unmet condition does. */
function isBlocking(gate: Gate): boolean {
  return gate.verdict === 'unmet' || gate.verdict === 'unknown'
}

/** The labels of every gate that is holding the stock back, most decisive first: earnings
 *  keeps a trader out whatever the price, and a price miss outranks an IV reading. */
export function reasonsFor(verdict: EntryVerdict): string[] {
  return [verdict.earnings, verdict.price, verdict.iv]
    .filter(isBlocking)
    .map((gate) => gate.label)
    .filter((label): label is string => label !== null)
}

export function allGatesPass(verdict: EntryVerdict): boolean {
  return ![verdict.price, verdict.iv, verdict.earnings].some(isBlocking)
}
