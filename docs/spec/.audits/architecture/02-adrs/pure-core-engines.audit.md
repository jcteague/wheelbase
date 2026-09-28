---
page: docs/spec/architecture/02-adrs/pure-core-engines.md
audited_at: 2026-09-28
findings: 1
---

# Audit: pure-core-engines.md

## Verified (6)

- ✓ `src/main/core/lifecycle.ts` imports only `decimal.js` and `./types`; `src/main/core/costbasis.ts` imports only `decimal.js` — no DB, broker, IPC, or logger imports (`lifecycle.ts:4-5`, `costbasis.ts:6`).
- ✓ Engines take plain values (`currentPhase`, `referenceDate`, `prevBasisPerShare`, …) — e.g. `lifecycle.ts:25, 84`, `costbasis.ts:143, 218`.
- ✓ Engines throw `ValidationError` — `lifecycle.ts:7-14`.
- ✓ Named transition functions exist (`closeCsp`, `expireCsp`, `recordAssignment`, `openCoveredCall`, `closeCoveredCall`, `expireCc`, `rollCsp`) — `lifecycle.ts:112-365`.
- ✓ `closeCsp` and `closeCoveredCall` share `requirePositiveClosePrice` — `lifecycle.ts:113, 332`; `openWheel` / `openCoveredCall` use `requirePositiveStrike` / `requirePositivePremium`.
- ✓ No logging in core engines — no `logger` import in either file.

## Drift (1)

- ✗ Line 16: "`rollCsp` reuses `requirePositiveStrike` / `requirePositivePremium` extracted from `openWheel` / `openCoveredCall`". `rollCsp` calls `requirePositiveDecimal(...)` directly for `costToClosePerContract` and `newPremiumPerContract` and does not validate a strike — `src/main/core/lifecycle.ts:365-382` (helper at `:41-45`). Suggested fix: say rollCsp reuses the underlying `requirePositiveDecimal` helper.

## Unverifiable (2)

- ? "Service layer is the only place that bridges engines with the DB … single transaction" — broad architectural claim across all services; not exhaustively checked.
- ? "Engine tests are fast" — qualitative.

## Missing files (0)

None.
