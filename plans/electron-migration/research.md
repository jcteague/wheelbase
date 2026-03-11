# Research: Electron Migration

## Project Scaffolding

- **Decision:** `electron-vite` (the `@electron-toolkit/preload` + Vite scaffold)
- **Rationale:** Best-in-class DX for Electron + Vite projects. Handles main/preload/renderer as separate Vite builds, hot-reload in dev, built-in TypeScript support. Most popular Electron scaffold as of 2025.
- **Alternatives considered:** `electron-forge` (more complex, less Vite-native), manual Electron + Vite config (error-prone).

---

## Renderer Framework

- **Decision:** React 19 (replacing Preact 10)
- **Rationale:** Preact was chosen for SSR/bundle-size reasons that don't apply in Electron. React 19 removes `preact/compat` shims, gives full shadcn/ui compatibility, better AI tooling support, and more training data.
- **Migration cost:** Low — JSX syntax is identical. Swap imports, replace `@testing-library/preact` with `@testing-library/react`, remove `@preact/signals`.

---

## Backend Architecture

- **Decision:** Electron IPC (`ipcMain.handle` / `ipcRenderer.invoke`) with service functions called directly — no HTTP server
- **Rationale:** The renderer is the only client. Opening a localhost HTTP port exposes the API to any local process, adds CORS configuration, risks port conflicts, and adds HTTP overhead — none of which serves a desktop-only app. IPC is the idiomatic Electron pattern: type-safe, no open port, lower latency, no extra dependency.
- **Pattern:**
  - `src/main/ipc/positions.ts` — registers `ipcMain.handle` for each operation, calls service functions directly
  - `src/preload/index.ts` — exposes typed `window.api` via `contextBridge`
  - `src/renderer/api/positions.ts` — replaces `fetch()` calls with `window.api.*()` calls
- **Testing:** IPC handlers are thin wrappers; test the underlying service functions directly with Vitest + in-memory SQLite. No HTTP test client needed.
- **Alternatives considered:**
  - Hono over localhost — unnecessary open port, CORS config, port conflict risk for a desktop-only app
  - Keep Python FastAPI as sidecar — avoids backend rewrite but bundles Python runtime (~100MB), complex process lifecycle management, two languages to maintain.

---

## Database

- **Decision:** SQLite via `better-sqlite3` (raw SQL) + `ley` for migrations, stored at `app.getPath('userData')/wheelbase.db`
- **Rationale:** Single-user app; no PostgreSQL server process needed. SQLite is zero-config, embeds in the app, survives updates. `better-sqlite3` has a synchronous API well-suited to the Electron main process. Raw parameterized SQL avoids ORM abstraction overhead for a simple 3-table schema. `ley` is a minimal migration runner with no runtime dependencies beyond the driver.
- **Migration concerns:**
  - `better-sqlite3` is a native addon requiring rebuild against Electron's Node ABI. Use `@electron/rebuild` in `postinstall`.
  - Must `asarUnpack` the native `.node` binary in electron-builder config.
  - `ley` migration files (plain `.sql`) must be unpacked from asar — configure `asarUnpack: ["migrations/**"]` in electron-builder.
- **Alternatives considered:** Drizzle ORM (type-safe query builder, but adds asar migration complexity and API surface for a simple schema), `@libsql/client` (targets Turso), `node:sqlite` (experimental).
- **Schema changes vs PostgreSQL:**
  - `UUID` → `text` (generate with `crypto.randomUUID()`)
  - `ARRAY` (tags field on positions) → `text` (JSON-serialized array)
  - PostgreSQL ENUM types → `text` with Zod enum validation at the service layer
  - `Numeric(12,4)` → `text` for money values to avoid float imprecision, parse with `decimal.js`

---

## Decimal Math (Cost Basis)

- **Decision:** `decimal.js` for all money calculations
- **Rationale:** JavaScript `number` is IEEE 754 float — same underlying risk as Python `float`. Python's `decimal.Decimal` with `ROUND_HALF_UP` maps directly to `decimal.js` `Decimal` with `Decimal.ROUND_HALF_UP`. Store monetary values as SQLite `text` (string representation), parse on read.
- **Alternatives considered:** `big.js` (simpler API but fewer rounding modes), raw `number` (unacceptable for financial data).

---

## Pure Engines (TypeScript rewrite)

- **Decision:** Rewrite `lifecycle.py` and `costbasis.py` as pure TypeScript functions in `src/main/core/`
- **Rationale:** No framework dependencies; straight logic translation. All existing tests can be ported to Vitest with minimal changes. Keep same invariant: zero DB or broker imports in core.
- **Validation:** Zod schemas replace Pydantic models for input validation. `z.parse()` throws `ZodError` with field-level messages — same pattern as existing frontend Zod usage.

---

## Testing

- **Decision:** Vitest for all unit + integration tests; Playwright with `_electron` launch for E2E
- **Rationale:**
  - Vitest runs in Node.js, works for main-process logic without any Electron harness
  - `better-sqlite3` with `:memory:` gives fast, isolated DB tests (no testcontainers needed)
  - Playwright has first-class `_electron` support since v1.15 — launches the app, attaches to the renderer window, full Playwright API available
- **Alternatives considered:** Jest (slower, ESM config pain), Cypress (no Electron support).

---

## Alpaca Integration

- **Decision:** `@alpacahq/typescript-sdk` (official Alpaca TypeScript SDK)
- **Rationale:** Official SDK, maintained by Alpaca. Supports market data, trading, and options chain data (Greeks, IV). Runs in Node.js. Feature parity with `alpaca-py` for all Phase 2–3 needs.
- **Migration:** Direct method-for-method translation from `integrations/alpaca.py`. Keep the isolation rule — all SDK calls in `src/main/integrations/alpaca.ts` only.

---

## Logging

- **Decision:** `pino` with `pino-pretty` in dev
- **Rationale:** Structured JSON logging, same philosophy as `structlog`. Fast, well-maintained, excellent TypeScript support.
- **Pattern:** Main process logger. Per-operation context (operation_id, ipc_channel) bound with `pino.child()`. Same INFO/DEBUG split as current structlog setup. No HTTP request context — log at the IPC handler level instead.
