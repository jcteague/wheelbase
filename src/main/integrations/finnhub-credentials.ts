export function loadFinnhubApiKey(): string {
  // MAIN_VITE_FINNHUB_API_KEY is resolved from .env at build/dev time by electron-vite.
  // FINNHUB_API_KEY is a runtime shell-env fallback (e.g. CI or packaged app).
  return (import.meta.env.MAIN_VITE_FINNHUB_API_KEY as string) || process.env.FINNHUB_API_KEY || ''
}
