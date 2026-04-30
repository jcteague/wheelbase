---
name: IPC handler pattern
description: IPC handlers must delegate to service functions; handleIpcCall must be shared from utils
type: feedback
---

IPC handlers in `src/main/ipc/` must be thin: validate with Zod, call a service function from `src/main/services/`, return the result. Business logic (data mapping, state management, provider calls) belongs in the service layer.

`handleIpcCall` must live in `src/main/ipc/utils.ts` and be imported by all IPC handler files. Do not duplicate it.

**Why:** positions.ts established this pattern. market-data.ts violated it by embedding provider calls and data mapping directly in the handler.

**How to apply:** Any time a new IPC handler is written or an existing one is modified, check that all logic beyond Zod parsing is in a service file. Check that `handleIpcCall` is imported from `./utils`, not re-declared locally.
