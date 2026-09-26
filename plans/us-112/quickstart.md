# Quickstart: US-112 — IVR on the PMCC position card

## Prerequisites

- Node ABI for Vitest: `pnpm rebuild:node` (switch back with `pnpm rebuild:electron` before e2e).
- No migration, no seed data, no new credential. IV rank rows come from the collector
  (`ivr_snapshot` today; `iv30_reading` once US-121 lands) — unit tests seed them directly.
- Areas 1–3 (main process) run today. Areas 4–6 (card) need US-108's `PmccPositionCard` on the
  grid US-18 provides; until then their tests are written against the components this story adds
  and mounted into the card when it exists.

## Unit + integration

```bash
pnpm test -- src/main/services/earnings-dates.test.ts     # readLastEarningsFromStore
pnpm test -- src/main/services/list-positions.test.ts     # ivRank join, degrade-to-null, now pinning
pnpm test -- src/renderer/src/lib/ivr-context.test.ts     # zones, both registries, unusable states
pnpm test -- src/renderer/src/components/pmcc              # IvrFaceCell, IvrContextCells
pnpm test -- src/renderer/src/hooks/useIvrSnapshotUpdates.test.ts
pnpm test                                                 # everything green before moving on
```

## Lint / types / format

```bash
pnpm lint && pnpm typecheck && pnpm format
```

## E2E (after US-108 lands)

```bash
pnpm rebuild:electron
pnpm test:e2e -- e2e/pmcc-card-ivr.spec.ts
```

The spec boots the app with `WHEELBASE_FAKE_IVR`, programs readings through `_test:ivr-set-outcomes`
/ `_test:ivr-set-now` (see `e2e/ivr-helpers.ts`; ages via `observedSessionsAgo` in
`e2e/trading-day-fixtures.ts`), seeds the US-108 XYZ PMCC fixture, and reads
`[data-testid="pmcc-ivr-face"]` and the two tier-2 cells. Under US-121 the seam becomes bar data;
the spec's helper calls change, the assertions do not.

## Passing criteria

- Every named e2e test in `plan.md` Area 7 passes against the packaged app.
- `list-positions.test.ts` proves a wheel item is byte-for-byte unchanged apart from `ivRank`.
- The IVR read failing (calendar throw) still returns the full list with `ivRank: null` and one
  WARN line.
