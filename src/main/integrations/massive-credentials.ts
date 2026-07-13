export function loadMassiveApiKey(): string {
  // A runtime MASSIVE_API_KEY, when present, is authoritative — this is how packaged
  // apps and E2E launches control Massive configuration deterministically. An explicit
  // empty string therefore means "not configured", overriding any build-time key.
  const runtime = process.env.MASSIVE_API_KEY
  if (runtime !== undefined) return runtime
  // Otherwise fall back to MAIN_VITE_MASSIVE_API_KEY, baked in from .env at build/dev time.
  return (import.meta.env.MAIN_VITE_MASSIVE_API_KEY as string) || ''
}
