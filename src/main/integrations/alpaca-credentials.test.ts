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

  // Regression guard for a build-time secret leak: reading import.meta.env here made Vite
  // inline every MAIN_VITE_* value — the Alpaca secret included — into out/main/index.js.
  it('ignores MAIN_VITE_-prefixed values entirely', () => {
    vi.stubEnv('MAIN_VITE_ALPACA_KEY_ID', 'PKVITE')
    vi.stubEnv('MAIN_VITE_ALPACA_SECRET_KEY', 'vite-secret')
    vi.stubEnv('MAIN_VITE_ALPACA_PAPER', 'true')

    expect(loadAlpacaCredentialsFromEnv()).toBeNull()
  })

  it('treats an explicitly empty process env var as not configured', () => {
    vi.stubEnv('ALPACA_KEY_ID', '')
    vi.stubEnv('ALPACA_SECRET_KEY', '')

    expect(loadAlpacaCredentialsFromEnv()).toBeNull()
  })
})
