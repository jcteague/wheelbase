# US-11: Leg history

<!-- generated:from us-11 -->
## Summary

Rewrites the position detail page's leg history table from a 5-column ledger into the mockup's 8-column wheel chain view: `Role | Action | Strike | Expiration | Contracts | Premium | Fill Date | Running Basis / Share`. The new `Running Basis / Share` column is derived in the renderer by walking the legs in chronological order alongside the position's cost-basis snapshots and carrying forward the last seen `basisPerShare` whenever a leg has no snapshot of its own (e.g. `CC_CLOSE`). To support this, the `positions:get` IPC response gains an `allSnapshots` field returning every snapshot for the position ordered by `snapshot_at ASC`, and the green phase began persisting explicit `CALLED_AWAY` and `CC_EXPIRED` leg roles in place of the generic `CC_CLOSE` / `EXPIRE` values used by earlier stories. No schema migration is required — every field is sourced from existing Phase 1 tables.

## Acceptance criteria

- Given a position with legs `CSP_OPEN`, `ASSIGN`, `CC_OPEN`, the leg history table shows all three rows in `fill_date` order (oldest first) with role, action, instrument type, strike, expiration, contracts, premium, and fill date.
- Given `CSP_OPEN` (strike $180, +$3.50, basis $176.50), `ASSIGN` (strike $180, basis $176.50), `CC_OPEN` (strike $182, +$2.30, basis $174.20), `CC_CLOSE` (strike $182, −$1.80, basis $174.20), each row shows its running cost basis; the `CC_CLOSE` row carries the prior $174.20 forward (no new snapshot at early close) and renders the premium as "−$1.80" in amber.
- Given `position.status === 'WHEEL_COMPLETE'` with a final snapshot `final_pnl = "$780.00"`, a `<tfoot>` summary row renders "Final P&L: +$780.00" (green for profit, red for loss).
- Given an `ASSIGN` leg with `contracts = 1`, the premium column shows muted italic "— (assigned)" with a "100 shares received" annotation; the strike column shows the assignment strike.
- Given a `CALLED_AWAY` leg at $182.00 with `contracts = 1`, the premium column shows "— (assigned)" with a "100 shares called away" annotation, the strike column shows $182.00, and the running basis carries forward from the prior `CC_OPEN` snapshot.
- Given a `CC_EXPIRED` leg, the premium column shows "expired worthless" in muted text and running basis carries forward from the `CC_OPEN` snapshot.
- Given a single open `CSP_OPEN` leg, only that row renders and the running basis shows the initial basis from the opening snapshot.

## What was built

The `getPosition` service issues a second SQL query — `GET_ALL_SNAPSHOTS_QUERY` — selecting every `cost_basis_snapshots` row for the position ordered `snapshot_at ASC`, mapped into `CostBasisSnapshotRecord[]` and returned alongside the existing `position`, `activeLeg`, `costBasisSnapshot` (latest), and `legs` fields. The `positions:get` IPC handler is unchanged — it already spreads the service result, so the new `allSnapshots` field flows through to the renderer adapter without touching the handler shape.

In the renderer, a new pure function `deriveRunningBasis(legs, snapshots)` lives in `src/renderer/src/lib/deriveRunningBasis.ts`. It walks legs in `fill_date` order while advancing a pointer through snapshots sorted `snapshot_at ASC`, comparing dates by `snapshotAt.slice(0, 10) <= leg.fillDate` (safe because snapshot timestamps are ISO-8601 and `fillDate` is already `YYYY-MM-DD`), and records the last seen `basisPerShare` on each leg as `runningCostBasis`. A green-phase enhancement groups legs and snapshots by fill date and assigns same-day snapshots in sequence — so a same-day chain like assign-then-open-CC keeps the `CSP_OPEN` row on the pre-assignment basis instead of collapsing both rows to the latest snapshot. `CC_CLOSE` legs have no snapshot of their own and simply carry the prior basis forward; `O(n+m)` overall with no look-ahead.

