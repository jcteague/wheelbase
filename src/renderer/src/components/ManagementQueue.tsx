import { useState } from 'react'
import { useManagementQueue } from '../hooks/useManagementQueue'
import { SectionCard } from './ui/SectionCard'
import { ManagementQueueRow } from './ManagementQueueRow'
import { DismissConfirmPanel } from './DismissConfirmPanel'

type ConfirmingAlert = { alertId: string; ticker: string }

export function ManagementQueue(): React.JSX.Element {
  const { data } = useManagementQueue()
  const items = data ?? []
  const [confirmingAlert, setConfirmingAlert] = useState<ConfirmingAlert | null>(null)

  return (
    <>
      <SectionCard header="Management Queue">
        <div className="flex items-center justify-between border-b border-wb-border px-4 py-3.5">
          <h2 className="text-lg font-bold text-wb-text-primary">What Needs Attention First</h2>
          <span className="font-wb-mono text-xs text-wb-text-muted">
            {items.length ? `${items.length} open alerts` : 'All clear'}
          </span>
        </div>

        {items.length ? (
          items.map((item) => (
            <ManagementQueueRow
              key={item.alertId}
              item={item}
              onDismissClick={(alertId) => setConfirmingAlert({ alertId, ticker: item.ticker })}
            />
          ))
        ) : (
          <div className="px-7 py-7 text-center leading-relaxed text-wb-text-secondary">
            <p className="mb-2 text-wb-text-primary">No positions need attention right now</p>
            <p>
              All active wheels are outside the management window and below their alert thresholds.
            </p>
          </div>
        )}
      </SectionCard>

      {confirmingAlert ? (
        <DismissConfirmPanel
          key={confirmingAlert.alertId}
          alertId={confirmingAlert.alertId}
          ticker={confirmingAlert.ticker}
          onCancel={() => setConfirmingAlert(null)}
          onDismissed={() => {
            // Guard against a slow dismiss for a since-abandoned confirmation
            // resolving after the user has moved on to a different alert.
            const dismissedAlertId = confirmingAlert.alertId
            setConfirmingAlert((current) =>
              current?.alertId === dismissedAlertId ? null : current
            )
          }}
        />
      ) : null}
    </>
  )
}
