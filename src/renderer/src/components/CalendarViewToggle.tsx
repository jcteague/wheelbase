type CalendarView = 'grid' | 'agenda'

type CalendarViewToggleProps = {
  value: CalendarView
  onChange: (value: CalendarView) => void
}

const OPTIONS: { value: CalendarView; label: string }[] = [
  { value: 'grid', label: 'Month Grid' },
  { value: 'agenda', label: 'Agenda' }
]

export function CalendarViewToggle({
  value,
  onChange
}: CalendarViewToggleProps): React.JSX.Element {
  return (
    <div className="inline-flex gap-0.5 p-[3px] rounded-full border border-wb-border bg-wb-bg-elevated">
      {OPTIONS.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={[
              'px-3 py-[5px] rounded-full font-wb-mono text-[0.72rem]',
              active ? 'bg-wb-gold-dim text-wb-gold font-bold' : 'text-wb-text-secondary'
            ].join(' ')}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
