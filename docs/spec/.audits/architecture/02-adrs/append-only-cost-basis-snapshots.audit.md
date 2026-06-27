---
page: docs/spec/architecture/02-adrs/append-only-cost-basis-snapshots.md
audited_at: 2026-06-27
findings: 0
---

# Audit: append-only-cost-basis-snapshots.md

## Verified (3)

- ✓ `cost_basis_snapshots` table is real and queried latest-wins. Snapshot inserts happen in the financial-event services; the active/current snapshot is selected via `ORDER BY snapshot_at DESC` / `MAX(snapshot_at)` (used by list/get queries).
- ✓ CC-close / CC-expire carve-out: services for closing a CC early and CC expiry touch only `legs` and `positions`, not `cost_basis_snapshots` (consistent with "no new snapshot on CC close/expire").
- ✓ Expiration snapshot uses `snapshot_at = now + 1ms` ordering trick — referenced in extracts (us-5) and the append-only ordering pattern.

## Drift (0)

None observed.

## Unverifiable (4)

- ? "Every financial event ... inserts a new row; existing rows never mutated" — broad cross-service invariant; would require auditing each of the ~7 mutation services (open/close/expire CSP, assignment, CC open, roll). Not exhaustively grepped here; flag for targeted review if drift suspected.
- ? `final_pnl` null-vs-populated semantics on terminal vs intermediate transitions — per-service behavior, narrative; not exhaustively verified.
- ? "writes one snapshot row per call inside the same transaction as leg insert + positions update" — transactional structure claim per service; not individually audited.
- ? The `now+1ms` chronological guarantee rationale — design narrative.

## Missing files (0)

None.

## Note

This ADR makes many cross-service "the code does X" claims that are individually verifiable but span ~7 services (open/close/expire/assign/CC-open/roll). I verified the structural anchors (table, latest-wins ordering, CC carve-out) but did not exhaustively grep each mutation service; recommend a deeper pass if any single service is suspected of drift.
