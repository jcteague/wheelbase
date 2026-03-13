# Research: US-4 — Close a CSP Early

## Date validation ownership (lifecycle engine vs service layer)

- **Decision:** Date validations for close (`closeFillDate >= openFillDate`, `closeFillDate <= expiration`) belong in the lifecycle engine (`core/lifecycle.ts`), not the service layer.
- **Rationale:** These are domain business rules, consistent with how `openWheel()` validates fill/expiration dates. The lifecycle engine accepts context values (open fill date, expiration) as parameters — the service layer looks them up from the DB and passes them in. This keeps core logic pure and testable without a DB.
- **Alternatives considered:** Service-layer validation (simpler setup, but business rules scattered across layers).

---

## How the close service reads position context

- **Decision:** The service calls a `getPosition(db, positionId)` helper first to fetch the position's current phase, open leg data (fill_date, expiration, premium_per_contract, contracts), and latest cost basis snapshot. That data is passed to the lifecycle and cost basis engines.
- **Rationale:** The lifecycle engine cannot touch the DB; it needs `openFillDate` and `expiration` from the caller. One query before the transaction is the cleanest pattern and consistent with `createPosition()` which calls `openWheel()` with values it already has.
- **Alternatives considered:** Inline SQL inside the close service (violates SRP), fat payload from frontend (puts DB concerns on the client).

---

## cost_basis_snapshots: insert new vs update existing on close

- **Decision:** Insert a new `cost_basis_snapshots` row at close time with the `final_pnl` set. Do not mutate the opening snapshot.
- **Rationale:** The table is append-only (has a `snapshot_at` timestamp); the latest row wins via `ORDER BY snapshot_at DESC LIMIT 1`. This is consistent with the immutable/roll pattern used for legs and matches the existing `listPositions` query which always selects the latest snapshot.
- **Alternatives considered:** Update the existing row (mutates history, violates immutability principle).

---

## P&L preview: frontend-only calculation

- **Decision:** The P&L preview in the form is computed locally in the React component as the user types. No IPC round-trip until form submission.
- **Rationale:** The user story's Technical Notes explicitly state this. All the required inputs (open premium, contracts) are available once the detail page loads. Local calculation is instant and avoids debounce complexity.
- **Alternatives considered:** Debounced IPC preview call (unnecessary latency, more infrastructure).

---

## pnl_percentage storage

- **Decision:** Do not store `pnl_percentage` in the DB. Store only `final_pnl` in `cost_basis_snapshots`. Recalculate percentage for display.
- **Rationale:** The existing schema has `final_pnl TEXT` but no percentage column. Percentage is derivable from `final_pnl / total_premium_collected * 100` or from `(openPremium - closePrice) / openPremium * 100`. No migration needed.
- **Alternatives considered:** Add `pnl_percentage` column (requires migration, but data is redundant).

---

## PositionDetailPage scope for this story

- **Decision:** Build just enough of PositionDetailPage to support the close flow: fetch and display core position fields (ticker, phase, strike, expiration, premium, cost basis) and render `CloseCspForm` when `phase === 'CSP_OPEN'`.
- **Rationale:** US-3 (Position detail page) created a stub. US-4 requires the detail page to host the close form. We build the minimum viable detail view rather than a full US-3 build-out.
- **Alternatives considered:** Keep PositionDetailPage as a stub and navigate to a separate `/positions/:id/close` route (adds unnecessary routing complexity for a single action).

---

## `getPosition` IPC channel

- **Decision:** Add a `positions:get` IPC handler backed by a `getPosition(db, positionId)` service. The renderer calls this to hydrate the detail page.
- **Rationale:** The existing `positions:list` returns summary data only. The close form needs full leg data (premium_per_contract, open fill_date, expiration) that isn't in the list response.
- **Alternatives considered:** Extend `listPositions` to return full data (breaks the list's lean shape), pass data via router state (fragile in Electron hash routing).

---

## Leg fields for the close leg

- **Decision:** Insert the close leg with `leg_role = 'CSP_CLOSE'`, `action = 'BUY'`, `option_type = 'PUT'`, `fill_price = closePricePerContract`. Copy `strike`, `expiration`, `contracts` from the opening leg. `premium_per_contract` is set to the close price (it is what was paid to close).
- **Rationale:** `leg_role` values `CSP_CLOSE` etc. are already planned in the schema comment. `action = 'BUY'` correctly describes buying to close. Mirroring strike/expiration/contracts from the open leg keeps the leg record self-contained.
- **Alternatives considered:** Omit some fields (violates schema NOT NULL constraints; contracts and strike are required).
