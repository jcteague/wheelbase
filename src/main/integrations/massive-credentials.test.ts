import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadMassiveApiKey } from './massive-credentials'

describe('loadMassiveApiKey', () => {
  let originalRuntime: string | undefined

  beforeEach(() => {
    originalRuntime = process.env.MASSIVE_API_KEY
    delete process.env.MASSIVE_API_KEY
    vi.stubEnv('MAIN_VITE_MASSIVE_API_KEY', '')
  })

  afterEach(() => {
    if (originalRuntime === undefined) {
      delete process.env.MASSIVE_API_KEY
    } else {
      process.env.MASSIVE_API_KEY = originalRuntime
    }
    vi.unstubAllEnvs()
  })

  it('returns the build-time key when no runtime key is set', () => {
    vi.stubEnv('MAIN_VITE_MASSIVE_API_KEY', 'baked-in-key')
    delete process.env.MASSIVE_API_KEY

    expect(loadMassiveApiKey()).toBe('baked-in-key')
  })

  it('lets a runtime key override the build-time key', () => {
    vi.stubEnv('MAIN_VITE_MASSIVE_API_KEY', 'baked-in-key')
    process.env.MASSIVE_API_KEY = 'runtime-key'

    expect(loadMassiveApiKey()).toBe('runtime-key')
  })

  it('treats an explicit empty runtime key as "not configured", overriding the build-time key', () => {
    vi.stubEnv('MAIN_VITE_MASSIVE_API_KEY', 'baked-in-key')
    process.env.MASSIVE_API_KEY = ''

    expect(loadMassiveApiKey()).toBe('')
  })

  it('returns an empty string when neither key is set', () => {
    delete process.env.MASSIVE_API_KEY

    expect(loadMassiveApiKey()).toBe('')
  })
})
