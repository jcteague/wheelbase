// [US-68] The cross-page contract between the screener row and the new-wheel form,
// plus the two display decisions the promoted form makes.
//
// Deliberately I/O-free: no hooks, no `window.api`. The promoted payload travels on
// the wouter hash query string (see plans/us-68/contracts/promote-navigation.md), so
// the codec, the price-moved threshold, and the banner state machine are all pure.
import { isValid, parseISO } from 'date-fns'
import Decimal from 'decimal.js'
import { z } from 'zod'
import type { ScreenerCandidate } from '../api/screener'
import type { MarketStatusDisplay } from '../components/MarketStatusPill'
import { isoDateSchema, positiveMoneySchema, tickerSchema } from '../schemas/common'
import { parseInputDecimal } from './decimal-input'
import { fmtMoney } from './format'
import { fmtQuoteTime } from './screener-format'

/** The screener fields a promote click carries. Narrower than `ScreenerCandidate` so
 *  the codec is testable from a literal rather than a 20-field fixture. */
export type PromoteSource = Pick<
  ScreenerCandidate,
  'ticker' | 'strike' | 'expiration' | 'mark' | 'timestamp'
>

/** The validated payload `NewWheelPage` hands to `NewWheelForm`. */
export type PromotedCandidate = {
  ticker: string
  strike: string
  expiration: string
  premium: string
  quotedAt: string
  thesis?: string
}

const instantSchema = z.string().refine((v) => isValid(parseISO(v)), 'Not a parseable instant')

const promotedParamsSchema = z.object({
  ticker: tickerSchema,
  strike: positiveMoneySchema,
  expiration: isoDateSchema,
  premium: positiveMoneySchema,
  quotedAt: instantSchema,
  thesis: z.string().trim().min(1).max(500).optional()
})

/**
 * The navigation search string for a promote click — without its leading `?`.
 * The screener's 4dp strike is normalized to the form's displayed value
 * (`'180.0000'` → `'180'`); the mark is carried verbatim as an editable default.
 */
export function buildPromoteSearch(candidate: PromoteSource, note?: string | null): string {
  const params = new URLSearchParams({
    promoted: '1',
    ticker: candidate.ticker,
    strike: new Decimal(candidate.strike).toString(),
    expiration: candidate.expiration,
    premium: candidate.mark,
    quotedAt: candidate.timestamp
  })
  const thesis = note?.trim()
  if (thesis) params.set('thesis', thesis)
  return params.toString()
}

/**
 * The promoted payload carried by a search string, or `null` when this is not a
 * promote navigation. Malformed params are not an error state — the page falls back
 * to the plain form (honouring a bare `?ticker=` if present).
 */
export function parsePromotedParams(search: string): PromotedCandidate | null {
  const params = new URLSearchParams(search)
  if (params.get('promoted') !== '1') return null

  const parsed = promotedParamsSchema.safeParse({
    ticker: params.get('ticker') ?? undefined,
    strike: params.get('strike') ?? undefined,
    expiration: params.get('expiration') ?? undefined,
    premium: params.get('premium') ?? undefined,
    quotedAt: params.get('quotedAt') ?? undefined,
    thesis: params.get('thesis') ?? undefined
  })
  return parsed.success ? parsed.data : null
}

/** The tick-noise floor, in dollars. A nickel move on a $2.70 mark is routine bid-ask bounce. */
const MOVE_FLOOR = '0.05'
/** The relative test — 5% of the promoted mark. It only outranks the floor above $1.00. */
const MOVE_FRACTION = '0.05'

/**
 * Whether the fresh mark drifted far enough from the promoted one to warn about:
 * `|fresh − promoted| > max($0.05, 5% of promoted)`. Strict — a deviation exactly
 * at the threshold is silent.
 */
export function markMovedMaterially(promotedMark: string, freshMark: string): boolean {
  const promoted = new Decimal(promotedMark)
  const threshold = Decimal.max(MOVE_FLOOR, promoted.times(MOVE_FRACTION))
  return new Decimal(freshMark).minus(promoted).abs().gt(threshold)
}

/** The one-shot re-fetch collapsed to the three cases the banner cares about. */
export type PromotedQuote = 'pending' | 'failed' | { mark: string; timestamp: string }

/** Exactly one banner state, carrying only what its copy names. */
export type PromoteBanner =
  | { kind: 'offline'; quotedAt: string }
  /** `session` distinguishes a closed market from an extended-hours one — the copy
   *  must not tell a trader the market is closed while the pill next to it reads EXT. */
  | { kind: 'stale'; quotedAt: string; session: 'CLOSED' | 'EXT' }
  | { kind: 'moved'; promotedMark: string; freshMark: string }
  | { kind: 'edited'; enteredPremium: string; promotedMark: string }
  | { kind: 'match'; promotedMark: string; freshMark: string }
  | { kind: 'none' }

