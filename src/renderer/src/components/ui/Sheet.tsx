import { type ReactNode } from 'react'

export function SheetCloseButton({ onClick }: { onClick: () => void }): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label="Close sheet"
      onClick={onClick}
      className="w-7 h-7 rounded-md border border-wb-border bg-wb-bg-elevated text-wb-text-muted flex items-center justify-center p-0 text-base leading-none cursor-pointer"
    >
      ×
    </button>
  )
}

export function SheetOverlay({
  children,
  onClose
}: {
  children: ReactNode
  onClose: () => void
}): React.JSX.Element {
  return (
    <div
      className="fixed top-0 right-0 bottom-0 left-[200px] z-50"
      style={{ top: 0, right: 0, bottom: 0 }}
    >
      <div className="absolute inset-0" style={{ inset: 0 }} onClick={onClose} />
      {children}
    </div>
  )
}

export function SheetPanel({
  children,
  width = 400
}: {
  children: ReactNode
  width?: number
}): React.JSX.Element {
  return (
    <div
      className="absolute top-0 right-0 bottom-0 bg-wb-bg-surface border-l border-wb-border flex flex-col shadow-sheet font-wb-mono text-wb-text-primary"
      style={{ top: 0, right: 0, bottom: 0, width: `${width}px` }}
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
  borderBottomColor = 'var(--wb-border)'
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
      className="flex justify-between items-start border-b px-6 py-5"
      style={{ borderBottomColor }}
    >
      <div>
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.08em]"
          style={{ color: eyebrowColor }}
        >
          {eyebrow}
        </span>
        <div className="text-base font-semibold mt-1">{title}</div>
        {subtitle && (
          <div data-testid="sheet-subtitle" className="text-xs text-wb-text-muted mt-0.5">
            {subtitle}
          </div>
        )}
      </div>
      <SheetCloseButton onClick={onClose} />
    </div>
  )
}

export function SheetBody({ children }: { children: ReactNode }): React.JSX.Element {
  return <div className="p-6 overflow-y-auto flex flex-col gap-4 flex-1">{children}</div>
}

export function SheetFooter({ children }: { children: ReactNode }): React.JSX.Element {
  return <div className="px-6 py-4 border-t border-wb-border flex gap-2.5 shrink-0">{children}</div>
}
