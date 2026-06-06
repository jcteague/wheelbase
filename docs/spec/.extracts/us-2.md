---
plan: us-2
source: plans/us-2/
extracted_at: 2026-05-30
status: complete
---

# Extract: us-2-position-list

## Summary

This story delivers the positions list view: a `GET /api/positions` endpoint that returns every position with its latest cost basis snapshot and active-leg data (strike, expiration, DTE computed server-side), sorted by DTE ascending with nulls last. The frontend gains a `/positions` page rendering a `PositionCard` per item plus a "No positions yet" empty state with a CTA link to the New Wheel form. No new DB migrations are required — all data lives in the Phase 1 schema. (Source: `plans/us-2/plan.md`, `plans/us-2/contracts/get-positions.md`)

> Note: the plan was authored against a FastAPI backend (`backend/`) + Vite frontend (`frontend/`) layout that has since migrated to the Electron `src/main` / `src/renderer` structure. The plan's verbatim paths are preserved in citations below; the Source Code References section lists the surviving artifacts at their current locations.

## Architecture Decisions

### ADR: DTE computation location (server-side)
- **Decision:** Compute DTE server-side in the route handler; return `dte: int | None` in the response.
- **Why:** The story explicitly states "computed server-side from expiration date." Centralises the logic, avoids client-side date arithmetic, and makes sort order trivial to implement in Python before serialising.
- **Alternatives considered:** Client-side computation (rejected — story spec says server-side); DB-computed column (rejected — no new migration warranted for a derived value).
- **Source:** `plans/us-2/research.md`

### ADR: Active leg selection per position
- **Decision:** Use `selectinload` to eagerly load `position.legs` and `position.cost_basis_snapshots`, then select the active leg in Python as the most recent `Leg` with `action == LegAction.open`, ordered by `fill_date` descending.
- **Why:** Single-user app with < 100 positions; selectinload issues two efficient SQL queries (positions + all legs in one IN query) rather than N+1. Python-side selection is readable and testable without complex window functions.
- **Alternatives considered:** SQL lateral join / `ROW_NUMBER` window function (more complex, no performance need at this scale); correlated subquery per position (N+1 risk without careful construction).
- **Source:** `plans/us-2/research.md`

### ADR: Latest cost basis snapshot selection
- **Decision:** Same selectinload approach — load all snapshots, pick the latest by `snapshot_at` in Python.
- **Why:** Consistent with the active-leg strategy; snapshots are append-only so the latest is always the authoritative figure.
- **Alternatives considered:** Subquery join on `max(snapshot_at) GROUP BY position_id` (would work but adds query complexity for negligible gain).
- **Source:** `plans/us-2/research.md`

### ADR: DTE for closed/expired positions returns null
- **Decision:** Return `dte: None` when there is no active open leg (HOLDING_SHARES, WHEEL_COMPLETE, etc.). The frontend renders `None` as "Expired".
- **Why:** Returning a negative integer for past expirations is ambiguous; `None` clearly signals "no active option." Frontend rendering concern is cleanly separated from the API value.
- **Alternatives considered:** Negative integer DTE (ambiguous); string `"Expired"` in the API (breaks the Decimal/int type contract).
- **Source:** `plans/us-2/research.md`

### ADR: Sort order (DTE ascending, nulls last)
- **Decision:** Sort positions by `dte` ascending, with `None` (no active option) placed last.
- **Why:** Traders prioritise positions closest to decision points (expiring soonest). Positions with no active option (holding shares, complete wheels) are secondary concerns.
- **Alternatives considered:** Sort by `opened_date` desc (less useful for daily management).
- **Source:** `plans/us-2/research.md`

### ADR: Phase badge rendering (plain styled span, not shadcn Badge)
- **Decision:** Render phase as a plain `<span>` with a CSS class derived from the phase string value; no external badge component.
- **Why:** shadcn/ui is adopted "incrementally for shared primitives" per CLAUDE.md. A simple styled span is sufficient for Phase 1 and avoids premature abstraction. Can migrate to shadcn Badge in a later story.
- **Alternatives considered:** shadcn/ui Badge component (reasonable but not yet needed); custom Badge component (unnecessary abstraction for one use).
- **Source:** `plans/us-2/research.md`

