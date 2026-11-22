// [US-104][US-105][US-115] The PMCC roll and sell sheets' frame: a portalled right-hand sheet holding one labelled
// dialog that takes focus on open and closes on Escape or a scrim click.
import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { getSheetPortal } from '../lib/portal'
import { SheetOverlay, SheetPanel } from './ui/Sheet'

type PmccRollSheetDialogProps = {
  label: string
  /** The panel's width in px; the roll sheets' 440 unless a sheet asks for another. */
  width?: number
  onClose: () => void
  children: ReactNode
}

export function PmccRollSheetDialog({
  label,
  width = 440,
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
      <SheetPanel width={width}>
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
