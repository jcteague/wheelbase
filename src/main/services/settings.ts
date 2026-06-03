import type Database from 'better-sqlite3'
import { ValidationError } from '../core/lifecycle'

export type BrokerEnvironment = 'paper' | 'live'
export type ActiveBrokerEnvironment = BrokerEnvironment | 'none'
export type CredentialState = 'configured' | 'missing'

export type CredentialStatus = {
  massive: CredentialState
  alpacaPaper: CredentialState
  alpacaLive: CredentialState
  activeBrokerEnv: ActiveBrokerEnvironment
  massiveLastCheckedAt: string | null
  alpacaPaperAccountNumberMasked: string | null
  alpacaLiveAccountNumberMasked: string | null
}

export type SaveAlpacaCredentialsInput = {
  environment: BrokerEnvironment
  keyId: string
  secret: string
  accountNumberMasked?: string | null
}

export type RemoveAlpacaCredentialsInput = {
  environment: BrokerEnvironment
}

export type SetActiveBrokerEnvironmentInput = {
  environment: BrokerEnvironment
}

export type AlpacaCredentials = {
  environment: BrokerEnvironment
  keyId: string
  secret: string
}

export type SettingsService = {
  getCredentialStatus: () => CredentialStatus
  saveAlpacaCredentials: (input: SaveAlpacaCredentialsInput) => CredentialStatus
  removeAlpacaCredentials: (input: RemoveAlpacaCredentialsInput) => CredentialStatus
  setActiveBrokerEnvironment: (input: SetActiveBrokerEnvironmentInput) => CredentialStatus
  loadAlpacaCredentials: (environment: BrokerEnvironment) => AlpacaCredentials | null
  loadActiveAlpacaCredentials: () => AlpacaCredentials | null
}

type SafeStorageLike = {
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
}

type SettingsServiceOptions = {
  db: Database.Database
  safeStorage: SafeStorageLike
  loadMassiveApiKey: () => string
  now?: () => string
}

type CredentialRow = {
  environment: BrokerEnvironment
  key_id_encrypted: Buffer
  secret_encrypted: Buffer
  account_number_masked: string | null
}

const ALPACA_VENDOR = 'alpaca'
const ACTIVE_BROKER_ENV_KEY = 'active_broker_environment'

function trimRequired(value: string, field: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new ValidationError(field, 'required', `${field} is required`)
  }
  return trimmed
}

function configured(row: CredentialRow | undefined): CredentialState {
  return row ? 'configured' : 'missing'
}

function hasCredential(db: Database.Database, environment: BrokerEnvironment): boolean {
  return getCredentialRow(db, environment) !== undefined
}

function getCredentialRow(
  db: Database.Database,
  environment: BrokerEnvironment
): CredentialRow | undefined {
  return db
    .prepare(
      `SELECT environment, key_id_encrypted, secret_encrypted, account_number_masked
       FROM credential_settings
       WHERE vendor = ? AND environment = ?`
    )
    .get(ALPACA_VENDOR, environment) as CredentialRow | undefined
}

function getStoredActiveEnvironment(db: Database.Database): ActiveBrokerEnvironment {
  const row = db
    .prepare(`SELECT value FROM app_settings WHERE key = ?`)
    .get(ACTIVE_BROKER_ENV_KEY) as { value: ActiveBrokerEnvironment } | undefined
  return row?.value ?? 'none'
}

function setStoredActiveEnvironment(
  db: Database.Database,
  environment: ActiveBrokerEnvironment,
  now: string
): void {
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`
  ).run(ACTIVE_BROKER_ENV_KEY, environment, now)
}

function effectiveActiveEnvironment(
  db: Database.Database,
  stored: ActiveBrokerEnvironment
): ActiveBrokerEnvironment {
  if (stored === 'none') return 'none'
  return getCredentialRow(db, stored) ? stored : 'none'
}

function getEffectiveActiveEnvironment(db: Database.Database): ActiveBrokerEnvironment {
  return effectiveActiveEnvironment(db, getStoredActiveEnvironment(db))
}

export function createSettingsService({
  db,
  safeStorage,
  loadMassiveApiKey,
  now = () => new Date().toISOString()
}: SettingsServiceOptions): SettingsService {
  function getCredentialStatus(): CredentialStatus {
    const paper = getCredentialRow(db, 'paper')
    const live = getCredentialRow(db, 'live')
    const activeBrokerEnv = getEffectiveActiveEnvironment(db)

    return {
      massive: loadMassiveApiKey().trim() ? 'configured' : 'missing',
      alpacaPaper: configured(paper),
      alpacaLive: configured(live),
      activeBrokerEnv,
      massiveLastCheckedAt: null,
      alpacaPaperAccountNumberMasked: paper?.account_number_masked ?? null,
      alpacaLiveAccountNumberMasked: live?.account_number_masked ?? null
    }
  }

  function saveAlpacaCredentials(input: SaveAlpacaCredentialsInput): CredentialStatus {
    const savedAt = now()
    const keyId = trimRequired(input.keyId, 'keyId')
    const secret = trimRequired(input.secret, 'secret')
    const encryptedKeyId = safeStorage.encryptString(keyId)
    const encryptedSecret = safeStorage.encryptString(secret)

    db.prepare(
      `INSERT INTO credential_settings (
         vendor,
         environment,
         key_id_encrypted,
         secret_encrypted,
         last_verified_at,
         account_number_masked,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(vendor, environment) DO UPDATE SET
         key_id_encrypted = excluded.key_id_encrypted,
         secret_encrypted = excluded.secret_encrypted,
         last_verified_at = excluded.last_verified_at,
         account_number_masked = excluded.account_number_masked,
         updated_at = excluded.updated_at`
    ).run(
      ALPACA_VENDOR,
      input.environment,
      encryptedKeyId,
      encryptedSecret,
      savedAt,
      input.accountNumberMasked ?? null,
      savedAt,
      savedAt
    )

    return getCredentialStatus()
  }

  function removeAlpacaCredentials(input: RemoveAlpacaCredentialsInput): CredentialStatus {
    db.prepare(`DELETE FROM credential_settings WHERE vendor = ? AND environment = ?`).run(
      ALPACA_VENDOR,
      input.environment
    )

    if (getStoredActiveEnvironment(db) === input.environment) {
      setStoredActiveEnvironment(db, 'none', now())
    }

    return getCredentialStatus()
  }

  function setActiveBrokerEnvironment(input: SetActiveBrokerEnvironmentInput): CredentialStatus {
    if (!hasCredential(db, input.environment)) {
      throw new ValidationError(
        'environment',
        'missing_credentials',
        `Alpaca ${input.environment} credentials are not configured`
      )
    }

    setStoredActiveEnvironment(db, input.environment, now())
    return getCredentialStatus()
  }

  function loadAlpacaCredentials(environment: BrokerEnvironment): AlpacaCredentials | null {
    const row = getCredentialRow(db, environment)
    if (!row) return null

    return {
      environment,
      keyId: safeStorage.decryptString(row.key_id_encrypted),
      secret: safeStorage.decryptString(row.secret_encrypted)
    }
  }

  function loadActiveAlpacaCredentials(): AlpacaCredentials | null {
    const active = getEffectiveActiveEnvironment(db)
    if (active === 'none') return null
    return loadAlpacaCredentials(active)
  }

  return {
    getCredentialStatus,
    saveAlpacaCredentials,
    removeAlpacaCredentials,
    setActiveBrokerEnvironment,
    loadAlpacaCredentials,
    loadActiveAlpacaCredentials
  }
}
