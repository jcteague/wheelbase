import { MONO } from '../../lib/tokens'

const statCellStyle: React.CSSProperties = {
  padding: '14px 20px',
  background: 'var(--wb-bg-surface)'
}

export type StatProps = { label: string; value: React.ReactNode }

export function Stat({ label, value }: StatProps): React.JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span
        style={{
          fontFamily: MONO,
          fontSize: '0.6rem',
          fontWeight: 600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--wb-text-muted)'
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: MONO,
          fontSize: '0.875rem',
          fontWeight: 500,
          color: 'var(--wb-text-primary)'
        }}
      >
        {value}
      </span>
    </div>
  )
}

type StatGridProps = { minWidth: number; items: StatProps[] }

export function StatGrid({ minWidth, items }: StatGridProps): React.JSX.Element {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))`,
        gap: '1px',
        background: 'var(--wb-border)'
      }}
    >
      {items.map(({ label, value }) => (
        <div key={label} style={statCellStyle}>
          <Stat label={label} value={value} />
        </div>
      ))}
    </div>
  )
}
