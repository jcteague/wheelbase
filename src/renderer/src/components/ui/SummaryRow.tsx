type SummaryRowProps = {
  label: string
  value: string
  highlight?: boolean
}

export function SummaryRow({ label, value, highlight }: SummaryRowProps): React.JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '0.8rem',
        background: highlight
          ? 'linear-gradient(90deg, var(--wb-gold-subtle), transparent)'
          : undefined,
        padding: highlight ? '4px 0' : undefined
      }}
    >
      <span style={{ color: 'var(--wb-text-muted)' }}>{label}</span>
      <span style={{ textAlign: 'right' }}>{value}</span>
    </div>
  )
}
