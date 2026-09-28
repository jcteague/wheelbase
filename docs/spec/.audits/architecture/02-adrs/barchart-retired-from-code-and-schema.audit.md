---
page: docs/spec/architecture/02-adrs/barchart-retired-from-code-and-schema.md
audited_at: 2026-09-28
findings: 0
---

# Audit: docs/spec/architecture/02-adrs/barchart-retired-from-code-and-schema.md

## Verified (9)

- ✓ `src/main/integrations/barchart-ivr-scraper.ts` and `src/main/integrations/fake-ivr.ts` (and tests) are gone — no such files in `src/main/integrations/`.
- ✓ `_test:ivr-set-outcomes` / `_test:ivr-fetch-log` are not registered — asserted absent in `src/main/ipc/test-iv-history.test.ts:167-168`; no other hits in `src/` or `e2e/`.
- ✓ `ivr_snapshot` dropped at the end of migration 016, taking its index with it — `migrations/016_create_iv30_history.sql:54-55`.
- ✓ `ivr-collect` job name kept — `src/main/services/ivr-collector.ts:16`.
- ✓ `ivr:collect-now` channel kept — `src/main/ipc/ivr.ts:8`, `src/preload/index.ts:87`.
- ✓ `ivr:snapshot-updated` push kept — `src/main/index.ts:209`, `src/preload/index.ts:90`.
- ✓ `IvrOnDemand` port kept — `src/main/services/ivr-on-demand.ts` (type imported at `src/main/ipc/watchlist.ts:11`; created at `src/main/index.ts:212`).
- ✓ Settings "Refresh IVR now" action kept — `src/renderer/src/pages/SettingsPage.tsx:571`.
- ✓ `cheerio` is in `package.json:41` and not imported anywhere under `src/`.

## Drift (0)

## Unverifiable (2)

- ? Barchart AWS WAF challenge, planning review (2026-09-20) outcome, Linear scenario wording — external / process history.
- ? "Six e2e specs" share the channel and job names — count not mechanically checked.

## Missing files (0)

- (none) — `../../.extracts/us-121.md`, `migrations/016_create_iv30_history.sql`, `../../features/us-121-iv-rank-from-own-iv-history.md`, `./barchart-as-canonical-ivr-source.md` exist.
