# US-1 — Open a New Wheel (Sell a CSP)

## Context

This is the foundational "hello world" story for Phase 1. Nothing exists yet beyond scaffolding — all engine files, models, routes, and components are empty stubs. This story establishes the database schema, pure engines, API contract, and form UI that every subsequent story builds on. Getting the patterns right here is critical.

---

## Implementation Order

Following TDD (Red → Green → Refactor), implemented bottom-up by dependency:

### Step 1: Shared Enums — `backend/app/core/types.py` (NEW)

Define all six `str, Enum` classes used across engines, models, and API:

- `StrategyType`: WHEEL
- `WheelStatus`: active, paused, closed
- `WheelPhase`: CSP_OPEN, CSP_EXPIRED, CSP_CLOSED_PROFIT, CSP_CLOSED_LOSS, HOLDING_SHARES, CC_OPEN, CC_EXPIRED, CC_CLOSED_PROFIT, CC_CLOSED_LOSS, WHEEL_COMPLETE
- `LegRole`: csp, short_cc, stock_assignment
- `LegAction`: open, close, expire, assign, exercise, roll_from, roll_to
- `OptionType`: put, call, stock

Lives in `core/` (not `models/`) so pure engines can import without touching SQLAlchemy.

### Step 2: Lifecycle Engine — `backend/app/core/lifecycle.py` (MODIFY)

**Tests first** → `backend/tests/core/test_lifecycle.py` (NEW)

Dataclasses:

- `OpenWheelInput` (frozen): ticker, strike (Decimal), expiration (date), contracts (int), premium_per_contract (Decimal), fill_date (date)
- `OpenWheelResult` (frozen): phase (WheelPhase)
- `ValidationError(ValueError)`: field, code, message attributes

Function: `open_wheel(input) -> OpenWheelResult`

- Validates (fail-fast, first error raises):
  - ticker matches `^[A-Z]{1,5}$` → `invalid_format`
  - strike > 0 → `must_be_positive`
  - contracts > 0, integer → `must_be_positive_integer`
  - premium_per_contract > 0 → `must_be_positive`
  - fill_date not future → `cannot_be_future`
  - expiration strictly after fill_date → `must_be_after_fill_date`
- Returns `OpenWheelResult(phase=WheelPhase.CSP_OPEN)`

Tests: happy path + one test per validation rule (~13 tests).

### Step 3: Cost Basis Engine — `backend/app/core/costbasis.py` (MODIFY)

**Tests first** → `backend/tests/core/test_costbasis.py` (NEW)

Dataclasses:

- `CspLegInput` (frozen): strike (Decimal), premium_per_contract (Decimal), contracts (int)
- `CostBasisResult` (frozen): basis_per_share (Decimal), total_premium_collected (Decimal)

Function: `calculate_initial_csp_basis(leg) -> CostBasisResult`

- `basis_per_share = strike - premium_per_contract`
- `total_premium_collected = premium_per_contract * contracts * 100`
- All math uses `decimal.Decimal`, rounded `ROUND_HALF_UP` to 4 places
- Helper: `_round4(value)` using `Decimal("0.0001").quantize()`

Tests: exact `Decimal` assertions (no `pytest.approx`), ~6 tests including rounding edge cases.

### Step 4: ORM Models — `backend/app/models/__init__.py` (MODIFY)

Three models using SQLAlchemy 2 `DeclarativeBase` + `mapped_column`:

**Position**: id (PK), ticker, strategy_type (enum), status (enum, default active), phase (enum, default CSP_OPEN), opened_date (default CURRENT_DATE), closed_date (nullable), account_id (nullable string), notes, thesis, tags (ARRAY(String)), created_at, updated_at. Relationships: legs, cost_basis_snapshots.

**Leg**: id (PK), position_id (FK), leg_role (enum), action (enum), option_type (enum), strike (Numeric(12,4)), expiration, contracts, premium_per_contract (Numeric(12,4)), fill_price (Numeric(12,4), nullable), fill_date, order_id (nullable), roll_chain_id (nullable UUID string), created_at, updated_at.

