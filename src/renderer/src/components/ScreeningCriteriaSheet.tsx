// [US-67] The single editing surface behind every Screener entry point into the
// criteria. Portal + overlay only — `ScreeningCriteriaForm` owns the form, and
// mounting it fresh on each open is what makes a dismissal discard the edits.

import { createPortal } from 'react-dom'
import type { ScreeningCriteria } from '../api/screening-criteria'
import { getSheetPortal } from '../lib/portal'
import { ScreeningCriteriaForm } from './ScreeningCriteriaForm'
import { SheetOverlay, SheetPanel } from './ui/Sheet'

export type ScreeningCriteriaSheetProps = {
  open: boolean
  criteria: ScreeningCriteria
  watchlistCount?: number
  onClose: () => void
  /** Fired only when a save succeeds — `onClose` alone cannot tell a save from a dismissal. */
  onSaved?: () => void
}

export function ScreeningCriteriaSheet({
  open,
  criteria,
  watchlistCount,
  onClose,
  onSaved
}: ScreeningCriteriaSheetProps): React.JSX.Element | null {
  if (!open) return null

  return createPortal(
    <SheetOverlay onClose={onClose}>
      {/* 460 rather than the 400 default: the paired min/max inputs plus their
          toggles do not fit at 400. */}
      <SheetPanel width={460}>
        <ScreeningCriteriaForm
          criteria={criteria}
          watchlistCount={watchlistCount}
          onClose={onClose}
          onSaved={onSaved}
        />
      </SheetPanel>
    </SheetOverlay>,
    getSheetPortal()
  )
}
