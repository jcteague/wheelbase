import type { AlpacaCredentials } from '../services/settings'

/**
 * Resolves Alpaca credentials from the environment — the dev/CI fallback used when nothing
 * is saved in the database.
 *
 * Two sources, in priority order:
 *  1. `process.env.ALPACA_*` — a real environment variable. Authoritative, and how packaged
 *     runs, CI and e2e launches force configuration deterministically.
 *  2. `import.meta.env.MAIN_VITE_ALPACA_*` — baked in from `.env` at build/dev time.
 *     electron-vite does NOT copy `.env` into `process.env` for the main process; it only
 *     exposes `MAIN_VITE_`-prefixed values here, so a bare `ALPACA_KEY_ID=` line in `.env`
 *     would otherwise be invisible.
 *
 * Note that (2) is inlined into the bundle at build time — do not build a distributable
 * with real keys in `.env`.
 */
export function loadAlpacaCredentialsFromEnv(): AlpacaCredentials | null {
  // `??`, not `||`: a DEFINED process env var is authoritative even when empty. An explicit
  // empty string means "not configured" and overrides a key inlined from .env at build time,
  // which is the only way e2e and CI can force a credential-less app out of a bundle built
  // on a developer machine.
  const keyId = process.env.ALPACA_KEY_ID ?? viteEnv('MAIN_VITE_ALPACA_KEY_ID')
  const secret = process.env.ALPACA_SECRET_KEY ?? viteEnv('MAIN_VITE_ALPACA_SECRET_KEY')
  if (!keyId || !secret) return null

  const paper = process.env.ALPACA_PAPER ?? viteEnv('MAIN_VITE_ALPACA_PAPER')
  return {
    keyId,
    secret,
    environment: paper === 'true' ? 'paper' : 'live'
  }
}

/** `import.meta.env` is absent outside a Vite-transformed bundle (plain Node tooling), and
 *  its index signature admits Vite's own boolean flags (DEV, PROD) alongside our strings. */
function viteEnv(
  name: 'MAIN_VITE_ALPACA_KEY_ID' | 'MAIN_VITE_ALPACA_SECRET_KEY' | 'MAIN_VITE_ALPACA_PAPER'
): string | undefined {
  const value: unknown = import.meta.env?.[name]
  return typeof value === 'string' ? value : undefined
}
