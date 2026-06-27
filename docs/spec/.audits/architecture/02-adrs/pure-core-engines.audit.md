---
page: docs/spec/architecture/02-adrs/pure-core-engines.md
audited_at: 2026-06-27
findings: 0
---

# Audit: pure-core-engines.md

## Verified (4)

- ✓ `src/main/core/lifecycle.ts` imports only `decimal.js` and `./types` — no `better-sqlite3`, no Alpaca SDK, no IPC (`src/main/core/lifecycle.ts:4-5`).
- ✓ `src/main/core/costbasis.ts` imports only `decimal.js` (`src/main/core/costbasis.ts:6`).
- ✓ Engines throw `ValidationError` — class defined and thrown in lifecycle (`src/main/core/lifecycle.ts:7,37,43,57,63,...`).
- ✓ Named lifecycle functions cited all exist: `closeCsp`, `expireCsp`, `recordAssignment`, `openCoveredCall`, `closeCoveredCall`, `expireCc`, `rollCsp` (`src/main/core/lifecycle.ts:112,149,273,181,331,303,365`), plus `openWheel`, `recordCallAway`, `rollCc`.

## Drift (0)

## Unverifiable (2)

- ? "The service layer is the only place that bridges engines with the DB ... inside a single transaction" — broadly consistent (e.g. `roll-csp-position.ts` does read-then-`db.transaction`), but "only place" is a global claim across many services, not exhaustively grep-verifiable.
- ? "No logging is added to core engines" — consistent with the imports (no logger import in either core file), but stated as a process rule.

## Missing files (0)
