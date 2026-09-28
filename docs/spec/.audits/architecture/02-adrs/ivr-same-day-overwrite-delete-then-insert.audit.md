---
page: docs/spec/architecture/02-adrs/ivr-same-day-overwrite-delete-then-insert.md
audited_at: 2026-09-28
findings: 6
---

# Audit: docs/spec/architecture/02-adrs/ivr-same-day-overwrite-delete-then-insert.md

## Verified (5)

- ✓ Superseded banner: `ivr_snapshot` dropped by migration 016 — `migrations/016_create_iv30_history.sql:55`.
- ✓ `observationWindowOf` / `utcDayBounds` deleted — grep of `src/` is empty.
- ✓ `iv30_reading` has one row per `(underlying, session, method)` via `PRIMARY KEY (underlying, session, method)` — `migrations/016_create_iv30_history.sql`.
- ✓ A same-session rerun finds nothing missing and returns `up_to_date` without writing — `src/main/services/iv-history.ts:213-226`.
- ✓ Linked pages exist: `ivr-collector-idempotent-over-missing-sessions.md`, us-44/us-100 feature pages, us-100 extract, `plans/us-44/research.md`, `plans/us-44/data-model.md`.

## Drift (0)

None. Everything below the banner is explicitly framed as "the rule as it stood from US-44 through US-100"; its `ivr_snapshot` / Barchart / `observationWindowOf` content is history. The Source list's `src/main/core/trading-calendar.ts — observationWindowOf` points at a deleted symbol, but the banner already says so.

## Unverifiable (1)

- ? Historical rationale (weekend duplicate rows, "latest same-day value wins") — narrative.

## Missing files (0)

None.
