import type { CalendarEntry } from '../lib/expiration-calendar'

type WeekDensityBarProps = {
  entries: CalendarEntry[]
}

export function WeekDensityBar({ entries }: WeekDensityBarProps): React.JSX.Element {
  const cspCount = entries.filter((entry) => entry.phase === 'CSP_OPEN').length
  const ccCount = entries.filter((entry) => entry.phase === 'CC_OPEN').length

  return (
    <div className="flex gap-[2px] w-[120px] h-[6px] rounded-full overflow-hidden">
      {cspCount > 0 ? (
        <div data-testid="density-csp" className="bg-wb-gold" style={{ flexGrow: cspCount }} />
      ) : null}
      {ccCount > 0 ? (
        <div data-testid="density-cc" className="bg-wb-violet" style={{ flexGrow: ccCount }} />
      ) : null}
    </div>
  )
}
