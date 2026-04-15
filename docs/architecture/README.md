# Architecture Reference

Modular docs for the Wheelbase Electron app. Load only what's relevant to your current task.

## When to load each doc

| Doc                                      | Load when...                                                                        |
| ---------------------------------------- | ----------------------------------------------------------------------------------- |
| [database.md](database.md)               | Adding/changing tables, columns, indexes, migrations, or debugging data issues      |
| [data-flow.md](data-flow.md)             | Adding IPC channels, services, core engines, or tracing a request through the stack |
| [frontend.md](frontend.md)               | Building pages, components, forms, hooks, or changing routing/layout                |
| [wheel-lifecycle.md](wheel-lifecycle.md) | Working on phase transitions, cost basis, validation rules, or new wheel operations |

## Layer map (one-line summaries)

```
Renderer (React 19 + TanStack Query + wouter)
  → API adapter (snake_case ↔ camelCase, error mapping)
    → Preload bridge (contextBridge, 6 IPC methods)
      → IPC handlers (Zod validation, error wrapping)
        → Services (DB transactions + core engine composition)
          → Core engines (pure functions, zero I/O)
            → SQLite (better-sqlite3, WAL mode, TEXT decimals)
```

## Key files quick-reference

| Concern                | Path                                                     |
| ---------------------- | -------------------------------------------------------- |
| DB init + migrations   | `src/main/db/`                                           |
| SQL schema             | `migrations/001_initial_schema.sql`                      |
| Core engines (pure)    | `src/main/core/lifecycle.ts`, `costbasis.ts`, `types.ts` |
| Services               | `src/main/services/`                                     |
| IPC handlers           | `src/main/ipc/positions.ts`                              |
| Preload bridge         | `src/preload/index.ts` + `index.d.ts`                    |
| API adapter            | `src/renderer/src/api/positions.ts`                      |
| Pages                  | `src/renderer/src/pages/`                                |
| Components             | `src/renderer/src/components/`                           |
| Hooks (TanStack Query) | `src/renderer/src/hooks/`                                |
| Form schemas (Zod)     | `src/renderer/src/schemas/`                              |
| Design tokens          | `src/renderer/src/index.css` (`:root` block)             |
