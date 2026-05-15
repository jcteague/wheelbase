import { useState, type ReactNode } from 'react'
import { MONO } from '../../lib/tokens'

type CollapsedDrawerProps = {
  title: string
  fieldCount: number
  defaultOpen?: boolean
  children: ReactNode
}

export function CollapsedDrawer({
  title,
  fieldCount,
  defaultOpen = false,
  children
}: CollapsedDrawerProps): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div
      style={{
        background: 'var(--wb-bg-surface)',
        border: '1px solid var(--wb-border)',
        borderRadius: 8
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          padding: '10px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          borderBottom: open ? '1px solid var(--wb-border)' : 'none',
          background: 'transparent',
          border: 'none',
          textAlign: 'left'
        }}
        aria-expanded={open}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--wb-text-muted)',
            display: 'flex',
            gap: 8,
            alignItems: 'center'
          }}
        >
          <span style={{ fontSize: 9 }}>{open ? '▼' : '▶'}</span>
          {title}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--wb-text-muted)' }}>
          {fieldCount} fields
        </span>
      </button>
      {open ? <div>{children}</div> : null}
    </div>
  )
}
