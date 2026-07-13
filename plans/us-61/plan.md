---
story: us-61
kind: feature
parent: null
topics: [expiration-calendar, management-dashboard]
status: planned
---

# Implementation Plan: US-61 — Flag positions expiring within 7 days on dashboard and calendar

## Summary

Add a persistent gold "Expiring soon" flag for active option positions at
DTE ≤ 7, on both the dashboard positions table and the expiration calendar
(month grid + day detail). It is a display rule driven entirely by the existing
`isDteUrgent` predicate — no IPC, service, engine, migration, or schema change.
Done state: a ≤ 7-DTE position shows a shared `ExpiringSoonFlag` pill (and a
gold row/cell highlight) identically on both surfaces; positions at 8+ DTE and
`HOLDING_SHARES` positions show no flag.

## Supporting Documents

Read these before starting implementation:

- **User Story & Acceptance Criteria:** `docs/epics/07-stories/US-61-expiring-soon-flags.md`
- **Mockup:** `mockups/us-61-expiring-soon-flags.mdx`
- **Research & Design Decisions:** `plans/us-61/research.md`
- **Data Model & Display Rules:** `plans/us-61/data-model.md`
- **Quickstart & Verification:** `plans/us-61/quickstart.md`

_No `contracts/` — US-61 adds no IPC surface (pure renderer, reuses
`positions:list` / `usePositions()` unchanged, per US-51 and US-60)._

## Prerequisites

None new. All required infrastructure already exists:

- `isDteUrgent` / `DTE_URGENT_THRESHOLD = 7` — `src/renderer/src/lib/dte.ts`.
- `PositionListItem.dte` and `CalendarEntry.dte` already carry server-computed
  DTE; `HOLDING_SHARES` already excluded from the calendar by `toCalendarEntries`.
- Gold design tokens (`--wb-gold`, `--wb-gold-dim`, `--wb-gold-border`,
  `--wb-gold-subtle`) and their Tailwind utilities.
- Existing gold DTE _text_ emphasis on dashboard rows, day-detail, and agenda.

## Implementation Areas

Ordered by dependency: the shared flag component first, then the two surfaces
that consume it, then the cell-level grid highlight, then e2e.

### 1. Shared `ExpiringSoonFlag` component

**Files to create or modify:**

- `src/renderer/src/components/ExpiringSoonFlag.tsx` — new presentational gold pill.
- `src/renderer/src/components/ExpiringSoonFlag.test.tsx` — new test.

**Red — tests to write (`ExpiringSoonFlag.test.tsx`):**

- `renders the label "Expiring soon"` — `render(<ExpiringSoonFlag />)`;
  `expect(screen.getByText(/expiring soon/i)).toBeInTheDocument()`.
- `exposes a stable test id` — `screen.getByTestId('expiring-soon-flag')` present.
- `uses gold design tokens` — the flag element's `className` contains
  `text-wb-gold` and `bg-wb-gold-dim` (and `border-wb-gold-border`).
- `supports a compact size variant` — `render(<ExpiringSoonFlag compact />)`
  still renders the label and testid (asserts the prop is accepted and the
  smaller text/padding class is applied).

**Green — implementation:**

- Build `ExpiringSoonFlag({ compact = false }: { compact?: boolean })` returning
  a `<span data-testid="expiring-soon-flag">` styled like the mockup's
  `ExpiringSoonFlag` and `TargetBadge.tsx:24`: `inline-flex items-center gap-[5px]
rounded-full font-wb-mono font-bold uppercase tracking-[0.09em] bg-wb-gold-dim
text-wb-gold border border-wb-gold-border`, with `compact` swapping the
  padding/text-size (`text-[0.58rem] px-[7px] py-[1px]` vs
  `text-[0.62rem] px-2 py-0.5`). Include the small gold dot
  (`w-[5px] h-[5px] rounded-full bg-wb-gold`) and the literal text
  `Expiring soon`. Tailwind tokens only — no inline `style`.

**Refactor — cleanup to consider:**

- Confirm token/class parity with `TargetBadge`; keep the pill minimal. Check for
  duplication and naming consistency.

**Acceptance criteria covered:** Supports the "prominent gold flag" required by
the dashboard and calendar scenarios (shared, consistent language).

---

### 2. Dashboard row flag (`PositionRow`)

**Files to create or modify:**

- `src/renderer/src/components/PositionCard.tsx` — render the flag + row tint.
- `src/renderer/src/components/PositionCard.test.tsx` — add cases.

**Red — tests to write (`PositionCard.test.tsx`):**

