# US-103 — Define the CostBasisSnapshot entity

**Epic:** Data Model & Schema
**Priority:** Must Have
**Phase:** 1 — Core Engine + Manual Trade Entry

---

## User Story

**As a** developer,
**I want** a `CostBasisSnapshot` table that records a point-in-time calculation of a position's effective cost basis after each leg is added,
**so that** the cost basis history is preserved and can be audited or displayed over time.

---

## Acceptance Criteria

- `CostBasisSnapshot` table exists with fields: `id`, `position_id` (FK), `created_at`, `basis_per_share`, `total_premium_collected`, `note`
- A new snapshot is written every time a Leg is added to a Position (triggered by the Cost Basis Engine)
- Snapshots are append-only — existing snapshots are never modified
- Unit tests confirm a snapshot is created when a Leg is saved
