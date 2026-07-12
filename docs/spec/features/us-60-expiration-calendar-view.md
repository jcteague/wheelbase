# US-60: Expiration Calendar View (Month Grid + Agenda)

<!-- generated:from us-60 -->

## Summary

US-60 adds an **Expiration Calendar** page (`#/calendar`) that plots active option expirations by date, color-coded by wheel phase, so a trader can spot clustering before it becomes urgent. It ships two selectable layouts — **Month Grid** (month-scoped, navigable, with a day-detail side panel and `+N more` overflow) and **Agenda** (a rolling horizon anchored at today — upcoming expirations over the next 30 days grouped by week, with a density bar and a "BUSY WEEK" flag). The selected layout is persisted in `localStorage` and restored on the next visit. The feature is pure renderer: it reuses the existing `positions:list` data via `usePositions()` and derives everything client-side — no new IPC, service, engine, or migration.

## Acceptance criteria

```gherkin
Background:
  Given the trader opens the Expiration Calendar page
  And active positions have expiration dates and wheel phases

Scenario: Calendar shows expirations on the correct dates with phase colors
  Given the active positions are:
    | ticker | phase            | expiration  |
    | AAPL   | CSP_OPEN         | 2026-08-14  |
    | MSFT   | CC_OPEN          | 2026-08-14  |
    | TSLA   | HOLDING_SHARES   | —           |
  When the calendar month view loads
  Then the August 14 cell shows AAPL in the CSP color
  And the August 14 cell shows MSFT in the CC color
  And TSLA does not appear on the calendar because it has no active option expiration

Scenario: Selecting a populated date shows that day's positions in a side panel
  Given August 14 has two expirations
  When the trader clicks August 14
  Then the day detail panel lists AAPL and MSFT
  And each list row shows ticker, phase, strike, and DTE

Scenario: Overflow indicator appears when more expirations exist than fit in one date cell
  Given August 21 has 5 expirations
  When the calendar renders August 21
  Then the cell shows the first visible positions
  And the cell shows "+2 more" for the hidden entries

Scenario: Empty month state renders cleanly
  Given there are no active option expirations in September 2026
  When the trader navigates to September 2026
  Then the page shows "No expirations this month"
  And the month grid still renders without position chips
```

The rolling **Agenda** layout is a user-requested addition beyond these four ACs — it is unit/component-tested rather than covered by a named e2e scenario.

## What was built

**Pure derivation layer** (`src/renderer/src/lib/expiration-calendar.ts`). `toCalendarEntries` filters `usePositions()`'s data to `status === 'ACTIVE' && expiration != null` (which automatically excludes `HOLDING_SHARES` positions — the phase-aware active-leg join already guarantees `expiration` is non-null exactly for `CSP_OPEN`/`CC_OPEN`). `groupByExpiration` keys entries by ISO date. `buildMonthGrid(viewMonth, byDate, today)` builds a `DayCell[][]` from `startOfWeek(startOfMonth(viewMonth))` through `endOfWeek(endOfMonth(viewMonth))` — the row count is **not** a fixed 6×7; it varies with the month's calendar shape (5 or 6 weeks). `buildAgendaWeeks(entries, today, horizonDays = AGENDA_HORIZON_DAYS)` filters to `today <= expiration <= today + horizonDays`, groups into ISO weeks, and flags `isBusy` at `total >= BUSY_WEEK_THRESHOLD`. `visibleChips(entries, limit = CHIP_LIMIT)` splits a cell's entries into `visible` (max 3) and `hiddenCount`.

**Shared leaf components.** `CalendarChip` (compact ticker pill, phase-tinted via inline `style` — the same allowed dynamic-color exception `PhaseBadge` uses), `CalendarViewToggle` (two-option `'grid' | 'agenda'` segmented control), `CalendarMonthNav` (‹/› + month label + Today pill), `CalendarLegend` (Sell Put/Sell Call dots + a muted "Holding (off-calendar)" note).

**Month Grid layout.** `CalendarMonthGrid` renders a `Sun..Sat` header and the built grid; each populated cell shows up to `CHIP_LIMIT` chips via `visibleChips` plus a `+{hiddenCount} more` line; a selected populated cell gets a gold ring; `emptyMonth` still renders every cell plus a "No expirations this month" message. `CalendarDayDetail` is the side panel — per-entry cards with a phase-colored left border, `PhaseBadge`, STRIKE/DTE/EXPIRES fields, and a "Review position →" button that navigates via wouter.

**Agenda layout.** `CalendarAgenda` renders one card per `AgendaWeek` (label + range, a `WeekDensityBar`, an "N expiring" count, a "BUSY WEEK" badge when busy), with one row per day and a mono `ticker · PhaseBadge · strike · DTE` line per entry; an empty `weeks` array renders a "No expirations in the next 30 days" card. `WeekDensityBar` renders a thin gold/violet bar sized by CSP/CC entry counts (a genuinely dynamic segment width, the other allowed inline-`style` exception).

