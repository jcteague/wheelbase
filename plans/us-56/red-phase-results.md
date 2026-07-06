# Red Phase Results: US-56 — Earnings-Proximity Alert

## Feature Context

- **Feature directory**: `plans/us-56/`
- **User story**: `docs/epics/07-stories/US-56-earnings-proximity-alert.md`
- **Plan file**: `plans/us-56/plan.md`

## Test Files Created/Modified

- `src/main/core/alerts.test.ts` — new `describe('evaluatePosition — EARNINGS_PROXIMITY (US-56)')` (12 tests); `makeInput` defaults extended
- `src/main/integrations/finnhub-earnings.test.ts` — new (17 tests: fetch, selection, cache, isolation)
- `src/main/services/evaluate-alerts.test.ts` — new `describe('evaluateAlerts — earnings boundary fetch (US-56)')` (6 tests)
- `src/main/services/evaluate-alerts-test-utils.ts` — `stubEarnings(map)`, `inertEarnings()`
- `src/main/services/evaluate-alerts.e2e.test.ts` — `describe('US-56 acceptance — EARNINGS_PROXIMITY')` (4 AC tests)

## Interfaces Under Test

```typescript
// src/main/core/alerts.ts
export type RuleCode = ... | 'EARNINGS_PROXIMITY'
export interface AlertEvaluationInput { ...; daysToEarnings: number | null; expiration: string | null }
export type EarningsProximityInput = Pick<AlertEvaluationInput, 'daysToEarnings' | 'expiration'>

// src/main/integrations/finnhub-earnings.ts
export function fetchNextEarningsDates(
  tickers: string[],
  opts?: { now?: Date; logger?: LoggerLike }
): Promise<Record<string, string>>
export function clearEarningsCache(): void

// src/main/integrations/finnhub-credentials.ts
export function loadFinnhubApiKey(): string

// src/main/services/evaluate-alerts.ts
export type FetchEarnings = (tickers: string[], opts?: { now?: Date }) => Promise<Record<string, string>>
// EvaluateAlertsInput gains fetchEarnings?: FetchEarnings
```

## Test Design Assumptions

- `makeInput` default is `daysToEarnings: 45` (inert — neither fires nor skips), not `null`, so existing "no skips" assertions stay valid; `expiration: null`.
- `inertEarnings()` returns a far-future (now + 45 d) date per requested ticker — the earnings analogue of `inertProvider`.
- Both service test files `vi.mock('../integrations/finnhub-earnings')` so tests that don't inject `fetchEarnings` can never reach the network.
- One pre-existing expectation updated when the new rule legitimately changed behavior: the missing-dte scenario now records a third `missing_dte` skip (EARNINGS_PROXIMITY), so exact skip counts were incremented.

## Verification

- Core: 8 of 12 new tests failed for the right reason (rule absent); 4 negative-path tests passed by construction. All pre-existing tests green.
- Finnhub: suite failed on `Cannot find module './finnhub-earnings'` (implementation absent).
- Service wiring: all 6 new tests failed (implementation ignored `fetchEarnings`); all 18 existing passed.
- E2E: written after Layers 1–2 completed, so they passed immediately — expected for the AC-verification layer (no production code owned by it).
