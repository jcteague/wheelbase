# Data Flow Architecture

How requests travel from the UI to the database and back.

## Layer stack

```
┌─────────────────────────────────────────────────┐
│  Renderer (React)                               │
│  Pages → Hooks (TanStack Query) → API Adapter   │
├─────────────────────────────────────────────────┤
│  Preload Bridge (contextBridge)                 │
│  window.api.* → ipcRenderer.invoke()            │
├─────────────────────────────────────────────────┤
│  IPC Handlers (ipcMain.handle)                  │
│  Zod validation → handleIpcCall() wrapper       │
├─────────────────────────────────────────────────┤
│  Services (DB transactions + core composition)  │
├─────────────────────────────────────────────────┤
│  Core Engines (pure functions, zero I/O)        │
├─────────────────────────────────────────────────┤
│  SQLite (better-sqlite3)                        │
└─────────────────────────────────────────────────┘
```

## IPC channels

| Channel                | Method                         | Service                  | Core engines used                       |
| ---------------------- | ------------------------------ | ------------------------ | --------------------------------------- |
| `ping`                 | `window.api.ping()`            | —                        | —                                       |
| `positions:list`       | `window.api.listPositions()`   | `list-positions.ts`      | —                                       |
| `positions:create`     | `window.api.createPosition(p)` | `positions.ts`           | `openWheel`, `calculateInitialCspBasis` |
| `positions:get`        | `window.api.getPosition(id)`   | `get-position.ts`        | —                                       |
| `positions:close-csp`  | `window.api.closePosition(p)`  | `close-csp-position.ts`  | `closeCsp`, `calculateCspClose`         |
| `positions:expire-csp` | `window.api.expirePosition(p)` | `expire-csp-position.ts` | `expireCsp`, `calculateCspExpiration`   |

## IPC result contract

Every handler returns this shape — never throws to the renderer:

```typescript
{ ok: true, ...data }
| { ok: false, errors: [{ field: string, code: string, message: string }] }
```

## Error propagation

```
Core engine throws ValidationError(field, code, message)
  → IPC handler catches → returns { ok: false, errors: [{field, code, message}] }
    → API adapter checks result.ok → throws ApiError { status, body }
      → TanStack Query mutation.isError → component displays error
```

Field names are mapped at the API adapter layer: IPC camelCase → form snake_case (e.g., `premiumPerContract` → `premium_per_contract`).

## Service pattern

Each service function follows this structure:

1. Fetch current state from DB (if needed)
2. Call core engine(s) for validation and calculation
3. Execute DB transaction (INSERT/UPDATE)
4. Log business event at INFO level
5. Return result object

Services are the only layer that touches both DB and core engines. Core engines never import DB or broker modules.

## Adding a new operation

1. **Core engine** — Add pure validation/calculation function to `src/main/core/`
2. **Schema** — Add Zod payload schema to `src/main/schemas.ts`
3. **Service** — Add service function in `src/main/services/` (DB + core composition)
4. **IPC handler** — Register channel in `src/main/ipc/positions.ts`
5. **Preload** — Add method to `src/preload/index.ts` + types in `index.d.ts`
6. **API adapter** — Add function to `src/renderer/src/api/positions.ts`
7. **Hook** — Add TanStack Query hook in `src/renderer/src/hooks/`
8. **Component** — Use the hook in page/component

## Logging standards

- **INFO:** Business events — `position_created`, `position_closed`, `position_expired`, `positions_listed`
- **DEBUG:** Inputs before processing, core engine results, DB checkpoints
- **Core engines:** Zero logging (pure functions, no I/O imports)
- **Config:** `pino`, silent in Vitest, info in production
