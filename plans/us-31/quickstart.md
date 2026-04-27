# Quickstart: US-31 — Market Data Provider Adapter

## Prerequisites

1. **Node.js** and **pnpm** installed (same as existing project setup)
2. Alpaca paper trading credentials in `.env` (only needed for optional integration tests):
   ```
   ALPACA_KEY_ID=your_key
   ALPACA_SECRET_KEY=your_secret
   ALPACA_PAPER=true
   ```

## Setup

### 1. Install new dependencies

```bash
pnpm add ws @msgpack/msgpack rxjs
pnpm add -D @types/ws
```

### 2. Rebuild native modules (if needed)

If you've recently run `npx electron-rebuild`, rebuild for system Node so Vitest works:

```bash
pnpm rebuild better-sqlite3
```

## Running Tests

### Unit tests (all stories)

```bash
pnpm test
```

### Unit tests (US-31 only)

```bash
pnpm test src/main/integrations/
```

This will run all test files matching `src/main/integrations/**/*.test.ts`.

### Expected test files

After implementation, these test files should exist and pass:

| File                                                 | Covers                                                                       |
| ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| `src/main/integrations/market-data-provider.test.ts` | Interface type contracts, MarketDataError class                              |
| `src/main/integrations/alpaca-market-data.test.ts`   | REST methods (mocked SDK), WebSocket streaming (mocked `ws`), error handling |
| `src/main/integrations/market-data-factory.test.ts`  | Factory function returns correct provider                                    |

### Passing criteria

```bash
pnpm test        # all tests pass
pnpm lint        # no lint errors
pnpm typecheck   # no TypeScript errors
pnpm format      # formatted
```

## No Migrations Required

This story introduces no database changes. All types are in-memory TypeScript interfaces.

## No UI Changes

This story is backend-only. No renderer changes, no E2E test setup beyond the standard `pnpm test:e2e` runner.

## Optional: Integration Test with Real Credentials

An optional integration test file (`src/main/integrations/alpaca-market-data.integration.test.ts`) can be created that hits real Alpaca paper endpoints. This file should:

- Be skipped by default (use `describe.skipIf(!process.env.ALPACA_KEY_ID)`)
- Not run in CI
- Verify real API responses match our type expectations
