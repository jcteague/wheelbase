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

// Shared by any adapter that just needs to surface the IPC field errors as-is;
// adapters with renderer-specific field-name remapping do that before calling this.
export function throwMappedIpcErrors(errors: IpcFieldError[]): never {
  throw apiError(400, { detail: errors })
}

// Extracts the first field error's message from an ApiError thrown via
// throwMappedIpcErrors (body shape: { detail: IpcFieldError[] }), or falls
// back when the error is absent or doesn't carry that shape.
export function firstErrorMessage(error: ApiError | null | undefined, fallback: string): string {
  const detail = (error?.body as { detail?: Array<{ message: string }> } | null | undefined)?.detail
  return detail?.[0]?.message ?? fallback
}
