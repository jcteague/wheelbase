import type { ScreenerIvRank } from '../api/screener'
import { tradingDaysLabel } from '../lib/ivr-tooltip'
import { formatIvrValue } from '../lib/screener-format'
import { AlertBox } from './ui/AlertBox'

// [US-96] What the current IV reading can and cannot decide.
//
// The number and its ring already say how old a reading is; this says what that costs
// the trader — which is the part a stuck stock needs explained. Only the unusable states
// earn a note: a fresh or aging reading decides conditions normally and has nothing to
// answer for.

type ReadingNoteProps = {
  ticker: string
  ivRank: ScreenerIvRank | null
  /** The trader's own IV threshold, when they set one. */
  ivrTrigger: number | null
}

type Note = {
  variant: 'info' | 'warning'
  kind: string
  text: string
}

/** Naming the trader's own threshold is more useful than the generic phrase, so the note
 *  quotes it whenever one exists. */
function conditionPhrase(ivrTrigger: number | null): string {
  return ivrTrigger === null ? 'an IV condition' : `“IVR ≥ ${ivrTrigger}”`
}

function noteFor(
  ticker: string,
  ivRank: ScreenerIvRank | null,
  ivrTrigger: number | null
): Note | null {
  const condition = conditionPhrase(ivrTrigger)

  // Reads as information, not a warning: the common cause is a ticker whose IV history is
  // simply too thin to rank yet, and nothing has gone wrong there.
  //
  // Says "usable reading", not "never collected": `null` also covers a row we hold but
  // cannot read — a corrupt value, or a calendar that cannot reach the observation. The
  // engine keeps those apart and logs the second for the operator, but the renderer is
  // handed the same `null` for both, so naming one of them here would be a guess.
  if (ivRank === null) {
    return {
      variant: 'info',
      kind: 'missing',
      text: `There is no usable IV rank for ${ticker}. Until one exists, an IV condition cannot be judged and this stock cannot reach Meets criteria on it.`
    }
  }

  const age = tradingDaysLabel(ivRank.ageTradingDays)
  const value = formatIvrValue(ivRank.value)

  switch (ivRank.state) {
    case 'expired':
      return {
        variant: 'warning',
        kind: 'expired',
        text: `The last IV rank for ${ticker} is ${age} old and has expired. It is treated as no reading: it cannot satisfy ${condition} and the IV-rank floor does not apply. Age this old means the collector has been failing for this name — check the snapshot diagnostics.`
      }
    case 'stale':
      return {
        variant: 'warning',
        kind: 'stale',
        text: `IV rank ${value} is ${age} old. It is shown for context but is treated as unknown: it cannot satisfy ${condition}. A reading older than one session in steady state means collection has been failing for ${ticker}.`
      }
    case 'predates_earnings':
      return {
        variant: 'warning',
        kind: 'predates_earnings',
        text: `IV rank ${value} was observed before ${ticker} reported earnings. IV re-prices through a print, so this reading is unusable regardless of age and cannot satisfy an IV condition. It will clear after the next collection.`
      }
    default:
      return null
  }
}

export function ReadingNote({
  ticker,
  ivRank,
  ivrTrigger
}: ReadingNoteProps): React.JSX.Element | null {
  const note = noteFor(ticker, ivRank, ivrTrigger)
  if (note === null) return null

  return (
    <AlertBox variant={note.variant} data-testid="bench-reading-note" data-kind={note.kind}>
      {note.text}
    </AlertBox>
  )
}
