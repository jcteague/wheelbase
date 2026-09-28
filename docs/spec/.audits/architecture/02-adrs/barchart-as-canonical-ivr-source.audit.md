---
page: docs/spec/architecture/02-adrs/barchart-as-canonical-ivr-source.md
audited_at: 2026-09-28
findings: 1
---

# Audit: docs/spec/architecture/02-adrs/barchart-as-canonical-ivr-source.md

## Verified (4)

- ✓ Page carries an explicit **Superseded by US-121** banner (line 5) and states the body "records the decision as it stood from US-44 until US-121" — the Decision's references to `fetchIVR` / `source = 'barchart'` are history, not drift.
- ✓ Banner claim "migration 016 drops the table" — `migrations/016_create_iv30_history.sql:55` (`DROP TABLE ivr_snapshot`).
- ✓ Banner claim "the scraper, its fake ... are deleted" — no `barchart*` or `fake-ivr*` file in `src/main/integrations/`; no `barchart` reference in `src/`.
- ✓ Banner claim "IV rank is now computed in-house from Alpaca daily option bars" — `/v1beta1/options/bars` URL builder at `src/main/integrations/alpaca-market-data-mappers.ts:352`, consumed by `src/main/services/iv-history.ts` via `collectIvHistory`.

## Drift (0)

## Unverifiable (1)

- ? "Barchart put its site behind an AWS WAF challenge" — external fact.

## Missing files (1)

- ✗ Source `src/main/integrations/barchart-ivr-scraper.ts` (line 25) no longer exists. Expected given the supersession, but the Source list presents it without a "(deleted)" note. `plans/us-44/research.md`, `../../features/us-44-ivr-snapshot-store-and-scheduler.md`, `../../features/us-121-iv-rank-from-own-iv-history.md`, `./barchart-retired-from-code-and-schema.md` exist.
