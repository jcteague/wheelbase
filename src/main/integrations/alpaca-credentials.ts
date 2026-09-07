import type { AlpacaCredentials } from '../services/settings'

/**
 * Resolves Alpaca credentials from the process environment — the dev/CI fallback used when
 * nothing is saved in the database.
 *
 * Deliberately `process.env` only. Reading `import.meta.env.MAIN_VITE_*` would let a `.env`
 * file configure the app, but Vite resolves those at BUILD time by substituting values into
 * the bundle, so the secret ends up in plaintext in `out/main/index.js` and in anything
 * `electron-builder` packages from it. A computed lookup is worse still: Vite cannot
 * string-replace `import.meta.env[name]`, so it injects the whole env object and every
 * `MAIN_VITE_*` value lands in the bundle whether or not any code reads it.
 *
 * `process.env` has no such problem — read at runtime, never inlined. Export the variables
 * for the process instead:
 *
 *   ALPACA_KEY_ID=… ALPACA_SECRET_KEY=… ALPACA_PAPER=true pnpm dev
 *
 * For normal use, save credentials in Settings: those are encrypted via safeStorage and take
 * priority over anything here.
 */
export function loadAlpacaCredentialsFromEnv(): AlpacaCredentials | null {
  const keyId = process.env.ALPACA_KEY_ID
  const secret = process.env.ALPACA_SECRET_KEY
  // An explicitly empty value reads as "not configured", which is how the e2e harness forces
  // a credential-less app regardless of what the developer's shell exports.
  if (!keyId || !secret) return null

  return {
    keyId,
    secret,
    environment: process.env.ALPACA_PAPER === 'true' ? 'paper' : 'live'
  }
}
