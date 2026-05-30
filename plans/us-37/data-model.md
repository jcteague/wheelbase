# Data Model: US-37 Paper/Live Broker Environment Toggle

## Product Clarification

Massive credentials are shared app-level configuration and are not saved, replaced, removed, or encrypted through user settings. User settings store Alpaca credentials only.

## Credential Settings

Persist Alpaca credential metadata in a new generic credential table via migration `006_add_credential_settings.sql`. The table name stays generic so future brokerages can use the same persistence model, but this story only writes Alpaca rows.

### `credential_settings`

| Field | Type | Notes |
| ----- | ---- | ----- |
| `vendor` | TEXT | `"alpaca"` for this story; future broker vendors can add their own values |
| `environment` | TEXT NOT NULL | `"paper"` or `"live"` |
| `key_id_encrypted` | BLOB NOT NULL | Alpaca key id encrypted with `safeStorage.encryptString` |
| `secret_encrypted` | BLOB NOT NULL | Alpaca secret encrypted with `safeStorage.encryptString` |
| `last_verified_at` | TEXT NULL | ISO timestamp after successful connection test |
| `account_number_masked` | TEXT NULL | Alpaca only; first 2 chars + `…` + last 3 chars |
| `created_at` | TEXT NOT NULL | ISO timestamp |
| `updated_at` | TEXT NOT NULL | ISO timestamp |

Unique key: `(vendor, environment)`.

Rules:

- Alpaca has at most one row each for `("alpaca", "paper")` and `("alpaca", "live")`.
- Whitespace is trimmed before validation and before encryption.
- Plaintext credentials never persist in SQLite, renderer state after submit, or logs.
- Saved secrets display as `••••••••`; replacing a value uses new input rather than decrypting into the UI.

## Broker Environment Setting

Persist non-secret app settings in a new SQLite table.

### `app_settings`

| Field | Type | Notes |
| ----- | ---- | ----- |
| `key` | TEXT PRIMARY KEY | e.g. `"active_broker_environment"` |
| `value` | TEXT NOT NULL | `"paper"`, `"live"`, or `"none"` |
| `updated_at` | TEXT NOT NULL | ISO timestamp |

Rules:

- If no Alpaca credentials exist, effective active broker environment is `"none"`.
- If stored active environment points to missing credentials, effective active broker environment is `"none"` until credentials are saved.
- Switching to `"live"` requires renderer confirmation before `settings:set-active-broker-environment` is called.
- Switching to `"paper"` is immediate.

## IPC Payloads And Results

### Credential Status

```ts
type CredentialStatus = {
  massive: 'configured' | 'missing'
  alpacaPaper: 'configured' | 'missing'
  alpacaLive: 'configured' | 'missing'
  activeBrokerEnv: 'paper' | 'live' | 'none'
  massiveLastCheckedAt: string | null
  alpacaPaperAccountNumberMasked: string | null
  alpacaLiveAccountNumberMasked: string | null
}
```

### Test Connection Result

```ts
type TestConnectionResult =
  | { ok: true; vendor: 'massive'; status: 'connected' }
  | {
      ok: true
      vendor: 'alpaca'
      environment: 'paper' | 'live'
      accountNumberMasked: string
    }
  | {
      ok: false
      errorCode:
        | 'auth_failed'
        | 'rate_limited'
        | 'environment_mismatch'
        | 'network_error'
        | 'unknown'
      message: string
    }
```

## Provider State

### MarketDataProvider

- Configured by the shared Massive app key, loaded from app configuration/env/packaging.
- Not recreated by settings page actions.
- Emits `MarketDataAuthError` / `MarketDataError('auth_failed')` if the shared key is missing or fails auth.
- Settings can test and display Massive status, but cannot save, replace, or remove the key.

### BrokerProvider

- Configured by active Alpaca environment.
- Recreated when active broker environment changes or when active Alpaca credentials are saved, replaced, removed, or fail auth.
- Broker-only surfaces render "Connect Alpaca to enable" when active environment is `"none"`.

## Renderer State

- `SettingsPage` reads `settings:get-credential-status`.
- `EnvironmentBadge` reads broker state only:
  - `"paper"`: high-visibility amber `PAPER`, animated dot.
  - `"live"`: more subtle green `LIVE`.
  - `"none"`: neutral grey `NO BROKER` with tooltip `Alpaca not configured. Click to set up.`
- `MarketDataStatusDot` reads Massive state only and does not affect broker badge color or label.
- Query keys:
  - Broker: `['broker', ...]`
  - Market data: `['market', ...]`
  - Positions/journal: existing position keys remain separate.

## Validation Rules

- Massive has no user-entered validation in settings.
- Alpaca credentials: trim `keyId` and `secret`; reject empty string for either.
- Alpaca environment: enum `"paper" | "live"`.
- Test connection with candidate values should not save on failure.
- The LIVE mismatch message in the Paper card is `Environment mismatch — these are LIVE keys, not paper keys`.
