import { describe, expect, it, vi } from 'vitest'
import { makeTestDb } from '../test-utils'
import { createSettingsService, type SettingsService } from './settings'

type SafeStorageLike = {
  encryptString: (value: string) => Buffer
  decryptString: (value: Buffer) => string
}

function createSafeStorageMock(): SafeStorageLike {
  return {
    encryptString: vi.fn((value: string) => Buffer.from(`encrypted:${value}`, 'utf8')),
    decryptString: vi.fn((value: Buffer) => value.toString('utf8').replace(/^encrypted:/, ''))
  }
}

function createService(overrides: { hasFallbackCredentials?: () => boolean } = {}): {
  db: ReturnType<typeof makeTestDb>
  safeStorage: SafeStorageLike
  service: SettingsService
} {
  const db = makeTestDb()
  const safeStorage = createSafeStorageMock()
  const service = createSettingsService({
    db,
    safeStorage,
    hasFallbackCredentials: () => false,
    ...overrides,
    testAlpacaConnection: vi.fn().mockResolvedValue({
      ok: true,
      vendor: 'alpaca',
      environment: 'paper',
      accountNumberMasked: 'PA…ABC'
    }),
    now: () => '2026-05-30T12:00:00.000Z'
  })
  return { db, safeStorage, service }
}

describe('settings service — Alpaca credential persistence', () => {
  it('stores paper and live Alpaca credentials independently in credential_settings', () => {
    const { service } = createService()

    service.saveAlpacaCredentials({
      environment: 'paper',
      keyId: '  PKPAPER123  ',
      secret: ' paper-secret ',
      accountNumberMasked: 'PA…ABC'
    })
    service.saveAlpacaCredentials({
      environment: 'live',
      keyId: ' AKLIVE456 ',
      secret: ' live-secret ',
      accountNumberMasked: 'AL…XYZ'
    })

    const status = service.getCredentialStatus()

    expect(status).toMatchObject({
      alpacaPaper: 'configured',
      alpacaLive: 'configured',
      alpacaPaperAccountNumberMasked: 'PA…ABC',
      alpacaLiveAccountNumberMasked: 'AL…XYZ'
    })
  })

  it('stores only encrypted blobs and returns metadata without decrypted secrets', () => {
    const { db, safeStorage, service } = createService()

    service.saveAlpacaCredentials({
      environment: 'paper',
      keyId: ' PKPAPER123 ',
      secret: ' paper-secret ',
      accountNumberMasked: 'PA…ABC'
    })

    const rows = db
      .prepare(
        `SELECT vendor, environment, key_id_encrypted, secret_encrypted
         FROM credential_settings
         ORDER BY vendor, environment`
      )
      .all() as Array<{
      vendor: string
      environment: string
      key_id_encrypted: Buffer
      secret_encrypted: Buffer
    }>

    expect(rows).toHaveLength(1)
    expect(rows[0].vendor).toBe('alpaca')
    expect(rows[0].environment).toBe('paper')
    expect(rows[0].key_id_encrypted.toString('utf8')).toBe('encrypted:PKPAPER123')
    expect(rows[0].secret_encrypted.toString('utf8')).toBe('encrypted:paper-secret')
    expect(rows[0].key_id_encrypted.toString('utf8')).not.toBe('PKPAPER123')
    expect(rows[0].secret_encrypted.toString('utf8')).not.toBe('paper-secret')
    expect(safeStorage.encryptString).toHaveBeenCalledWith('PKPAPER123')
    expect(safeStorage.encryptString).toHaveBeenCalledWith('paper-secret')

    const status = service.getCredentialStatus()
    expect(JSON.stringify(status)).not.toContain('PKPAPER123')
    expect(JSON.stringify(status)).not.toContain('paper-secret')
  })

  it('removing the active broker credentials sets activeBrokerEnv to none', () => {
    const { service } = createService()

    service.saveAlpacaCredentials({
      environment: 'paper',
      keyId: 'PKPAPER123',
      secret: 'paper-secret',
      accountNumberMasked: 'PA…ABC'
    })
    service.setActiveBrokerEnvironment({ environment: 'paper' })
    service.removeAlpacaCredentials({ environment: 'paper' })

    expect(service.getCredentialStatus()).toMatchObject({
      alpacaPaper: 'missing',
      activeBrokerEnv: 'none'
    })
  })

  it('persists active broker environment between service instances', () => {
    const db = makeTestDb()
    const safeStorage = createSafeStorageMock()
    const create = (): SettingsService =>
      createSettingsService({
        db,
        safeStorage,
        hasFallbackCredentials: () => false,
        testAlpacaConnection: vi.fn().mockResolvedValue({
          ok: true,
          vendor: 'alpaca',
          environment: 'paper',
          accountNumberMasked: 'PA…ABC'
        }),
        now: () => '2026-05-30T12:00:00.000Z'
      })

    const first = create()
    first.saveAlpacaCredentials({
      environment: 'paper',
      keyId: 'PKPAPER123',
      secret: 'paper-secret',
      accountNumberMasked: 'PA…ABC'
    })
    first.setActiveBrokerEnvironment({ environment: 'paper' })

    const second = create()
    expect(second.getCredentialStatus().activeBrokerEnv).toBe('paper')
  })

  it('reports marketData as configured when the active broker environment has credentials', () => {
    const { service } = createService()

    service.saveAlpacaCredentials({
      environment: 'paper',
      keyId: 'PKPAPER123',
      secret: 'paper-secret',
      accountNumberMasked: 'PA…ABC'
    })
    service.setActiveBrokerEnvironment({ environment: 'paper' })

    expect(service.getCredentialStatus().marketData).toBe('configured')
  })

  it('reports marketData as missing when no broker environment is active', () => {
    const { service } = createService()

    service.saveAlpacaCredentials({
      environment: 'paper',
      keyId: 'PKPAPER123',
      secret: 'paper-secret',
      accountNumberMasked: 'PA…ABC'
    })

    const status = service.getCredentialStatus()
    expect(status.activeBrokerEnv).toBe('none')
    expect(status.marketData).toBe('missing')
  })

  // [US-99] .env credentials are a real, documented source, so a status that ignored them
  // would report "not connected" while quotes were flowing.
  it('reports marketData configured when only fallback credentials exist', () => {
    const { service } = createService({ hasFallbackCredentials: () => true })

    const status = service.getCredentialStatus()

    expect(status.activeBrokerEnv).toBe('none')
    expect(status.marketData).toBe('configured')
  })

  it('reports marketData missing when there are no saved and no fallback credentials', () => {
    const { service } = createService()

    expect(service.getCredentialStatus().marketData).toBe('missing')
  })

  // [US-99] Alpaca is the only vendor: the status document must carry no per-vendor
  // market-data field beyond the derived `marketData` flag.
  it('exposes exactly the Alpaca-only credential status fields', () => {
    const { service } = createService()

    const status = service.getCredentialStatus()

    expect(Object.keys(status).sort()).toEqual([
      'activeBrokerEnv',
      'alpacaLive',
      'alpacaLiveAccountNumberMasked',
      'alpacaPaper',
      'alpacaPaperAccountNumberMasked',
      'marketData'
    ])
  })
})
