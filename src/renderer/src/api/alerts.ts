// Renderer adapter for the management-queue read path and the dismiss action.

import { throwMappedIpcErrors } from './error'

// Unwraps the IPC envelope to the items array, falling back to an empty queue
// on failure.
export async function listManagementQueue(): Promise<ManagementQueueItem[]> {
  const result = await window.api.alerts.list()
  if (!result.ok) return []
  return result.items
}

export async function dismissAlert(alertId: string): Promise<IpcDismissedAlertRecord> {
  const result = await window.api.alerts.dismiss({ alertId })
  if (!result.ok) throwMappedIpcErrors(result.errors)
  return result.alert
}
