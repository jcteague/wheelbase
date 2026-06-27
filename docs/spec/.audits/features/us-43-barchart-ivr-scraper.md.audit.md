---
page: docs/spec/features/us-43-barchart-ivr-scraper.md
audited_at: 2026-06-27
findings: 1
---

# Audit: us-43-barchart-ivr-scraper.md

## Verified (13)

- ✓ Both listed source files exist (`barchart-ivr-scraper.ts`, `barchart-ivr-scraper.test.ts`).
- ✓ `export async function fetchIVR(ticker: string): Promise<IVRResult>` — `src/main/integrations/barchart-ivr-scraper.ts:356`.
- ✓ `IVRResult` discriminated union (six variants begin at line 78) — `barchart-ivr-scraper.ts:78`.
- ✓ `IVRDataSchema` Zod object with `source: z.literal('barchart')` — `barchart-ivr-scraper.ts:22-28`.
- ✓ `getSession(): Promise<SessionResult>`, module-level `SessionCache` type + `sessionCache` cache var — `barchart-ivr-scraper.ts:213,91,133`.
- ✓ `fetchApi(url, session, retryCount)`, `createRateLimiter()` factory + module singleton `const rateLimiter` — `barchart-ivr-scraper.ts:267,115,132`.
- ✓ `parseIVRResponse(ticker, body)` exported — `barchart-ivr-scraper.ts:309`.
- ✓ Endpoint path `proxies/core-api/v1/options/get` and field list `baseSymbol,impliedVolatilityRank1y,impliedVolatilityPercentile1y,historicVolatility20d` — `barchart-ivr-scraper.ts:11,18`.
- ✓ XSRF harvesting (`XSRF-TOKEN` cookie → `X-XSRF-TOKEN` header) — `barchart-ivr-scraper.ts:204,209,276`.
- ✓ `parse_error` keyed on missing/non-numeric `impliedVolatilityRank1y` — `barchart-ivr-scraper.ts:319`.
- ✓ 46 tests in the test file (page claims "46 tests") — `grep -c` = 46.
- ✓ "Contracts touched: None" is consistent — no IPC/migration references found for this module.

## Drift (1)

- ✗ Page endpoint block (line 43) shows `GET https://www.barchart.com/proxies/...` while the prose "Authentication" section (line 60) and Summary reference "barchart.com" generically; the session URL is actually `https://www.barchart.com/stocks/quotes/SPY/options` (`barchart-ivr-scraper.ts:10`). This is cosmetic — the host (`www.barchart.com`) is correct in code; only a human-review nit on consistent host spelling. Low severity.

## Unverifiable (1)

- ? Retry/backoff math (`Math.random() * 1000 * 2^attempt`) and the "≥1000ms between API calls" behavior are present in code structure (`fetchApi` retryCount, `createRateLimiter`) but the exact timing is not asserted by static grep; covered by the module's own tests.

## Missing files (0)