**CostBasisSnapshot**: id (PK), position_id (FK), basis_per_share (Numeric(12,4)), total_premium_collected (Numeric(12,4)), final_pnl (Numeric(12,4), nullable), annualized_return (Numeric(12,4), nullable), snapshot_at (default now), created_at.

Indexes: `positions(status, phase)`, `positions(ticker)`, `legs(position_id, fill_date)`.

### Step 5: Alembic Migration

- Uncomment model import in `backend/app/db/migrations/env.py`
- Set `target_metadata = Base.metadata`
- Run `alembic revision --autogenerate -m "create_initial_schema"`
- Review generated migration for PostgreSQL ENUM creation and ARRAY column correctness
- Run `alembic upgrade head` to apply

### Step 6: API Schemas — `backend/app/api/schemas.py` (NEW)

Pydantic v2 models:

- `CreatePositionRequest`: ticker, strike (Decimal), expiration (date), contracts (int), premium_per_contract (Decimal), fill_date (optional date), account_id/thesis/notes (optional)
- `PositionResponse`, `LegResponse`, `CostBasisSnapshotResponse`: with `from_attributes=True`
- `CreatePositionResponse`: position + leg + cost_basis_snapshot
- `FieldError` / `ValidationErrorResponse`: for 400 responses

Decimal fields serialize as strings in JSON (Pydantic v2 default) to preserve precision.

### Step 7: API Route — `backend/app/api/routes/positions.py` (NEW)

**Tests first** → `backend/tests/api/test_positions.py` (NEW)

`POST /positions` (201):

1. Call `open_wheel()` — catch `ValidationError` → 400 with field-level errors
2. Call `calculate_initial_csp_basis()`
3. In `async with session.begin()`: create Position, flush (get id), create Leg, create CostBasisSnapshot
4. Return `CreatePositionResponse`

Also modify:

- `backend/app/api/routes/__init__.py` — export router
- `backend/app/main.py` — include router at `/api`, add global 500 exception handler
- `backend/tests/conftest.py` — add `client` fixture (httpx AsyncClient + ASGITransport) with mocked session

Test fixture approach: mock `get_session` dependency (PostgreSQL-specific types prevent SQLite). ~10 API tests.

### Step 8: Frontend Test Infrastructure

Install dev deps: `pnpm add -D vitest @testing-library/preact @testing-library/user-event jsdom`

Modify:

- `frontend/vite.config.ts` — add `test: { environment: 'jsdom', globals: true, setupFiles: './src/test-setup.ts' }`
- `frontend/package.json` — add `"test": "vitest run"` script

Create: `frontend/src/test-setup.ts`

### Step 9: Frontend Routing

Install: `pnpm add wouter` (React-compatible, works with preact/compat)

Modify `frontend/src/app.tsx`:

- Add `Router` with routes: `/` → NewWheelPage, `/positions/:id` → PositionDetailPage (stub)

### Step 10: Frontend API + Hook

- `frontend/src/api/positions.ts` (NEW) — typed `createPosition()` using fetch, handles snake_case ↔ camelCase mapping in request body
- `frontend/src/hooks/useCreatePosition.ts` (NEW) — thin TanStack Query `useMutation` wrapper

### Step 11: New Wheel Form + Pages

**Tests first** → `frontend/src/components/NewWheelForm.test.tsx` (NEW)

`frontend/src/components/NewWheelForm.tsx` (NEW):

- React Hook Form + Zod resolver (`newWheelSchema` already exists in `schemas/new-wheel.ts`)
- `mode: 'onBlur'` for validation on blur
- Required fields: ticker, strike, expiration, contracts, premium per contract
- Collapsible "Advanced" section: fill date (default today), thesis, notes
- Preact Signals for local state: `successResult`, `serverError`, `advancedOpen`
- Submit disabled during `mutation.isPending`
- On success: inline confirmation panel (ticker, contracts, premium collected, cost basis), navigate to `/positions/:id` after 2s or button click
- On 400: map field errors to RHF via `setError`, focus first invalid field
- On server error: inline error message above submit button
- Accessible: labels, aria-describedby for errors, aria-expanded on Advanced toggle, aria-live on success panel

