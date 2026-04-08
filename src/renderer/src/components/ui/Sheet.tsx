import { type ReactNode } from 'react'
import { MONO } from '../../lib/tokens'

export const SIDEBAR_WIDTH = 200

export function SheetCloseButton({ onClick }: { onClick: () => void }): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label="Close sheet"
      onClick={onClick}
      style={{
        width: 28,
        height: 28,
        borderRadius: 6,
        border: '1px solid var(--wb-border)',
        background: 'var(--wb-bg-elevated)',
        color: 'var(--wb-text-muted)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        fontSize: 16,
        lineHeight: 1,
      }}
    >
      ×
    </button>
  )
}

export function SheetOverlay({
  children,
  onClose,
}: {
  children: ReactNode
  onClose: () => void
}): React.JSX.Element {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        left: `${SIDEBAR_WIDTH}px`,
        zIndex: 50,
      }}
    >
      <div
        style={{ position: 'absolute', inset: 0 }}
        onClick={onClose}
      />
      {children}
    </div>
  )
}

export function SheetPanel({
  children,
  width = 400,
}: {
  children: ReactNode
  width?: number
}): React.JSX.Element {
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: `${width}px`,
        background: 'var(--wb-bg-surface)',
        borderLeft: '1px solid var(--wb-border)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: MONO,
        color: 'var(--wb-text-primary)',
        boxShadow: '-12px 0 48px rgba(0,0,0,0.5)',
      }}
    >
      {children}
    </div>
  )
}

export function SheetHeader({
  eyebrow,
  title,
  subtitle,
  onClose,
  eyebrowColor = 'var(--wb-text-muted)',
  borderBottomColor = 'var(--wb-border)',
}: {
  eyebrow: string
  title: string
  subtitle?: string
  onClose: () => void
  eyebrowColor?: string
  borderBottomColor?: string
}): React.JSX.Element {
  return (
    <div
      style={{
        padding: '20px 24px',
        borderBottom: `1px solid ${borderBottomColor}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
      }}
    >
      <div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: eyebrowColor,
          }}
        >
          {eyebrow}
        </span>
        <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>{title}</div>
        {subtitle && (
          <div
            data-testid="sheet-subtitle"
            style={{ fontSize: 12, color: 'var(--wb-text-muted)', marginTop: 2 }}
          >
            {subtitle}
          </div>
        )}
      </div>
      <SheetCloseButton onClick={onClose} />
    </div>
  )
}

export function SheetBody({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div
      style={{
        padding: '20px 24px',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        flex: 1,
      }}
    >
      {children}
    </div>
  )
}

export function SheetFooter({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div
      style={{
        padding: '16px 24px',
        borderTop: '1px solid var(--wb-border)',
        display: 'flex',
        gap: 10,
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  )
}