- `shows the expiring-soon flag when DTE <= 7` — `renderRow` with
  `{ ...BASE_ITEM, dte: 7 }`; `screen.getByTestId('expiring-soon-flag')` present.
- `does not show the flag at 8 DTE` — `{ ...BASE_ITEM, dte: 8 }`;
  `screen.queryByTestId('expiring-soon-flag')` is null (DTE cell still renders `8d`).
- `does not show the flag when DTE is null` — `{ ...BASE_ITEM, dte: null,
expiration: null }` (holding-shares shape); no flag; DTE cell renders `—`.
- `tints the row gold when expiring soon` — with `dte: 7`, the `<tr>`
  (`data-testid="position-card"`) `className` contains `bg-wb-gold-subtle` and
  `border-l-wb-gold`; with `dte: 8` it contains neither.

**Green — implementation:**

- Reuse the existing `dteUrgent = isDteUrgent(item.dte)` value
  (`PositionCard.tsx:67`).
- In the ticker cell (`PositionCard.tsx:100-117`), after the pending-assignment
  dot / `TargetBadge`, render `{dteUrgent && <ExpiringSoonFlag compact />}` so it
  sits beside the ticker — matching the mockup's dashboard row.
- On the `<tr>` (`PositionCard.tsx:90-97`), append conditional classes when
  `dteUrgent`: `bg-wb-gold-subtle border-l-wb-gold` (the `.wb-position-row` base
  supplies the 3px left-border width/style; the utility overrides only the
  color). Keep the existing gold DTE `dteClass` unchanged.

**Refactor — cleanup to consider:**

- Keep the conditional class string readable (build via a small array + join if
  it grows). Ensure the flag does not double up with the pending-assignment dot
  visually. Check duplication/naming.

**Acceptance criteria covered:**

- "Dashboard highlights positions with 7 DTE or less" — AAPL at 7 DTE shows the
  gold flag, visible regardless of any queue item.
- "Positions outside the threshold are not flagged" — NVDA at 8 DTE: no flag.
- "Holding-shares positions are not flagged" — TSLA (`dte: null`): no flag.

---

### 3. Calendar day-detail flag (`CalendarDayDetail` / `EntryCard`)

**Files to create or modify:**

- `src/renderer/src/components/CalendarDayDetail.tsx` — flag + gold card border.
- `src/renderer/src/components/CalendarDayDetail.test.tsx` — add cases.

**Red — tests to write (`CalendarDayDetail.test.tsx`):**

- `labels an expiring-soon entry with the flag` — an entry `makeEntry({ dte: 4 })`
  in a selected day; `screen.getByTestId('expiring-soon-flag')` present and DTE
  renders `text-wb-gold` (existing behaviour, keep asserting `4d`).
- `does not flag an entry outside the threshold` — `makeEntry({ dte: 8 })`;
  `screen.queryByTestId('expiring-soon-flag')` is null.

**Green — implementation:**

- In `EntryCard` (`CalendarDayDetail.tsx:15-62`) compute
  `const soon = isDteUrgent(entry.dte)`.
- Render `{soon && <ExpiringSoonFlag />}` in the card header area (below the
  ticker / `PhaseBadge` row at `:29-34`), matching the mockup's day-detail card.
- When `soon`, switch the card border to gold: make the border class conditional
  (`border-wb-gold-border` when `soon`, else `border-wb-border`) while keeping the
  phase-colored left border `style`. DTE gold text already handled at `:44`.

**Refactor — cleanup to consider:**

- Keep the flag placement consistent with the dashboard (same component, same
  label). Check duplication/naming consistency.

**Acceptance criteria covered:**

- "Calendar highlights expiring-soon positions" (partial) — the day detail panel
  labels MSFT as "Expiring soon".

---

### 4. Calendar month-grid cell highlight (`CalendarMonthGrid` / `DayCellView`)

**Files to create or modify:**

- `src/renderer/src/components/CalendarMonthGrid.tsx` — cell-level gold highlight
  - `SOON` marker.
- `src/renderer/src/components/CalendarMonthGrid.test.tsx` — add cases.

**Red — tests to write (`CalendarMonthGrid.test.tsx`):**

- `rings a day cell that has an expiring-soon entry` — build a grid whose cell has
  an entry with urgent `dte` (fixtures default to `dte: 6`); the
  `day-cell-<iso>` element's `className` contains `ring-wb-gold` and
  `bg-wb-gold-subtle`, and the cell shows the `SOON` marker text.
- `does not ring a cell whose entries are all outside the threshold` — a cell with
  only a `dte: 8` entry: `className` contains neither the gold ring nor
  `bg-wb-gold-subtle`, and no `SOON` marker.
