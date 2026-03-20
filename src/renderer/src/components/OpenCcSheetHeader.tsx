import { MONO } from '../lib/tokens'

export function OpenCcSheetHeader({
  eyebrow,
  title,
  subtitle,
  onClose,
  eyebrowColor
}: {
  eyebrow: string
  title: string
  subtitle?: string
  onClose: () => void
  eyebrowColor?: string
}): React.JSX.Element {
  return (
    <div
      style={{
        padding: '20px 24px 18px',
        borderBottom: '1px solid var(--wb-border)',
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12
      }}
    >
      <div>
        <span
          style={{
            fontSize: '0.65rem',
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase' as const,
            color: eyebrowColor ?? 'var(--wb-text-muted)',
            fontFamily: MONO
          }}
        >
          {eyebrow}
        </span>
        <div
          style={{ fontSize: 17, fontWeight: 700, color: 'var(--wb-text-primary)', marginTop: 6 }}
        >
          {title}
        </div>
        {subtitle ? (
          <div style={{ fontSize: 11, color: 'var(--wb-text-secondary)', marginTop: 4 }}>
            {subtitle}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        aria-label="Close sheet"
        onClick={onClose}
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          border: '1px solid var(--wb-border)',
          background: 'var(--wb-bg-elevated)',
          color: 'var(--wb-text-muted)',
          cursor: 'pointer'
        }}
      >
        ×
      </button>
    </div>
  )
}
