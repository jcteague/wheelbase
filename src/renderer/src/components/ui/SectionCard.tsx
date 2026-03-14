import type { CSSProperties, ReactNode } from 'react'
import { MONO } from '../../lib/tokens'

type SectionCardProps = {
  header?: string
  children: ReactNode
}

const cardStyle: CSSProperties = {
  background: 'var(--wb-bg-surface)',
  border: '1px solid var(--wb-border)',
  borderRadius: '8px',
  overflow: 'hidden'
}

const headerStyle: CSSProperties = {
  padding: '10px 20px',
  borderBottom: '1px solid var(--wb-border)',
  fontSize: '0.65rem',
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--wb-text-muted)',
  fontFamily: MONO
}

export function SectionCard({ header, children }: SectionCardProps): React.JSX.Element {
  return (
    <section style={cardStyle}>
      {header ? <div style={headerStyle}>{header}</div> : null}
      {children}
    </section>
  )
}
