// Renderer adapter for the management-queue read path. Unwraps the IPC envelope
// to the items array, falling back to an empty queue on failure.

export async function listManagementQueue(): Promise<ManagementQueueItem[]> {
  const result = await window.api.alerts.list()
  if (!result.ok) return []
  return result.items
}
