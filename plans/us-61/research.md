# Research: US-61 — Flag positions expiring within 7 days

## Story recap

Add a persistent, factual "Expiring soon" visual flag (gold) for active option
positions at **DTE ≤ 7**, on both the **dashboard** (positions table) and the
**expiration calendar** (month grid + day detail). This is a **display rule on
current DTE**, not a dismissible alert record. Out of scope: configurable
thresholds, sub-thresholds (3/1/0 DTE), external notifications.

## Key finding: almost all infrastructure already exists

This is a **pure renderer** story. No IPC, service, engine, migration, schema,
or new data field is required.

- **`isDteUrgent` / `DTE_URGENT_THRESHOLD` already exist** —
  `src/renderer/src/lib/dte.ts`: `DTE_URGENT_THRESHOLD = 7`,
  `isDteUrgent(dte) => dte !== null && dte <= 7`. This is the exact predicate
  the story needs; no new helper is required.
- **Gold DTE _text_ emphasis already ships** on all three DTE render sites via
  `isDteUrgent`:
  - `src/renderer/src/components/PositionCard.tsx:67-70` (`dteClass` → gold + semibold)
  - `src/renderer/src/components/CalendarDayDetail.tsx:44` (DTE value → `text-wb-gold`)
  - `src/renderer/src/components/CalendarAgenda.tsx:20` (agenda DTE → gold)
- **Data already carries DTE everywhere it's needed.** `PositionListItem`
  (`src/renderer/src/api/positions.ts`) has `dte: number | null`; the calendar's
  `CalendarEntry` (`src/renderer/src/lib/expiration-calendar.ts`) carries `dte`
  on every entry. DTE is server-computed. `HOLDING_SHARES` positions have
  `expiration: null` / `dte: null` and are already excluded from the calendar by
  `toCalendarEntries` (filters `status === 'ACTIVE' && expiration != null`).

## Gap analysis — what US-61 must add

1. A distinct **"Expiring soon" flag pill** — does not exist anywhere. Grep for
   `expiring`/`Expiring` finds only the agenda "N expiring" count label.
2. **Dashboard row** emphasis beyond the existing gold DTE text: the mockup pins
   an `Expiring soon` pill in the ticker cell and tints the whole row gold
   (gold-subtle background + gold left border).
3. **Calendar month-grid day cell** highlight: a gold ring + gold-subtle
   background + a `SOON` marker on any day cell containing an urgent entry.
   Currently only the _selected_ cell gets a gold ring; there is no
   urgency-driven ring.
4. **Calendar day-detail card** flag: the mockup adds the `Expiring soon` pill
   and a gold card border to urgent entries (DTE gold text already present).

The month-grid **chips** and the **agenda** view need no change — the mockup
keeps chips phase-colored and highlights at the _cell_ level, and the agenda is
outside both AC scenarios (it already golds its DTE text).

## Design tokens (all present — Tailwind v4 CSS-first, no config file)

`src/renderer/src/index.css` defines and exposes to Tailwind: `--wb-gold`
(`#e6a817`), `--wb-gold-dim`, `--wb-gold-border`, `--wb-gold-subtle`. Utilities
`text-wb-gold`, `bg-wb-gold-dim`, `border-wb-gold-border`, `bg-wb-gold-subtle`,
`ring-wb-gold`, `border-l-wb-gold` are all in active use. The `.wb-position-row`
class (`index.css:210`) sets a transparent 3px left border that only shows the
phase color on hover — a conditional `border-l-wb-gold` utility overrides just
the color while keeping the 3px width/style.

## Existing visual precedents to model on

- `TargetBadge.tsx:24` — gold pill: `font-wb-mono text-[0.6rem] font-bold
tracking-[0.1em] px-2 py-0.5 rounded-[10px] bg-wb-gold-dim text-wb-gold border
border-wb-gold-border`. The `ExpiringSoonFlag` pill should mirror this.
- Pending-assignment gold dot `PositionCard.tsx:104-110` — same ticker-cell slot
  the flag will occupy, with a `data-testid` + `aria-label` pattern to copy.
