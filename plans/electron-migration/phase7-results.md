# Phase 7 Results: Playwright E2E

## Status: Infrastructure complete — test requires GUI terminal to run

## What was implemented

### 1. Hash-based routing (`src/renderer/src/App.tsx`)
Switched wouter from default browser-history routing to hash routing via `useHashLocation`.
Required because Electron's `loadFile()` creates `file://` URLs with full pathnames that don't
match route patterns like `/`. Hash URLs (`#/positions`) work correctly.

### 2. Fixed empty-state link (`src/renderer/src/pages/PositionsListPage.tsx`)
Changed `href="/"` → `href="#/"` to work with the hash router.

### 3. DB path override (`src/main/db/index.ts`)
Added `process.env.WHEELBASE_DB_PATH` override so E2E tests can inject a temp DB path
for isolation without affecting the real user database.

### 4. E2E test (`e2e/electron.spec.ts`)
Vitest + playwright `_electron` test covering the full create → list flow:
- Launch Electron with an isolated temp DB
- Navigate to `#/positions` → verify "No positions yet" empty state
- Navigate to `#/` → fill form (AAPL, $150 strike, 1 contract, $3.50 premium)
- Submit → verify success message shows "AAPL"
- Navigate to `#/positions` → verify "AAPL" + "CSP Open" card

### 5. `vitest.e2e.config.ts`
Separate vitest config for e2e tests (60s timeout, node environment).
E2E tests are excluded from `pnpm test` (unit tests only).

### 6. `package.json` script
`"test:e2e": "electron-vite build && vitest run --config vitest.e2e.config.ts"`

### 7. `tailwindcss-animate` added to devDependencies
Was referenced in `index.css` but missing — caused production build to fail.

## Known constraint: run from a GUI terminal

`pnpm test:e2e` must be run from a terminal with access to the macOS WindowServer
(iTerm2, Terminal.app, etc.), **not** from Claude Code's shell.

Electron requires WindowServer access during Chromium framework initialization.
Claude Code's shell runs in a background context without GUI session access,
so any attempt to spawn Electron as a child process results in SIGABRT before
any app code runs. This is a macOS process isolation constraint, not a code bug.

```bash
# Run from your own terminal:
cd ~/my-stuff/wheelbase/wheelbase-electron
pnpm test:e2e
```

## Unit tests (all passing)

```
✓ main  src/main/core/costbasis.test.ts        (8 tests)
✓ main  src/main/core/lifecycle.test.ts        (14 tests)
✓ main  src/main/ipc/ping.test.ts              (2 tests)
✓ main  src/main/db/migrate.test.ts            (3 tests)
✓ main  src/main/services/list-positions.test.ts (8 tests)
✓ main  src/main/services/positions.test.ts    (11 tests)
✓ renderer  src/renderer/src/components/PositionCard.test.tsx     (8 tests)
✓ renderer  src/renderer/src/pages/PositionsListPage.test.tsx     (4 tests)
✓ renderer  src/renderer/src/components/NewWheelForm.test.tsx     (11 tests)

Test Files: 9 passed | Tests: 69 passed
```
