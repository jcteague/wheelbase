type ScreenerCriteriaStripProps = {
  /** What the chips describe — `Criteria` for the wheel, `PMCC criteria` for the PMCC lens. */
  label: string
  chips: string[]
  onClick: () => void
}

/** Clickable summary of what is currently filtering the screener; opens the criteria sheet. */
export function ScreenerCriteriaStrip({
  label,
  chips,
  onClick
}: ScreenerCriteriaStripProps): React.JSX.Element {
  return (
    <button
      type="button"
      data-testid="screener-criteria-strip"
      onClick={onClick}
      className="flex w-full cursor-pointer flex-wrap items-center gap-[10px] rounded-md border border-wb-border bg-wb-bg-surface px-[14px] py-[9px] text-left hover:bg-wb-bg-hover"
    >
      <span className="font-wb-mono text-[0.6rem] uppercase tracking-[0.12em] text-wb-text-muted">
        {label}
      </span>
      {chips.map((chip) => (
        <span
          key={chip}
          className="whitespace-nowrap rounded border border-wb-border-subtle bg-wb-bg-elevated px-2 py-[2px] font-wb-mono text-[0.7rem] text-wb-text-secondary"
        >
          {chip}
        </span>
      ))}
      <span className="ml-auto font-wb-mono text-[0.68rem] text-wb-gold">Edit →</span>
    </button>
  )
}
