// Shared API error type and helper for renderer-side IPC adapters.

export type ApiError = {
  status: number
  body: unknown
}

export function apiError(status: number, body: unknown): ApiError {
  return { status, body }
}

// Shared shape of the `{ ok, errors }` envelope every main-process IPC handler
// returns via handleIpcCall. Renderer adapters import these instead of redefining.
export type IpcFieldError = {
  field: string
  code: string
  message: string
}

export type IpcResult<T> = ({ ok: true } & T) | { ok: false; errors: IpcFieldError[] }
