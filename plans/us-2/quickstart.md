# Quickstart: US-2 — List All Positions

## Prerequisites

US-1 must be complete (positions table, legs table, cost_basis_snapshots table, and POST /api/positions all exist).

No new migrations are required for US-2.

## Backend Tests

```bash
# From repo root
make db-up          # ensure postgres container is running (tests use testcontainers, so optional)
cd backend
uv run pytest tests/api/test_list_positions.py -v
```

Or run the full suite:

```bash
make test
```

Expected: all tests in `backend/tests/api/test_list_positions.py` pass.

## Frontend Tests

```bash
cd frontend
pnpm test --run
```

Or in watch mode during development:

```bash
pnpm test
```

Expected: all tests in:
- `frontend/src/components/PositionCard.test.tsx`
- `frontend/src/pages/PositionsListPage.test.tsx`

## Lint + Type Check

```bash
make lint
make typecheck
```

Both must be clean before the story is considered done.

## Manual Smoke Test

1. `make db-up && make migrate`
2. `make dev`
3. Create a position via the New Wheel form at `http://localhost:5173/`
4. Navigate to `http://localhost:5173/positions`
5. Verify the position card shows ticker, phase badge, strike, DTE, premium collected, and effective cost basis.
6. With no positions: navigate to `/positions` and verify the "No positions yet" empty state message appears with a link to the New Wheel form.

## Acceptance Check for DTE Scenario

Given today is 2026-03-06 and expiration is 2026-04-17:
```
(date(2026, 4, 17) - date(2026, 3, 6)).days == 42  ✓
```
