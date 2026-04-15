# Wheelbase: Electron Migration Plan

**From:** Preact SPA + Python FastAPI + PostgreSQL (web app)
**To:** Electron + React 19 + Hono + Drizzle + SQLite (desktop app)

See `research.md` for all decisions and rationale.

---

## Phase 1 — Electron Scaffold

**Goal:** A working Electron window with React renderer and IPC wired up, no app logic yet.

### Tasks

1. Scaffold project with `create @quick-start/electron` (react-ts template)
2. Configure `electron.vite.config.ts`:
   - Main: externalize `better-sqlite3`
   - Renderer: Tailwind 4 via `@tailwindcss/vite`
3. Set up `contextBridge` in `src/preload/index.ts` exposing `window.api` with a `ping()` method
4. Register `ipcMain.handle('ping', () => 'pong')` in `src/main/index.ts`
5. Verify renderer can call `window.api.ping()` and receive `'pong'`
6. Configure ESLint + Prettier + `tsc --noEmit`

**Done when:** `pnpm dev` opens a window; ping/pong IPC succeeds; lint and typecheck clean.

---

## Phase 2 — React Renderer Migration

**Goal:** All existing frontend code running under React 19 with all tests passing.

### Tasks

1. Copy `frontend/src/` into `src/renderer/`
2. Swap Preact imports → React:
   - `from 'preact'` → `from 'react'`
   - `from 'preact/hooks'` → `from 'react'`
   - Remove all `@preact/signals` usage (none yet in existing code)
3. Replace `@testing-library/preact` → `@testing-library/react`
4. Update `vitest.config.ts` for renderer tests (jsdom environment)
5. Install and wire shadcn/ui components (copy existing `ui/` components, remove compat shims)
6. Update `src/renderer/api/positions.ts` base URL to read from `window.apiPort`
7. Run all frontend tests — fix any React 19 compat issues

**Files to migrate (direct copy + import swap):**

- `pages/NewWheelPage.tsx`, `PositionsListPage.tsx`, `PositionDetailPage.tsx`
- `components/PositionCard.tsx`, `NewWheelForm.tsx`, `ui/*.tsx`
- `hooks/usePositions.ts`, `useCreatePosition.ts`
- `api/positions.ts`
- `schemas/new-wheel.ts`, `common.ts`
- `lib/utils.ts`, `index.css`

**Tests to migrate:**

- `PositionCard.test.tsx`, `NewWheelForm.test.tsx`, `PositionsListPage.test.tsx`

**Done when:** All 3 test files pass under `@testing-library/react`; lint and typecheck clean.

---

## Phase 3 — SQLite Schema + ley Migrations

**Goal:** Database schema defined in plain SQL, migrations run on app start via `ley`.

### Tasks

1. Write `migrations/001_initial_schema.sql` (see `data-model.md` for full SQL)
2. Write `src/main/db/index.ts`:
   - Open `better-sqlite3` at `app.getPath('userData')/wheelbase.db` (dev: `wheelbase-dev.db`)
   - Enable WAL mode and foreign keys
   - Export `db` instance
3. Write `src/main/db/migrate.ts`:
   - Use `ley` to run all pending migrations at app startup
   - Resolve `migrations/` folder path accounting for dev vs asar-packaged
4. Configure `electron-builder` to `asarUnpack`:
   - `node_modules/better-sqlite3/**` (native binary)
   - `migrations/**` (SQL files must be on real disk, not inside asar)
5. Write Vitest test: open `:memory:` DB, run migrations, assert all three tables exist

**Done when:** App starts, DB file created at userData path, migration test passes.

---

## Phase 4 — Core Engines (TypeScript)

**Goal:** `lifecycle.ts` and `costbasis.ts` pure functions with full test coverage.

### Tasks

1. Write `src/main/core/types.ts` — Zod enums matching Python `core/types.py`
2. Port `lifecycle.py` → `src/main/core/lifecycle.ts`:
   - Input: Zod schema replacing Pydantic model
   - Validation: same field rules (ticker format, strike > 0, contracts ≥ 1, premium > 0, expiration > fill_date)
   - Output: `{ phase: 'CSP_OPEN', ... }`
   - Throws: `ZodError` with field-level messages
3. Port `costbasis.py` → `src/main/core/costbasis.ts`:
   - Use `decimal.js` with `ROUND_HALF_UP` to 4 places
   - Same formula: `basisPerShare = strike − premiumPerContract`
   - Same formula: `totalPremium = premium × contracts × 100`
