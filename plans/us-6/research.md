# Research: US-6 — Record CSP Assignment

All decisions are resolvable from the existing codebase and story spec.
No external library research required.

---

## LegAction enum extension

- **Decision:** Add `'ASSIGN'` to the `LegAction` Zod enum in `src/main/core/types.ts`
- **Rationale:** The story specifies `LegAction: assign`. The current enum (`SELL | BUY | EXPIRE`) has no assignment action. `ASSIGN` is semantically correct — it is a broker-initiated stock delivery, not a buy, sell, or expiration.
- **Alternatives considered:** Reusing `EXPIRE` (rejected — semantically wrong); reusing `BUY` (rejected — shares are not purchased at market price).

---

## OptionType → InstrumentType rename

- **Decision:** Rename the `OptionType` Zod enum and TypeScript type to `InstrumentType`. Add `'STOCK'` as a third value. The renamed enum becomes `PUT | CALL | STOCK`. Rename the `option_type` column to `instrument_type` in the legs table via a new DB migration.
- **Rationale:** `OptionType` is semantically wrong for a field that must now represent stocks as well as options. `InstrumentType` is standard financial terminology that covers options (PUT, CALL) and equities (STOCK) within one enum. PMCC legs are both CALLs, so no new values are needed for that strategy — the rename alone future-proofs the field.
- **Alternatives considered:** `PositionType` (rejected — conflicts with the existing `positions` table and `strategy_type`); leaving `OptionType` and adding `STOCK` (rejected — user explicitly flagged this as semantically wrong); separate nullable `stockFlag` boolean (rejected — over-complicated; a discriminated enum is cleaner).
- **Migration scope:** New migration file `migrations/003_rename_option_type_to_instrument_type.sql`. Must update the CHECK constraint to `instrument_type IN ('PUT', 'CALL', 'STOCK')`. All service files that hardcode `'PUT'` or `'CALL'` in INSERT statements must be updated to use the new column name.

---

## LegRole for the assignment leg

- **Decision:** Use the existing `'ASSIGN'` value already present in the `LegRole` Zod enum (`src/main/core/types.ts`) and the DB CHECK constraint (`migrations/001_initial_schema.sql`).
- **Rationale:** `ASSIGN` is already defined and correct. The story's reference to `stock_assignment` describes the operation's semantics; `ASSIGN` is the code-level identifier already established by earlier schema work.
- **Alternatives considered:** Adding a new `'STOCK_ASSIGNMENT'` value — rejected: would require a schema migration and break the existing CHECK constraint for no benefit.

---

## Premium waterfall calculation

- **Decision:** The `calculateAssignmentBasis()` core function accepts an array of `{ legRole, premiumPerContract }` objects and returns both the numeric `basisPerShare` and a `premiumWaterfall` array of `{ label, amount }` items. The service passes all `CSP_OPEN` and `ROLL_TO` legs from the position's leg history.
- **Rationale:** The mockup and acceptance criteria require each premium line to render individually (e.g., "− CSP premium $3.50", "− Roll credit $1.50"). Returning the waterfall from the pure core function keeps rendering logic out of the service and component.
- **Alternatives considered:** Computing the waterfall in the component from raw leg data — rejected: puts domain logic in the renderer; computing only a total in the core and re-deriving lines in the component — rejected: duplicates leg traversal.

---

## Cost basis snapshot for HOLDING_SHARES

- **Decision:** The assignment service inserts a new `cost_basis_snapshots` row with `final_pnl = NULL`. The position `status` remains `'ACTIVE'` and `closed_date` remains NULL.
- **Rationale:** Assignment is a phase transition, not a position close. The snapshot records the effective cost basis at the moment of assignment. `final_pnl` is only set when the wheel completes (CC close or expiry).
- **Alternatives considered:** No new snapshot — rejected: the cost basis changes at assignment (it is now measured against the assignment strike minus all collected premiums, not just the initial CSP premium).

---

## Future assignment date handling

- **Decision:** The `recordAssignment()` lifecycle engine does NOT throw a `ValidationError` for future dates. The future-date warning is rendered client-side only (gold soft warning, form remains submittable).
- **Rationale:** The story explicitly states: "Future-date warning is client-side only; the backend does not reject future dates." Some brokers post assignment details over the weekend and the recorded date may technically be a future business day.
- **Alternatives considered:** Backend validation — explicitly rejected by the story spec.

---

## activeLeg after assignment

- **Decision:** After assignment, the `getPosition` service's `activeLeg` query should return `null` for `HOLDING_SHARES` positions (the CSP option no longer exists as an open leg). The ASSIGN leg is an event marker, not an ongoing position.
- **Rationale:** Consistent with how `EXPIRE` legs work — they are appended as event markers. The `PositionDetailPage` currently guards `activeLeg &&` before rendering the open leg card, so returning `null` is safe without a page rewrite.
- **How to apply:** Review the `getPosition` service's `activeLeg` query during implementation (Area 6). If the query selects by `phase` or `leg_role`, confirm `ASSIGN` legs are excluded.
