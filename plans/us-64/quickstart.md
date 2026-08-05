# Quickstart — US-64 verification

US-64 is **backend-only** (adapter + pure core + service). There is no renderer
surface, so there is no Playwright E2E for this story; the AC-level coverage runs as
a headless integration test of `pullWatchlistChains` against a stub
`MarketDataProvider` + an in-memory SQLite watchlist.

## Prerequisites

- Deps installed; `better-sqlite3` built for system Node (Vitest):
  ```bash
  npx electron-rebuild -f -w better-sqlite3   # first, for Electron
  pnpm rebuild better-sqlite3                 # then, for system Node (Vitest)
  ```
- No migrations required — US-64 persists nothing. The integration test seeds the
  existing `watchlist` table (migration `012_create_watchlist.sql`) in an in-memory DB.

## Test layout

| Layer                     | File                                                     |
| ------------------------- | -------------------------------------------------------- |
| Adapter enrichment        | `src/main/integrations/massive-market-data.test.ts`      |
| Fake provider chains      | `src/main/integrations/fake-market-data.test.ts`         |
| Pure core helpers         | `src/main/core/candidate-chain.test.ts`                  |
| Service orchestration     | `src/main/services/candidate-chains.test.ts`             |
| AC integration (headless) | `src/main/services/candidate-chains.integration.test.ts` |

## Run

```bash
pnpm test src/main/core/candidate-chain.test.ts
pnpm test src/main/services/candidate-chains
pnpm test src/main/integrations/massive-market-data.test.ts
pnpm test                # full suite must stay green
```

## Passing criteria

- Adapter: chain results carry `contractId`, `strike`, `expiration`, `contractType`,
  and real `openInterest`/`volume`; `getOptionSnapshot` (single) is unchanged.
- Core: `dteWindowToExpirationRange` returns dates `currentDate + min|max` days;
  `toCandidateStrikes` drops `bid<=0 || ask<=0`; `classifyChainFailure` maps
  `not_found→'ticker'`, else `'provider'`.
- Service: each AC scenario (below) produces the exact `status` values in
  `data-model.md`; per-ticker failures never abort the batch; not_found logs at
  debug.

## Post-change checklist

```bash
pnpm test && pnpm lint && pnpm typecheck && pnpm format
```