Add shadcn/ui components: `pnpm dlx shadcn@latest add input button label form`

Pages:

- `frontend/src/pages/NewWheelPage.tsx` (NEW) — renders heading + NewWheelForm
- `frontend/src/pages/PositionDetailPage.tsx` (NEW) — stub showing position ID from URL params

---

## File Summary

| Action | File                                                                 |
| ------ | -------------------------------------------------------------------- |
| NEW    | `backend/app/core/types.py`                                          |
| MODIFY | `backend/app/core/lifecycle.py`                                      |
| MODIFY | `backend/app/core/costbasis.py`                                      |
| MODIFY | `backend/app/models/__init__.py`                                     |
| MODIFY | `backend/app/db/migrations/env.py`                                   |
| NEW    | `backend/app/db/migrations/versions/<hash>_create_initial_schema.py` |
| NEW    | `backend/app/api/schemas.py`                                         |
| NEW    | `backend/app/api/routes/positions.py`                                |
| MODIFY | `backend/app/api/routes/__init__.py`                                 |
| MODIFY | `backend/app/main.py`                                                |
| NEW    | `backend/tests/core/test_lifecycle.py`                               |
| NEW    | `backend/tests/core/test_costbasis.py`                               |
| NEW    | `backend/tests/api/__init__.py`                                      |
| NEW    | `backend/tests/api/test_positions.py`                                |
| MODIFY | `backend/tests/conftest.py`                                          |
| NEW    | `frontend/src/api/positions.ts`                                      |
| NEW    | `frontend/src/hooks/useCreatePosition.ts`                            |
| NEW    | `frontend/src/components/NewWheelForm.tsx`                           |
| NEW    | `frontend/src/components/NewWheelForm.test.tsx`                      |
| NEW    | `frontend/src/pages/NewWheelPage.tsx`                                |
| NEW    | `frontend/src/pages/PositionDetailPage.tsx`                          |
| NEW    | `frontend/src/test-setup.ts`                                         |
| MODIFY | `frontend/src/app.tsx`                                               |
| MODIFY | `frontend/vite.config.ts`                                            |
| MODIFY | `frontend/package.json`                                              |

Reuse existing: `frontend/src/schemas/new-wheel.ts` (Zod schema), `frontend/src/schemas/common.ts` (shared validators), `frontend/src/lib/utils.ts` (cn helper).

---

## Tasks

| #   | Task                                                       | Status  | Blocked By |
| --- | ---------------------------------------------------------- | ------- | ---------- |
| 1   | Create shared enums in `backend/app/core/types.py`         | pending | —          |
| 2   | Implement lifecycle engine with tests (Red → Green)        | pending | #1         |
| 3   | Implement cost basis engine with tests (Red → Green)       | pending | #1         |
| 4   | Create ORM models and Alembic migration                    | pending | #1         |
| 5   | Implement API schemas and POST /positions route with tests | pending | #2, #3, #4 |
| 6   | Set up frontend test infrastructure                        | pending | —          |
| 7   | Set up frontend routing and install shadcn/ui components   | pending | #6         |
| 8   | Implement frontend API client and mutation hook            | pending | #5         |
| 9   | Implement New Wheel form, pages, and frontend tests        | pending | #6, #7, #8 |
| 10  | Run full verification (tests, lint, typecheck, smoke test) | pending | #5, #9     |

Parallel tracks: **Backend** (#1→#2/#3/#4→#5) and **Frontend infra** (#6→#7) can run concurrently. They converge at #8→#9.

---

## Verification

1. `make test` — all backend tests pass (lifecycle ~13, costbasis ~6, API ~10)
2. `cd frontend && pnpm test` — form component tests pass
3. `make lint && make typecheck` — clean
4. `make db-up && make migrate` — migration applies without errors
5. `make dev` — manual smoke test:
   - Fill in New Wheel form, submit → see confirmation panel
   - Submit with invalid data → see field errors
   - After success → navigates to position detail stub
