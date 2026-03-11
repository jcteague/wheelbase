# Tasks: Implementation Plan: US-2 — List All Positions

Generated from: `plans/us-2/plan.md`
Generated: 2026-03-06
Total tasks: 16

> Task IDs (T001–T016) are stable references — use them to call out a specific task in a prompt,
> e.g. "implement T007" or "skip to T012".

## Red — Write Failing Tests

- [x] **T001** [Red] Write failing tests for PositionListItemResponse schema and basic GET /api/positions response shape
- [x] **T004** [Red] Write failing tests for GET /api/positions sort order, null DTE, and all-positions inclusion
- [x] **T011** [Red] Write failing tests for PositionCard component rendering
- [x] **T014** [Red] Write failing tests for PositionsListPage loading, empty, and populated states

## Green — Implement

- [x] **T002** [Green] Implement PositionListItemResponse schema in schemas.py
- [x] **T005** [Green] Implement full GET /api/positions handler with selectinload, DTE computation, sort, and logging
- [x] **T007** [Green] Implement PositionListItem type and listPositions function in api/positions.ts
- [x] **T009** [Green] Implement usePositions hook in hooks/usePositions.ts
- [x] **T012** [Green] Implement PositionCard component
- [x] **T015** [Green] Implement PositionsListPage and add /positions route to app.tsx

## Refactor — Clean Up

- [ ] **T003** [Refactor] Clean up PositionListItemResponse schema
- [ ] **T006** [Refactor] Clean up GET /api/positions handler
- [ ] **T008** [Refactor] Clean up frontend API layer additions
- [ ] **T010** [Refactor] Clean up usePositions hook
- [ ] **T013** [Refactor] Clean up PositionCard component
- [ ] **T016** [Refactor] Clean up PositionsListPage and routing
