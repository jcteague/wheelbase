# Quickstart — US-62: Covered-call breach alert

## Scope of changes

All production changes live in one file: `src/main/core/alerts.ts` (pure
engine). Tests live in `src/main/core/alerts.test.ts` (unit) and
`src/main/services/evaluate-alerts.e2e.test.ts` (service/e2e resolution +
selection). No migrations, no renderer, no IPC changes.

## Setup

None. `rule_code` is unconstrained `TEXT`, so no migration is needed. The
service already pre-fetches underlying prices for every ticker and already
excludes non-evaluable phases.

> If you have just run `pnpm test:e2e`, remember the `better-sqlite3` ABI
> caveat before running unit tests, and vice-versa (see CLAUDE.md).

## Running the tests

```bash
# Unit — pure rule engine (fast, run these first while iterating)
pnpm test src/main/core/alerts.test.ts

# Service/e2e — selection, persistence, and auto-resolution
pnpm test src/main/services/evaluate-alerts.e2e.test.ts

# Full suite + gates before marking done
pnpm test && pnpm lint && pnpm typecheck && pnpm format
```

## Passing criteria

- New `COVERED_CALL_BREACH` unit tests pass (fires above/at strike, no fire
  below, CSP produces no match/skip, missing-price skip).
- New service/e2e tests pass: a `CC_OPEN` breach creates a medium alert; a
  `HOLDING_SHARES` position with no open call creates none; a subsequent
  evaluation with the stock back below the strike resolves the alert.
- No regressions in the existing alert unit/service tests.
- `pnpm lint`, `pnpm typecheck`, `pnpm format` all clean.
