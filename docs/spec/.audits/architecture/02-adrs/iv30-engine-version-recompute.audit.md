---
page: docs/spec/architecture/02-adrs/iv30-engine-version-recompute.md
audited_at: 2026-09-28
findings: 8
---

# Audit: docs/spec/architecture/02-adrs/iv30-engine-version-recompute.md

## Verified (7)

- ✓ `IV30_ENGINE_VERSION` integer in `src/main/core/iv30.ts:19`, stamped on readings (`:201`) and stored in `iv30_reading.engine_version` (`migrations/016_create_iv30_history.sql`).
- ✓ `recomputeIvHistory` re-runs `iv30FromInputs` over rows behind the current version, or all rows when `force` — `src/main/services/iv-history.ts:271-281`; `iv30FromInputs` shares `iv30Of`/`interpolateTotalVariance` with `computeIv30` (`src/main/core/iv30.ts:95-112,189`).
- ✓ Takes no provider argument (signature `(db, { ticker?, force?, logger? })`, `iv-history.ts:271-274`).
- ✓ Rewrites in one transaction — `updateIv30Values`, `src/main/services/iv-history-store.ts:191-196`.
- ✓ `collectIvHistory` recomputes the ticker before computing missing sessions — `iv-history.ts:200-206`.
- ✓ Rows that no longer invert (or whose inputs cannot be rebuilt, `inputsOf` → null) are counted `unrecomputable`, left unchanged and logged at WARN (`iv_history_unrecomputable`) — `iv-history.ts:278-291`, `iv-history-store.ts:232`.
- ✓ `_test:iv-history-recompute` channel drives the same function — `src/main/ipc/test-iv-history.ts:52`.

## Drift (0)

None.

## Unverifiable (1)

- ? Known limit (unrecomputable rows re-warned every collect) — consistent with the code having no suppression, but framed as a review advisory.

## Missing files (0)

None.
