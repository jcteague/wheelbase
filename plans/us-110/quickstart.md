# Quickstart: US-110

## Setup

No migration, no seed data, no new dependency. The PMCC criteria document is created on first save; until then `screener:get-pmcc-criteria` returns the shipped defaults.

`better-sqlite3` is built for one Node ABI at a time and pnpm skips pre/post scripts, so switch by hand:

```bash
pnpm rebuild:node       # before pnpm test (Vitest)
pnpm rebuild:electron   # before pnpm dev / pnpm build / pnpm test:e2e
```

Wrong ABI shows as `NODE_MODULE_VERSION` from Vitest or a hang on `waiting for event 'window'` from an e2e launch.

## Running this story's tests

```bash
# Engine and bounds (pure)
pnpm vitest run src/main/core/pmcc-screener.test.ts src/main/core/screening-criteria.test.ts

# Persistence, chain pull, service
pnpm vitest run src/main/services/pmcc-screening-criteria.test.ts
pnpm vitest run src/main/services/candidate-chains.integration.test.ts
pnpm vitest run src/main/services/pmcc-screener.integration.test.ts

# IPC + schema
pnpm vitest run src/main/ipc/screener.test.ts src/main/schemas.test.ts

# Renderer
pnpm vitest run src/renderer/src/lib/bench.test.ts src/renderer/src/lib/screener-format.test.ts
pnpm vitest run src/renderer/src/schemas/pmcc-screening-criteria.test.ts
pnpm vitest run src/renderer/src/components/BenchCard.test.tsx src/renderer/src/components/BenchDetail.test.tsx
pnpm vitest run src/renderer/src/components/MatchingDiagonalCard.test.tsx src/renderer/src/components/PmccScreeningCriteriaForm.test.tsx
pnpm vitest run src/renderer/src/pages/WatchlistPage.test.tsx

# Everything
pnpm test
```

## E2E

```bash
pnpm rebuild:electron
pnpm test:e2e -- e2e/pmcc-screener.spec.ts      # this story, one test per AC
pnpm test:e2e -- e2e/watchlist-bench.spec.ts    # US-96 must still pass untouched (wheel lens is the default)
pnpm test:e2e -- e2e/screening-criteria.spec.ts # US-67 must still pass untouched
pnpm test:e2e                                    # full suite before calling it done
```

Call fixtures are served through the same `WHEELBASE_MOCK_OPTION_SNAPSHOTS` seam the put fixtures use, keyed by OCC symbol with `C`. The fake provider filters on `type` and `expirationFrom`; area 5 adds the `expirationTo` check it currently lacks so the two windows do not bleed into each other.

## Manual check

```bash
pnpm dev
```

1. Watchlist with a few names that have listed LEAPS (e.g. large caps and sector ETFs). Market-data credentials configured.
2. Header shows `Wheel | PMCC`. Select **PMCC**: the criteria strip switches to the PMCC chips, the sections re-partition, the detail panel shows a **Matching diagonal** card for a name in Meets criteria with both legs and the spread metrics.
3. Open **Screening criteria**: the sheet header reads `PMCC · LEAPS + short call`; tighten **Max debit / width** and **Save & re-screen**; confirm the banner, the updated chip, and the moved card.
4. Select **Wheel**: the wheel strip and results are exactly as before; the wheel sheet shows the unchanged wheel criteria.
5. Quit and relaunch: PMCC criteria persist; the bench opens on **Wheel**.

## Passing criteria

- `pnpm test` green, `pnpm lint` clean, `pnpm typecheck` clean, `pnpm format` applied
- `pnpm test:e2e` green, including every AC-named case in `e2e/pmcc-screener.spec.ts` and the untouched US-66/67/68/70/96/98 suites
- `grep -rn "type: 'put'" src/main/services/candidate-chains.ts` returns nothing (the type is a parameter)
- `src/main/core/pmcc-screener.ts` and `src/main/core/screener.ts` import nothing from `services/`, `integrations/`, or the logger
- No component file over 200 lines (`ScreeningCriteriaForm.tsx` shrinks; `PmccScreeningCriteriaForm.tsx` composes the extracted fields)
