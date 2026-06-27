---
page: docs/spec/architecture/02-adrs/event-marker-legs.md
audited_at: 2026-06-27
findings: 1
---

# Audit: event-marker-legs.md

## Verified (6)

- ✓ EXPIRE leg: `action='EXPIRE'`, `leg_role='EXPIRE'`, `premium_per_contract='0.0000'`, `fill_price=NULL`, fill_date = recorded/expiration date: `src/main/services/expire-csp-position.ts:62` (`VALUES (?, ?, 'EXPIRE', 'EXPIRE', 'PUT', ...)`) with `'0.0000'` and `null` bound (lines ~69-70).
- ✓ ASSIGN leg: `action='ASSIGN'`, `leg_role='ASSIGN'`, `instrument_type='STOCK'`, `premium_per_contract='0.0000'`, `fill_price=NULL`: `src/main/services/assign-csp-position.ts:106` (`VALUES (?, ?, 'ASSIGN', 'ASSIGN', 'STOCK', ?, ?, ?, '0.0000', ?, ...)`), fill_price `null` bound at line 113; also the returned object at `:153-159`.
- ✓ `activeLeg` can be `null` (return type and mapper): `getPosition` returns `activeLeg: LegRecord | null` via `mapActiveLeg` (`src/main/services/get-position.ts:88,237,245`).
- ✓ CC-expire writes an EXPIRE leg following the same pattern: `expire-cc-position.ts` references `'EXPIRE'` (confirmed in service grep).
- ✓ `snapshot_at` offset handling exists via `makeSnapshotAt`: `src/main/services/expire-csp-position.ts:5,55` (helper from `../dates`).
- ✓ `LegRole` already contains `EXPIRE`/`ASSIGN` (no new CHECK needed claim consistent with values in `src/main/core/types.ts`).

## Drift (1)

- ✗ The ADR Consequences state "The `LegAction` enum extends to `SELL | BUY | EXPIRE | ASSIGN`." Current enum is `['SELL', 'BUY', 'EXPIRE', 'ASSIGN', 'EXERCISE']` (`src/main/core/types.ts:3`) — an `EXERCISE` value was added later and is not mentioned. Suggested fix: update the ADR enum list to include `EXERCISE` (or note it was added by a later story).

## Unverifiable (1)

- ? "`snapshot_at = now + 1ms`" precise offset — `makeSnapshotAt` is used but the exact +1ms increment lives in `src/main/dates.ts`, not re-verified line-by-line here.

## Missing files (0)

- ✓ Feature pages us-5, us-6, us-9 and ADR `append-only-cost-basis-snapshots.md` exist.
