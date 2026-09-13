# US-96 Quickstart — running and verifying the work locally

## Setup

No migration and no new environment variables. One new dependency:

```bash
pnpm dlx shadcn@latest add tooltip      # adds src/renderer/src/components/ui/tooltip.tsx + @radix-ui/react-tooltip
pnpm install
npx electron-rebuild -f -w better-sqlite3   # Electron ABI (for pnpm dev / pnpm test:e2e)
pnpm rebuild better-sqlite3                 # system Node ABI (for pnpm test)
```

If `pnpm test` has run since the last `electron-rebuild`, run `npx electron-rebuild -f -w better-sqlite3`
again before `pnpm test:e2e` (symptom otherwise: e2e hangs on "waiting for event 'window'").

## Unit and integration tests (Vitest)

```bash
pnpm test
```

New or changed test files, in the order the plan builds them:

| File                                                                                                                 | Covers                                                                                  |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `src/main/core/ivr-freshness.test.ts`                                                                                | `expired` is returned as an assessed reading; `isUsableState('expired')` is false       |
| `src/main/services/ivr-snapshots.test.ts`                                                                            | expired readings reach the map; unreadable still → null                                 |
| `src/main/core/watchlist-signal.test.ts`                                                                             | every gate row in `data-model.md`; precedence of `reasonsFor`; `earningsDisplay` window |
| `src/main/services/underlying-quotes.test.ts`                                                                        | per-ticker isolation of the shared quote fetch                                          |
| `src/main/services/screener.test.ts`                                                                                 | price-ceiling path still uses isolated quotes (unchanged behaviour)                     |
| `src/main/services/watchlist-snapshot.test.ts`                                                                       | rows, `asOf`, every degradation guarantee in `contracts/watchlist-snapshot.md`          |
| `src/main/ipc/watchlist.test.ts`                                                                                     | `watchlist:snapshot` envelope; internal error path                                      |
| `src/renderer/src/api/watchlist.test.ts`                                                                             | `getWatchlistSnapshot` maps `ok:false` to `ApiError`                                    |
| `src/renderer/src/hooks/useWatchlistSnapshot.test.ts`, `useAddToWatchlist.test.ts`, `useRemoveFromWatchlist.test.ts` | query key; both mutations invalidate snapshot + screener results                        |
| `src/renderer/src/lib/ivr-tooltip.test.ts`                                                                           | tooltip copy per tier                                                                   |
| `src/renderer/src/components/FreshnessRing.test.tsx`, `IvrCell.test.tsx`                                             | fill fraction per state, `exp`, no ring for null, tooltip opens on hover/focus          |
| `src/renderer/src/lib/bench.test.ts`, `day-change.test.ts`                                                           | join rules, ordering, reasons, default selection; percent/direction                     |
| `src/renderer/src/components/BenchCard.test.tsx`, `BenchDetail.test.tsx`, `WatchlistPage.test.tsx`                   | cards, detail panel, page composition, header actions, states                           |
| `src/renderer/src/App.test.tsx`                                                                                      | no Screener nav item or route                                                           |

Passing criteria: all suites green, `pnpm lint` clean, `pnpm typecheck` clean, `pnpm format` no diff.

## E2E tests (Playwright `_electron`)

```bash
pnpm test:e2e                                  # full suite
pnpm test:e2e -- e2e/watchlist-bench.spec.ts   # this story's AC suite only
```

Fixtures come from the existing seams — no new env vars:

- Put chains: `WHEELBASE_MOCK_OPTION_SNAPSHOTS` via `launchScreener({ fixtures })` (`e2e/screener-helpers.ts`)
- Underlying quotes: `WHEELBASE_MOCK_STOCK_QUOTES` via `launchScreener({ stockQuotes })` — now read for every bench row, not only under a price ceiling
- IV ranks and clock: `launchScreener({ ivr, fakeNow, brokerCalendar })`, `setIvrNow`, `reloadBench`
- Earnings: `launchScreener({ earnings })`
- Outage / not connected: `marketDataError`, `withoutBrokerCredentials`
- Conditions: seeded through the real add form (`seedWatchlist` gains an optional per-ticker conditions map: `ownBelow`, `ivr`, `postEarnings`)

Re-pointed suites that must stay green: `e2e/watchlist.spec.ts` (US-63, untouched),
`e2e/screener-results.spec.ts`, `e2e/screener-earnings.spec.ts`, `e2e/screening-criteria.spec.ts`,
`e2e/promote-to-trade.spec.ts`, `e2e/ivr-staleness.spec.ts`, `e2e/ivr-watchlist-collection.spec.ts`.

## Manual check

```bash
pnpm dev
```

Open Watchlist. With Alpaca paper credentials saved and a few tickers added with conditions,
confirm: the sidebar has no Screener entry; the header shows Screening criteria / Refresh /
Add stock and the market pill; Meets criteria and Stocks of interest split the bench; each
card shows price and an IVR with a ring; hovering the ring opens the tooltip; selecting a card
fills the detail panel; Review trade lands on the pre-filled new-wheel form.

## Spec

When the plan completes, run `/update-spec us-96` so `docs/spec/` captures the combined page,
the retired Screener page, the `expired` state, and the `watchlist:snapshot` contract.
