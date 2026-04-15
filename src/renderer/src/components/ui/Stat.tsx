export type StatProps = { label: string; value: React.ReactNode }

export function Stat({ label, value }: StatProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-[5px]">
      <span className="font-wb-mono text-[0.6rem] font-semibold tracking-[0.1em] uppercase text-wb-text-muted">
        {label}
      </span>
      <span className="font-wb-mono text-sm font-medium text-wb-text-primary">{value}</span>
    </div>
  )
}

type StatGridProps = { minWidth: number; items: StatProps[] }

export function StatGrid({ minWidth, items }: StatGridProps): React.JSX.Element {
  return (
    <div
      className="grid gap-px bg-wb-border"
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))` }}
    >
      {items.map(({ label, value }) => (
        <div key={label} className="py-3.5 px-5 bg-wb-bg-surface">
          <Stat label={label} value={value} />
        </div>
      ))}
    </div>
  )
}
