type Urgency = 'high' | 'medium' | 'low'

const URGENCY_PILL: Record<Urgency, { label: string; className: string }> = {
  high: { label: 'HIGH', className: 'text-wb-red bg-wb-red-dim' },
  medium: { label: 'MED', className: 'text-wb-gold bg-wb-gold-dim' },
  low: { label: 'LOW', className: 'text-wb-blue bg-wb-blue-dim' }
}

export function UrgencyPill({ urgency }: { urgency: Urgency }): React.JSX.Element {
  const { label, className } = URGENCY_PILL[urgency]

  return (
    <span
      className={`inline-flex w-fit items-center rounded-full px-2 py-[3px] font-wb-mono text-[0.65rem] font-bold tracking-[0.08em] ${className}`}
    >
      {label}
    </span>
  )
}
