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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isIpcFieldError(value: unknown): value is IpcFieldError {
  return (
    isRecord(value) &&
    typeof value.field === 'string' &&
    typeof value.code === 'string' &&
    typeof value.message === 'string'
  )
}

// The field errors a 400 thrown via throwMappedIpcErrors carries (body `{ detail: [...] }`);
// empty for any other status, or a body that does not have exactly that shape.
export function ipcFieldErrorsOf(error: ApiError): IpcFieldError[] {
  if (error.status !== 400 || !isRecord(error.body)) return []
  const { detail } = error.body
  return Array.isArray(detail) && detail.every(isIpcFieldError) ? detail : []
}

// Extracts the first field error's message from an ApiError thrown via
// throwMappedIpcErrors (body shape: { detail: IpcFieldError[] }), or falls
// back when the error is absent or doesn't carry that shape.
export function firstErrorMessage(error: ApiError | null | undefined, fallback: string): string {
  const detail = (error?.body as { detail?: Array<{ message: string }> } | null | undefined)?.detail
  return detail?.[0]?.message ?? fallback
}
