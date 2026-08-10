# Green Phase Results: US-66 Layer 3 — ScreenerPage Composition, States, Stale Badge

## Feature Context

- **Feature directory**: `plans/us-66/`
- **User story**: `docs/epics/08-stories/US-66-display-ranked-results.md`
- **Plan file**: `plans/us-66/plan.md` (area 5)
- **Red phase results**: `plans/us-66/red-phase-results.md`
- **Mockup**: `mockups/us-66-screener-results.mdx` (states `ranked` / `empty` / `unavailable` / `stale`)

## Files touched (production)

- `src/renderer/src/pages/ScreenerPage.tsx` — new page: header (title, count badge, stale badge,
  `MarketStatusPill`) and the body state machine over `useScreenerResults()`

## E2E coverage added or modified

None — e2e is Layer 5.

## Public Interfaces Implemented

```typescript
// src/renderer/src/pages/ScreenerPage.tsx
export const SCREENER_PAGE_TITLE = 'Screener'
export function ScreenerPage(): React.JSX.Element
```

## Implementation Summary

### Approach

The page composes existing pieces only — `ScreenerResultsTable`, `ScreenerExcludedSection`,
`ScreenerStateCard`, `LoadingState`, `ErrorAlert`, `Badge`, `MarketStatusPill` — and adds no
formatting logic of its own beyond calling `fmtQuoteTime`. Body branches follow the state machine in
`data-model.md`: loading → `LoadingState`; envelope failure → `ErrorAlert`; `provider_unavailable` →
error-tone card with a `Retry refresh` action wired to `refetch()`; `ok` → either the ranked table
(with the `Candidate Results` title bar and count line from the mockup's `TitleBar`) or the
neutral-tone empty card, with `ScreenerExcludedSection` rendered under both `ok` branches.

### Key Design Decisions

- **`staleQuoteTime` is a single derived value**, not a boolean plus a string: the stale badge, the
  caption, and the count line's `quoted HH:mm:ss` variant all key off the same non-null value, so
  they can never disagree. It is null unless the market display is `CLOSED`, ranked rows exist, and
  the payload actually carries a `quoteTimestamp`.
- **The stale badge is a plain span with `wb-gold` tokens**, not `Badge` — `Badge` applies its gold
  treatment through inline `style` tints, and the mockup's stale pill is an uppercase mono chip with
  a visible gold border.
- **`ScreenerExcludedSection` is rendered unconditionally in the `ok` branches** — it already returns
  `null` for an empty list, so no `excluded.length > 0` guard is duplicated at the call site.
- **The mockup's `CenteredCard` captions are omitted.** Their copy ("the screener never renders an
  empty table as a successful zero-result screen") is design annotation explaining the state to a
  mockup reader, not user-facing product copy.
- **The empty state shows no count line** — matching the mockup, which renders `TitleBar` only when
  there is a table beneath it.
- **The empty card has no action button.** The mockup's "Open Screener settings" belongs to US-67.

### Deviations from Plan

- The plan lists `ScreenerResultsTable` + `ScoreLegend` as separate page children; the score legend
  already ships inside `ScreenerResultsTable` (Layer 2), so the page renders the table alone.

## Test Execution Results

```bash
pnpm test ScreenerPage
 ✓  renderer  src/renderer/src/pages/ScreenerPage.test.tsx (9 tests) 337ms

Test Files  1 passed (1)
     Tests  9 passed (9)

pnpm test
Test Files  179 passed (179)
     Tests  1978 passed (1978)
```

## Quality Checks

- ✅ `pnpm test` passed (1978 tests, no regressions)
- ✅ `pnpm lint` passed
- ✅ `pnpm typecheck` passed

## Known Limitations / Tech Debt

- `ScreenerResultsBody` takes `quoteTime` as a pre-derived prop rather than deriving it — deliberate
  (the header needs the same value), but worth a look in refactor for a cleaner seam.
- The `useMarketStatusDisplay` + `MarketStatusPill` header arrangement now exists on both
  `PositionsListPage` and `ScreenerPage`; the refactor task asks whether the markup is genuinely the
  same shape (it is not today — Positions pairs the pill with a `+ New Wheel` action).
- The page is not yet routed; `App.tsx` wiring is Layer 4.

## Handoff to Refactor Phase

To resume: run `/refactor us-66`. Refactor phase should:

1. Read this file for the implementation file and the tech-debt notes above
2. Run `pnpm test` to confirm the baseline is green before touching anything
3. Focus on `src/renderer/src/pages/ScreenerPage.tsx` and the shared-header question

---

# Green Phase Results: US-66 Layer 4 — Route and Navigation

## Feature Context

- **Feature directory**: `plans/us-66/`
- **Plan file**: `plans/us-66/plan.md` (area 6)
- **Red phase**: none at unit level — there is no `App.test.tsx`; the Red for this area is the
  failing e2e navigation step in Layer 5 (per `tasks.md`)

## Files touched (production)

- `src/renderer/src/App.tsx` — `Screener` nav item in the Trading group (after Watchlist),
  `/screener` route in the `Switch`, and the `ShellHeader` title mapping for `/screener`

## E2E coverage added or modified

None — e2e is Layer 5.

## Public Interfaces Implemented

No new exports. `App.tsx` now consumes `SCREENER_PAGE_TITLE` / `ScreenerPage` from
`./pages/ScreenerPage`.

## Implementation Summary

### Approach

Three edits mirroring the existing Watchlist wiring exactly: a `NavItem` with the mockup's `⌕` icon
(`mockups/us-66-screener-results.mdx` sidebar `NavRow`) placed directly after Watchlist, a
`<Route path="/screener" component={ScreenerPage} />` in the `Switch`, and a `/screener` arm in the
`ShellHeader` title chain.

### Key Design Decisions

- **`ShellHeader` title mapping added beyond the task's two bullets.** Without it the shell header
  would read `Dashboard` while the Screener page is open — the same defect the Calendar and Watchlist
  arms exist to prevent. One line, no new concept.
- **Nav label uses `SCREENER_PAGE_TITLE`**, not a literal, matching `CALENDAR_PAGE_TITLE` /
  `WATCHLIST_PAGE_TITLE`.

### Deviations from Plan

None.

## Test Execution Results

```bash
pnpm test
Test Files  179 passed (179)
     Tests  1978 passed (1978)
```

## Quality Checks

- ✅ `pnpm test` passed (1978 tests, no regressions)
- ✅ `pnpm lint` passed
- ✅ `pnpm typecheck` passed

## Known Limitations / Tech Debt

- The `ShellHeader` title chain is now a five-deep nested ternary (`/settings` → `/new` →
  `/calendar` → `/watchlist` → `/screener` → `Dashboard`). It was already a four-deep chain before
  this change; each new route makes it worse. Primary refactor candidate: a route→title lookup map.
- Nav item + route + header title must be edited in three places for every new page — the coupling
  is invisible until a page is added and the header silently reads `Dashboard`.
