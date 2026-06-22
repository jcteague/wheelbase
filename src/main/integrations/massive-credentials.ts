export function loadMassiveApiKey(): string {
  // MAIN_VITE_MASSIVE_API_KEY is resolved from .env at build/dev time by electron-vite.
  // MASSIVE_API_KEY is a runtime shell-env fallback (e.g. CI or packaged app).
  return (import.meta.env.MAIN_VITE_MASSIVE_API_KEY as string) || process.env.MASSIVE_API_KEY || ''
}
