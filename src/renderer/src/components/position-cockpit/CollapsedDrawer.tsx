import { useState, type ReactNode } from 'react'

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
  const buttonBorder = open ? 'border-b border-wb-border' : ''
  return (
    <div className="bg-wb-bg-surface border border-wb-border rounded-lg">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={`w-full px-[18px] py-[10px] flex items-center justify-between cursor-pointer text-left ${buttonBorder}`}
      >
        <span className="font-wb-mono text-[11px] font-semibold tracking-[0.1em] uppercase text-wb-text-muted flex items-center gap-2">
          <span className="text-[9px]">{open ? '▼' : '▶'}</span>
          {title}
        </span>
        <span className="font-wb-mono text-[11px] text-wb-text-muted">{fieldCount} fields</span>
      </button>
      {open ? <div>{children}</div> : null}
    </div>
  )
}