export type PromoteBannerInput = {
  quote: PromotedQuote
  marketDisplay: MarketStatusDisplay
  promotedPremium: string
  /** The premium field's live value — free text, so it may not parse. */
  currentPremium: string
  /**
   * When the **pre-filled** mark was quoted, i.e. always the screener's instant.
   * Deliberately not the fresh quote's: `offline` and `stale` describe the value
   * sitting in the premium field, so naming the re-fetch's time would assert a
   * false provenance for it. The provenance strip's instant is resolved separately
   * in `usePromoteBanner`.
   */
  promotedQuotedAt: string
}

/**
 * Whether the trader has replaced the promoted mark with a price of their own.
 *
 * A property of the form, not of the banner: the derived row must say "recomputed
 * from your price" whenever it genuinely did, including when a higher-precedence
 * banner (offline / stale / moved) is occupying the one banner slot.
 */
export function isPremiumOverridden(currentPremium: string, promotedPremium: string): boolean {
  // A cleared or half-typed premium is not an override to announce: there is no
  // entered price to name, and the field is mid-edit rather than decided.
  const entered = parseInputDecimal(currentPremium)
  return entered !== null && !entered.equals(promotedPremium)
}

/**
 * The single banner the promoted form shows, first match wins:
 * offline > stale > moved > edited > match > none.
 *
 * `offline` outranks `stale` because it explains why no fresh time is shown, and
 * `stale` outranks the price comparisons because a closed-market fetch "succeeds"
 * with the 16:00 close — comparing against it would mislead. No state ever blocks
 * submit.
 */
export function derivePromoteBanner(input: PromoteBannerInput): PromoteBanner {
  const { quote, marketDisplay, promotedPremium, currentPremium, promotedQuotedAt } = input

  if (quote === 'failed') return { kind: 'offline', quotedAt: promotedQuotedAt }
  if (marketDisplay === 'CLOSED' || marketDisplay === 'EXT') {
    return { kind: 'stale', quotedAt: promotedQuotedAt, session: marketDisplay }
  }

  const fresh = quote === 'pending' ? null : quote
  if (fresh && markMovedMaterially(promotedPremium, fresh.mark)) {
    return { kind: 'moved', promotedMark: promotedPremium, freshMark: fresh.mark }
  }
  if (isPremiumOverridden(currentPremium, promotedPremium)) {
    return { kind: 'edited', enteredPremium: currentPremium, promotedMark: promotedPremium }
  }
  if (fresh) {
    return { kind: 'match', promotedMark: promotedPremium, freshMark: fresh.mark }
  }
  return { kind: 'none' }
}

/**
 * The trader-facing copy for each banner state, in one place — the e2e spec asserts
 * these same strings against the running app. `null` when there is nothing to say
 * (the re-fetch is still in flight on an open market).
 */
export function promoteBannerMessage(banner: PromoteBanner): string | null {
  switch (banner.kind) {
    case 'offline':
      return `Couldn't refresh quote — showing screener snapshot from ${fmtQuoteTime(banner.quotedAt)}. Verify before recording.`
    case 'stale':
      // Equity options don't trade extended hours, so an EXT mark is just the 4:00
      // close while the underlying keeps moving — stale for the same reason, but the
      // market is not closed and the copy must not say so.
      return banner.session === 'CLOSED'
        ? `Market closed — the pre-filled mark is a stale after-hours snapshot (quoted ${fmtQuoteTime(banner.quotedAt)}). Verify before recording.`
        : `Extended hours — options aren't trading, so the pre-filled mark is a stale snapshot (quoted ${fmtQuoteTime(banner.quotedAt)}). Verify before recording.`
    case 'moved':
      return `Price moved: quoted ${fmtMoney(banner.promotedMark)} → now ${fmtMoney(banner.freshMark)} — review before submitting.`
    case 'edited':
      return `Recording your entered price (${fmtMoney(banner.enteredPremium)}), not the screener snapshot (${fmtMoney(banner.promotedMark)}).`
    case 'match':
      return new Decimal(banner.freshMark).equals(banner.promotedMark)
        ? `Fresh quote matches the promoted mark — ${fmtMoney(banner.promotedMark)}.`
        : `Fresh quote ${fmtMoney(banner.freshMark)} — no material move from the promoted ${fmtMoney(banner.promotedMark)}.`
    case 'none':
      return null
  }
}