### ADR: No new DB migration required
- **Decision:** No migration needed for US-2.
- **Why:** All required data (position, legs, cost basis snapshots) already exists in the Phase 1 schema. The `dte` field is computed, not stored.
- **Alternatives considered:** None recorded.
- **Source:** `plans/us-2/research.md`, `plans/us-2/data-model.md`

## Contracts

### `GET /api/positions`
- **Type:** API call (HTTP GET, no query params, no auth, no body)
- **Shape:**
  ```json
  // Success — 200 OK (array sorted by dte ascending, nulls last)
  [
    {
      "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "ticker": "AAPL",
      "phase": "CSP_OPEN",
      "status": "active",
      "strike": "180.0000",
      "expiration": "2026-04-17",
      "dte": 42,
      "premium_collected": "250.0000",
      "effective_cost_basis": "177.5000"
    },
    {
      "id": "7ba12e88-1234-4abc-9def-1a2b3c4d5e6f",
      "ticker": "SPY",
      "phase": "WHEEL_COMPLETE",
      "status": "closed",
      "strike": null,
      "expiration": null,
      "dte": null,
      "premium_collected": "540.0000",
      "effective_cost_basis": "418.6000"
    }
  ]

  // Empty state — 200 OK
  []
  ```

  Field notes:
  | Field                  | Type                    | Nullable | Description                                                                              |
  | ---------------------- | ----------------------- | -------- | ---------------------------------------------------------------------------------------- |
  | `id`                   | string (UUID)           | No       | Position UUID                                                                            |
  | `ticker`               | string                  | No       | Equity symbol, uppercase                                                                 |
  | `phase`                | string (enum)           | No       | Current `WheelPhase` value                                                               |
  | `status`               | string (enum)           | No       | `active`, `paused`, or `closed`                                                          |
  | `strike`               | string (Decimal)        | Yes      | Strike price from latest open leg; null if no active option                              |
  | `expiration`           | string (date, ISO 8601) | Yes      | Expiration date from latest open leg; null if no active option                           |
  | `dte`                  | integer                 | Yes      | Days to expiration computed as `(expiration − today).days`; null if `expiration` is null |
  | `premium_collected`    | string (Decimal)        | No       | `total_premium_collected` from latest cost basis snapshot                                |
  | `effective_cost_basis` | string (Decimal)        | No       | `basis_per_share` from latest cost basis snapshot                                        |

  No error responses defined — endpoint has no domain validation (read-only, no input). Standard FastAPI 500 applies for unexpected server errors.
- **Source:** `plans/us-2/contracts/get-positions.md`
- **Implementation:** plan paths `backend/app/api/routes/positions.py` (FastAPI handler) — the codebase has since migrated to Electron IPC; current equivalent is `src/main/services/list-positions.ts`.

### `PositionListItemResponse` (Pydantic response model)
- **Type:** other (server-side response schema)
- **Shape:**
  ```
  id: uuid.UUID
  ticker: str
  phase: WheelPhase
  status: WheelStatus
  strike: Decimal | None
  expiration: datetime.date | None
  dte: int | None
  premium_collected: Decimal
  effective_cost_basis: Decimal
  ```
  `model_config = {"from_attributes": False}` (constructed manually, not from ORM directly). Response model declared as `list[PositionListItemResponse]`.
- **Source:** `plans/us-2/plan.md`, `plans/us-2/data-model.md`, `plans/us-2/contracts/get-positions.md`
- **Implementation:** plan path `backend/app/api/schemas.py` — not yet wired in current codebase (migrated to Electron IPC).

### `PositionListItem` (frontend type)
- **Type:** other (TypeScript type for renderer)
- **Shape:**
  ```typescript
  export type PositionListItem = {
    id: string
    ticker: string
    phase: string         // refactored to WheelPhase union literal
    status: string        // refactored to WheelStatus union literal
    strike: string | null
    expiration: string | null
    dte: number | null
    premium_collected: string
    effective_cost_basis: string
  }
  ```
  After the refactor phase, `phase` and `status` were narrowed from `string` to `WheelPhase` and `WheelStatus` union literal types mirroring the backend Python enums.
- **Source:** `plans/us-2/plan.md`, `plans/us-2/refactor-phase-results.md`
- **Implementation:** plan path `frontend/src/api/positions.ts` — current equivalent surface in `src/renderer/src/hooks/usePositions.ts` / `src/renderer/src/components/PositionCard.tsx`.

