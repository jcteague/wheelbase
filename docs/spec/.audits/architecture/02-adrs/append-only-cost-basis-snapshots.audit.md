---
page: docs/spec/architecture/02-adrs/append-only-cost-basis-snapshots.md
audited_at: 2026-09-28
findings: 2
---

# Audit: docs/spec/architecture/02-adrs/append-only-cost-basis-snapshots.md

## Verified (7)

- ✓ Each cost-basis event inserts a new row — `INSERT INTO cost_basis_snapshots` in `src/main/services/positions.ts:106` (CSP open), `close-csp-position.ts:80`, `expire-csp-position.ts:81`, `assign-csp-position.ts:126`, `open-covered-call-position.ts:93`, `roll-csp-position.ts:110`, `roll-cc-position.ts:117`, `record-call-away-position.ts:97`.
- ✓ No `UPDATE`/`DELETE` of `cost_basis_snapshots` anywhere in `src/main` (non-test).
- ✓ CC close and CC expire do not touch the table — zero `cost_basis_snapshots` references in `src/main/services/close-covered-call-position.ts` and `expire-cc-position.ts`.
- ✓ Intermediate transitions write `final_pnl = NULL` — `assign-csp-position.ts:134`, `roll-csp-position.ts:172`; call-away writes a real `finalPnl` — `record-call-away-position.ts:61,100`.
- ✓ CC close returns `ccLegPnl` on the envelope instead of a snapshot column — `close-covered-call-position.ts:52,111`.
- ✓ Snapshot insert is inside the same `db.transaction` as the leg/position writes — e.g. `close-csp-position.ts:56`.
- ✓ Latest snapshot selected by `ORDER BY snapshot_at DESC` (with a `rowid DESC` tie-break) — `src/main/services/list-positions.ts:50`, `get-position.ts:208`.

## Drift (2)

- ✗ Consequences line 27 (and Alternatives line 22) say the expiration snapshot uses `snapshot_at = now + 1ms` to sort after the opening snapshot. No `+1ms` logic exists: `expire-csp-position.ts:55` (and every other snapshot writer) uses `makeSnapshotAt(eventDate)` (`src/main/dates.ts:24-27`), which combines the event date with the current wall-clock time; same-tick ordering is now broken by `rowid DESC` in the read queries (`list-positions.ts:50`, `get-position.ts:208`). Suggested fix: describe `makeSnapshotAt` + the `rowid` tie-break.
- ✗ Line 7 says the current snapshot is chosen with `ORDER BY snapshot_at DESC LIMIT 1`, and line 14 says `listPositions`/`getPosition` use `MAX(snapshot_at)` per position. Both read queries use `ORDER BY snapshot_at DESC, rowid DESC` (`list-positions.ts:50`, `get-position.ts:208`); no `MAX(snapshot_at)` is used. Minor; suggested fix: quote the actual ordering.

## Unverifiable (1)

- ? "Re-adding the CC premium would double-count it" — domain rationale.

## Missing files (0)

- (none) — all seven `../../.extracts/us-*.md` and seven `../../features/us-*.md` links resolve.
