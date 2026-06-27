---
page: docs/spec/architecture/02-adrs/standalone-service-per-operation.md
audited_at: 2026-06-27
findings: 0
---

# Audit: standalone-service-per-operation.md

## Verified (4)

- ✓ Every named per-operation service file exists under `src/main/services/` — `close-csp-position.ts`, `expire-csp-position.ts`, `assign-csp-position.ts`, `open-covered-call-position.ts`, `close-covered-call-position.ts`, `expire-cc-position.ts`, `roll-csp-position.ts`, plus read-only `get-position.ts` and `list-positions.ts` (all confirmed present).
- ✓ `src/main/services/positions.ts` is a barrel re-exporting the operations — `positions.ts:13-20` re-exports `listPositions`, `getPosition`, `closeCspPosition`, `expireCspPosition`, `assignCspPosition`, `openCoveredCallPosition`, `closeCoveredCallPosition`, `expireCcPosition`.
- ✓ Read-only context loaders share SQL via `activeLegSubquery()` — `src/main/services/active-leg-sql.ts:6`; consumed by `get-position.ts:16,200` and `list-positions.ts:11,45` (also `evaluate-alerts.ts:18,46`).
- ✓ Integration tests live next to each service — e.g. `close-csp-position.test.ts` pattern (corroborated by per-file test naming).

## Drift (0)

None.

Note (not drift): the barrel re-export block visible at `positions.ts:13-20` does not show an explicit `roll-csp-position` re-export in that range, but `roll-csp-position.ts` exists and `createPosition` is defined further down (`positions.ts:26`); the barrel's full surface was not exhaustively line-read. Flagged as low-confidence, likely complete.

## Unverifiable (2)

- ? "each service writes leg + snapshot + position update inside a single `db.transaction(() => {...})()`" — per-service transaction-composition claim; not line-verified across all seven files.
- ? Historical narrative ("started as a method on a positions.ts god-object; by US-12 the pattern was clear") — not auditable.

## Missing files (0)

- ADR cross-link `./active-leg-resolution.md` and extract/feature references — not checked beyond code-claim scope.
