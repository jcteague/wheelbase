# Refactor Phase Results: US-63 Layer 1 (Foundation)

Scope: the three parallel Layer 1 areas — DB migration, main-process IPC schemas,
renderer add-form schema.

## Automated Simplification

- code-simplifier agent run: **skipped (deliberate)** — the three production files
  total ~60 lines and were already minimal and clean. The Red+Green agents had
  pre-applied the plan's refactor hints (shared `WatchlistTickerSchema`, reuse of
  `positiveMoneySchema`). Running an automated simplifier on already-clean, tiny
  schema files risks introducing speculative abstraction, which Simplicity-First
  forbids. A manual review was performed instead.
- Files reviewed: `migrations/012_create_watchlist.sql`, `src/main/schemas.ts`
  (Watchlist section), `src/renderer/src/schemas/watchlist.ts`.

## Manual Refactorings Performed

### 1. (Already applied by Green phase) Extract shared `WatchlistTickerSchema` — `src/main/schemas.ts`

**Before**: `WatchlistAddPayloadSchema` and `WatchlistRemovePayloadSchema` would each
inline the trim/uppercase/`^[A-Z]{1,5}$` ticker rule.
**After**: a single module-level `WatchlistTickerSchema` const reused by both.
**Reason**: removes duplication; matches the `*PayloadSchema` naming convention.

### 2. (Already applied by Green phase) Reuse `positiveMoneySchema` — `src/renderer/src/schemas/watchlist.ts`

**Before**: the optional money field would re-implement positive-number validation.
**After**: `optionalPositiveMoneySchema` delegates non-empty values to
`positiveMoneySchema.safeParse(v).success`, preserving its message.
**Reason**: reuses the shared money rule without duplicating its message.

### Reuse candidates evaluated and rejected

- **Renderer `tickerSchema` from `common.ts`** — cannot be reused for the watchlist
  ticker field: US-63 requires the messages `Enter a ticker symbol` (empty) and
  `Enter a valid ticker symbol` (invalid), whereas `common.ts` `tickerSchema` emits
  `Ticker must be 1-5 uppercase letters` and has no empty-specific message. The plan
  only required the **regex** be identical, which it is (`^[A-Z]{1,5}$`).

No further manual refactorings were warranted.

## Test Execution Results

```
pnpm test
Test Files  160 passed (160)
     Tests  1758 passed (1758)
```

## Quality Checks

- ✅ `pnpm test` passed (1758 tests, no regressions)
- ✅ `pnpm lint` passed (1 prettier warning auto-fixed via `pnpm format`)
- ✅ `pnpm typecheck` passed (node + web)

## Files touched (production)

- `migrations/012_create_watchlist.sql`
- `src/main/schemas.ts`
- `src/renderer/src/schemas/watchlist.ts`

## E2E coverage added or modified

None (Layer 1 is foundation only; e2e is Layer 6).

## Remaining Tech Debt

- [ ] None for Layer 1.

## Notes

Refactor phase run in the main conversation (the `/refactor` skill cannot be invoked
from a subagent). All quality gates green.

---

# Refactor Phase Results: US-63 Layer 2 (Service layer)

Scope: `src/main/services/watchlist.ts` (add / list / remove).

## Automated Simplification

- code-simplifier agent run: **passed — no changes made.** The agent confirmed the
  file already satisfies every project convention (`db`-first args, module-level
  `const XXX_QUERY` strings, `decimal.js` `.toFixed(4)` money, `ValidationError`
  from `../core/lifecycle`, INFO-on-write / DEBUG-on-read logging).
- Files processed: `src/main/services/watchlist.ts`.

## Manual Refactorings Performed

None warranted. Candidates evaluated and rejected:

- **Reuse `mapRow` inside `addWatchlistEntry`'s return** — rejected: it would force
  building a synthetic `WatchlistRow` (re-encoding booleans to 0/1 just to re-read
  them). The direct object literal for the just-inserted write result is clearer.
- **Abstract the repeated column list** (interface / INSERT / LIST / `mapRow`) —
  rejected: inherent to a thin SQL service; no concept worth naming, so extraction
  would add indirection against Simplicity-First.
- **Share `normalizeTicker` with `ivr-collector.ts`** — rejected: that file
  de-dupes already-normalized data (different concern); no real duplication.

## Test Execution Results

```
pnpm test
Test Files  161 passed (161)
     Tests  1767 passed (1767)
```

## Quality Checks

- ✅ `pnpm test` passed (1767 tests, no regressions)
- ✅ `pnpm lint` passed (3 prettier warnings in the test file auto-fixed via `pnpm format`)
- ✅ `pnpm typecheck` passed (node + web)

## Files touched (production)

- `src/main/services/watchlist.ts`

## E2E coverage added or modified

None (e2e is Layer 6).

## Remaining Tech Debt

- [ ] None for Layer 2.

## Notes

Refactor phase run in the main conversation (the `/refactor` skill cannot be invoked
from a subagent). All quality gates green.