### `listPositions` (frontend API wrapper)
- **Type:** other (renderer fetch wrapper)
- **Shape:**
  ```typescript
  export async function listPositions(): Promise<PositionListItem[]> {
    const response = await fetch('/api/positions')
    const body: unknown = await response.json()
    if (!response.ok) throw apiError(response.status, body)
    return body as PositionListItem[]
  }
  ```
- **Source:** `plans/us-2/plan.md`
- **Implementation:** plan path `frontend/src/api/positions.ts` — replaced by Electron IPC adapter in current codebase.

### `usePositions` (TanStack Query hook)
- **Type:** other (renderer data hook)
- **Shape:**
  ```typescript
  export function usePositions() {
    return useQuery<PositionListItem[], ApiError>({
      queryKey: ['positions'],
      queryFn: listPositions
    })
  }
  ```
- **Source:** `plans/us-2/plan.md`
- **Implementation:** `src/renderer/src/hooks/usePositions.ts`

## Schema Changes

### No new tables, columns, or migrations
- **Change:** none — all required data lives in the existing Phase 1 schema (`positions`, `legs`, `cost_basis_snapshots`). The `dte` field is computed at query time and not stored.
- **Columns / fields:** sourced read-only from existing tables — `positions.id`, `positions.ticker`, `positions.phase`, `positions.status`; active `legs.strike`, `legs.expiration`; latest `cost_basis_snapshots.total_premium_collected`, `cost_basis_snapshots.basis_per_share`.
- **Source:** `plans/us-2/data-model.md`, `plans/us-2/research.md`, `plans/us-2/quickstart.md`
- **Migration file:** none

### Active-leg selection logic (Python, read-only)
- **Change:** no schema change — documents the in-memory selection used to populate the response.
- **Columns / fields:**
  ```python
  active_leg = max(
      (leg for leg in position.legs if leg.action == LegAction.open),
      key=lambda l: l.fill_date,
      default=None
  )
  ```
- **Source:** `plans/us-2/data-model.md`
- **Migration file:** none

### Latest-snapshot selection logic (Python, read-only)
- **Change:** no schema change — documents the in-memory selection used to populate the response.
- **Columns / fields:**
  ```python
  latest_snapshot = max(
      position.cost_basis_snapshots,
      key=lambda s: s.snapshot_at,
      default=None
  )
  ```
  If `latest_snapshot` is None (data-integrity issue), the position is skipped or raises a server error — this should never happen given the POST /positions invariant.
- **Source:** `plans/us-2/data-model.md`
- **Migration file:** none

## Acceptance Criteria

- Scenario: Display positions list with one open CSP
  - Given the trader has one open wheel on AAPL with strike $180, expiration 2026-04-17, and premium $2.50 per contract
  - When the trader views the positions list
  - Then a position card appears showing: ticker AAPL, phase badge CSP_OPEN, strike $180.00, expiration 2026-04-17, DTE 42, premium collected $250.00, effective cost basis $177.50
- Scenario: Display multiple positions sorted by DTE ascending
  - Given the trader has open wheels on AAPL (30 DTE), MSFT (14 DTE), and TSLA (45 DTE)
  - When the trader views the positions list
  - Then positions appear in order: MSFT, AAPL, TSLA
  - And each position card shows its respective data
- Scenario: DTE countdown updates daily
  - Given the trader has an open wheel on AAPL expiring 2026-04-17
  - And today is 2026-03-06
  - When the trader views the positions list
  - Then the DTE shows 42
- Scenario: Closed positions appear with final status
  - Given the trader has a completed wheel on SPY with phase WHEEL_COMPLETE
  - When the trader views the positions list
  - Then the SPY card shows the WHEEL_COMPLETE phase badge
  - And the DTE field shows "Expired" instead of a countdown
- Scenario: Empty state when no positions exist
  - Given the trader has no positions
  - When the trader views the positions list
  - Then a message appears: "No positions yet"
  - And a call-to-action links to the New Wheel form

(Source: `docs/epics/01-stories/US-2-list-positions.md`, referenced in `plans/us-2/plan.md`)

## Decisions & Tradeoffs

