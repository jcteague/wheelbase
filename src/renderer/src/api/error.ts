// Shared API error type and helper for renderer-side IPC adapters.

export type ApiError = {
  status: number
  body: unknown
}

export function apiError(status: number, body: unknown): ApiError {
  return { status, body }
}
