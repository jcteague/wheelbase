# US-102 — Define the Leg entity

**Epic:** Data Model & Schema
**Priority:** Must Have
**Phase:** 1 — Core Engine + Manual Trade Entry

---

## User Story

**As a** developer,
**I want** a `Leg` database table that records every discrete option or stock transaction within a position,
**so that** the full transaction history of each wheel is preserved in an immutable audit trail.

---

## Acceptance Criteria

- `Leg` table exists with fields: `id`, `position_id` (FK to Position), `leg_role` (`csp` | `short_cc` | `long_leaps` | `stock_assignment`), `action` (`open` | `close` | `roll_from` | `roll_to` | `expire` | `assign` | `exercise`), `option_type` (`call` | `put` | `stock`), `strike`, `expiration`, `contracts`, `premium_per_contract`, `fill_price`, `fill_date`, `order_id`, `roll_chain_id`
- `premium_per_contract` is positive for credits received, negative for debits paid
- `roll_chain_id` links a `roll_from` leg to its corresponding `roll_to` leg
- All fields except `order_id` and `roll_chain_id` are non-nullable
- Foreign key constraint enforces `position_id` references an existing Position
- Alembic migration is included
- Unit tests confirm a Leg cannot be created without a valid `position_id`
