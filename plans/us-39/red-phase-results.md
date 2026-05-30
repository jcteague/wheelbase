# Red Phase Results: BrokerProvider Interface (US-39 Area 1)

## Feature Context

- **Feature directory**: `plans/us-39/`
- **User stories**: `docs/epics/06-stories/US-31-market-data-provider-adapter.md`, `US-39-massive-market-data-provider.md`, `US-40-alpaca-broker-provider.md`
- **Plan file**: `plans/us-39/plan.md`
- **Tasks file**: `plans/us-39/tasks.md`

## Test Files Created/Modified

- `src/main/integrations/broker-provider.test.ts` — type-level checks for new BrokerProvider interface, BrokerError class, and AccountInfo type

## Interfaces Under Test

```typescript
// src/main/integrations/broker-provider.ts

export interface BrokerProvider {
  getAccountInfo(): Promise<AccountInfo>
  getActivities(filter: ActivityFilter): Promise<BrokerActivity[]>
  getMarketStatus(): Promise<MarketStatus>
}

export class BrokerError extends Error {
  readonly code: BrokerErrorCode
  constructor(code: BrokerErrorCode, message: string)
}

export type BrokerErrorCode =
  | 'auth_failed'
  | 'network_error'
  | 'rate_limited'
  | 'environment_mismatch'
  | 'unknown'

export type AccountInfo = {
  buyingPower: string
  portfolioValue: string
  cash: string
  environment: 'paper' | 'live'
  accountNumberMasked: string // format: first2 + "…" + last3
}

export type BrokerActivity = {
  activityId: string
  activityType: string
  symbol: string
  qty: number
  price: string
  transactionTime: string
}

export type ActivityFilter = {
  type: string
  since?: string // ISO-8601
}

export type MarketStatus = {
  isOpen: boolean
  nextOpen: string
  nextClose: string
  session: 'regular' | 'pre' | 'post' | 'closed'
}
```

## Test Coverage Summary

- [x] BrokerProvider interface shape: fixture object `satisfies BrokerProvider` — verifies all three required methods exist with correct return types
- [x] BrokerError code field: `new BrokerError('auth_failed', ...)` → `error.code === 'auth_failed'` and `instanceof Error`
- [x] BrokerErrorCode exhaustive: all five code values construct without error
- [x] AccountInfo.accountNumberMasked field present and typed as string

## Test Execution Results

```
FAIL src/main/integrations/broker-provider.test.ts
Error: Cannot find module './broker-provider' imported from '...broker-provider.test.ts'
```

## Verification

- ✅ Every test fails because broker-provider.ts does not exist — not due to test bugs
- ✅ No syntax errors in test file
- ✅ Failure is at module import, not test logic

## Handoff to Green Phase

Green phase must create `src/main/integrations/broker-provider.ts` exporting all interfaces listed above. No other files need to be created or modified for this area.
