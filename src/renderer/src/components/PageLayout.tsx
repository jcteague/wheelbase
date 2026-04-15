type PageHeaderProps = {
  left: React.ReactNode
  right?: React.ReactNode
}

export function PageHeader({ left, right }: PageHeaderProps): React.JSX.Element {
  return (
    <div className="flex items-center justify-between px-[24px] py-[12px] border-b border-wb-border bg-wb-bg-surface shrink-0">
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
    <div className="flex flex-col h-full overflow-hidden">
      {header}
      <div className="flex-1 overflow-auto" style={contentStyle}>
        {children}
      </div>
    </div>
  )
}
