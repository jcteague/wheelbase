# Option Wheel Manager — Claude Context

## What This App Is

A single-user trading journal and management tool for the **options wheel strategy**. Traders sell cash-secured puts (CSPs), accept assignment into shares, then sell covered calls (CCs) until the shares are called away — repeating the cycle. The app tracks every leg, maintains accurate cost basis through rolls and premiums, and fires management alerts.

Three-layer architecture:
- **Frontend** — Preact 10 SPA (Vite, TypeScript)
- **Backend** — Python FastAPI with APScheduler background jobs
- **Database** — PostgreSQL 16 via SQLAlchemy 2 / Alembic

Alpaca is the broker integration (read-only through Phase 3, order execution in Phase 4).

---

## Key Domain Concepts

- **Wheel** — a position that progresses through phases: `CSP_OPEN → HOLDING_SHARES → CC_OPEN → (repeat or exit)`
- **Leg** — a single option transaction (open or close) attached to a position
- **Roll** — closing one leg and opening another; stored as a linked `roll_from`/`roll_to` pair, never mutated in place
- **Cost basis** — recalculated after every leg event: `assignment_strike − CSP_premiums − CC_premiums + roll_debits − roll_credits`
- **Phase** — the lifecycle state of a wheel; the Lifecycle Engine enforces valid transitions and rejects illegal ones

---

## Tech Stack (brief)

| Concern | Choice |
|---|---|
| Frontend framework | Preact 10 + Vite + TypeScript |
| Component/page state | **Preact Signals** (`@preact/signals`) — preferred |
| Global UI state | **Zustand** (cross-view state only) |
| Server state / polling | TanStack Query (React Query) |
| Forms | React Hook Form (via preact/compat) |
| Schema validation | **Zod** (frontend runtime validation + inferred TS types) |
| UI components | **shadcn/ui** (adopted incrementally for shared primitives) |
| Backend | Python FastAPI + Pydantic v2 |
| Scheduling | APScheduler (in-process) |
| Database | PostgreSQL 16, SQLAlchemy 2, Alembic |
| Broker | alpaca-py SDK, all calls isolated in `integrations/alpaca.py` |

---

## Engineering Standards

### Test-Driven Development (required)

Every task follows the **Red → Green → Refactor** cycle:
1. **Red** — write a failing test that defines the expected behaviour
2. **Green** — write the minimum code to make it pass
3. **Refactor** — clean up without breaking the test

All tests must pass before a task is considered done. If tests are failing, keep working until they pass — do not mark work complete with a red suite.

### Code Quality Over Raw Performance

Prefer **clean, readable, maintainable** code. Optimise only when there is a measured need. Clarity for the next reader is the default goal.

### Functional Programming Style (TypeScript)

- Prefer pure functions and immutable data; avoid mutation
- Use `map`, `filter`, `reduce` over imperative loops
- Avoid classes in TypeScript; use plain functions and types
- Keep side effects at the boundaries (API calls, signal writes); keep core logic pure

### Post-Change Checklist

After every code change, run in order:
1. **Tests** — all must pass
2. **Lint** — fix any lint errors before committing
3. **Type-check** — no TypeScript errors permitted
4. **Logging** — adequate production and debug coverage (see Logging Standards below)

Do not consider a task done until all four are clean.

### Logging Standards (Backend)

Library: `structlog` with JSON output. Configured in `backend/app/logging_config.py`.

Every backend task must include logging at both levels:

- **Production (INFO):** key business events — what was created, what failed validation, what phase transitioned. These run in production at the default log level.
- **Debug (DEBUG):** inputs before processing, results from pure-function calls, DB transaction checkpoints (before write, after flush). These are suppressed in production and enabled with `LOG_LEVEL=DEBUG`.

**Rules:**
- Use `structlog.get_logger(__name__)` — not `logging.getLogger` — so structured kwargs and `capture_logs()` in tests work correctly
- Never add logging to `app/core/` engines (`lifecycle.py`, `costbasis.py`, `alerts.py`) — they are pure functions with no I/O imports
- All log records emitted within a request automatically carry `request_id`, `http_method`, and `http_path` via `LoggingMiddleware` + `structlog.contextvars`
- Log tests use `structlog.testing.capture_logs()`; pass `processors=[structlog.contextvars.merge_contextvars]` when asserting on context-bound fields like `request_id`

---

## Architecture Rules

- The core Python engines (`lifecycle.py`, `costbasis.py`, `alerts.py`) have **no broker or database imports** — they take plain dataclasses and return results. Test them without a live DB or API.
- All Alpaca API calls live exclusively in `integrations/alpaca.py`. Nothing else imports `alpaca-py`.
- Rolls are **always** stored as linked leg pairs, never in-place updates. The full transaction history is the primary long-term asset of the app.
- The local PostgreSQL database is the source of truth; Alpaca is the execution layer only.

---

## Build Phases (summary)

| Phase | Focus |
|---|---|
| 1 | Core engines + manual trade entry. No broker connection. Full unit test coverage of cost basis math. |
| 2 | Alpaca read integration — live prices, Greeks, assignment detection via polling |
| 3 | Alert engine + candidate screener |
| 4 | Order execution via Alpaca write API |
| 5 | Analytics dashboard |
