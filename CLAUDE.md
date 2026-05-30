# Option Wheel Manager — Claude Context

Codex should also read and follow [CLAUDE.md](/Users/johnteague/my-stuff/wheelbase/CLAUDE.md) for this repo. If `AGENTS.md` and `CLAUDE.md` overlap, treat them as complementary; if they ever conflict, prefer the more specific instruction closest to the task.

## What This App Is

A single-user trading journal and management tool for the **options wheel strategy**. Traders sell cash-secured puts (CSPs), accept assignment into shares, then sell covered calls (CCs) until the shares are called away — repeating the cycle. The app tracks every leg, maintains accurate cost basis through rolls and premiums, and fires management alerts.

Two-layer architecture (Electron desktop app):

- **Renderer** — React 19 SPA (electron-vite, TypeScript, TanStack Query, React Hook Form, Zod, wouter)
- **Main process** — TypeScript, better-sqlite3 + custom SQL migrations, IPC handlers, pure core engines

Alpaca is the broker integration (read-only through Phase 3, order execution in Phase 4).

---

## Key Domain Concepts

- **Wheel** — a position that progresses through phases: `CSP_OPEN → HOLDING_SHARES → CC_OPEN → (repeat or exit)`
- **Leg** — a single option transaction (open or close) attached to a position
- **Roll** — closing one leg and opening another; stored as a linked `roll_from`/`roll_to` pair, never mutated in place
- **Cost basis** — recalculated after every leg event: `assignment_strike − CSP_premiums − CC_premiums + roll_debits − roll_credits`
- **Phase** — the lifecycle state of a wheel; the Lifecycle Engine enforces valid transitions and rejects illegal ones

---

## Tech Stack

| Concern                | Choice                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------- |
| App shell              | Electron + electron-vite                                                            |
| Renderer framework     | React 19 + TypeScript                                                               |
| Routing                | wouter (hash-based — required for Electron `file://` URLs)                          |
| Server state / polling | TanStack Query                                                                      |
| Forms                  | React Hook Form + Zod resolver                                                      |
| Schema validation      | **Zod v4** (IPC payload validation + inferred TS types)                             |
| UI components          | shadcn/ui                                                                           |
| Main process           | TypeScript (Node)                                                                   |
| Database               | SQLite via `better-sqlite3`; custom migration runner in `src/main/db/migrate.ts`    |
| Money math             | `decimal.js` with `ROUND_HALF_UP`, stored as TEXT (4 dp)                            |
| Logging                | `pino` (`silent` in Vitest, `info` in production)                                   |
| Broker                 | `@alpacahq/typescript-sdk`, all calls isolated in `src/main/integrations/alpaca.ts` |
| Testing                | Vitest (unit + integration), Playwright `_electron` (E2E)                           |

---

## Key File Locations

| Purpose                   | Path                                |
| ------------------------- | ----------------------------------- |
| Electron main entry       | `src/main/index.ts`                 |
| IPC handlers              | `src/main/ipc/`                     |
| Service layer (DB + core) | `src/main/services/`                |
| Core engines (pure)       | `src/main/core/`                    |
| Alpaca integration        | `src/main/integrations/alpaca.ts`   |
| DB init + migrations      | `src/main/db/`                      |
| Preload / contextBridge   | `src/preload/index.ts`              |
| Renderer entry            | `src/renderer/src/main.tsx`         |
| API adapter (IPC → hooks) | `src/renderer/src/api/positions.ts` |
| SQL migrations            | `migrations/`                       |
| E2E tests                 | `e2e/`                              |

---

## Engineering Standards

### Test-Driven Development (required)

Every task follows the **Red → Green → Refactor** cycle:

1. **Red** — write a failing test that defines the expected behaviour
2. **Green** — write the minimum code to make it pass
3. **Refactor** — clean up without breaking the test

All tests must pass before a task is considered done.

### Post-Change Checklist

After every code change, run in order:

1. `pnpm test` — all must pass
2. `pnpm lint` — fix any lint errors
3. `pnpm typecheck` — no TypeScript errors permitted
4. `pnpm format` — run prettier to format code
5. **Logging** — INFO for business events, DEBUG for inputs/checkpoints

### Functional Programming Style

- Prefer pure functions and immutable data; avoid mutation
- Use `map`, `filter`, `reduce` over imperative loops
- Avoid classes in TypeScript; use plain functions and types
- Keep side effects at the boundaries (IPC calls, DB writes); keep core logic pure

### Logging Standards

Library: `pino`. Configured in `src/main/logger.ts`.

- **INFO:** key business events — what was created, what failed validation, what phase transitioned
- **DEBUG:** There should be enough debug logging statements to track workflows and track down issues. api requests and responses, inputs before processing, results from pure-function calls, DB transaction checkpoints
- Never add logging to `src/main/core/` engines — they are pure functions with no I/O imports

---

## Architecture Rules

- `src/main/core/` engines (`lifecycle.ts`, `costbasis.ts`) have **no DB or broker imports** — they take plain values and return results
- All `@alpacahq/typescript-sdk` calls live exclusively in `src/main/integrations/alpaca.ts`
- IPC handlers never throw to the renderer — always return `{ ok: true, ...result } | { ok: false, errors: [...] }`
- Rolls are **always** stored as linked leg pairs, never in-place updates
- SQLite is the source of truth; Alpaca is the execution layer only
- Wouter **must** use hash-based routing (`useHashLocation`) — browser-history routing breaks in packaged Electron
- All renderer forms **must** use React Hook Form + Zod resolver — no hand-managed `useState` form state; use `useForm({ resolver: zodResolver(...) })`, `register`, `Controller` for custom inputs, and `useWatch` for reactive derived values
- Renderer components **must** use Tailwind utility classes and `wb-*` design tokens (`text-wb-green`, `bg-wb-gold`, `animate-wb-pulse`, etc.) — never raw inline styles for color, spacing, or animation; inline `style` is only acceptable for values that cannot be expressed as a Tailwind class (e.g. a truly dynamic numeric value not in the scale)

---

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Continually Improve the code

When making checking for possible refactors (during refactor phase of TDD), look for improvements that can be made code that keeps the application

- Adhere to Architecture Standards.
- Reduces duplication acrorss the entire application.
- Reduces complexity

When editing existing code:

- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

## Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## Running the App

```bash
pnpm dev          # development mode (hot reload)
pnpm test         # unit + integration tests (Vitest)
pnpm test:e2e     # E2E tests — must run from a GUI terminal (iTerm/Terminal.app), not from Claude Code's shell
pnpm typecheck    # tsc type-check
pnpm lint         # ESLint
pnpm build        # production build
```

> **Note:** `better-sqlite3` must be built twice — once for each Node ABI:
>
> - After `pnpm install`, run `npx electron-rebuild -f -w better-sqlite3` to build for Electron (required for `pnpm dev` / `pnpm build`)
> - Then run `pnpm rebuild better-sqlite3` to rebuild for system Node (required for `pnpm test` via Vitest)
> - Order matters: run electron-rebuild first, then the system rebuild, so tests work in the same shell session.

---

## Build Phases (summary)

| Phase | Focus                                                                                         |
| ----- | --------------------------------------------------------------------------------------------- |
| 1     | Core engines + manual trade entry. No broker connection. Full unit test coverage. ✅ Complete |
| 2     | Alpaca read integration — live prices, Greeks, assignment detection via polling               |
| 3     | Alert engine + candidate screener                                                             |
| 4     | Order execution via Alpaca write API                                                          |
| 5     | Analytics dashboard                                                                           |