- Selected-cell gold ring `CalendarMonthGrid.tsx:36` — the exact
  `bg-wb-gold-subtle ring-1 ring-inset ring-wb-gold` treatment to reuse for the
  expiring-soon cell ring.

## Architecture Decisions

### ADR: Reuse the existing `isDteUrgent` predicate; add no new threshold or helper

- **Decision:** Drive every US-61 flag off the existing
  `isDteUrgent`/`DTE_URGENT_THRESHOLD = 7` in `src/renderer/src/lib/dte.ts`. Do
  not introduce a new "expiring soon" constant or predicate.
- **Why:** The story's threshold (≤ 7 DTE) is byte-for-byte the existing urgent
  predicate that already golds DTE text across dashboard, calendar day-detail,
  and agenda. A second constant would risk the two drifting and duplicates a
  single source of truth. The mockup itself is authored against `isDteUrgent` /
  `DTE_URGENT_THRESHOLD`.
- **Alternatives considered:** A dedicated `isExpiringSoon`/`EXPIRING_SOON_DTE`
  in a new module — rejected as redundant with an identical existing predicate;
  the "Out of scope: configurable thresholds" line means there is no future
  divergence to prepare for.

### ADR: One shared `ExpiringSoonFlag` component reused on both surfaces

- **Decision:** Create a single `src/renderer/src/components/ExpiringSoonFlag.tsx`
  gold pill and render it in both the dashboard `PositionRow` and the calendar
  `CalendarDayDetail` `EntryCard`.
- **Why:** The Technical Notes require identical warning language across
  dashboard and calendar so traders don't learn two dialects. A shared component
  guarantees the label text, tokens, and `data-testid` stay in lockstep and is
  the same "reuse the shared badge, don't hand-roll inline markup" pattern US-51
  used for `PhaseBadge`/`UrgencyPill`.
- **Alternatives considered:** Inline pill markup at each site — rejected: it
  duplicates styling, drifts over time, and violates the
  Tailwind-tokens-not-inline-styles rule when copied from the mockup's inline
  `style`. Extending `TargetBadge` — rejected: different concept (profit target
  vs expiration), different label; conflating them reads poorly.

### ADR: Cell-level highlight on the month grid, not per-chip

- **Decision:** On the month grid, apply the expiring-soon treatment (gold ring +
  `bg-wb-gold-subtle` + a `SOON` marker) to the **day cell** when any of its
  entries is urgent. Leave `CalendarChip` phase-colored and unchanged.
- **Why:** Matches the mockup (`dayHasSoon` gates a cell-level ring + `SOON`
  label; chips keep phase color) and the AC wording "the MSFT chip or date cell
  shows an expiring-soon highlight." Cell-level reads at a glance without making
  dense weeks noisy, and reuses the existing selected-cell ring treatment.
- **Alternatives considered:** Per-chip gold ring — rejected: noisier, fights the
  phase-color language chips already carry, and not what the mockup shows.

### ADR: Persistent gold left border + gold-subtle row tint via Tailwind utilities

- **Decision:** For an urgent dashboard row, add `bg-wb-gold-subtle` and
  `border-l-wb-gold` conditionally on the `<tr>` (the existing `.wb-position-row`
  supplies the 3px width/style; the utility overrides only the color).
- **Why:** Token-based, no inline `style`, faithful to the mockup's gold row
  tint + left rail. Keeps the change to conditional class strings.
- **Alternatives considered:** Repurposing `--wb-row-phase-color` to gold when
  urgent — rejected: that CSS var carries phase semantics and only shows on
  hover, so it would neither persist nor read as an expiration signal.

## Open Questions

None. Story, mockup, tokens, predicate, and render sites are all resolved.
