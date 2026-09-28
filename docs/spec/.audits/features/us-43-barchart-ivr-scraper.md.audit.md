---
page: docs/spec/features/us-43-barchart-ivr-scraper.md
audited_at: 2026-09-28
findings: 7
---

# Audit: docs/spec/features/us-43-barchart-ivr-scraper.md

The Barchart IVR scraper has been **retired**. US-121 now computes IV rank from the app's own IV30 history. This page has **no superseded/retired banner** and describes the module in the present tense ("US-43 implements `fetchIVR(ticker)` … in `src/main/integrations/barchart-ivr-scraper.ts`"), so its code claims are drift.

## Verified (0)

None of the page's code claims hold against current `src/`.

## Drift (3)

- ✗ **The whole page presents the scraper as live code**: `fetchIVR`, `IVRResult`, `IVRDataSchema`, `getSession`, `SessionCache`, `fetchApi`, `createRateLimiter`, `parseIVRResponse`, and the Barchart endpoint and field mapping. `grep -rnI "fetchIVR\|IVRResult\|IVRDataSchema" src/` returns nothing. The module was deleted in commit `ba49a5c`. A regression test now asserts that no main-process source imports it: `src/main/index.test.ts:576-584` ("no main-process source imports the retired Barchart scraper or fake"). Suggested fix: add a "Retired — superseded by [US-121](./us-121-iv-rank-from-own-iv-history.md)" banner and frame the body as history.
- ✗ **"Related stories … US-44 stores `fetchIVR` results to the database on a cron schedule."** No code path calls `fetchIVR`. See the US-44 audit.
- ✗ **"46 tests … in `barchart-ivr-scraper.test.ts`"** and "All 7 Gherkin scenarios are covered". The test file no longer exists.

## Unverifiable (2)

- ? The Market Chameleon investigation, the XOR cipher and the Cloudflare/Playwright findings are historical narrative.
- ? The rationale for rejecting Barchart OnDemand is narrative.

## Missing files (2)

- ✗ `src/main/integrations/barchart-ivr-scraper.ts`: does not exist (deleted in `ba49a5c`).
- ✗ `src/main/integrations/barchart-ivr-scraper.test.ts`: does not exist.