- DTE is rendered with an integer + "d" suffix (e.g., "42d"); the literal string "Expired" is rendered in place of a number when `dte` is null. (Source: `plans/us-2/plan.md`)
- The frontend trusts the backend's sort order rather than re-sorting client-side; tests assert all expected tickers are present and the first card matches the nearest-expiration ticker. (Source: `plans/us-2/plan.md`)
- Currency formatting on `PositionCard` uses `parseFloat(value).toFixed(2)` wrapped in `$`; a shared `formatCurrency(s: string)` helper in `lib/utils.ts` is deferred until a second consumer exists. (Source: `plans/us-2/plan.md`, `plans/us-2/refactor-phase-results.md`)
- Empty state CTA links to `/` (the New Wheel form), not to a dedicated `/new` route. (Source: `plans/us-2/plan.md`)
- Logging in the route handler: `DEBUG list_positions_query_start` before the select, `DEBUG list_positions_query_complete count=...` after, `INFO positions_listed count=...` on return. (Source: `plans/us-2/plan.md`)
- All positions are returned regardless of phase or status — no filtering at the endpoint level; filtering is deferred (Phase 4 concern). (Source: `plans/us-2/data-model.md`, `docs/epics/01-stories/US-2-list-positions.md`)
- Active-leg helpers are extracted into `_active_leg(position)` and `_latest_snapshot(position)` only if the handler body becomes long (deferred refactor decision). (Source: `plans/us-2/plan.md`)
- No isolated unit tests for the `listPositions` fetch wrapper or the `usePositions` hook; both are covered by page-level component tests via mocking. (Source: `plans/us-2/plan.md`)

Refactor-phase decisions (authoritative; `plans/us-2/refactor-phase-results.md`):
- Extracted `_dte_sort_key(item)` as a named module-level function with docstring in `backend/app/api/routes/positions.py`; replaced the inline lambda `lambda x: (x.dte is None, x.dte if x.dte is not None else 0)` at the `items.sort(key=...)` call site. Named, documented, independently readable.
- Replaced bare-int `0` fallbacks for `premium_collected` and `effective_cost_basis` with explicit `Decimal(0)` (and added `from decimal import Decimal`) in `backend/app/api/routes/positions.py`. Makes Decimal intent explicit and consistent with project Decimal discipline.
- Narrowed `phase: string` and `status: string` on `PositionListItem` to `phase: WheelPhase` / `status: WheelStatus` union literal types in `frontend/src/api/positions.ts`. Provides compile-time safety mirroring the backend Python enums.
- Pre-refactor bug fix in `NewWheelForm.test.tsx`: test mock body key changed from `errors` to `detail` to match FastAPI's actual `{"detail": [...]}` response shape. No production code changed (this was a US-1 test bug, not a US-2 production change).
- All 46 backend tests and 23 frontend tests pass after refactor; `make test`, `make lint`, and `make typecheck` are all clean.

## Source Code References

Plan-authored paths (FastAPI / Vite era — no longer present in repo):
- `backend/app/api/schemas.py` (PositionListItemResponse)
- `backend/app/api/routes/positions.py` (GET /positions handler)
- `backend/tests/api/test_list_positions.py`
- `frontend/src/api/positions.ts` (PositionListItem type, listPositions)
- `frontend/src/hooks/usePositions.ts`
- `frontend/src/components/PositionCard.tsx`
- `frontend/src/components/PositionCard.test.tsx`
- `frontend/src/pages/PositionsListPage.tsx`
- `frontend/src/pages/PositionsListPage.test.tsx`
- `frontend/src/app.tsx` (route registration)

Surviving artifacts at current Electron paths (verified to exist):
- `src/main/services/list-positions.ts`
- `src/main/services/list-positions.test.ts`
- `src/renderer/src/hooks/usePositions.ts`
- `src/renderer/src/components/PositionCard.tsx`
- `src/renderer/src/components/PositionCard.test.tsx`
- `src/renderer/src/pages/PositionsListPage.tsx`
- `src/renderer/src/pages/PositionsListPage.test.tsx`

## Open Questions

- None recorded. The refactor-phase results report "Remaining Tech Debt" as two deferred items rather than open questions: (1) a shared `formatCurrency(s: string): string` helper is deferred until a second consumer needs it; (2) the hand-maintained `WheelPhase` / `WheelStatus` union types in `api/positions.ts` are flagged as duplicates of the backend Python enums and would benefit from a future API codegen step (e.g., `openapi-typescript`). (Source: `plans/us-2/refactor-phase-results.md`)

Deferred / out of scope (noted in story, not unresolved): filtering or searching positions, pagination, live market price or current option value (Epic 06), grouping by ticker or strategy type. (Source: `docs/epics/01-stories/US-2-list-positions.md`)
