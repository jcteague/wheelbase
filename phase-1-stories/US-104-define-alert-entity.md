# US-104 — Define the Alert entity

**Epic:** Data Model & Schema
**Priority:** Should Have
**Phase:** 1 — Core Engine + Manual Trade Entry

---

## User Story

**As a** developer,
**I want** an `Alert` table that stores alert rule definitions associated with positions,
**so that** the management rules engine can evaluate and fire alerts against active positions.

---

## Acceptance Criteria

- `Alert` table exists with fields: `id`, `position_id` (FK), `alert_type`, `threshold`, `triggered` (boolean), `notification_sent` (boolean)
- `alert_type` supports at minimum: `profit_target`, `dte_threshold`, `price_level`, `assignment_risk`
- `triggered` and `notification_sent` default to `false`
- Alembic migration is included
