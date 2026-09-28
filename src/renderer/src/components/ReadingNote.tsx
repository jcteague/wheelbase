import type { IvRankPair } from '../api/ivr'
import { ivrAbsenceNote, type IvrNote, tradingDaysLabel } from '../lib/ivr-tooltip'
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
  /** The row's reading or, when there is none, why. */
  ivr: IvRankPair
  /** The trader's own IV threshold, when they set one. */
  ivrTrigger: number | null
}

/** Naming the trader's own threshold is more useful than the generic phrase, so the note
 *  quotes it whenever one exists. */
function conditionPhrase(ivrTrigger: number | null): string {
  return ivrTrigger === null ? 'an IV condition' : `“IVR ≥ ${ivrTrigger}”`
}

function noteFor(ticker: string, ivr: IvRankPair, ivrTrigger: number | null): IvrNote | null {
  const condition = conditionPhrase(ivrTrigger)
  const { ivRank, ivRankAbsence } = ivr

  // The main process says why a reading is missing, so the note names that reason rather
  // than guessing at one.
  if (ivRank === null) {
    return ivrAbsenceNote(ticker, ivRankAbsence, condition)
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
      if (ivRank.value !== null) return null
      // A usable reading with no rank: the window is flat, so the percentile still stands
      // but a rank condition has nothing to compare against.
      return {
        variant: 'info',
        kind: 'flat_range',
        text: `IV rank unavailable for a flat 52-week range: ${ticker}'s IV30 held at ${ivRank.low} all year. IV percentile ${ivRank.percentile} still stands, but ${condition} cannot be judged on rank until the range widens.`
      }
  }
}

export function ReadingNote({
  ticker,
  ivr,
  ivrTrigger
}: ReadingNoteProps): React.JSX.Element | null {
  const note = noteFor(ticker, ivr, ivrTrigger)
  if (note === null) return null

  return (
    <AlertBox
      variant={note.variant}
      data-testid="bench-reading-note"
      data-kind={note.kind}
      data-tone={note.variant}
    >
      {note.text}
    </AlertBox>
  )
}
