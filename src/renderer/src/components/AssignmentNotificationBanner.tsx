import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from 'wouter'
import { usePendingAssignments } from '../api/assignments'
import { positionQueryKeys } from '../hooks/positionQueryKeys'
import { fmtDate } from '../lib/format'
import { AlertBox } from './ui/AlertBox'

// How long a toast lingers before it auto-dismisses. Bounds the toast list so a
// long session can't accumulate stale success/error notifications indefinitely.
const TOAST_TTL_MS = 10_000

type Toast = {
  id: number
  tone: 'success' | 'error'
  message: string
  positionId?: string
}

// "180.00" → "180", "180.50" → "180.5" so the strike reads like the story copy.
function formatStrike(strike: string): string {
  return String(Number(strike))
}

type IpcErrorResult = { errors: Array<{ message: string }> }

function errorText(result: IpcErrorResult): string {
  return result.errors[0]?.message ?? 'Something went wrong. Please try again.'
}

// Each toast owns its own auto-dismiss timer (scheduled on mount, cleared on
// unmount) so a newly-arriving toast never resets an existing toast's countdown.
function ToastItem({
  toast,
  onDismiss
}: {
  toast: Toast
  onDismiss: (id: number) => void
}): React.JSX.Element {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), TOAST_TTL_MS)
    return () => clearTimeout(timer)
  }, [toast.id, onDismiss])

  const toneClass =
    toast.tone === 'success'
      ? 'border-wb-green-border bg-wb-green-dim text-wb-green'
      : 'border-wb-red-border bg-wb-red-dim text-wb-red'

  return (
    <div
      role="status"
      className={`flex items-center gap-3 rounded-md border px-4 py-3 text-[0.8125rem] font-wb-mono shadow-lg ${toneClass}`}
    >
      <span>{toast.message}</span>
      {toast.positionId && <Link href={`/positions/${toast.positionId}`}>Open covered call →</Link>}
      <button
        aria-label="Dismiss notification"
        className="ml-1 text-wb-text-muted"
        onClick={() => onDismiss(toast.id)}
      >
        ✕
      </button>
    </div>
  )
}

export function AssignmentNotificationBanner(): React.JSX.Element | null {
  const { data } = usePendingAssignments()
  const queryClient = useQueryClient()
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(new Set())
  const [toasts, setToasts] = useState<Toast[]>([])

  const visible = (data ?? []).filter((a) => !hiddenIds.has(a.id))

  const dismissToast = useCallback((id: number): void => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  if (visible.length === 0 && toasts.length === 0) return null

  function hide(id: number): void {
    setHiddenIds((prev) => new Set([...prev, id]))
  }

  // Replace any existing toast with the same id so a retry that succeeds swaps
  // out the earlier error toast instead of colliding on the React key.
  function pushToast(toast: Toast): void {
    setToasts((prev) => [...prev.filter((t) => t.id !== toast.id), toast])
  }

  async function handleConfirm(assignment: PendingAssignmentNotification): Promise<void> {
    const result = await window.api.assignments.confirm(assignment.id)
    if (!result.ok) {
      pushToast({ id: assignment.id, tone: 'error', message: errorText(result) })
      return
    }
    const shares = assignment.qty * 100
    hide(assignment.id)
    pushToast({
      id: assignment.id,
      tone: 'success',
      positionId: assignment.positionId,
      message: `${assignment.ticker} assigned — now holding ${shares} shares at $${formatStrike(assignment.strike)} strike`
    })
    queryClient.invalidateQueries({ queryKey: positionQueryKeys.all })
    queryClient.invalidateQueries({ queryKey: positionQueryKeys.detail(assignment.positionId) })
    queryClient.invalidateQueries({ queryKey: ['assignments', 'pending'] })
  }

  async function handleDismiss(id: number): Promise<void> {
    const result = await window.api.assignments.dismiss(id)
    if (!result.ok) {
      pushToast({ id, tone: 'error', message: errorText(result) })
      return
    }
    hide(id)
    queryClient.invalidateQueries({ queryKey: ['assignments', 'pending'] })
  }

  return (
    <>
      {visible.length > 0 && (
        <div className="flex flex-col gap-2 px-[24px] py-[12px]">
          {visible.map((assignment) => (
            <AlertBox key={assignment.id} variant="warning">
              <div className="flex items-center gap-3 animate-wb-pulse">
                <span>
                  Assignment detected: {assignment.ticker} ${formatStrike(assignment.strike)}{' '}
                  {assignment.contractType.toUpperCase()} was assigned on{' '}
                  {fmtDate(assignment.transactionTime.slice(0, 10))}. Confirm to update position.
                </span>
                <div className="flex gap-2 ml-auto">
                  <button
                    className="px-3 py-1 rounded text-xs font-medium bg-wb-gold text-wb-bg-base"
                    onClick={() => handleConfirm(assignment)}
                  >
                    Confirm
                  </button>
                  <button
                    className="px-3 py-1 rounded text-xs font-medium border border-wb-border text-wb-text-muted"
                    onClick={() => handleDismiss(assignment.id)}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </AlertBox>
          ))}
        </div>
      )}

      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
          {toasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
          ))}
        </div>
      )}
    </>
  )
}