`LegHistoryTable.tsx` is rewritten from 5 columns to 8. Local subcomponents `PremiumCell` and `BasisCell` encapsulate the per-role rendering: `ASSIGN` and `CALLED_AWAY` render muted italic "— (assigned)" with a `0.68rem` annotation ("100 shares received" / "100 shares called away"); `CC_EXPIRED` renders muted italic "expired worthless"; `CC_CLOSE` renders amber `var(--wb-gold)` with an em-dash minus prefix (`"−${premiumPerContract}"`, not a hyphen); other roles with a value render green `var(--wb-green)` with a plus prefix; `null` / zero falls back to muted "—". The `Running Basis / Share` column header carries a `rgba(121,192,255,0.05)` background and `#79c0ff` accent; tbody cells inherit the same sky-tinted accent and render values as bold `$X.XX` via `parseFloat(value).toFixed(2)`. A conditional `<tfoot>` renders a single `<td colSpan={8}>` "Final P&L" row only when the new `finalPnl` prop is truthy, using `fmtMoney` and `pnlColor` from `format.ts` and a green-dim border-top / background.

`PositionDetailPage` imports `deriveRunningBasis`, calls it with `legs` and `allSnapshots ?? []`, and passes the enriched rows plus `finalPnl` from the terminal snapshot into `LegHistoryTable`. Phase / role labels and colors are centralised in `src/renderer/src/lib/phase.ts`: a new `ROLE_COLOR` map carries the mockup's hex values per role, and `LEG_ROLE_LABEL` gains `CALLED_AWAY: 'Called Away'`, `CC_EXPIRED: 'CC Expired'`, `CC_CLOSE: 'CC Close'` and updates older entries (`CSP_OPEN: 'CSP Open'`) to match the mockup. The instrument type is intentionally not its own column — the role badge implicitly conveys it (CSP Open = PUT, CC Open/Close/Expired = CALL, Called Away = CALL) to keep the table width manageable.

Green-phase persistence changes follow the renderer's needs: `LegRole` in `src/main/core/types.ts` gains `CALLED_AWAY` and `CC_EXPIRED` values, `record-call-away-position.ts` now writes `CALLED_AWAY` (was emitting `CC_CLOSE`), and `expire-cc-position.ts` writes `CC_EXPIRED` (was emitting a generic `EXPIRE` role). The renderer can then drive row labels and annotations off the persisted role without special-casing older values. As a Layer 4 follow-up, `computeDte()` in `src/renderer/src/lib/format.ts` switched to UTC dates to match the main-process `toISOString().slice(0, 10)` convention, removing a local/UTC midnight boundary mismatch that made the expired-CC action flaky in E2E.

## Architecture decisions

