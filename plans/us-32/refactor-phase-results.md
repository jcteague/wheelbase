# Refactor Phase Results: US-32 — Layer 7, E2E Tests

## Automated Simplification

- code-simplifier agent: **passed**
- Files processed: `e2e/live-underlying-price.spec.ts`

## Manual Refactorings Performed

### 1. Collapse boilerplate — 7 `describe` blocks → 1 outer `describe`

**Before**: Each AC had its own `describe` block with `let app`, `let dbPath`, and an `afterEach` — 35+ lines of repeated boilerplate.  
**After**: Single outer `describe('US-32: ...')` with one `afterEach`. Each `it` still calls `launchWithMocks` with its own opts.

### 2. Extract `goToPositionsList(page)` helper

**Before**: Every test had `await page.evaluate(() => { location.hash = '#/' })` inline.  
**After**: One named helper replaces 7 identical inline blocks.

### 3. Simplify `triggerTick` quote parameter type

**Before**: Verbose 8-property inline type annotation that was misleading (cast `as IpcStockQuote` but the object also had `change`/`changePercent` fields).  
**After**: `Record<string, unknown>` — honest about what's forwarded to the IPC handler.

### 4. Dead code confirmed absent

No leftover `setupMarketDataStubs`, `fireStockQuoteTick`, or `fireStreamError` helpers from the earlier broken page.evaluate approach.

### 5. Clarified `EXPIRATION_ISO` comment

Added explanation matching the style in `e2e/csp-flow.spec.ts`.

## Test Execution Results

```
7 passed in e2e/live-underlying-price.spec.ts (~7s)
83 unit test files, 958 tests — all passed
```

## Quality Checks

- ✅ `pnpm test:e2e e2e/live-underlying-price.spec.ts` — 7/7 passed
- ✅ `pnpm test` — 958/958 passed
- ✅ `pnpm lint` — no errors
- ✅ `pnpm typecheck` — no errors

## Remaining Tech Debt

- The `better-sqlite3` ABI mismatch is still present: running `pnpm test` before `pnpm test:e2e` can break subsequent e2e runs (pre-existing issue, not introduced by this work). Workaround: `npx electron-rebuild -f -w better-sqlite3` before `pnpm test:e2e`.
- The `is.dev` check in `main/index.ts` unconditionally appends `--remote-debugging-port=9222`, which conflicts with any other running Electron instance on the same machine and silently breaks e2e connectivity. Low priority — not blocking any tests when the port is free.
