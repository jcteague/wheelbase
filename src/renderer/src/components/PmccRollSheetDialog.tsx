// [US-104][US-105] The PMCC roll sheets' frame: a portalled right-hand sheet holding one labelled
// dialog that takes focus on open and closes on Escape or a scrim click.
import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { getSheetPortal } from '../lib/portal'
import { SheetOverlay, SheetPanel } from './ui/Sheet'

type PmccRollSheetDialogProps = {
  label: string
  onClose: () => void
  children: ReactNode
}

export function PmccRollSheetDialog({
  label,
  onClose,
  children
}: PmccRollSheetDialogProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== 'Escape') return
    // A portalled date-picker popover's Escape bubbles here too, and belongs to it.
    const { target } = event
    if (!(target instanceof Node) || !dialogRef.current?.contains(target)) return
    event.stopPropagation()
    onClose()
  }

  return createPortal(
    <SheetOverlay onClose={onClose}>
      <SheetPanel width={440}>
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          tabIndex={-1}
          className="flex h-full min-h-0 flex-col outline-none"
          onKeyDown={handleKeyDown}
        >
          {children}
        </div>
      </SheetPanel>
    </SheetOverlay>,
    getSheetPortal()
  )
}
