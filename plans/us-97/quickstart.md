# Quickstart: US-97 — Collect IVR snapshots for watchlist underlyings

## Setup

No migration, seed data, or env changes. `better-sqlite3` must be built for the right ABI
(see CLAUDE.md): `npx electron-rebuild -f -w better-sqlite3` before e2e, `pnpm rebuild
better-sqlite3` before Vitest. Running `pnpm test` then `pnpm test:e2e` in one shell needs the
electron-rebuild step in between.

## Unit / integration

```bash
pnpm vitest run src/main/services/ivr-collector.test.ts
pnpm vitest run src/renderer/src/pages/SettingsPage.test.tsx   # if the pending-state area is kept
pnpm test                                                        # full suite
```

Passing criteria:

- `ivr-collector.test.ts` — new cases for watchlist-only, closed-but-watchlisted, held-and-
  watchlisted (single fetch), and removal (no new row, old row kept) all green; the renamed
  target-selection test asserts the union.
- No other suite changes result — `makeTestDb` already runs the `watchlist` migration.

## E2E

```bash
pnpm test:e2e -- e2e/ivr-watchlist-collection.spec.ts   # the new US-97 spec
pnpm test:e2e -- e2e/ivr-collector.spec.ts              # US-44 suite must be unchanged
pnpm test:e2e -- e2e/screener-results.spec.ts e2e/screening-criteria.spec.ts  # harness refactor
pnpm test:e2e                                           # everything
```

Passing criteria: one `it()` per US-97 AC (9), all green; the US-44 spec's exact
`skippedCount`/`successCount` assertions unchanged; screener suites green after `seedIvr` stops
seeding throwaway positions.

If e2e hangs on `waiting for event 'window'`, the ABI is wrong — re-run
`npx electron-rebuild -f -w better-sqlite3`.

## Post-change checklist

```bash
pnpm test && pnpm lint && pnpm typecheck && pnpm format
```

Then `/update-spec us-97` — mark the US-44 ADR `active-ivr-targets-from-positions.md`
superseded and refresh the US-44 feature page's "derives collection targets directly from the
`positions` table" wording.
