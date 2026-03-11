# Implementation Plan: US-2 — List All Positions

## Summary

Implements the positions list view: a `GET /api/positions` endpoint that returns all positions with their latest cost basis snapshot and active leg data (strike, expiration, DTE computed server-side), sorted by DTE ascending. The frontend gains a `/positions` page with `PositionCard` components and an empty state.

## Supporting Documents

Read these before starting implementation — they contain key decisions, data model details, and the API contract:

- **User Story & Acceptance Criteria:** `docs/epics/01-stories/US-2-list-positions.md`
- **Research & Design Decisions:** `plans/us-2/research.md`
- **Data Model & Selection Logic:** `plans/us-2/data-model.md`
- **API Contract (GET /api/positions):** `plans/us-2/contracts/get-positions.md`
- **Quickstart & Verification:** `plans/us-2/quickstart.md`

## Prerequisites

US-1 is complete: `Position`, `Leg`, and `CostBasisSnapshot` ORM models exist; the initial Alembic migration has been applied; `POST /api/positions` is working. No new migrations are required.

---

## Implementation Areas

### 1. Backend Response Schema

**Files to create or modify:**
- `backend/app/api/schemas.py` — add `PositionListItemResponse`

**Red — tests to write:**
- In `backend/tests/api/test_list_positions.py` (new file):
  - `test_list_positions_empty_returns_200_with_empty_array`: GET /api/positions with no DB rows returns `200` and `[]`.
  - `test_list_positions_single_csp_open_response_shape`: After creating one position via POST /api/positions, GET /api/positions returns a list with one item containing keys: `id`, `ticker`, `phase`, `status`, `strike`, `expiration`, `dte`, `premium_collected`, `effective_cost_basis`.
  - `test_list_positions_dte_computed_correctly`: Position with expiration 2026-04-17 and today mocked/known returns `dte == 42` (when today is 2026-03-06). Use `freezegun` or pass a known date; if freezegun is not available, assert `dte` is an integer and matches `(date(2026,4,17) - date.today()).days`.
  - `test_list_positions_values_match_created_position`: After POST with strike=180, premium_per_contract=2.50, contracts=1 — GET returns `strike=="180.0000"`, `premium_collected=="250.0000"`, `effective_cost_basis=="177.5000"`.

**Green — implementation:**
- Add `PositionListItemResponse` Pydantic model to `backend/app/api/schemas.py`:
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
  Set `model_config = {"from_attributes": False}` (constructed manually, not from ORM directly).

**Refactor — cleanup to consider:**
- Verify field naming is consistent with existing response schemas (snake_case, Decimal as string in JSON).

**Acceptance criteria covered:**
- All five Gherkin scenarios depend on this shape being correct.

---

### 2. Backend Route Handler

**Files to create or modify:**
- `backend/app/api/routes/positions.py` — add `GET /positions` handler

**Red — tests to write:**
- In `backend/tests/api/test_list_positions.py`:
  - `test_list_positions_sorted_by_dte_ascending`: Create three positions via POST with expirations 2026-05-16 (TSLA, 45 DTE from ref), 2026-04-04 (MSFT, ~29 DTE), 2026-04-17 (AAPL, ~42 DTE). GET /api/positions returns them ordered nearest-expiration-first: MSFT, AAPL, TSLA.
  - `test_list_positions_includes_all_positions`: Create two positions; GET returns both.
  - `test_list_positions_null_dte_for_no_active_leg`: Directly insert a `Position` with phase=`WHEEL_COMPLETE` and no legs via `db_session`; GET returns that position with `dte=null`, `strike=null`, `expiration=null`.
  - `test_list_positions_null_dte_sorted_last`: Two positions — one with active leg (dte=10), one without (dte=null). GET returns active-leg position first.

**Green — implementation:**
- Add `list_positions` handler to `backend/app/api/routes/positions.py`:
  1. Query all `Position` rows using `select(Position).options(selectinload(Position.legs), selectinload(Position.cost_basis_snapshots))`.
  2. For each position, select `active_leg` = the `Leg` with `action == LegAction.open` and the latest `fill_date` (use `max()` with `default=None`).
  3. For each position, select `latest_snapshot` = the `CostBasisSnapshot` with the latest `snapshot_at`.
  4. Compute `dte = (active_leg.expiration - datetime.date.today()).days if active_leg else None`.
  5. Build `PositionListItemResponse` for each position.
  6. Sort list: positions with `dte` not None first (ascending), then positions with `dte=None`.
  7. Return the sorted list.
- Add structured logging:
  - DEBUG `list_positions_query_start` before executing the select.
  - DEBUG `list_positions_query_complete` with `count=len(positions)`.
  - INFO `positions_listed` with `count=len(result)`.

**Refactor — cleanup to consider:**
- Extract the active-leg-selection logic into a small private function `_active_leg(position)` if the handler body becomes long.
- Extract snapshot selection into `_latest_snapshot(position)` similarly.

**Acceptance criteria covered:**
- "Display positions list with one open CSP" — returns correct data.
- "Display multiple positions sorted by DTE ascending" — MSFT(14), AAPL(30), TSLA(45) order.
- "DTE countdown" — server computes `(expiration - today).days`.
- "Closed positions appear with final status" — WHEEL_COMPLETE included, dte=null.
- "Empty state" — returns `[]` which frontend uses to render empty state.

---

### 3. Frontend API Layer

**Files to create or modify:**
- `frontend/src/api/positions.ts` — add `PositionListItem` type and `listPositions` function

**Red — tests to write:**
- No unit tests for the API module itself (it wraps `fetch`; covered by component/page tests via mocking).