- Snapshot-to-leg matching uses a carry-forward pointer scan in the renderer: iterate legs in `fill_date ASC`, advance the snapshot pointer while `snapshot.snapshotAt.slice(0, 10) <= leg.fillDate`, record the last seen `basisPerShare` as the leg's `runningCostBasis`. `O(n+m)`, no look-ahead. Date comparison via `slice(0, 10)` is safe — snapshot timestamps are ISO-8601 and `fillDate` is already `YYYY-MM-DD`. `CC_CLOSE` has no snapshot, so its row simply carries the previous basis forward. Alternatives rejected: matching by role name (brittle if two `CC_OPEN` legs exist); SQL join on `fill_date` (not possible client-side); precomputing running basis in the backend (display logic in the wrong layer).
- `allSnapshots` is added to the existing `positions:get` response rather than a separate IPC channel. The service already issues a second query for `legs`; a parallel snapshot query is consistent with that pattern and keeps the IPC response self-contained. Alternatives rejected: JOIN-ing snapshots into the legs query (overcomplicated); returning only the latest snapshot and re-deriving history (loses terminal `final_pnl` data) → [contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `deriveRunningBasis` lives in `src/renderer/src/lib/`, not in `src/main/core/`. It is display logic enriching legs for rendering, not business logic; the renderer's `lib/` folder already hosts pure helpers (`format.ts`, `phase.ts`). Placing it main-side would couple the service to a display concern; placing it inline in `PositionDetailPage` would hurt testability.
- The 5-column `LegHistoryTable` is replaced by the mockup's 8-column layout in full (`Role | Action | Strike | Expiration | Contracts | Premium | Fill Date | Running Basis / Share`). The mockup is authoritative; the instrument-type column is dropped because the role badge conveys it implicitly. `LegHistoryEntry` adds `expiration: string | null`, `contracts: number`, and `runningCostBasis: string | null`; `premiumPerContract` becomes nullable. A new optional `finalPnl?: string | null` prop drives the conditional `<tfoot>`.
- Role color and label maps are centralised in `src/renderer/src/lib/phase.ts` (`ROLE_COLOR`, updated `LEG_ROLE_LABEL`) rather than inlined in `LegHistoryTable.tsx` or split into a separate `legRoles.ts` file. Keeps the renderer's role/phase vocabulary in one place.
- Green-phase decision: `CALLED_AWAY` and `CC_EXPIRED` are persisted as distinct `LegRole` enum values. The renderer needs them to render the story-specific row labels ("Called Away", "CC Expired") and annotations ("100 shares called away", "expired worthless") without special-casing older `CC_CLOSE` / `EXPIRE` rows. Alternative rejected: keep the generic roles and have the renderer reinterpret them — leg-role semantics should match the mockup contract at the persistence layer. → [domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md)
- Green-phase decision: same-day basis sequencing happens in the renderer. `deriveRunningBasis` groups legs and snapshots by fill date and assigns same-day snapshots in sequence so earlier rows keep their own basis while later rows inherit the latest snapshot. Same-day multi-leg chains (e.g. assign + open CC on the same day) initially collapsed to the latest snapshot, causing the `CSP_OPEN` row to inherit the `CC_OPEN` basis; the fix preserves chronological progression per row. Alternative rejected: move sequencing into the backend query (keep display-layer logic in the display layer).
- Green-phase decision: DTE math switches to UTC. `computeDte()` evaluates persisted `YYYY-MM-DD` strings in UTC to match the main-process `toISOString().slice(0, 10)` convention. Removes a date-boundary mismatch that made the expired-CC action flaky around local/UTC midnight.
- No schema migration. The existing schema fully supports the wheel leg chain display; the new role values use the existing `legs.role` string column → [schema/tables.md](../schema/tables.md)
- Roll legs (`ROLL_FROM`, `ROLL_TO`) may appear in leg history — render with their role badge, carry forward the previous running basis, do not crash. Full roll visualization is deferred to a future story.
- The table is non-interactive in Phase 1 — no sorting, no pagination, no CSV export.

## Contracts touched

- `positions:get` — IPC response gains `allSnapshots: CostBasisSnapshotRecord[]` ordered `snapshot_at ASC`; request payload and error shape unchanged. Handler is untouched and simply spreads the service result → [contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `GetPositionResult` — main-process return type adds `allSnapshots: CostBasisSnapshotRecord[]` alongside `position`, `activeLeg`, `costBasisSnapshot` (latest), and `legs`.
- `GET_ALL_SNAPSHOTS_QUERY` — new SQL constant: `SELECT id, position_id, basis_per_share, total_premium_collected, final_pnl, snapshot_at, created_at FROM cost_basis_snapshots WHERE position_id = ? ORDER BY snapshot_at ASC`. Rows map into `allSnapshots`.
- `PositionDetail` — renderer adapter type gains `allSnapshots`, mirroring the IPC response. Refactor phase extracted `LegDetail` and `SnapshotDetail` as named exported types reused by `PositionDetail` (was inline duplication for `activeLeg`/`legs` and `costBasisSnapshot`/`allSnapshots`).
- `deriveRunningBasis<T extends { fillDate: string }>(legs, snapshots): Array<T & { runningCostBasis: string | null }>` — new renderer pure helper implementing the carry-forward pointer scan + same-day sequencing.
- `EnrichedLeg = LegRecord & { runningCostBasis: string | null }` — display type produced by `deriveRunningBasis`; `runningCostBasis` is the `basisPerShare` of the most recent snapshot with `snapshotAt.slice(0, 10) <= fillDate`, or `null` if no snapshot has been seen yet.
- `LegHistoryEntry` — component row type: `id`, `legRole`, `action`, `instrumentType`, `strike`, `expiration: string | null`, `contracts: number` (new), `premiumPerContract: string | null`, `fillDate`, `runningCostBasis: string | null` (new).
- `LegHistoryTableProps` — gains optional `finalPnl?: string | null`; truthy values render the `<tfoot>` Final P&L row, otherwise the footer is omitted entirely.
- `LegRole` (main-process enum in `src/main/core/types.ts`) — adds `CALLED_AWAY` and `CC_EXPIRED`. `record-call-away-position.ts` now persists `CALLED_AWAY` (was `CC_CLOSE`); `expire-cc-position.ts` now persists `CC_EXPIRED` (was `EXPIRE`).
- `ROLE_COLOR: Record<string, string>` (new in `phase.ts`) — `CSP_OPEN: '#e6a817'`, `ASSIGN: '#79c0ff'`, `CC_OPEN: '#d2a8ff'`, `CC_CLOSE: '#3fb950'`, `CC_EXPIRED: '#484f58'`, `CALLED_AWAY: '#3fb950'`.
- `LEG_ROLE_LABEL` (updated in `phase.ts`) — `CSP_OPEN: 'CSP Open'` (replaces `'Sell Put'`), `ASSIGN: 'Assign'`, `CC_OPEN: 'CC Open'`, plus new entries `CC_CLOSE: 'CC Close'`, `CC_EXPIRED: 'CC Expired'`, `CALLED_AWAY: 'Called Away'`.

### Snapshot creation events (reference)

| Leg role    | Creates snapshot? | `finalPnl` set? |
| ----------- | ----------------- | --------------- |
| CSP_OPEN    | Yes               | No              |
| ASSIGN      | Yes               | No              |
| CC_OPEN     | Yes               | No              |
| CC_CLOSE    | **No**            | n/a             |
| CC_EXPIRED  | Yes               | Yes             |
| CALLED_AWAY | Yes               | Yes             |
| ROLL_FROM   | No                | n/a             |
| ROLL_TO     | No                | n/a             |

`CC_CLOSE` running basis always carries forward from the prior `CC_OPEN` snapshot → [domain/cost-basis.md](../domain/cost-basis.md)

## Source files

- `src/main/schemas.ts` — added `allSnapshots: CostBasisSnapshotRecord[]` to `GetPositionResult`
- `src/main/services/get-position.ts` — `GET_ALL_SNAPSHOTS_QUERY` + `SnapshotRow` interface + `allSnapshots` mapping; refactor extracted `mapActiveLeg()` / `mapLatestSnapshot()` helpers
- `src/main/services/get-position.test.ts` — empty / single / multi-snapshot ordering cases
- `src/main/core/types.ts` — added `CC_EXPIRED` and `CALLED_AWAY` `LegRole` enum values
- `src/main/core/types.test.ts` — covers the new leg-role enum values
- `src/main/services/record-call-away-position.ts` — persists `CALLED_AWAY` (was `CC_CLOSE`)
- `src/main/services/record-call-away-position.test.ts`
- `src/main/services/expire-cc-position.ts` — persists `CC_EXPIRED` (was `EXPIRE`)
- `src/main/services/expire-cc-position.test.ts`
- `src/main/ipc/positions.test.ts` — updated mocked IPC contracts for the new leg roles
- `src/renderer/src/api/positions.ts` — added `allSnapshots` to `PositionDetail`; refactor extracted `LegDetail` and `SnapshotDetail` named types
- `src/renderer/src/api/positions.test.ts` — adapter expectations for `CC_EXPIRED`
- `src/renderer/src/lib/deriveRunningBasis.ts` — new pure function (carry-forward pointer scan + same-day sequencing)
- `src/renderer/src/lib/deriveRunningBasis.test.ts`
- `src/renderer/src/lib/phase.ts` — added `ROLE_COLOR`; updated `LEG_ROLE_LABEL`
- `src/renderer/src/lib/phase.test.ts`
- `src/renderer/src/lib/format.ts` — `computeDte()` switched to UTC
- `src/renderer/src/lib/format.test.ts` — locked UTC-based DTE behavior
- `src/renderer/src/components/LegHistoryTable.tsx` — 8-column rewrite, `PremiumCell` / `BasisCell` local subcomponents, conditional `<tfoot>`; refactor added `formatDollarAmount()`, `renderAssignedPremiumCell()`, `assignmentAnnotationByRole`, shared muted / running-basis style objects
- `src/renderer/src/components/LegHistoryTable.test.tsx` — new columns, role badge, special premium cells, basis cell, conditional `<tfoot>`
- `src/renderer/src/pages/PositionDetailPage.tsx` — imports `deriveRunningBasis`; passes `enrichedLegs` and `finalPnl` to `LegHistoryTable` (`allSnapshots ?? []` fallback for older fixtures)
- `src/renderer/src/pages/PositionDetailPage.test.tsx` — fixtures with `allSnapshots`; assertions for running-basis header, value, and Final P&L footer
- `src/renderer/src/pages/PositionDetailContent.tsx` — refactor introduced `NoteBlock` helper for Thesis / Notes
- `src/renderer/src/hooks/useRecordCallAway.test.ts` — hook response shape updated to `CALLED_AWAY`
- `e2e/helpers.ts` — kept E2E date seeding aligned with service-side UTC defaults
- `e2e/leg-chain-display.spec.ts` — 7 E2E tests, one per AC
<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
