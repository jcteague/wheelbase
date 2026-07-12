type CalendarMonthNavProps = {
  label: string
  onPrev: () => void
  onNext: () => void
  onToday: () => void
}

const STEP_BUTTON_CLASS =
  'w-7 h-7 rounded border border-wb-border bg-wb-bg-elevated text-wb-text-secondary font-wb-mono'

export function CalendarMonthNav({
  label,
  onPrev,
  onNext,
  onToday
}: CalendarMonthNavProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-[10px]">
      <button type="button" onClick={onPrev} className={STEP_BUTTON_CLASS}>
        ‹
      </button>
      <button type="button" onClick={onNext} className={STEP_BUTTON_CLASS}>
        ›
      </button>
      <div className="text-[1.15rem] font-semibold text-wb-text-primary">{label}</div>
      <button
        type="button"
        onClick={onToday}
        className="ml-1 px-[10px] py-1 rounded-full border border-wb-border bg-transparent text-wb-text-secondary font-wb-mono text-[0.68rem]"
      >
        Today
      </button>
    </div>
  )
}