**Green — implementation:**
- Add `PositionListItem` type to `frontend/src/api/positions.ts`:
  ```typescript
  export type PositionListItem = {
    id: string;
    ticker: string;
    phase: string;
    status: string;
    strike: string | null;
    expiration: string | null;
    dte: number | null;
    premium_collected: string;
    effective_cost_basis: string;
  };
  ```
- Add `listPositions` function:
  ```typescript
  export async function listPositions(): Promise<PositionListItem[]> {
    const response = await fetch('/api/positions');
    const body: unknown = await response.json();
    if (!response.ok) throw apiError(response.status, body);
    return body as PositionListItem[];
  }
  ```

**Refactor — cleanup to consider:**
- Check for duplication and naming consistency.

**Acceptance criteria covered:**
- Provides the data contract the hook and page depend on.

---

### 4. Frontend Data Hook

**Files to create or modify:**
- `frontend/src/hooks/usePositions.ts` — new file

**Red — tests to write:**
- No isolated hook tests; covered by page-level component tests.

**Green — implementation:**
- Create `usePositions` hook using `useQuery`:
  ```typescript
  export function usePositions() {
    return useQuery<PositionListItem[], ApiError>({
      queryKey: ['positions'],
      queryFn: listPositions,
    });
  }
  ```

**Refactor — cleanup to consider:**
- Check for duplication and naming consistency.

**Acceptance criteria covered:**
- Provides data to `PositionsListPage`.

---

### 5. PositionCard Component

**Files to create or modify:**
- `frontend/src/components/PositionCard.tsx` — new file
- `frontend/src/components/PositionCard.test.tsx` — new test file

**Red — tests to write:**
- In `frontend/src/components/PositionCard.test.tsx`:
  - `renders ticker`: Given a `PositionListItem` with ticker "AAPL", renders text "AAPL".
  - `renders phase badge`: Renders the phase string "CSP_OPEN" in the card.
  - `renders strike formatted as currency`: strike "180.0000" renders as "$180.00".
  - `renders expiration date`: expiration "2026-04-17" renders as "2026-04-17" or a formatted date string.
  - `renders DTE as integer`: dte=42 renders as "42" (with optional "days" label).
  - `renders premium collected formatted as currency`: premium_collected "250.0000" renders as "$250.00".
  - `renders effective cost basis formatted as currency`: effective_cost_basis "177.5000" renders as "$177.50".
  - `renders Expired when dte is null`: dte=null renders the text "Expired" in place of a number.

**Green — implementation:**
- Create `PositionCard` component in `frontend/src/components/PositionCard.tsx`:
  - Props: `item: PositionListItem`
  - Renders an `<article>` or `<div>` card containing:
    - Ticker as heading
    - Phase as a `<span>` badge (CSS class based on phase value)
    - Strike as `$N.NN` (or `—` if null)
    - Expiration date string (or `—` if null)
    - DTE: integer value + "d" suffix, or "Expired" if null
    - Premium collected as `$N.NN`
    - Effective cost basis as `$N.NN`
  - Format Decimal strings from the API using `parseFloat(value).toFixed(2)` wrapped in `$`.

**Refactor — cleanup to consider:**
- Check for duplication and naming consistency.
- Ensure currency formatting is consistent (consider a shared `formatCurrency(s: string): string` helper in `lib/utils.ts` if used in multiple places — only add if used in two or more components by end of this story).

**Acceptance criteria covered:**
- "position card appears showing: ticker, phase badge, strike, expiration, DTE, premium collected, effective cost basis"
- "DTE shows 'Expired' instead of a countdown" for WHEEL_COMPLETE

---

### 6. PositionsListPage and Routing

**Files to create or modify:**
- `frontend/src/pages/PositionsListPage.tsx` — new file
- `frontend/src/pages/PositionsListPage.test.tsx` — new test file
- `frontend/src/app.tsx` — add `/positions` route

**Red — tests to write:**
- In `frontend/src/pages/PositionsListPage.test.tsx` (mock `usePositions`):
  - `renders loading state`: `usePositions` returns `{ isLoading: true }` → renders a loading indicator (e.g., text "Loading..." or a spinner element).
  - `renders empty state when no positions`: `usePositions` returns `{ data: [], isLoading: false }` → renders "No positions yet" text and a link/button to the New Wheel form (href="/").
  - `renders a card for each position`: `usePositions` returns `{ data: [item1, item2], isLoading: false }` → renders two `PositionCard` components (assert two cards by role or test-id).
  - `renders positions sorted by dte ascending`: Data has TSLA(45 DTE) before AAPL(30 DTE) in array; since backend guarantees sort order, assert first card ticker is AAPL — OR simply assert all expected tickers are present (sort is backend's responsibility, tested in backend tests).

**Green — implementation:**
- Create `PositionsListPage` in `frontend/src/pages/PositionsListPage.tsx`:
  - Uses `usePositions()` hook.
  - Loading state: renders a `<p>Loading...</p>` (or simple spinner).
  - Error state: renders a `<p>Failed to load positions.</p>`.
  - Empty state: renders `<p>No positions yet</p>` and an `<a href="/">Open your first wheel</a>` link.
  - Populated state: renders a `<ul>` or `<div>` with one `<PositionCard>` per item.
- Add `/positions` route to `frontend/src/app.tsx`:
  ```tsx
  import { PositionsListPage } from './pages/PositionsListPage';
  // ...
  <Route path="/positions" component={PositionsListPage} />
  ```

**Refactor — cleanup to consider:**
- Check for duplication and naming consistency.

**Acceptance criteria covered:**
- "Display positions list with one open CSP" — PositionsListPage renders a card.
- "Display multiple positions sorted by DTE ascending" — backend sort is trusted; page renders all cards.
- "Empty state when no positions exist" — "No positions yet" + CTA link renders.
