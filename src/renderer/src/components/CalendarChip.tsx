import { tintFromColor } from '../lib/colorTint'
import { PHASE_COLOR } from '../lib/phase'
import type { CalendarEntry } from '../lib/expiration-calendar'

type CalendarChipProps = {
  entry: CalendarEntry
  dense?: boolean
}

export function CalendarChip({ entry, dense = false }: CalendarChipProps): React.JSX.Element {
  const color = PHASE_COLOR[entry.phase]

  return (
    <div
      className={[
        'inline-flex items-center gap-[5px] rounded font-wb-mono font-bold leading-tight',
        dense ? 'py-[1px] px-[5px] text-[0.62rem]' : 'py-[3px] px-[7px] text-[0.68rem]'
      ].join(' ')}
      style={tintFromColor(color)}
    >
      <span className="w-[5px] h-[5px] shrink-0 rounded-full" style={{ background: color }} />
      {entry.ticker}
    </div>
  )
}
