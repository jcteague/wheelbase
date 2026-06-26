# US-63: Centralize duplicated table INSERT statements behind typed insert helpers

**As a** developer maintaining Wheelbase,
**I want to** define each table's INSERT statement once behind a typed helper,
**So that** a schema change is made in one place and both production code and tests follow it automatically instead of silently drifting.

---

## Context

While building the US-50 alert engine we found that the raw `INSERT` statements for the core entities are copy-pasted across the codebase rather than defined once:

- `INSERT INTO legs` is hand-written in **10 production services** plus test files, each with a slightly different column subset (`positions.ts` omits `fill_price`; `roll-csp-position.ts` adds `roll_chain_id`; others differ again).
- `INSERT INTO cost_basis_snapshots` is hand-written in **8 production services** plus tests.
- `INSERT INTO positions` lives in one service but is re-typed by several tests.

Because the column lists are duplicated, a schema change (a renamed column, a new `NOT NULL` column) has to be applied by hand in every copy, and nothing fails loudly if a copy is missed. The test copies are the most dangerous: they re-state the production column list but are not coupled to it, so a production statement can change while the test inserts keep using the old shape. This is exactly the duplication CLAUDE.md asks us to remove ("reduce duplication across the entire application").

The fix is a thin set of typed insert helpers — a small repository module — that own each table's column list once. Production services and tests both call the helper, so the column list exists in a single place.

---

## Acceptance Criteria

```gherkin
Background:
  Given the positions, legs, and cost_basis_snapshots tables each have exactly one INSERT helper
  And the helpers accept a typed input object covering all columns, with optional columns nullable

Scenario: Existing behavior is preserved after the refactor
  Given every production service and test that inserted positions, legs, or cost_basis_snapshots now calls the shared helper
  When the full test suite runs
  Then all existing tests pass without changes to their assertions

Scenario: A schema change is made in exactly one place
  Given a developer adds a new column to the legs table
  When they update the insertLeg helper to include it
  Then no production service contains its own INSERT INTO legs column list to update
  And no test contains its own raw INSERT INTO legs statement to update

Scenario: Tests seed rows through the same path as production
  Given a test needs a position, leg, or cost_basis_snapshot row in a specific state
  When the test creates that row
  Then it calls the shared insert helper rather than a hand-written SQL string

Scenario: No raw INSERT statements remain outside the helper module (guard)
  Given the helpers are the single insert path for these three tables
  When the codebase is searched for "INSERT INTO positions", "INSERT INTO legs", or "INSERT INTO cost_basis_snapshots"
  Then the only matches are inside the insert-helper module and the migration files
  And no matches remain in production services or tests

Scenario: Column-subset variance is handled without per-caller SQL
  Given a caller that does not set fill_price or roll_chain_id
  When it calls insertLeg without those fields
  Then the helper inserts NULL for the omitted columns
  And the caller writes no SQL of its own
```

---

## Technical Notes

- Add a focused repository module (e.g. `src/main/db/inserts.ts`) exporting `insertPosition`, `insertLeg`, and `insertCostBasisSnapshot`, each taking a typed input object and owning its column list.
- Model the column-subset variance with optional fields (`fillPrice?`, `rollChainId?`, etc.) defaulting to `NULL`; do not branch SQL per caller.
- Keep the helpers within the service/DB layer — pure persistence, no business logic, no core-engine or lifecycle decisions (those stay in the calling services).
- Migration files keep their own DDL/seed SQL — they are the schema definition and are intentionally excluded from the guard.
- Convert callers one table at a time (positions → legs → cost_basis_snapshots), keeping the suite green after each, to bound blast radius (~16 files touched).
- This same pattern should be reused by the US-50 alert persistence service (`insertAlert`) and is a candidate to extend later to `ivr_snapshot`, `pending_assignments`, and `app_settings` (see Out of Scope).

---

## Out of Scope

- Insert helpers for `ivr_snapshot`, `pending_assignments`, `app_settings`, and `alerts` — follow-up once the core-trio pattern is established.
- Abstracting `UPDATE` / `DELETE` statements.
- Adopting an ORM or query builder — this is plain typed wrappers over `better-sqlite3`, not a framework change.
- Any schema change itself (this story changes structure, not behavior).

---

## Dependencies

- Relates to US-50 (alert engine) — the duplication was surfaced during that work; US-50's alert persistence service should adopt the same helper pattern.

---

## Estimate

8 points

## Mockup

None — internal refactor / tech-debt story, no renderer surface
