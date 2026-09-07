import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadAlpacaCredentialsFromEnv } from './alpaca-credentials'

describe('loadAlpacaCredentialsFromEnv', () => {
  beforeEach(() => {
    vi.stubEnv('ALPACA_KEY_ID', undefined)
    vi.stubEnv('ALPACA_SECRET_KEY', undefined)
    vi.stubEnv('ALPACA_PAPER', undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns paper credentials when ALPACA_PAPER is true', () => {
    vi.stubEnv('ALPACA_KEY_ID', 'PKPAPER123')
    vi.stubEnv('ALPACA_SECRET_KEY', 'paper-secret')
    vi.stubEnv('ALPACA_PAPER', 'true')

    expect(loadAlpacaCredentialsFromEnv()).toEqual({
      keyId: 'PKPAPER123',
      secret: 'paper-secret',
      environment: 'paper'
    })
  })

  it('returns live credentials when ALPACA_PAPER is false', () => {
    vi.stubEnv('ALPACA_KEY_ID', 'AKLIVE456')
    vi.stubEnv('ALPACA_SECRET_KEY', 'live-secret')
    vi.stubEnv('ALPACA_PAPER', 'false')

    expect(loadAlpacaCredentialsFromEnv()).toEqual({
      keyId: 'AKLIVE456',
      secret: 'live-secret',
      environment: 'live'
    })
  })

  it('defaults to the live environment when ALPACA_PAPER is unset', () => {
    vi.stubEnv('ALPACA_KEY_ID', 'AKLIVE456')
    vi.stubEnv('ALPACA_SECRET_KEY', 'live-secret')

    expect(loadAlpacaCredentialsFromEnv()).toEqual({
      keyId: 'AKLIVE456',
      secret: 'live-secret',
      environment: 'live'
    })
  })

  it('returns null when the key id is missing', () => {
    vi.stubEnv('ALPACA_SECRET_KEY', 'paper-secret')
    vi.stubEnv('ALPACA_PAPER', 'true')

    expect(loadAlpacaCredentialsFromEnv()).toBeNull()
  })

  it('returns null when the secret is an empty string', () => {
    vi.stubEnv('ALPACA_KEY_ID', 'PKPAPER123')
    vi.stubEnv('ALPACA_SECRET_KEY', '')
    vi.stubEnv('ALPACA_PAPER', 'true')

    expect(loadAlpacaCredentialsFromEnv()).toBeNull()
  })

  // electron-vite does not copy .env into process.env: for the main process it exposes
  // only MAIN_VITE_-prefixed vars through import.meta.env, baked in at build time. A
  // real process env var still wins, which is how CI and e2e force configuration.
  it('reads MAIN_VITE_-prefixed values when no process env vars are set', () => {
    vi.stubEnv('MAIN_VITE_ALPACA_KEY_ID', 'PKVITE')
    vi.stubEnv('MAIN_VITE_ALPACA_SECRET_KEY', 'vite-secret')
    vi.stubEnv('MAIN_VITE_ALPACA_PAPER', 'true')

    expect(loadAlpacaCredentialsFromEnv()).toEqual({
      keyId: 'PKVITE',
      secret: 'vite-secret',
      environment: 'paper'
    })
  })

  // The bundle may carry an inlined key from whatever .env the build machine had; an
  // explicit empty process env var is how a test run says "pretend there are none".
  it('treats an explicitly empty process env var as not configured', () => {
    vi.stubEnv('ALPACA_KEY_ID', '')
    vi.stubEnv('ALPACA_SECRET_KEY', '')
    vi.stubEnv('MAIN_VITE_ALPACA_KEY_ID', 'PKVITE')
    vi.stubEnv('MAIN_VITE_ALPACA_SECRET_KEY', 'vite-secret')

    expect(loadAlpacaCredentialsFromEnv()).toBeNull()
  })

  it('prefers a real process env var over the MAIN_VITE_ fallback', () => {
    vi.stubEnv('ALPACA_KEY_ID', 'PKPROCESS')
    vi.stubEnv('ALPACA_SECRET_KEY', 'process-secret')
    vi.stubEnv('MAIN_VITE_ALPACA_KEY_ID', 'PKVITE')
    vi.stubEnv('MAIN_VITE_ALPACA_SECRET_KEY', 'vite-secret')

    expect(loadAlpacaCredentialsFromEnv()?.keyId).toBe('PKPROCESS')
  })
})
