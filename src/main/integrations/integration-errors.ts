export function isNetworkError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const e = err as { cause?: { code?: string }; code?: string; message?: string }
  const networkCodes = ['ECONNREFUSED', 'ENOTFOUND']
  if (e.cause?.code && networkCodes.includes(e.cause.code)) return true
  if (e.code && networkCodes.includes(e.code)) return true
  if (e.message && /fetch failed|network|ECONNREFUSED/i.test(e.message)) return true
  return false
}