- `today cell shows TODAY, not SOON, even when urgent` — a cell that is both today
  and urgent renders the `TODAY` marker and not a duplicate `SOON` marker (mockup
  precedence: TODAY wins the header slot).

**Green — implementation:**

- In `DayCellView` (`CalendarMonthGrid.tsx:20-62`) compute
  `const isSoon = cell.entries.some((e) => isDteUrgent(e.dte))` (import
  `isDteUrgent` from `../lib/dte`).
- Add to the cell `className` array (`:32-39`), independent of `isSelected`, when
  `isSoon`: `'bg-wb-gold-subtle ring-1 ring-inset ring-wb-gold'` (reusing the
  exact selected-cell treatment). Selected + soon should not conflict — both
  resolve to the same gold ring.
- In the day-number header row (`:41-53`), after the `TODAY` marker, render a
  `SOON` marker `{!cell.isToday && isSoon ? <span className="font-wb-mono
text-[0.55rem] tracking-[0.1em] text-wb-gold">SOON</span> : null}` — matching
  the mockup (TODAY takes precedence in the same slot).
- Leave `CalendarChip` unchanged (cell-level highlight per research ADR).

**Refactor — cleanup to consider:**

- Consider a small local `isSoon` const shared with the header marker to avoid
  recomputing. Ensure the ring class isn't duplicated when a cell is both
  selected and soon. Check naming consistency with `isSelected`.

**Acceptance criteria covered:**

- "Calendar highlights expiring-soon positions" (partial) — the MSFT date cell
  shows an expiring-soon highlight.
- "Positions outside the threshold are not flagged" (calendar side) — an 8-DTE
  cell gets no highlight.

---

### 5. E2e Tests

**Files to create or modify:**

- `e2e/expiring-soon-flags.spec.ts` — new Playwright `_electron` spec, one test
  per AC.
- Reuse `e2e/calendar-helpers.ts` (`futureDate(N)`, IPC seeding helpers) from
  US-60.

**Setup:** seed via the IPC bridge (mirroring `e2e/expiration-calendar.spec.ts`)
with relative expirations so DTE is deterministic:

- AAPL — `CSP_OPEN`, expiration `futureDate(7)` ⇒ 7 DTE.
- MSFT — `CC_OPEN` (create → assign → open covered call), expiration
  `futureDate(4)` ⇒ 4 DTE.
- NVDA — `CC_OPEN`, expiration `futureDate(8)` ⇒ 8 DTE.
- TSLA — `HOLDING_SHARES` (create CSP → assign, no covered call), no active
  option expiration.

**Red — tests to write (one per AC, name mirrors the AC):**

- `Dashboard highlights positions with 7 DTE or less` — on the positions table,
  the AAPL row shows the `expiring-soon-flag`; assert it is present even though
  AAPL has no management-queue item open.
- `Calendar highlights expiring-soon positions` — navigate to the calendar month
  containing MSFT's expiration; the MSFT date cell has the expiring-soon
  highlight (`ring-wb-gold` / `SOON` marker); click the cell and the day-detail
  panel shows MSFT labelled with the `expiring-soon-flag` ("Expiring soon").
- `Positions outside the threshold are not flagged` — NVDA (8 DTE) shows **no**
  `expiring-soon-flag` on the dashboard row, and its calendar day cell has **no**
  expiring-soon highlight/`SOON` marker.
- `Holding-shares positions are not flagged` — TSLA shows no `expiring-soon-flag`
  on the dashboard, and does not appear on the calendar at all (no option
  expiration).

**Green — implementation:**

- Areas 1–4 already implement the behaviour; wire the spec to the running app and
  the seeded fixtures, asserting via the `expiring-soon-flag` testid, the day-cell
  ring classes, and the `SOON` / "Expiring soon" text.

**Refactor — cleanup to consider:**

- Factor shared seeding into `calendar-helpers.ts` if it duplicates US-60. Use
  relative `futureDate` offsets (never hardcoded dates) so the suite doesn't rot.

**Acceptance criteria covered:** All four story scenarios (one e2e test each).

## AC Audit

| AC scenario (US-61)                               | Covered by e2e test (Area 5)                        |
| ------------------------------------------------- | --------------------------------------------------- |
| Dashboard highlights positions with 7 DTE or less | `Dashboard highlights positions with 7 DTE or less` |
| Calendar highlights expiring-soon positions       | `Calendar highlights expiring-soon positions`       |
| Positions outside the threshold are not flagged   | `Positions outside the threshold are not flagged`   |
| Holding-shares positions are not flagged          | `Holding-shares positions are not flagged`          |

All four ACs map to exactly one named e2e test. No uncovered ACs.
