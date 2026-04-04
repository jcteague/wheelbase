# Research: US-10 — Record Shares Called Away

All unknowns were resolved by reading the existing codebase. No external research was needed.

---

## LegAction for exercise

- **Decision:** Use `LegAction: EXERCISE` (already in `LegAction` enum in `src/main/core/types.ts`? — verified: current `LegAction` is `z.enum(['SELL', 'BUY', 'EXPIRE', 'ASSIGN'])` — `EXERCISE` is NOT present)
- **Rationale:** The story specifies `LegAction: EXERCISE` as distinct from `BUY` (which is used for early close). The enum must be extended with `'EXERCISE'`.
- **Alternatives considered:** Reusing `BUY` — rejected because the story explicitly distinguishes exercise (delivery of shares) from a market buy-to-close.
- **Action:** Add `'EXERCISE'` to the `LegAction` enum in `src/main/core/types.ts` and propagate to any `z.enum` checks.

---

## Fill date handling

- **Decision:** The fill date is derived from the CC_OPEN leg's `expiration` field, displayed read-only in the UI. The payload sends only `positionId`; the service resolves fill date from the CC_OPEN leg expiration.
- **Rationale:** The mockup shows a read-only "auto" fill date field with value `ccExpiration`. The story states "fill price is always the CC strike — the trader does not enter it manually; it is derived from the CC_OPEN leg." The same principle applies to fill date — it is the CC expiration date (with T+1 delivery in a real broker, but kept as the expiration date for Phase 1 simplicity, matching the mockup).
- **Alternatives considered:** Exposing `fillDate` as an editable field — deferred to a future release per story's out-of-scope note on early exercise.

---

## Multi-contract guard

- **Decision:** Service layer validates `ccOpenLeg.contracts <= 1`; throws `ValidationError` with message `"Multi-contract call-away is not yet supported"` before any DB writes.
- **Rationale:** Story Out of Scope section: "the form must reject positions with contracts > 1 with message 'Multi-contract call-away is not yet supported'".
- **Alternatives considered:** UI-level guard only — rejected because service guards are the authoritative validation layer in this codebase.

---

## Final P&L formula

- **Decision:** `finalPnl = (ccStrike − basisPerShare) × sharesHeld` — `basisPerShare` is the effective basis already reduced by all premiums. Annualized return: `(finalPnl / capitalDeployed) × (365 / cycleDays) × 100`.
- **Rationale:** Technical Notes in the story explicitly state NOT to add `totalPremiumCollected` separately — it is already embedded in `basisPerShare`.
- **Alternatives considered:** Adding premium waterfall as a separate addend — explicitly rejected by the story.

---

## Cost basis snapshot for call-away

- **Decision:** Create a new `cost_basis_snapshots` row with the same `basisPerShare` and `totalPremiumCollected` as the existing CC_OPEN snapshot, plus `finalPnl` set. Follow the pattern of `expireCspPosition` and `closeCspPosition` which both create a final snapshot.
- **Rationale:** `store final_pnl in cost_basis_snapshot` is required by the story technical notes.
- **Alternatives considered:** Updating the existing snapshot in-place — rejected; codebase always creates new snapshots, never mutates.

---

## Position closed_date

- **Decision:** Set `closed_date = fill_date` (the CC expiration date) on the position row. Set `status = CLOSED`.
- **Rationale:** Story technical notes: "Store final_pnl in cost_basis_snapshot; set closed_date and status = CLOSED on the position".

---

## CC_OPEN leg closed_date linkage

- **Decision:** Update the CC_OPEN leg's `closed_date = fill_date` and store the CC_CLOSE leg ID as a reference. The existing `legs` table has no `closed_date` column — this is handled by convention (the CC_CLOSE leg references the same strike/expiration, allowing leg history to show the exercise).
- **Rationale:** Story: "After call-away, set closed_date = fill_date on the CC_OPEN leg and link it to the new CC_CLOSE leg." The `legs` table has no explicit `closed_date` column in the current schema — the linkage is implicit via shared strike/expiration on the CC_CLOSE leg. No migration needed.
- **Alternatives considered:** Adding a `closed_date` column to `legs` — deferred; current schema handles this via leg history display pattern already used in `closeCoveredCallPosition`.

---

## "Start New Wheel" CTA routing

- **Decision:** `onClick` navigates to `/#/new?ticker=AAPL` using `window.location.hash = '#/new?ticker=' + ticker` or wouter's `useLocation` hook.
- **Rationale:** Story: "uses internal router navigation to `/new?ticker=AAPL` (hash-based routing via wouter)". The app uses hash-based routing (`useHashLocation`).
- **Alternatives considered:** `<Link>` component — acceptable but `onClick` is consistent with the success CTA pattern in `CloseCcEarlySuccess`.