4. Port all backend tests to Vitest:
   - `tests/core/test_lifecycle.py` → `src/main/core/lifecycle.test.ts` (18+ cases)
   - `tests/core/test_costbasis.py` → `src/main/core/costbasis.test.ts` (8+ cases)

**Done when:** All ported tests pass; no DB or Electron imports in `src/main/core/`.

---

## Phase 5 — Services + IPC Handlers

**Goal:** `listPositions` and `createPosition` service functions working, wired to IPC, with tests.

### Tasks

1. Write `src/main/schemas.ts` — Zod request/response schemas (see `contracts/positions-api.md`)
2. Write `src/main/services/positions.ts`:
   - `listPositions(db)` — query DB, compute DTE, sort, return list
   - `createPosition(db, payload)` — validate via lifecycle engine, calculate cost basis, write Position + Leg + Snapshot atomically in a transaction
3. Write `src/main/ipc/positions.ts` — thin `ipcMain.handle` wrappers calling the service functions; add pino logging per operation
4. Register IPC handlers in `src/main/index.ts`
5. Write Vitest integration tests calling service functions directly with in-memory SQLite:
   - Port `tests/api/test_positions.py` → `src/main/services/positions.test.ts`
   - Port `tests/api/test_list_positions.py` → `src/main/services/list-positions.test.ts`

**Done when:** All service tests pass; IPC handlers registered; lint and typecheck clean.

---

## Phase 6 — Connect Renderer to IPC

**Goal:** Full create-and-list flow working in the running Electron app.

### Tasks

1. Update `src/preload/index.ts` — expose `listPositions` and `createPosition` on `window.api`
2. Update `src/renderer/api/positions.ts` — replace `fetch()` calls with `window.api.*()` calls
3. Add `window.api` TypeScript types to `src/renderer/env.d.ts` (or a shared types file)
4. Verify `NewWheelForm` → `window.api.createPosition()` → success → list refresh
5. Verify `PositionsListPage` → `window.api.listPositions()` → cards render

**Done when:** Manual smoke test of create + list flow succeeds in dev.

---

## Phase 7 — Playwright E2E

**Goal:** Automated E2E test covering the create → list flow.

### Tasks

1. Configure Playwright for Electron:
   ```ts
   // e2e/electron.spec.ts
   import { _electron as electron } from 'playwright'
   const app = await electron.launch({ args: ['dist/main/index.js'] })
   const window = await app.firstWindow()
   ```
2. Write smoke test:
   - Navigate to `/positions`
   - Verify empty state renders
   - Fill and submit new wheel form
   - Verify position card appears with correct ticker and phase
3. Add `pnpm test:e2e` script to `package.json`

**Done when:** E2E test passes against the built app.

---

## Phase 8 — Alpaca Integration Stub

**Goal:** `src/main/integrations/alpaca.ts` in place, ready for Phase 2 feature work.

### Tasks

1. Install `@alpacahq/typescript-sdk`
2. Write stub `src/main/integrations/alpaca.ts` with same structure as current `integrations/alpaca.py`
3. Wire config (API key/secret) through Electron's environment or a secure config store

**Done when:** Module exists, imports cleanly, no other files import from `@alpacahq/typescript-sdk`.

---

## What Does NOT Change

- All domain concepts (Wheel, Leg, Roll, Cost Basis, Phase lifecycle)
- All validation rules and cost basis math
- API contract shapes (request/response schemas)
- The architectural rule: core engines are pure functions with no I/O
- The architectural rule: Alpaca SDK calls isolated in one file
- TDD workflow (Red → Green → Refactor)

---

## Risk Register

| Risk                                           | Likelihood | Mitigation                                                      |
| ---------------------------------------------- | ---------- | --------------------------------------------------------------- |
| `better-sqlite3` rebuild fails in CI           | Medium     | Pin Electron version; add `postinstall` rebuild script          |
| Migration files inaccessible in packaged asar  | Medium     | `asarUnpack: ["migrations/**"]` in electron-builder config      |
| React 19 breaking changes vs Preact compat     | Low        | Existing components use no Preact-specific APIs                 |
| `decimal.js` ROUND_HALF_UP differs from Python | Low        | Port the exact costbasis tests and verify output matches        |
| Hono port 9001 in use on user machine          | Low        | Increment port until free; expose active port via contextBridge |
