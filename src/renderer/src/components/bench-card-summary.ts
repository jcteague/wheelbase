import type { PmccScreenerCandidate } from '../api/pmcc-screener'
import type { ScreenerCandidate } from '../api/screener'
import type { BenchCandidate } from '../lib/bench'
import { fmtDiagonalLine, fmtPutLine, fmtScore } from '../lib/screener-format'

// [US-110] What a bench card says about its candidate, per lens. The card itself is
// lens-agnostic; everything that differs between a put and a diagonal on it lives here.

export type CardSummary<C extends BenchCandidate> = {
  /** The candidate in one line, shown while the stock meets criteria. */
  describeMatch: (candidate: C) => string
  /** The ranking score to two decimals, as the rank pill's title. */
  score: (candidate: C) => string
}

export const WHEEL_CARD_SUMMARY: CardSummary<ScreenerCandidate> = {
  describeMatch: fmtPutLine,
  score: (put) => fmtScore(put.yieldPerDelta)
}

export const PMCC_CARD_SUMMARY: CardSummary<PmccScreenerCandidate> = {
  describeMatch: fmtDiagonalLine,
  score: (diagonal) => fmtScore(diagonal.returnPerDelta)
}
