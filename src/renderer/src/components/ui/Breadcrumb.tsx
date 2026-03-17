import { MONO } from '../../lib/tokens'

type BreadcrumbProps = {
  backTo: string
  backLabel: string
  current: string
}

export function Breadcrumb({ backTo, backLabel, current }: BreadcrumbProps): React.JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <a
        href={backTo}
        className="wb-nav-link"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          fontSize: '0.75rem',
          textDecoration: 'none',
          fontFamily: MONO
        }}
      >
        ← {backLabel}
      </a>
      <span style={{ color: 'var(--wb-border)', userSelect: 'none' }}>/</span>
      <span
        style={{
          fontFamily: MONO,
          fontWeight: 700,
          fontSize: '0.875rem',
          letterSpacing: '0.04em',
          color: 'var(--wb-text-primary)'
        }}
      >
        {current}
      </span>
    </div>
  )
}
