# Quickstart: Electron Migration

## Prerequisites

- Node.js 20+
- pnpm 10+
- Git

No PostgreSQL, no Python, no Docker required.

---

## Initial Setup

```bash
# Scaffold new Electron Vite project (run from parent directory)
pnpm create @quick-start/electron wheelbase-electron --template react-ts
cd wheelbase-electron

# Install core runtime deps
pnpm add better-sqlite3 ley decimal.js pino uuid
pnpm add @tanstack/react-query react-hook-form zod zustand wouter
pnpm add lucide-react class-variance-authority clsx tailwind-merge

# Install dev deps
pnpm add -D @electron/rebuild @types/better-sqlite3 @types/uuid
pnpm add -D vitest @testing-library/react @testing-library/user-event
pnpm add -D tailwindcss @tailwindcss/vite playwright
pnpm add -D @alpacahq/typescript-sdk
```

---

## Database Setup

Migrations live in `migrations/` as plain `.sql` files named `001_initial_schema.sql`, `002_...sql`, etc.

`ley` runs them automatically at app startup via `src/main/db/migrate.ts` — no manual step needed in dev.

To add a new migration: create the next numbered `.sql` file in `migrations/`. `ley` tracks applied migrations in a `_ley_migrations` table.

---

## Running in Development

```bash
pnpm dev
```

This starts:

- Electron main process with Hono on `localhost:9001`
- Vite dev server for renderer on `localhost:5173`
- Hot reload for both

The DB file is created at:

- macOS: `~/Library/Application Support/wheelbase-electron/wheelbase.db`

---

## Running Tests

### Unit tests (core engines, API routes)

```bash
pnpm test
# or watch mode:
pnpm test --watch
```

Tests use `better-sqlite3` with `:memory:` — no running Electron instance needed.

Expected output: all lifecycle, costbasis, and API route tests passing.

### E2E tests (requires dev server running)

```bash
# In one terminal:
pnpm dev

# In another:
pnpm test:e2e
```

Playwright launches Electron directly via `_electron.launch()`.

---

## Rebuilding Native Modules

Required after any Electron version change:

```bash
pnpm rebuild
# or explicitly:
npx @electron/rebuild -f -w better-sqlite3
```

---

## Migration Phases

The migration is executed in this order. Each phase ends with all tests passing.

| Phase | Work                              | Tests                                   |
| ----- | --------------------------------- | --------------------------------------- |
| 1     | Electron scaffold + IPC ping/pong | App opens, IPC verified                 |
| 2     | React renderer migration          | All frontend Vitest tests pass          |
| 3     | SQLite schema + ley migrations    | Schema created in SQLite                |
| 4     | Core engines (TypeScript)         | lifecycle + costbasis Vitest tests pass |
| 5     | Service functions + IPC handlers  | Service integration tests pass          |
| 6     | Connect renderer to IPC           | Full create/list flow works             |
| 7     | Playwright E2E                    | E2E smoke test passes                   |
| 8     | Alpaca integration stub           | Integration module in place             |

---

## Linting and Type-checking

```bash
pnpm lint       # ESLint
pnpm typecheck  # tsc --noEmit
```

Both must be clean before a phase is considered done.
