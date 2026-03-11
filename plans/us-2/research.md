# Research: US-2 — List All Positions

## DTE Computation Location

- **Decision:** Compute DTE server-side in the route handler; return `dte: int | None` in the response.
- **Rationale:** The story explicitly states "computed server-side from expiration date." Centralises the logic, avoids client-side date arithmetic, and makes sort order trivial to implement in Python before serialising.
- **Alternatives considered:** Client-side computation (rejected — story spec says server-side); DB-computed column (rejected — no new migration warranted for a derived value).

## Active Leg Selection per Position

- **Decision:** Use `selectinload` to eagerly load `position.legs` and `position.cost_basis_snapshots`, then select the active leg in Python: the most recent `Leg` with `action == LegAction.open`, ordered by `fill_date` descending.
- **Rationale:** Single-user app with < 100 positions; selectinload issues two efficient SQL queries (positions + all legs in one IN query) rather than N+1. Python-side selection is readable and testable without complex window functions.
- **Alternatives considered:** SQL lateral join / ROW_NUMBER window function (more complex, no performance need at this scale); correlated subquery per position (N+1 risk without careful construction).

## Latest Cost Basis Snapshot Selection

- **Decision:** Same selectinload approach — load all snapshots, pick the latest by `snapshot_at` in Python.
- **Rationale:** Consistent with active leg strategy; snapshots are append-only so the latest is always the authoritative figure.
- **Alternatives considered:** Subquery join on max(snapshot_at) grouped by position_id (would work but adds query complexity for negligible gain).

## DTE for Closed/Expired Positions

- **Decision:** Return `dte: None` when there is no active open leg (HOLDING_SHARES, WHEEL_COMPLETE, etc.). The frontend renders `None` as "Expired".
- **Rationale:** Returning a negative integer for past expirations is ambiguous; `None` clearly signals "no active option." Frontend rendering concern is cleanly separated from the API value.
- **Alternatives considered:** Negative integer DTE (ambiguous); string `"Expired"` in the API (breaks the Decimal/int type contract).

## Sort Order

- **Decision:** Sort positions by `dte` ascending, with `None` (no active option) placed last.
- **Rationale:** Traders prioritise positions closest to decision points (expiring soonest). Positions with no active option (holding shares, complete wheels) are secondary concerns.
- **Alternatives considered:** Sort by `opened_date` desc (less useful for daily management).

## Phase Badge Rendering (Frontend)

- **Decision:** Render phase as a plain `<span>` with a CSS class derived from the phase string value; no external badge component.
- **Rationale:** shadcn/ui is adopted "incrementally for shared primitives" per CLAUDE.md. A simple styled span is sufficient for Phase 1 and avoids premature abstraction. Can migrate to shadcn Badge in a later story.
- **Alternatives considered:** shadcn/ui Badge component (reasonable but not yet needed); custom Badge component (unnecessary abstraction for one use).

## No New DB Migration Required

- **Decision:** No migration needed for US-2.
- **Rationale:** All required data (position, legs, cost basis snapshots) already exists in the Phase 1 schema. The `dte` field is computed, not stored.
