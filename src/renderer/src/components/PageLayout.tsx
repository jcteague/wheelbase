type PageHeaderProps = {
  left: React.ReactNode
  right?: React.ReactNode
}

export function PageHeader({ left, right }: PageHeaderProps): React.JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 24px',
        borderBottom: '1px solid var(--wb-border)',
        background: 'var(--wb-bg-surface)',
        flexShrink: 0
      }}
    >
      {left}
      {right}
    </div>
  )
}

type PageLayoutProps = {
  header: React.ReactNode
  contentStyle?: React.CSSProperties
  children: React.ReactNode
}

export function PageLayout({ header, contentStyle, children }: PageLayoutProps): React.JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {header}
      <div style={{ flex: 1, overflow: 'auto', ...contentStyle }}>{children}</div>
    </div>
  )
}