**Page + persistence + routing.** `useCalendarView()` (`src/renderer/src/hooks/useCalendarView.ts`) reads/writes `localStorage['wb.calendar.view']`, defaulting to `'grid'` for an absent or invalid stored value. `CalendarPage` composes `PageLayout`/`PageHeader` (title + `CalendarViewToggle` + `MarketStatusPill`, wired exactly like `PositionsListPage`'s `useSettingsStatus()` → `hasBroker` → `useMarketStatus(hasBroker)` → `deriveMarketStatusDisplay()`, with `stale` hardcoded `false` since the page never fetches stock quotes) and a view-dependent sub-header: grid → `CalendarMonthNav` + `CalendarLegend`; agenda → a static "Management Horizon · Next 30 Days" label + `CalendarLegend` (month nav hidden). State: `view` (persisted), `viewMonth` and `selectedDate` (ephemeral `useState`); `today` is frozen once per mount (`useMemo(() => new Date(), [])`) so the `grid`/`weeks` `useMemo`s stay correctly memoized without an `eslint-disable`. `src/renderer/src/App.tsx` registers the `/calendar` route, a sidebar `NavItem`, and a `ShellHeader` title case.

**E2E coverage** (`e2e/expiration-calendar.spec.ts`, `e2e/calendar-helpers.ts`). One test per AC scenario, seeding positions directly through the IPC bridge (`window.api.createPosition`/`assignPosition`/`openCoveredCall`) rather than walking the UI entry forms — mirroring the pattern in `e2e/option-pnl.spec.ts`. Dates are relative offsets (`futureDate(N)`) so the suite doesn't rot; `navigateToMonthOf` computes the month delta with `date-fns` `differenceInCalendarMonths` and clicks the month-nav buttons that many times.

## Architecture decisions

- **Reuse `positions:list` via `usePositions()`; no new IPC, service, engine, or migration.** `PositionListItem` already carries every field the calendar needs (`ticker`, `phase`, `strike`, `expiration`, `dte`, `id`), with DTE server-computed and the `HOLDING_SHARES` exclusion already implied by the phase-aware active-leg join. A dedicated `calendar:list` endpoint would duplicate `positions:list`'s data for a trivial renderer-side grouping transform; a separate query key was also rejected since it would fork or double-fetch the shared cache.
- **Grid stays month-scoped; Agenda is a rolling horizon anchored at today, not `viewMonth`-scoped.** The user explicitly wanted a rolling agenda so a cluster straddling a month boundary isn't split; the month nav is hidden entirely while the agenda is active.
- **Layout choice persists via a dedicated `useCalendarView` hook reading/writing `localStorage`,** not the settings table or ephemeral state. A `localStorage`-backed UI preference needs no IPC round-trip or DB migration and is trivially unit-testable with a mocked `localStorage`; isolating the read/write in one hook keeps `CalendarPage` free of persistence detail.
- **Chip overflow caps at `CHIP_LIMIT = 3` per date cell**, with the day-detail panel showing the full list for the selected date — matches the mockup's `slice(0, 3)` and keeps dense weeks readable at a glance rather than letting cells scroll or grow.
- **`CalendarChip`'s dot was deliberately left independent of `PhaseBadge`'s dot** (not factored into a shared sub-component) — a chip and a badge are different concepts; abstracting them was judged not to read cleanly.
- **`buildMonthGrid`'s row count is not a fixed 6×7 invariant** — it depends on the specific month's calendar shape. An early e2e assertion incorrectly assumed a hardcoded 42-cell grid for every month; fixed to assert `cellCount % 7 === 0 && cellCount >= 28` instead.

## Contracts touched

None. No new IPC channel, event, or Zod schema — this story reuses the existing `positions:list` channel / `usePositions()` hook unchanged. See [IPC handlers](../contracts/ipc-handlers.md) for the unmodified `positions:list` contract.

## Source files

- `src/renderer/src/lib/expiration-calendar.ts`
- `src/renderer/src/components/CalendarChip.tsx`
- `src/renderer/src/components/CalendarViewToggle.tsx`
- `src/renderer/src/components/CalendarMonthNav.tsx`
- `src/renderer/src/components/CalendarLegend.tsx`
- `src/renderer/src/components/CalendarMonthGrid.tsx`
- `src/renderer/src/components/CalendarDayDetail.tsx`
- `src/renderer/src/components/CalendarAgenda.tsx`
- `src/renderer/src/components/WeekDensityBar.tsx`
- `src/renderer/src/hooks/useCalendarView.ts`
- `src/renderer/src/pages/CalendarPage.tsx`
- `src/renderer/src/App.tsx` — `/calendar` route, `NavItem`, `ShellHeader` title case
- `e2e/expiration-calendar.spec.ts`
- `e2e/calendar-helpers.ts`

<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
