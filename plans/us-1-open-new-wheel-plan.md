# US-1 Plan — Open a New Wheel (Sell a CSP)

## Problem Statement

Implement the first vertical slice for the Option Wheel Manager so a trader can create a wheel by manually recording an opening CSP. This story establishes the foundational schema, pure lifecycle/cost-basis engines, create-position API transaction flow, and New Wheel frontend form UX.

## Scope

In scope for US-1:

- Database schema/migrations for `positions`, `legs`, and `cost_basis_snapshots` (including enums/defaults/indexes specified in US-1)
- Pure backend lifecycle + cost basis engines with unit tests
- `POST /positions` endpoint with validation and transactional writes
- New Wheel frontend form, validation, submit UX, and success/error states
- End-to-end test/lint/typecheck verification

Out of scope for US-1:

- Broker integration
- Non-create position actions (expire/assign/roll/close)
- Dashboard/list/detail enhancements beyond post-create navigation

## Implementation Approach

1. **Red phase first**
   - Write failing tests for core engine behavior, API contract, and frontend create flow.
2. **Green phase**
   - Implement minimum code to pass tests for schema, engines, endpoint, and form.
3. **Refactor phase**
   - Improve naming/duplication/types while keeping tests green.
4. **Quality gates**
   - Run `make test`, `make lint`, and `make typecheck` before completion.

## Work Breakdown

### 1) Data model and migration foundation

- Define/confirm SQLAlchemy models for:
  - `Position`
  - `Leg`
  - `CostBasisSnapshot`
- Add enum definitions and defaults per US-1 acceptance criteria.
- Ensure money columns use `NUMERIC(12,4)` and Python `Decimal` mapping.
- Add Alembic migration creating tables, FKs, and indexes:
  - `positions(status, phase)`
  - `positions(ticker)`
  - `legs(position_id, fill_date)`

### 2) Core engine (pure) implementation

- Lifecycle engine:
  - Input: plain dataclasses/value objects
  - Rule: `WHEEL` + `csp/open` => `CSP_OPEN`
  - Validation rejections for ticker/strike/contracts/premium/fill_date/expiration
- Cost basis engine:
  - `basis_per_share = strike - premium_per_contract`
  - `total_premium_collected = premium_per_contract * contracts * 100`
  - Decimal + `ROUND_HALF_UP` to 4 places internal precision

### 3) API contract and transactional creation

- Implement `POST /positions`:
  - Request validation and field-level 400 errors
  - Single DB transaction creates position + opening leg + first snapshot
  - Rollback on any failure
  - `201` response includes created `position`, first `leg`, first `cost_basis_snapshot`
  - `500` standardized response shape
- Duplicate submit behavior: allow duplicate creates in Phase 1 (no idempotency key).

### 4) Frontend New Wheel form

- Required fields: ticker, strike, expiration, contracts, premium_per_contract
- Optional advanced fields: fill_date, thesis, notes
- Validation on blur + submit; backend error mapping 1:1
- Disable submit in-flight and prevent double submit
- Success confirmation panel with:
  - ticker
  - contracts
  - premium collected
  - initial cost basis/share
- Navigate to new position detail after short delay or user action
- Accessibility: labels, keyboard flow, focus to first invalid field, error announcements

### 5) Testing strategy

- Backend unit tests:
  - lifecycle happy path + invalid inputs
  - cost-basis exact Decimal formula
- Backend API tests:
  - success path returns 201 + expected payload shape
  - 400 field validation shape
  - transaction rollback behavior
- Frontend tests:
  - required field validation behavior
  - successful submit UX updates
  - server/network error state handling

### 6) Final verification checklist

- `make test`
- `make lint`
- `make typecheck`
- Manual smoke check for New Wheel create flow in local dev setup

## Risks and Notes

- Enum drift between migration/model/Pydantic schemas can cause subtle runtime issues; define shared enum sources where possible.
- Decimal serialization between DB/API/frontend must be consistent (string vs number contract should be explicit).
- Transaction rollback must be explicitly tested to avoid partial data writes.

## Definition of Done

US-1 is complete when all US-1 acceptance criteria pass with automated tests, the create flow works end-to-end, and all quality gates are green.
