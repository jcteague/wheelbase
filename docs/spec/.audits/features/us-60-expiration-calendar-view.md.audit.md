---
page: docs/spec/features/us-60-expiration-calendar-view.md
audited_at: 2026-09-28
findings: 26
---

# Audit: docs/spec/features/us-60-expiration-calendar-view.md

## Verified (19)

- ✓ All 14 listed source files exist, as does `e2e/option-pnl.spec.ts`, which is cited as the seeding pattern. The linked `../contracts/ipc-handlers.md` exists.
- ✓ `toCalendarEntries` filters `status === 'ACTIVE' && expiration != null` — `src/renderer/src/lib/expiration-calendar.ts:51-53`
- ✓ `groupByExpiration` is at `expiration-calendar.ts:64`. `buildMonthGrid(viewMonth, byDate, today)` spans `startOfWeek(startOfMonth)` through `endOfWeek(endOfMonth)` with no fixed 6×7 grid — `:72-78`
- ✓ `buildAgendaWeeks(entries, today, horizonDays = AGENDA_HORIZON_DAYS)` filters `today <= expiration <= today + horizon` and sets `isBusy: total >= BUSY_WEEK_THRESHOLD` — `expiration-calendar.ts:92-130`
- ✓ `visibleChips(entries, limit = CHIP_LIMIT)` returns `{ visible, hiddenCount }` — `expiration-calendar.ts:134-142`. `CHIP_LIMIT = 3` and `AGENDA_HORIZON_DAYS = 30` — `:16,18`
- ✓ `CalendarChip` tints by phase with inline `style` — `src/renderer/src/components/CalendarChip.tsx:19-21`
- ✓ `CalendarViewToggle` offers `'grid' | 'agenda'` ("Month Grid" / "Agenda") — `CalendarViewToggle.tsx:1,9-10`
- ✓ `CalendarMonthNav` has ‹/› and Today — `CalendarMonthNav.tsx:20-31`
- ✓ `CalendarLegend` shows CSP/CC dots from `PHASE_LABEL` (CSP_OPEN = "Sell Put" per `src/renderer/src/lib/phase.test.ts:20`) and a "Holding (off-calendar)" note — `CalendarLegend.tsx:23-34`
- ✓ `CalendarMonthGrid` has a Sun..Sat header (`:6`), uses `visibleChips(…, CHIP_LIMIT)` (`:23`), shows `+{hiddenCount} more` (`:62`), puts a gold ring on the selected cell (`:38`) and shows "No expirations this month" (`:99`)
- ✓ `CalendarDayDetail` has a phase-colored left border (`:29`), `PhaseBadge` (`:35`), STRIKE/DTE/EXPIRES fields (`:44-56`) and a "Review position →" button (`:65`). Navigation goes through wouter `setLocation` in `CalendarPage.tsx:26,95`
- ✓ `CalendarAgenda` has a `WeekDensityBar` (`:77`), "N expiring" (`:79`), "BUSY WEEK" (`:72`) and "No expirations in the next 30 days" (`:95`)
- ✓ `WeekDensityBar` uses gold/violet segments with dynamic inline `flexGrow` — `WeekDensityBar.tsx:14,17`
- ✓ `useCalendarView` reads and writes `localStorage['wb.calendar.view']` and defaults to `'grid'` when the value is invalid — `src/renderer/src/hooks/useCalendarView.ts:5-20`
- ✓ `CalendarPage` uses `PageLayout`/`PageHeader`/`MarketStatusPill` and `usePositions()`. It keeps `view` persisted and `viewMonth`/`selectedDate` in `useState`. The agenda label reads "Management Horizon · Next 30 Days" — `src/renderer/src/pages/CalendarPage.tsx:27-31,50-80`
- ✓ `App.tsx` registers the `/calendar` route (`:105`), a sidebar NavItem (`:50-53`) and a shell title for `/calendar` (`:22`)
- ✓ `e2e/expiration-calendar.spec.ts` has one test per AC scenario (lines 70, 99, 124, 148). The grid assertion is `cellCount % 7 === 0 && cellCount >= 28` (`:168-170`)
- ✓ `e2e/calendar-helpers.ts` seeds through `window.api.createPosition`/`assignPosition`/`openCoveredCall` (`:34,51,87`). It has `futureDate(N)` (`:5`) and a `navigateToMonthOf` that uses `differenceInCalendarMonths` (`:139-147`)
- ✓ No new IPC channel: `CalendarPage` reads data only via `usePositions()`

## Drift (4)

- ✗ Page says the market-status pill is wired "exactly like `PositionsListPage`'s `useSettingsStatus()` → `hasBroker` → `useMarketStatus(hasBroker)` → `deriveMarketStatusDisplay()`, with `stale` hardcoded `false`". Both pages now call the shared `useMarketStatusDisplay()` hook (`CalendarPage.tsx:33`, `PositionsListPage.tsx:181`). The hook gates on `hasMarketData` (market-data credentials), not `hasBroker` (`src/renderer/src/hooks/useMarketStatusDisplay.ts:19-23`). This matters because the page states a broker dependency the code no longer has.
- ✗ Page says `today` is frozen once per mount (`useMemo(() => new Date(), [])`). It now comes from `useToday()`, which is midnight-normalized and rolls over at midnight via a timeout — `CalendarPage.tsx:35`, `src/renderer/src/hooks/useToday.ts:10-20`. `useToday.ts` is not in Source files.
- ✗ Page says `App.tsx` adds "a `ShellHeader` title case". Shell titles now come from a `PAGE_TITLES` route map (`'/calendar': CALENDAR_PAGE_TITLE`) — `src/renderer/src/App.tsx:18-23`. This is minor and suggests a wording change.
- ✗ Page says `buildAgendaWeeks` "groups into ISO weeks". It groups by date-fns `startOfWeek` with the default Sunday start, not ISO Monday weeks — `expiration-calendar.ts:110-116`. This is minor.

## Unverifiable (3)

- ? The claim that the Agenda was a "user-requested addition beyond these four ACs" is history.
- ? The claim that `CalendarChip`'s dot was "deliberately left independent of `PhaseBadge`" is design rationale.
- ? The claim that "an early e2e assertion incorrectly assumed a 42-cell grid" is history. The current assertion is verified above.

## Missing files (0)

None.
