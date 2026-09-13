import type { CSSProperties, ReactNode } from 'react'
import { MONO } from '../../lib/tokens'

type SectionCardProps = {
  header?: string
  headerVariant?: 'default' | 'emphasized'
  children: ReactNode
  className?: string
}

const cardStyle: CSSProperties = {
  background: 'var(--wb-bg-surface)',
  border: '1px solid var(--wb-border)',
  borderRadius: '8px',
  overflow: 'hidden'
}

const headerStyle = (headerVariant: SectionCardProps['headerVariant']): CSSProperties => ({
  padding: '10px 20px',
  borderBottom: '1px solid var(--wb-border)',
  fontSize: '0.7rem',
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--wb-text-muted)',
  fontFamily: MONO,
  ...(headerVariant === 'emphasized'
    ? { background: 'var(--wb-bg-elevated)', color: 'var(--wb-text-primary)' }
    : {})
})

export function SectionCard({
  header,
  headerVariant,
  children,
  className
}: SectionCardProps): React.JSX.Element {
  return (
    <section style={cardStyle} className={className}>
      {header ? <div style={headerStyle(headerVariant)}>{header}</div> : null}
      {children}
    </section>
  )
}
