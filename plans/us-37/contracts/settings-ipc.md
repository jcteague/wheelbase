# IPC Contracts: Settings Credentials And Broker Environment

All handlers use `handleIpcCall` style and return `{ ok: true, ...result } | { ok: false, errors: IpcFieldError[] }`. Handlers never throw to the renderer.

## `settings:get-credential-status`

Payload: none.

Result:

```ts
{
  status: {
    massive: 'configured' | 'missing'
    alpacaPaper: 'configured' | 'missing'
    alpacaLive: 'configured' | 'missing'
    activeBrokerEnv: 'paper' | 'live' | 'none'
    massiveLastCheckedAt: string | null
    alpacaPaperAccountNumberMasked: string | null
    alpacaLiveAccountNumberMasked: string | null
  }
}
```

Massive status comes from shared app configuration. There are no `settings:save-massive-key` or `settings:remove-massive-key` channels.

## `settings:save-alpaca-credentials`

Payload:

```ts
{
  environment: 'paper' | 'live'
  keyId: string
  secret: string
}
```

Behavior:

- Trim `keyId` and `secret`.
- Validate both non-empty.
- Test connection against the supplied environment before save, or save only after a successful prior test from the same form state.
- Encrypt both values with `safeStorage.encryptString`.
- Upsert Alpaca credential row and account mask.
- If saved environment is active, recreate only `BrokerProvider`.

Result:

```ts
{ status: CredentialStatus }
```

## `settings:remove-alpaca-credentials`

Payload:

```ts
{ environment: 'paper' | 'live' }
```

Behavior:

- Delete one Alpaca credential row.
- If removed environment is active, set effective active broker environment to `"none"` and recreate/clear only `BrokerProvider`.

Result:

```ts
{ status: CredentialStatus }
```

## `settings:set-active-broker-environment`

Payload:

```ts
{ environment: 'paper' | 'live' }
```

Behavior:

- Validate requested environment has saved Alpaca credentials.
- Persist `active_broker_environment`.
- Recreate only `BrokerProvider` using that credential pair.
- Does not recreate or disconnect `MarketDataProvider`.

Result:

```ts
{ status: CredentialStatus }
```

Renderer side effects after success:

- Invalidate only queries whose `queryKey[0] === 'broker'`.
- Do not invalidate queries whose `queryKey[0] === 'market'`.

## `settings:test-connection`

Payload:

```ts
type TestConnectionPayload =
  | { vendor: 'massive' }
  | { vendor: 'alpaca'; environment: 'paper' | 'live'; keyId: string; secret: string }
```

Massive behavior:

- Load the shared app-level Massive key from the same configuration path used by `MarketDataProvider`.
- Call `GET /v3/reference/tickers/AAPL` with that configured key.
- HTTP 200 returns connected.
- HTTP 401/403 returns `auth_failed` with message `Authentication failed (401)`.
- HTTP 429 returns `rate_limited` with message `Rate limited — please try again`.
- Probe ticker is hard-coded.

Alpaca behavior:

- Trim `keyId` and `secret`.
- Call `GET /v2/account` against `paper-api.alpaca.markets` for `environment: "paper"` or `api.alpaca.markets` for `"live"`.
- Success returns `accountNumberMasked`.
- Does not import activities.
- 401 caused by live keys in Paper card returns `environment_mismatch` with message `Environment mismatch — these are LIVE keys, not paper keys`.

Result:

```ts
{
  test: TestConnectionResult
}
```
