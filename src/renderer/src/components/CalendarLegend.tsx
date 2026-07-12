import { PHASE_COLOR, PHASE_LABEL } from '../lib/phase'

type LegendItemProps = {
  label: string
  dotClassName?: string
  dotStyle?: React.CSSProperties
}

function LegendItem({ label, dotClassName, dotStyle }: LegendItemProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-[6px]">
      <span
        className={['w-[7px] h-[7px] rounded-full shrink-0', dotClassName]
          .filter(Boolean)
          .join(' ')}
        style={dotStyle}
      />
      <span className="text-[0.72rem] text-wb-text-secondary">{label}</span>
    </div>
  )
}

export function CalendarLegend(): React.JSX.Element {
  return (
    <div className="flex items-center gap-4">
      {(['CSP_OPEN', 'CC_OPEN'] as const).map((phase) => (
        <LegendItem
          key={phase}
          label={PHASE_LABEL[phase]}
          dotStyle={{ background: PHASE_COLOR[phase] }}
        />
      ))}
      <LegendItem label="Holding (off-calendar)" dotClassName="bg-wb-sky" />
    </div>
  )
}
