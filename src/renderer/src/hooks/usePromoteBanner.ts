import { derivePromoteBanner, type PromoteBanner, type PromotedCandidate } from '../lib/promote'
import { useMarketStatusDisplay } from './useMarketStatusDisplay'
import { usePromotedQuote } from './usePromotedQuote'

/** Everything the promoted form says about its quote. */
export type PromoteBannerState = {
  /** The single banner to show — never blocking, sometimes `{ kind: 'none' }`. */
  banner: PromoteBanner
  /**
   * The instant the freshest mark we hold was quoted — the re-fetch's once it lands,
   * the screener's until then. This is the provenance strip's number (AC: "the
   * snapshot time updates to the fresh quote's time").
   *
   * Deliberately *not* the number the banner prints: `offline` and `stale` both
   * describe the **pre-filled mark**, which is always the screener's, so they carry
   * `promoted.quotedAt` instead. The two can legitimately differ, and each names
   * what it is describing.
   */
  quotedAt: string
}

/**
 * [US-68] The promoted form's reconciliation with a one-shot fresh quote, or `null`
 * when nothing was promoted.
 *
 * Only mounted from `PromotedFormChrome`, i.e. only when something was promoted —
 * `useMarketStatusDisplay` polls broker status on a 60s interval, which the plain
 * US-1 form must not start.
 */
export function usePromoteBanner(
  promoted: PromotedCandidate,
  currentPremium: string
): PromoteBannerState {
  const { quote } = usePromotedQuote(promoted)
  const { display: marketDisplay } = useMarketStatusDisplay()

  return {
    banner: derivePromoteBanner({
      quote,
      marketDisplay,
      promotedPremium: promoted.premium,
      currentPremium,
      promotedQuotedAt: promoted.quotedAt
    }),
    quotedAt: typeof quote === 'object' ? quote.timestamp : promoted.quotedAt
  }
}
