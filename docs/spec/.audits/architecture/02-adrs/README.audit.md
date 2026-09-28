---
page: docs/spec/architecture/02-adrs/README.md
audited_at: 2026-09-28
findings: 3
---

# Audit: docs/spec/architecture/02-adrs/README.md

## Verified (8)

- ✓ Every one of the 118 `./<name>.md` links in the index resolves to an existing file in `docs/spec/architecture/02-adrs/` (link list vs `ls *.md` diff is empty).
- ✓ Every ADR file in the directory (118, excluding README.md) is listed in the index; no ADR is orphaned and no link is duplicated.
- ✓ Superseded entries (`shared-massive-app-configuration`, `ivr-same-day-overwrite-delete-then-insert`, `active-ivr-targets-from-positions`, `barchart-as-canonical-ivr-source`, `ivr-non-trading-day-guard-in-collector`) are flagged **Superseded** in the index and each file carries a matching status banner (e.g. `barchart-as-canonical-ivr-source.md:5`, `active-ivr-targets-from-positions.md:3`).
- ✓ `union-ivr-targets-positions-and-watchlist` summary (positions UNION watchlist, uppercase/Set/sort) matches `src/main/services/ivr-collector.ts:41-48,61-67`.
- ✓ `dedicated-ivr-ipc-surface` summary — `ivr:collect-now` registered at `src/main/ipc/ivr.ts:8`, exposed at `src/preload/index.ts:86-90`.
- ✓ `settings-market-data-action-placement` — "Refresh IVR now" button exists at `src/renderer/src/pages/SettingsPage.tsx:571`.
- ✓ `barchart-retired-from-code-and-schema` summary — migration `migrations/016_create_iv30_history.sql:55` runs `DROP TABLE ivr_snapshot`; no `barchart`/`scrape` references remain in `src/`; job name `ivr-collect` kept (`src/main/services/ivr-collector.ts:16`).
- ✓ `ivr-collector-idempotent-over-missing-sessions` summary (no closed-day guard; weekend runs `up_to_date`) matches the header comment at `src/main/services/ivr-collector.ts:5-7`.

## Drift (3)

- ✗ README.md:9 — the `ivr-collector-per-ticker-failure-isolation` summary says, in the present tense, that "pacing stays outside" the `try/catch` and that "the scraper _throws_ on a non-JSON body". The ADR itself is amended by US-121 (`ivr-collector-per-ticker-failure-isolation.md:5-7`: "the scraper, its 1 req/s limiter ... are gone"), and `src/main/services/ivr-collector.ts:108-137` has no pacing and no scraper — each turn is `collectIvHistory`. Suggested fix: restate the summary in terms of `collectIvHistory` (DB errors rethrown as systemic, `auth_failed` aborts the run) or mark the scraper wording as history.
- ✗ README.md:90 — `ivr-collector-throttle-boundary` is listed without a Superseded/Retired marker and claims "The IVR collector enforces the 1 request/second batch throttle, even though the scraper also rate-limits". `src/main/services/ivr-collector.ts` contains no throttle/sleep, and the scraper no longer exists (no `barchart`/`scrape` hits in `src/`). The ADR file itself (`ivr-collector-throttle-boundary.md:7`) still names `collectIVRSnapshots` / `fetchIVR`, neither of which exists. Suggested fix: mark the entry (and ADR) superseded by US-121.

- ✗ README.md:147 — the `earnings-four-state-lookup` summary says "the pure engine owns the types and the Finnhub module re-exports them". `src/main/integrations/finnhub-earnings.ts` does not reference or re-export `EarningsLookup` / `CandidateEarnings` (it declares its own `EarningsCalendarRead`, `finnhub-earnings.ts:21-23`); the union is consumed by `src/main/services/earnings-dates.ts:9`. Suggested fix: "... and the persisted earnings store conforms to them".

## Unverifiable (1)

- ? The remaining ~110 one-line summaries restate their ADRs; they were checked only for link integrity and for the retired-vendor/IVR claims above. Per-ADR accuracy is covered by each ADR's own audit.

## Missing files (0)

- (none) — all 118 links resolve.
