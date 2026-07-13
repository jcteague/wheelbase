# US-61 — Flag positions expiring within 7 days — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off

> Note for all Red tasks touching calendar components: existing `makeEntry`
> fixtures default to `dte: 6` (already urgent). Override `dte` to `8`/`42` for
> negative cases.

---

## Layer 1 — Foundation (no dependencies)

> These areas can be started immediately and run in parallel. Area 4 does **not**
> depend on the `ExpiringSoonFlag` component — it uses a cell-level ring + `SOON`
> marker, not the flag pill.

### ExpiringSoonFlag component

- [x] **[Red]** Write failing tests — `src/renderer/src/components/ExpiringSoonFlag.test.tsx`
  - Test cases:
    - renders the label "Expiring soon" (`getByText(/expiring soon/i)`)
    - exposes `data-testid="expiring-soon-flag"`
    - className contains `text-wb-gold`, `bg-wb-gold-dim`, `border-wb-gold-border`
    - `compact` variant still renders label + testid (applies smaller text/padding)
  - Run `pnpm test ExpiringSoonFlag` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/ExpiringSoonFlag.tsx` _(depends on: ExpiringSoonFlag component Red ✓)_
  - `ExpiringSoonFlag({ compact = false }: { compact?: boolean })` → `<span data-testid="expiring-soon-flag">`
  - Styled like `TargetBadge.tsx:24` + mockup: `inline-flex items-center gap-[5px] rounded-full font-wb-mono font-bold uppercase tracking-[0.09em] bg-wb-gold-dim text-wb-gold border border-wb-gold-border`; gold dot + literal `Expiring soon`
  - `compact` swaps padding/text size (`text-[0.58rem] px-[7px] py-[1px]` vs `text-[0.62rem] px-2 py-0.5`). Tailwind tokens only — no inline `style`
  - Run `pnpm test ExpiringSoonFlag` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/ExpiringSoonFlag.tsx` _(depends on: ExpiringSoonFlag component Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Verify token/class parity with `TargetBadge`; keep the pill minimal
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Calendar month-grid cell highlight

- [x] **[Red]** Write failing tests — `src/renderer/src/components/CalendarMonthGrid.test.tsx`
  - Test cases:
    - rings a day cell that has an expiring-soon entry — `day-cell-<iso>` className contains `ring-wb-gold` and `bg-wb-gold-subtle`, and cell shows `SOON` marker
    - does not ring a cell whose entries are all outside the threshold (`dte: 8`) — no gold ring, no `bg-wb-gold-subtle`, no `SOON`
    - today cell shows `TODAY`, not `SOON`, even when urgent
  - Run `pnpm test CalendarMonthGrid` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/CalendarMonthGrid.tsx` _(depends on: Calendar month-grid cell highlight Red ✓)_
  - In `DayCellView`: `const isSoon = cell.entries.some((e) => isDteUrgent(e.dte))` (import `isDteUrgent` from `../lib/dte`)
  - Add `'bg-wb-gold-subtle ring-1 ring-inset ring-wb-gold'` to the cell className array when `isSoon` (independent of `isSelected`; both resolve to the same gold ring)
  - In the day-number header row, after `TODAY`: `{!cell.isToday && isSoon ? <span className="font-wb-mono text-[0.55rem] tracking-[0.1em] text-wb-gold">SOON</span> : null}`
  - Leave `CalendarChip` unchanged
  - Run `pnpm test CalendarMonthGrid` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/CalendarMonthGrid.tsx` _(depends on: Calendar month-grid cell highlight Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Share the `isSoon` const between cell class + header marker; avoid duplicate ring class when selected + soon; name consistently with `isSelected`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — Flag-consuming surfaces (depend on Layer 1)

> Both areas render the shared `ExpiringSoonFlag`. Start after the ExpiringSoonFlag
> component Green is checked off. They run in parallel with each other.

### Dashboard row flag (PositionRow)

**Requires:** ExpiringSoonFlag component Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/components/PositionCard.test.tsx` _(depends on: ExpiringSoonFlag component Green ✓)_
  - Test cases:
    - shows the flag when DTE <= 7 — `renderRow({ ...BASE_ITEM, dte: 7 })`; `getByTestId('expiring-soon-flag')`
    - does not show the flag at 8 DTE — `dte: 8`; `queryByTestId` null; DTE cell still renders `8d`
    - does not show the flag when DTE is null — `dte: null, expiration: null`; no flag; DTE cell renders `—`
    - tints the row gold when expiring soon — `dte: 7`: `<tr>` (`position-card`) className contains `bg-wb-gold-subtle` and `border-l-wb-gold`; `dte: 8`: neither
  - Run `pnpm test PositionCard` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/PositionCard.tsx` _(depends on: Dashboard row flag Red ✓)_
  - Reuse existing `dteUrgent = isDteUrgent(item.dte)` (`:67`)
  - Ticker cell (`:100-117`): after pending-assignment dot / `TargetBadge`, render `{dteUrgent && <ExpiringSoonFlag compact />}`
  - `<tr>` (`:90-97`): append `bg-wb-gold-subtle border-l-wb-gold` when `dteUrgent` (base `.wb-position-row` supplies 3px left-border width/style; utility overrides color only). Keep existing gold `dteClass` unchanged
  - Run `pnpm test PositionCard` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/PositionCard.tsx` _(depends on: Dashboard row flag Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Keep the conditional class string readable; ensure flag doesn't clash with pending-assignment dot
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Calendar day-detail flag (EntryCard)

**Requires:** ExpiringSoonFlag component Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/components/CalendarDayDetail.test.tsx` _(depends on: ExpiringSoonFlag component Green ✓)_
  - Test cases:
    - labels an expiring-soon entry with the flag — `makeEntry({ dte: 4 })`; `getByTestId('expiring-soon-flag')`; DTE still `4d` in gold
    - does not flag an entry outside the threshold — `makeEntry({ dte: 8 })`; `queryByTestId('expiring-soon-flag')` null
  - Run `pnpm test CalendarDayDetail` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/CalendarDayDetail.tsx` _(depends on: Calendar day-detail flag Red ✓)_
  - In `EntryCard`: `const soon = isDteUrgent(entry.dte)`
  - Render `{soon && <ExpiringSoonFlag />}` in the card header area (below ticker/`PhaseBadge` row at `:29-34`)
  - When `soon`, border becomes `border-wb-gold-border` (else `border-wb-border`), keeping the phase-colored left-border `style`. DTE gold text already handled at `:44`
  - Run `pnpm test CalendarDayDetail` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/CalendarDayDetail.tsx` _(depends on: Calendar day-detail flag Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Keep flag placement/label consistent with the dashboard
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — E2E Tests

**Requires:** All Green tasks from Layers 1 & 2 ✓

### E2E Tests

- [x] **[Red]** Write failing e2e tests — `e2e/expiring-soon-flags.spec.ts` _(depends on: all Layer 1 & 2 Green tasks ✓)_
  - Seed via IPC bridge (mirror `e2e/expiration-calendar.spec.ts`, reuse `e2e/calendar-helpers.ts` `futureDate(N)`): AAPL `CSP_OPEN` @ `futureDate(7)` (7 DTE); MSFT `CC_OPEN` @ `futureDate(4)` (4 DTE); NVDA `CC_OPEN` @ `futureDate(8)` (8 DTE); TSLA `HOLDING_SHARES` (no option)
  - One `it()` per AC — test name mirrors AC language:
    - AC-1: Dashboard highlights positions with 7 DTE or less → `it('Dashboard highlights positions with 7 DTE or less')` — AAPL row shows `expiring-soon-flag`, present even with no queue item
    - AC-2: Calendar highlights expiring-soon positions → `it('Calendar highlights expiring-soon positions')` — MSFT date cell has highlight (`ring-wb-gold`/`SOON`); day-detail labels MSFT "Expiring soon"
    - AC-3: Positions outside the threshold are not flagged → `it('Positions outside the threshold are not flagged')` — NVDA (8 DTE) no flag on dashboard, no cell highlight on calendar
    - AC-4: Holding-shares positions are not flagged → `it('Holding-shares positions are not flagged')` — TSLA no flag on dashboard, absent from calendar
  - Run `pnpm test:e2e` — all new tests must fail
- [x] **[Green]** Make e2e tests pass _(depends on: E2E Red ✓)_
  - Behaviour implemented in Layers 1–2; wire spec to seeded fixtures + assert via `expiring-soon-flag` testid, day-cell ring classes, `SOON`/"Expiring soon" text
  - Run `pnpm test:e2e` — all tests must pass
- [x] **[Refactor]** `/refactor` e2e tests _(depends on: E2E Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Factor shared seeding into `calendar-helpers.ts`; use relative `futureDate` offsets only

---

## Completion Checklist

- [x] All Red tasks complete (tests written and failing for right reason)
- [x] All Green tasks complete (all tests passing)
- [x] All Refactor tasks complete (lint + typecheck clean)
- [x] E2E tests cover every AC (4/4)
- [x] `pnpm test && pnpm lint && pnpm typecheck` — all clean
