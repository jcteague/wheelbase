---
page: docs/spec/architecture/02-adrs/active-ivr-targets-from-positions.md
audited_at: 2026-09-28
findings: 0
---

# Audit: docs/spec/architecture/02-adrs/active-ivr-targets-from-positions.md

## Verified (5)

- ✓ Page is explicitly marked superseded by US-97 (line 3) and the Decision is framed as "As originally decided for US-44 — superseded" (line 13) — historical, not drift.
- ✓ Superseding claim holds: `COLLECTION_TARGETS_QUERY` is `positions WHERE status != 'CLOSED' UNION watchlist` — `src/main/services/ivr-collector.ts:41-48`.
- ✓ "The positions arm ... is still one half of that union" — `ivr-collector.ts:42-44` (`WHERE status != 'CLOSED'`).
- ✓ "Normalisation ... unchanged" — uppercase + `Set` de-dup + sort in `listCollectionTargets`, `ivr-collector.ts:61-67`.
- ✓ Cited source `src/main/services/ivr-collector.ts` exists; the collector reads SQLite directly rather than `listPositions()` (no `listPositions` import in `ivr-collector.ts:8-14`).

## Drift (0)

## Unverifiable (1)

- ? "Sorting and de-duplicating ... simplifies tests and log review" — rationale.

## Missing files (0)

- (none) — `plans/us-44/research.md`, `plans/us-44/data-model.md`, `../../features/us-44-ivr-snapshot-store-and-scheduler.md`, `../../features/us-97-collect-ivr-for-watchlist-underlyings.md`, and `./union-ivr-targets-positions-and-watchlist.md` all exist.
