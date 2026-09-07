# Contract: `settings:get-credential-status` and `settings:test-connection` (changed)

> Existing handlers whose payload / response shapes change because Massive is removed. No
> handler is added or deleted.

## Purpose

Report whether market data and the broker are configured (both now derive from the Alpaca
credentials), and verify a set of Alpaca keys — Alpaca is the only vendor left to test.

## Request

```typescript
// settings:get-credential-status — no payload (unchanged)

// settings:test-connection — src/main/schemas.ts
export const TestConnectionPayloadSchema = z.object({
  vendor: z.literal('alpaca'),
  environment: BrokerEnvironmentSchema, // 'paper' | 'live'
  keyId: NonEmptyTrimmedStringSchema,
  secret: NonEmptyTrimmedStringSchema
})
// The former z.discriminatedUnion with a { vendor: 'massive' } member is removed.
```

## Response (success)

```typescript
// settings:get-credential-status → { ok: true, status: CredentialStatus }
export type CredentialStatus = {
  marketData: 'configured' | 'missing' // NEW: activeBrokerEnv !== 'none'
  alpacaPaper: 'configured' | 'missing'
  alpacaLive: 'configured' | 'missing'
  activeBrokerEnv: 'paper' | 'live' | 'none'
  alpacaPaperAccountNumberMasked: string | null
  alpacaLiveAccountNumberMasked: string | null
  // REMOVED: massive, massiveLastCheckedAt
}

// settings:test-connection → { ok: true, test: TestConnectionResult }
export type TestConnectionResult =
  | { ok: true; vendor: 'alpaca'; environment: 'paper' | 'live'; accountNumberMasked: string }
  | { ok: false; errorCode: ConnectionErrorCode; message: string }
// REMOVED: { ok: true; vendor: 'massive'; status: 'connected' }
```

The same two type changes are mirrored verbatim in `src/preload/index.d.ts` and
`src/renderer/src/api/settings.ts`.

## Error codes

| field      | code                    | message                                                           |
| ---------- | ----------------------- | ----------------------------------------------------------------- |
| `__root__` | —                       | Standard envelope errors only (`internal_error`, Zod `invalid_*`) |
| `vendor`   | `invalid_literal` (Zod) | payload with `vendor: 'massive'` is now rejected by the schema    |

`TestConnectionResult.ok === false` carries the existing `ConnectionErrorCode` set
(`auth_failed | rate_limited | environment_mismatch | network_error | unknown`) unchanged.

## E2E mock surface

`WHEELBASE_MOCK_SETTINGS_CONNECTIONS` (read in `src/main/index.ts`) drops its `massive` key:

```typescript
type MockSettingsConnectionConfig = {
  alpaca?: Partial<Record<'paper' | 'live', TestConnectionResult>>
}
```

## Source

- Handler: `src/main/ipc/settings.ts` (unchanged code paths; the `massive` branch of the debug log disappears with the union)
- Service: `src/main/services/settings.ts` (`getCredentialStatus`; `loadMassiveApiKey` option removed from `SettingsServiceOptions`)
- Connection tests: `src/main/services/settings-connections.ts` (`testMassiveConnection` and `MASSIVE_BASE_URL` deleted)
- Dispatcher + mock: `src/main/index.ts` (`runSettingsConnectionTest`, `runMockSettingsConnectionTest`)
- Renderer consumers: `src/renderer/src/App.tsx`, `components/MarketDataStatusDot.tsx`, `pages/SettingsPage.tsx`, `pages/PositionsListPage.tsx`
