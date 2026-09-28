---
page: docs/spec/architecture/02-adrs/server-side-dte-and-derived-fields.md
audited_at: 2026-09-28
findings: 2
---

# Audit: server-side-dte-and-derived-fields.md

## Verified (6)

- ✓ DTE computed in the main process and returned per row — `src/main/services/list-positions.ts:78` (`dte: computeDte(row.expiration ?? null)`).
- ✓ `null` DTE when no expiration — `src/main/core/dte.ts:13-16`.
- ✓ Server-side sort `dte ASC, nulls last` — `list-positions.ts:90-95` (in-memory sort after the query, via `dteSortKey`, line 55).
- ✓ `positions:list` IPC handler exists — `src/main/ipc/positions.ts:54`.
- ✓ `PositionCard` renders `"42d"` or `—` — `src/renderer/src/components/PositionCard.tsx:155`.
- ✓ Links `../../.extracts/us-2.md` and `../../features/us-2-position-list.md` exist.

## Drift (0)

None.

## Unverifiable (2)

- ? Line 16 references `selectinload` (a FastAPI/SQLAlchemy-era mechanism), framed as the "FastAPI-era equivalent", i.e. history. The current app uses a single SQL query plus in-memory sort. Not counted as drift; flag for a wording refresh.
- ? "The same principle applies to other derived fields (premium-waterfall ordering, sharesHeld, etc.)" and "tests assert first card matches the nearest-expiration ticker" — broad; not mechanically verified.

## Missing files (0)

None.
