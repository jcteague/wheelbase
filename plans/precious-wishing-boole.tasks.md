# Tasks: US-1 — Open a New Wheel (Sell a CSP)

Generated from: `plans/precious-wishing-boole.md`
Generated: 2026-03-01
Total tasks: 26



## Red — Write Failing Tests

- [x] [Red] Write failing tests for lifecycle engine open_wheel validation
- [x] [Red] Write failing tests for cost basis engine calculate_initial_csp_basis
- [x] [Red] Write failing tests for POST /positions API endpoint
- [x] [Red] Write failing tests for NewWheelForm component

## Green — Implement

- [x] [Green] Implement shared enums in backend/app/core/types.py
- [x] [Green] Implement lifecycle engine open_wheel function in backend/app/core/lifecycle.py
- [x] [Green] Implement cost basis engine calculate_initial_csp_basis in backend/app/core/costbasis.py
- [x] [Green] Implement Position ORM model in backend/app/models/__init__.py
- [x] [Green] Implement Leg ORM model in backend/app/models/__init__.py
- [x] [Green] Implement CostBasisSnapshot ORM model in backend/app/models/__init__.py
- [x] [Green] Create Alembic migration for initial schema
- [x] [Green] Implement API Pydantic schemas in backend/app/api/schemas.py
- [x] [Green] Implement POST /positions route in backend/app/api/routes/positions.py
- [x] [Green] Set up frontend test infrastructure with Vitest
- [x] [Green] Set up frontend routing with wouter in frontend/src/app.tsx
- [x] [Green] Install shadcn/ui form components
- [x] [Green] Implement frontend API client in frontend/src/api/positions.ts
- [x] [Green] Implement useCreatePosition mutation hook in frontend/src/hooks/useCreatePosition.ts
- [x] [Green] Implement NewWheelForm component in frontend/src/components/NewWheelForm.tsx
- [x] [Green] Implement NewWheelPage and PositionDetailPage
- [x] [Green] Run full verification suite (tests, lint, typecheck)

## Refactor — Clean Up

- [x] [Refactor] Clean up lifecycle engine and tests
- [x] [Refactor] Clean up cost basis engine and tests
- [x] [Refactor] Clean up ORM models in backend/app/models/__init__.py
- [x] [Refactor] Clean up API route, schemas, and test fixtures
- [x] [Refactor] Clean up NewWheelForm, pages, and frontend tests
