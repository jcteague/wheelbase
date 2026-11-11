import type { OptionMark } from '../../lib/option-mark'
import { SUB } from './styles'

type OptionMarkTextProps = {
  mark: OptionMark
  testId: string
  /** What an unavailable mark reads; the wheel card's wording by default. */
  unavailableLabel?: string
}

/** An open option leg's mid with its no-bid / wide-spread note — shared by both cards. */
export function OptionMarkText({
  mark,
  testId,
  unavailableLabel = '— unavailable'
}: OptionMarkTextProps): React.JSX.Element {
  if (mark === 'unavailable') {
    return (
      <span data-testid={testId} title="Option snapshot unavailable" className="cursor-help">
        {unavailableLabel}
      </span>
    )
  }
  const { note } = mark
  return (
    <span data-testid={testId}>
      {mark.mid}
      {note?.kind === 'noBid' && <span className={SUB}> no bid</span>}
      {note?.kind === 'wideSpread' && (
        <span
          data-testid="opt-mid-spread-warning"
          title={note.tooltip}
          className="ml-1 text-wb-gold"
        >
          ⚠
        </span>
      )}
    </span>
  )
}
