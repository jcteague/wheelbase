import { createPortal } from 'react-dom'
import { firstErrorMessage } from '../api/error'
import { useDismissAlert } from '../hooks/useDismissAlert'
import { getSheetPortal } from '../lib/portal'
import { Button } from './ui/button'
import { ErrorAlert } from './ui/ErrorAlert'
import { SheetOverlay, SheetPanel, SheetHeader, SheetBody, SheetFooter } from './ui/Sheet'

export function DismissConfirmPanel({
  alertId,
  ticker,
  onCancel,
  onDismissed
}: {
  alertId: string
  ticker: string
  onCancel: () => void
  onDismissed: () => void
}): React.JSX.Element {
  const mutation = useDismissAlert()

  return createPortal(
    <SheetOverlay onClose={onCancel}>
      <SheetPanel>
        <SheetHeader
          eyebrow="Confirm Dismissal"
          title="Hide this alert until the condition clears?"
          onClose={onCancel}
        />

        <SheetBody>
          <p className="leading-relaxed text-wb-text-secondary">
            {ticker} will disappear from the open queue, but the dismissal will be recorded with a
            timestamp. If the condition clears and later returns, a fresh alert can appear.
          </p>
          {mutation.error ? (
            <ErrorAlert>{firstErrorMessage(mutation.error, 'Dismiss failed')}</ErrorAlert>
          ) : null}
        </SheetBody>

        <SheetFooter>
          <Button variant="outline" onClick={onCancel} className="flex-1">
            Keep alert open
          </Button>
          <Button
            onClick={() => mutation.mutate(alertId, { onSuccess: onDismissed })}
            disabled={mutation.isPending}
            className="flex-1 bg-wb-red font-bold text-white"
          >
            {mutation.isPending ? 'Dismissing…' : 'Confirm dismiss'}
          </Button>
        </SheetFooter>
      </SheetPanel>
    </SheetOverlay>,
    getSheetPortal()
  )
}
