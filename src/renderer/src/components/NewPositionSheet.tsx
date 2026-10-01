import { useEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'wouter'
import { getSheetPortal } from '../lib/portal'
import { parsePromotedParams } from '../lib/promote'
import type { PmccRecorded, SharedFieldsHandle } from './new-position-shared'
import { NewWheelForm } from './NewWheelForm'
import { PmccEntryForm } from './PmccEntryForm'
import { StrategyToggle, type Strategy } from './StrategyToggle'
import { SheetHeader, SheetOverlay, SheetPanel } from './ui/Sheet'

const HELPER_LINE: Record<Strategy, string> = {
  STANDARD: 'Start the wheel with a cash-secured put.',
  PMCC: 'Long LEAPS call + a shorter-dated short call.'
}

type NewPositionSheetProps = {
  open: boolean
  /** The `#/new?…` query: `ticker=` pre-fill or a US-68 screener promote. */
  search: string
  onClose: () => void
  onRecorded: (recorded: PmccRecorded) => void
  /** Focused on close when the element that opened the sheet is gone (the `+ New Wheel` trigger). */
  returnFocusRef?: RefObject<HTMLElement | null>
}

/**
 * [US-101] The shared New position sheet. Unmounting on close drops both drafts, so
 * every open starts fresh in Standard.
 */
export function NewPositionSheet({
  open,
  ...props
}: NewPositionSheetProps): React.JSX.Element | null {
  if (!open) return null
  return createPortal(<NewPositionSheetContent {...props} />, getSheetPortal())
}

/** Only the visible form renders as a flex column; the other keeps its draft under `hidden`. */
function formPane(active: boolean): { hidden: boolean; className?: string } {
  return { hidden: !active, className: active ? 'flex min-h-0 flex-1 flex-col' : undefined }
}

function NewPositionSheetContent({
  search,
  onClose,
  onRecorded,
  returnFocusRef
}: Omit<NewPositionSheetProps, 'open'>): React.JSX.Element {
  const [, navigate] = useLocation()
  const [strategy, setStrategy] = useState<Strategy>('STANDARD')
  const [wheelPending, setWheelPending] = useState(false)
  const [pmccPending, setPmccPending] = useState(false)
  const pending = wheelPending || pmccPending
  const dialogRef = useRef<HTMLDivElement>(null)
  const wheelRef = useRef<SharedFieldsHandle>(null)
  const pmccRef = useRef<SharedFieldsHandle>(null)

  // [US-68] A screener promote carries the whole candidate; anything else (including a
  // malformed promote) falls back to the plain form, honouring a bare `?ticker=`.
  //
  // Read once and held: wouter's hash `navigate` writes the query into the real
  // `location.search` and never clears it, so without the consume-on-mount below the
  // params outlive the promote — the next plain open would re-open the form pre-filled
  // from a stale candidate.
  const [promoted] = useState(() => parsePromotedParams(search) ?? undefined)
  const [defaultTicker] = useState(() => new URLSearchParams(search).get('ticker') ?? undefined)
  // Keyed off the raw params, not the parsed result: a *malformed* promote is consumed
  // too, or its `ticker=` would still pre-fill the next plain open.
  const [carriesPromote] = useState(() => new URLSearchParams(search).has('promoted'))

  useEffect(() => {
    if (!carriesPromote) return
    // Drop the query while keeping the hash route. `replaceState` fires no hashchange,
    // so this mount keeps the payload it already parsed.
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`)
  }, [carriesPromote])

  // Whatever opened the sheet — the header link, the sidebar item, an empty-state or
  // success link — read during the first render, before anything inside takes focus.
  const [opener] = useState(() => document.activeElement)

  useEffect(() => {
    dialogRef.current?.focus()
    const fallback = returnFocusRef?.current
    return () => {
      const target =
        opener instanceof HTMLElement && opener !== document.body && opener.isConnected
          ? opener
          : fallback
      target?.focus()
    }
  }, [opener, returnFocusRef])

  const requestClose = (): void => {
    if (!pending) onClose()
  }

  const switchTo = (next: Strategy): void => {
    if (next === strategy) return
    const [from, to] = next === 'PMCC' ? [wheelRef, pmccRef] : [pmccRef, wheelRef]
    const shared = from.current?.getShared()
    if (shared) to.current?.setShared(shared)
    setStrategy(next)
  }

  return (
    <SheetOverlay onClose={requestClose}>
      <SheetPanel width={460}>
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="New position"
          tabIndex={-1}
          className="flex h-full min-h-0 flex-col outline-none"
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return
            // A portalled popover (the date picker's calendar) is a React child but not a
            // DOM one: its Escape bubbles here too, and belongs to the popover, not the sheet.
            const { target } = event
            if (!(target instanceof Node) || !dialogRef.current?.contains(target)) return
            event.stopPropagation()
            requestClose()
          }}
        >
          <SheetHeader
            eyebrow="OPEN WHEEL"
            title="New position"
            subtitle="Record a completed trade"
            onClose={requestClose}
          />
          <div className="border-b border-wb-border px-6 py-4">
            <StrategyToggle value={strategy} onChange={switchTo} disabled={pending} />
            <p className="mt-3 mb-0 text-xs text-wb-text-secondary">{HELPER_LINE[strategy]}</p>
          </div>
          <div {...formPane(strategy === 'STANDARD')}>
            <NewWheelForm
              navigate={navigate}
              defaultTicker={defaultTicker}
              promoted={promoted}
              sharedRef={wheelRef}
              onPendingChange={setWheelPending}
              onCancel={requestClose}
            />
          </div>
          <div {...formPane(strategy === 'PMCC')}>
            <PmccEntryForm
              onRecorded={onRecorded}
              onCancel={requestClose}
              sharedRef={pmccRef}
              onPendingChange={setPmccPending}
              active={strategy === 'PMCC'}
            />
          </div>
        </div>
      </SheetPanel>
    </SheetOverlay>
  )
}
