# US-101 — Define the Position entity

**Epic:** Data Model & Schema
**Priority:** Must Have
**Phase:** 1 — Core Engine + Manual Trade Entry

---

## User Story

**As a** developer,
**I want** a `Position` database table that represents a single wheel or PMCC as a persistent entity,
**so that** all legs and cost basis calculations can be anchored to a named, trackable unit across its full lifecycle.

---

## Acceptance Criteria

- `Position` table exists with fields: `id`, `ticker`, `strategy_type` (`WHEEL` | `PMCC`), `status` (`active` | `paused` | `closed`), `opened_date`, `closed_date`, `account_id`, `notes`, `thesis`, `tags`
- `strategy_type` is non-nullable and enforced via a database enum or check constraint
- `status` defaults to `active` on creation
- `opened_date` is set automatically on record creation
- The data model is defined via SQLAlchemy ORM with an Alembic migration
- Unit tests confirm field validation (e.g., invalid `strategy_type` raises an error)
