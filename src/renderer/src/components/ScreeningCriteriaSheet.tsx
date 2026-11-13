// [US-67] The single editing surface behind every Screener entry point into the
// criteria. Portal + overlay only — the lens's form (`ScreeningCriteriaForm` for the
// wheel, `PmccScreeningCriteriaForm` for PMCC [US-110]) owns the form, and mounting
// it fresh on each open is what makes a dismissal discard the edits.

import { createPortal } from 'react-dom'
import type { PmccScreeningCriteria } from '../api/pmcc-screening-criteria'
import type { ScreeningCriteria } from '../api/screening-criteria'
import { getSheetPortal } from '../lib/portal'
import { PmccScreeningCriteriaForm } from './PmccScreeningCriteriaForm'
import { ScreeningCriteriaForm } from './ScreeningCriteriaForm'
import { SheetOverlay, SheetPanel } from './ui/Sheet'

export type ScreeningCriteriaSheetProps = {
  open: boolean
  watchlistCount?: number
  onClose: () => void
  /** Fired only when a save succeeds — `onClose` alone cannot tell a save from a dismissal. */
  onSaved?: () => void
} & (
  | { strategy: 'WHEEL'; criteria: ScreeningCriteria }
  | { strategy: 'PMCC'; pmccCriteria: PmccScreeningCriteria }
)

export function ScreeningCriteriaSheet(
  props: ScreeningCriteriaSheetProps
): React.JSX.Element | null {
  const { open, watchlistCount, onClose, onSaved } = props
  if (!open) return null

  return createPortal(
    <SheetOverlay onClose={onClose}>
      {/* 460 rather than the 400 default: the paired min/max inputs plus their
          toggles do not fit at 400. */}
      <SheetPanel width={460}>
        {props.strategy === 'WHEEL' ? (
          <ScreeningCriteriaForm
            criteria={props.criteria}
            watchlistCount={watchlistCount}
            onClose={onClose}
            onSaved={onSaved}
          />
        ) : (
          <PmccScreeningCriteriaForm
            criteria={props.pmccCriteria}
            watchlistCount={watchlistCount}
            onClose={onClose}
            onSaved={onSaved}
          />
        )}
      </SheetPanel>
    </SheetOverlay>,
    getSheetPortal()
  )
}
