import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from 'wouter'
import { usePendingAssignments } from '../api/assignments'
import { AlertBox } from './ui/AlertBox'

type ConfirmedState = {
  positionId: number
}

export function AssignmentNotificationBanner(): React.JSX.Element | null {
  const { data } = usePendingAssignments()
  const queryClient = useQueryClient()
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set())
  const [confirmedMap, setConfirmedMap] = useState<Record<number, ConfirmedState>>({})

  const visible = (data ?? []).filter((a) => !dismissedIds.has(a.id))

  if (visible.length === 0) return null

  async function handleConfirm(id: number, positionId: number): Promise<void> {
    const result = await window.api.assignments.confirm(id)
    if (result.ok) {
      setConfirmedMap((prev) => ({ ...prev, [id]: { positionId } }))
      queryClient.invalidateQueries({ queryKey: ['positions', 'list'] })
      queryClient.invalidateQueries({ queryKey: ['positions', String(positionId)] })
      queryClient.invalidateQueries({ queryKey: ['assignments', 'pending'] })
    }
  }

  async function handleDismiss(id: number): Promise<void> {
    const result = await window.api.assignments.dismiss(id)
    if (result.ok) {
      setDismissedIds((prev) => new Set([...prev, id]))
      queryClient.invalidateQueries({ queryKey: ['assignments', 'pending'] })
    }
  }

  return (
    <div className="flex flex-col gap-2 px-[24px] py-[12px]">
      {visible.map((assignment) => {
        const confirmed = confirmedMap[assignment.id]
        const dateStr = assignment.transactionTime.slice(0, 10)

        if (confirmed) {
          return (
            <AlertBox key={assignment.id} variant="success">
              <div className="flex items-center gap-3">
                <span>Assignment confirmed</span>
                <Link href={`/positions/${confirmed.positionId}`}>Open covered call →</Link>
              </div>
            </AlertBox>
          )
        }

        return (
          <AlertBox key={assignment.id} variant="warning">
            <div className="flex items-center gap-3 animate-wb-pulse">
              <span className="font-semibold">{assignment.ticker}</span>
              <span>${assignment.strike}</span>
              <span>{assignment.contractType}</span>
              <span>{dateStr}</span>
              <div className="flex gap-2 ml-auto">
                <button
                  className="px-3 py-1 rounded text-xs font-medium bg-wb-gold text-wb-bg-base"
                  onClick={() => handleConfirm(assignment.id, assignment.positionId)}
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
        )
      })}
    </div>
  )
}
