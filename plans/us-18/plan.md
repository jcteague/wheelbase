---
story: us-18
kind: feature
parent: null
topics: [positions-list, alerts, management-queue]
status: planned
---

# Implementation Plan: US-18 — Display positions as a card grid with live price, option mark, P&L and action strip

## Summary

Replace the ten-column positions table with one card grid. Each wheel renders as a card with
its live price, option mark, unrealized P&L, one leg block, ledger footer, and an action strip
that mirrors the position's open management-queue rows; a PMCC renders as a minimal card in the
same shell until US-108 replaces it. Done means the 22 named e2e cases pass, every pre-existing
list spec stays green with only one header assertion rewritten, and the table, its cells and
its CSS are gone.

## Supporting Documents

- **User Story & Acceptance Criteria:** [OPT-30 / US-18](https://linear.app/optionswheel/issue/OPT-30) (Linear is the authority; the archive `docs/epics/04-stories/US-18-position-cards.md` is its reconciled source)
- **Research & Design Decisions:** `plans/us-18/research.md`
- **Data Model & Type Design:** `plans/us-18/data-model.md`
- **API Contract:** `plans/us-18/contracts/alerts-list.md` (additive `ruleCode`)
- **Quickstart & Verification:** `plans/us-18/quickstart.md`
- **Mockup:** `mockups/epic-09-pmcc-dashboard.mdx` — `WheelCard`, `PositionsGrid`, `CardShell`, `ActionStrip`, `LegTag`, `FootCell`, `PriceBlock`, `QUEUE_ACTION`

## Prerequisites

None — all required schema and infrastructure already exists: `positions:list` with the
`WHEEL | PMCC` union, `alerts:list` and `useManagementQueue`, `useStockQuotes`,
`useOptionSnapshots`, `computeUnrealizedPnl`, `resolveProfitTarget`, `isWideSpread`,
`hasNoBid`, `formatPnlPercentForDisplay`, `isDteUrgent`, `PhaseBadge`, `TargetBadge`,
`ExpiringSoonFlag`, `Badge`, and the `wb-*` colour tokens. No migration.

## Acceptance coverage audit

| #    | Linear scenario → e2e test name (`e2e/position-cards.spec.ts`)          | Areas         |
| ---- | ----------------------------------------------------------------------- | ------------- |
| S1   | The dashboard is one card grid, not a table                             | 6, 7          |
| S2   | The card header names the position, its phase and its live price        | 3, 4, 7       |
| S3   | Unrealized P&L is the card's big figure with its share of max profit    | 4, 7          |
| S4   | Unrealized P&L is red when the option has gained value                  | 4, 7          |
| S5   | The leg block shows the open option                                     | 3, 4, 7       |
| S6   | A position holding shares shows a placeholder leg and no P&L            | 4, 7          |
| S7   | The TARGET badge fires when the leg reaches the profit target           | 4, 7          |
| S8   | DTE inside 7 days is gold with the Expiring-soon flag                   | 4, 7          |
| S9   | A wide spread marks the mid and an unavailable snapshot blanks it       | 3, 4, 7       |
| S10  | The footer shows the two ledger figures                                 | 3, 4, 7       |
| S11  | The management-window row rides on the card as a gold action strip      | 1, 2, 3, 6, 7 |
| S12  | The expiration-imminent row leads as EXPIRING                           | 2, 7          |
| S13a | Strike proximity on a put leads as ▲ STRIKE PROXIMITY — gold at $181.40 | 2, 7          |
| S13b | Strike proximity on a put leads as ▲ STRIKE PROXIMITY — red at $178.90  | 2, 7          |
| S14  | A covered-call breach leads as ▲ CALL BREACHED in red                   | 2, 3, 7       |
| S15  | Several open rows show the worst first with the rest on a +N chip       | 2, 3, 7       |
| S16  | A dismissed row does not ride on the card                               | 6, 7          |
| S17  | The whole card navigates to the detail page                             | 3, 4, 7       |
| S18  | A pending assignment keeps its indicator on the card                    | 4, 7          |
| S19  | A closed position sits in the Closed section without live figures       | 4, 6, 7       |
| S20  | Cards keep the list's sort order                                        | 6, 7          |
| S21  | A PMCC renders as a minimal card in the same shell until US-108         | 5, 6, 7       |

22 named e2e cases. Every scenario is also covered by a unit test in the area listed.

## Implementation Areas

### 1. `ruleCode` on the management-queue read

**Files to create or modify:**

- `src/main/schemas.ts` — `ManagementQueueItem` gains `ruleCode: RuleCode` (import `RuleCode` from `./core/alerts`).
- `src/main/services/alerts.ts` — `listManagementQueue` selects `a.rule_code AS rule_code`; `QueueRow` and `mapQueueRow` carry it.
- `src/main/services/alerts.test.ts` — extend the existing `listManagementQueue` cases.
- `src/main/ipc/alerts.test.ts` — the `alerts:list` envelope case asserts the field.

**Red — tests to write:**

- `alerts.test.ts` › `listManagementQueue`: after upserting an open `MANAGEMENT_WINDOW` and an open `EXPIRATION_IMMINENT` alert on two positions, each returned item's `ruleCode` equals the stored `rule_code` (`toEqual(expect.objectContaining({ ruleCode: 'EXPIRATION_IMMINENT', summary: … }))`), ordering unchanged (high first).
- `alerts.test.ts`: a dismissed and a resolved alert still do not appear (positive control: the open one does).
- `ipc/alerts.test.ts` › `alerts:list`: `{ ok: true, items: [expect.objectContaining({ ruleCode: 'MANAGEMENT_WINDOW' })] }`.
- No property — service/IPC projection, not a core engine.

**Green — implementation:**

- Add `rule_code` to the `SELECT` in `listManagementQueue` (`src/main/services/alerts.ts`), to the private `QueueRow` type, and `ruleCode: row.rule_code` in `mapQueueRow`.
- `ManagementQueueItem.ruleCode: RuleCode` in `src/main/schemas.ts` per `data-model.md` § 1; the preload alias and `api/alerts.ts` need no change.
- DEBUG log unchanged (`management_queue_listed` already logs the count).

**Refactor — cleanup to consider:**

- Check `QueueRow` is still the only hand-written row type in the file; nothing else expected.

**Acceptance criteria covered:** S11 (the strip can name the rule), prerequisite for S12–S16.

### 2. Pure wheel-lane mapping: `rankWheelActions`

**Files to create or modify:**

- `src/renderer/src/lib/card-actions.ts` — `CardTone`, `CardAction`, `QueueRowForCard`, `WHEEL_LANES`, `rankWheelActions`, `formatActionLine`.
- `src/renderer/src/lib/card-actions.test.ts`.

**Red — tests to write:**

- `rankWheelActions([{ ruleCode: 'MANAGEMENT_WINDOW', summary: '10 DTE remaining — review for roll or close' }], { price: '421.50', strike: '430.0000' })` → `[{ glyph: '◷', statusWord: 'MANAGEMENT WINDOW', tone: 'gold', rank: 5, summary: '10 DTE remaining — review for roll or close' }]` (literal).
- `EXPIRATION_IMMINENT` → `◷ EXPIRING gold rank 4`; `COVERED_CALL_BREACH` → `▲ CALL BREACHED red rank 1`.
- `STRIKE_PROXIMITY` tone boundary: price `181.4000` vs strike `180.0000` → gold rank 2; price `178.9000` → red rank 1; price equal to strike (`180.0000`) → gold (not below); `price: null` → gold.
- Ordering: input `[MANAGEMENT_WINDOW, EXPIRATION_IMMINENT, COVERED_CALL_BREACH]` → ranks `[1, 4, 5]`; two rows with equal rank keep input order (stable).
- Dropped codes: `PROFIT_TARGET`, `EARNINGS_PROXIMITY`, `PMCC_ASSIGNMENT_RISK` yield `[]`; a mixed list keeps only the lane rows (positive control in the same test).
- `formatActionLine({ glyph: '◷', statusWord: 'EXPIRING', summary: 'Expires in 4 days at $430.00 strike', … })` → `'◷ EXPIRING · Expires in 4 days at $430.00 strike'`.
- No property — renderer lib over a finite enum, every branch has an example test.

**Green — implementation:**

- `WHEEL_LANES`: an ordered array of `{ ruleCode, glyph, statusWord, tone: (ctx) => CardTone, rank: (tone) => number }` entries for the four codes in `data-model.md` § 2 (registry pattern, no `if/return` chain).
- `rankWheelActions(rows: QueueRowForCard[], ctx: { price: string | null; strike: string | null }): CardAction[]` — `flatMap` rows to lane entries, compute tone/rank, stable sort by rank. ITM test with `Decimal(price).lt(strike)`.
- Types `CardTone`, `CardAction`, `QueueRowForCard` exactly as `data-model.md` § Type Design.

**Refactor — cleanup to consider:**

- Keep lane numbers as named constants (`LANE_RED_ASSIGNMENT = 1` …) so US-108 imports them for ✕ 0 / ◆ 3.

**Acceptance criteria covered:** S11–S16 (mapping and precedence).

### 3. Card primitives: `CardShell`, `CardHeader`, `PriceBlock`, `ActionStrip`, `LegTag`, `LegBlock`, `CardFooterCell`

**Files to create or modify:**

- `src/renderer/src/components/position-card/types.ts` — `CardTone`, `CardAccent` (re-export `CardTone` from `lib/card-actions`).
- `src/renderer/src/components/position-card/CardShell.tsx`, `CardHeader.tsx`, `PriceBlock.tsx`, `ActionStrip.tsx`, `LegTag.tsx`, `LegBlock.tsx`, `CardFooterCell.tsx` + one test file each (`*.test.tsx`).

**Red — tests to write:**

- `CardShell`: renders `data-testid="position-card"` with `data-edge="CSP_OPEN"` and class `border-l-wb-gold` for `accent="CSP_OPEN"`; with `edge="red"` → `border-l-4 border-l-wb-red` and `data-edge="red"`; `muted` → `opacity-50` and no hover class; `clickable` with `onClick` fires on click; `testId="position-card-closed"` when told.
- `ActionStrip`: one action → `role="status"`, `data-tone="gold"`, text `◷ MANAGEMENT WINDOW · 10 DTE remaining — review for roll or close`, no `+N` chip (positive control: with two actions the chip renders). Two actions → leads with rank-1 text, chip text `+1`, chip `title` equals `Also open:\n◷ EXPIRING · Expires in 4 days at $430.00 strike`. Three → `+2` with two lines.
- `LegTag`: `P` → title `Cash-secured put`; `C` → `Covered call`; `·` → `No option leg open`.
- `LegBlock`: plain → `data-testid="leg-block"` without `data-action`; `actions=[gold]` → `data-action="gold"`, class contains `border-l-wb-gold` and marks text `◷` with `title` = the action line; two actions → marks `▲ ◷` with both lines in the title. Renders `title`, `dte` slot, `mark` slot, trailing slot verbatim (query by text).
- `PriceBlock`: `price="182.45"` + `sub="30d to expiration"` → `$182.45` and the sub text; `price={null}` → `—`; `testId` forwarded.
- `CardFooterCell`: label eyebrow and children.

**Green — implementation:**

- Components as `research.md` § 2 describes, Tailwind + `wb-*` tokens only; class maps typed `Record<CardTone, string>` (`STRIP_CLASS`, `CHIP_CLASS`, `EDGE_CLASS`, `LEG_ACTION_CLASS`) and `Record<CardAccent, string>` (`ACCENT_CLASS`).
- `ActionStrip({ actions: CardAction[] })` uses `formatActionLine` for the chip tooltip; `LegBlock({ tag, actions, title, dte, mark, trailing, testId })` with `LegMarks` inline.
- `CardShell({ accent, edge, muted, clickable, onClick, testId, children })` renders a `div`, never a `tr`.

**Refactor — cleanup to consider:**

- Collapse `EYEBROW` / `SUB` class strings into `position-card/styles.ts` constants shared by every primitive and both cards.

**Acceptance criteria covered:** S2, S5, S9, S10, S11, S14, S15, S17 (primitives).

### 4. `WheelCard` and `wheel-card-display`

**Files to create or modify:**

- `src/renderer/src/lib/wheel-card-display.ts` — `deriveWheelCardDisplay(item, snapshot, quote, { closed, profitTargetDefault })` (moves and extends `deriveRowDisplay` from `PositionCard.tsx`).
- `src/renderer/src/lib/wheel-card-display.test.ts`.
- `src/renderer/src/components/position-card/WheelCard.tsx` + `WheelCard.test.tsx`.
- Delete: `components/PositionCard.tsx`, `PositionCard.test.tsx`, `OptMidCell.tsx(.test)`, `UnrealizedPnlCell.tsx(.test)`, `positionRowStyles.ts(.test)`, `PriceCell.tsx` (verified 2026-10-24: its only consumers are the two rows), and `.wb-position-row*` rules in `src/renderer/src/index.css`.

**Red — tests to write:**

- `wheel-card-display.test.ts`: AAPL fixture (`entryPremiumPerContract '3.5000'`, `contracts 1`, snapshot mid `2.60`) → `pnl: { amount: '+$90.00', percentOfMax: '+25.7' }`, `pnlSubline: '+25.7% of max profit'`, `targetReached: false`; mid `5.20` → `'-$170.00'`, `'-48.6% of max profit'`; MSFT mid `1.30` → `targetReached: true`, `pnlPercent` `'53.5714'`, `maxProfit` `'280.0000'`; HOLDING_SHARES (no leg) → `pnl: null`, `pnlSubline: 'no option leg open'`, `priceSubline: 'shares held · no option leg'`, `mark: null`; leg but `snapshot` undefined → `'unavailable'`, `mark: 'unavailable'`; `closed: true` → `'closed — no live marks'`, `priceSubline: 'closed'`, `targetReached: false` even with a snapshot; `dteUrgent` at 7 true, 8 false; `mark.wide` true for `0.50 × 1.50 / 1.00`, false for `2.55 × 2.65 / 2.60`; `mark.noBid` for bid `0`.
- `WheelCard.test.tsx` (render with `item`, `quote`, `snapshot`, `actions`, `hasPendingAssignment`, `profitTargetDefault`, `isClosed`):
  - header: `position-ticker` text `AAPL`, `PhaseBadge` short label `CSP Open`, `position-card-AAPL-price` shows `$182.45` and `30d to expiration`, link `Open ↗` has `href="#/positions/<id>"`.
  - P&L: `position-card-AAPL-pnl` contains `+$90.00` with class `text-wb-green` and `+25.7% of max profit`; loss fixture → `-$170.00` with `text-wb-red`.
  - leg block: text `$180.00 put · 2027-09-12`, `30d`, `position-card-AAPL-opt-mid` shows `$2.60`, trailing `· $3.50 credit`; MSFT → `$430.00 call`, tag `C`.
  - wide spread → `opt-mid-spread-warning` with the US-33 tooltip; no bid → text `no bid` and no warning (positive control pair); snapshot undefined → `— unavailable` and P&L `—` / `unavailable`.
  - TARGET: `target-badge` present at mid `1.30`, absent at `1.80` (same fixture, two renders).
  - DTE 4 → class `text-wb-gold` on the DTE span and `expiring-soon-flag` present; DTE 30 → neither.
  - HOLDING_SHARES → leg text `no option leg open — sell a covered call`, tag `·`, P&L `—` / `no option leg open`, header `shares held · no option leg`.
  - footer: `Cost basis` `$176.50` `/ share`, `Premium collected` `$350.00` `to date`.
  - actions `[MANAGEMENT_WINDOW gold]` → `action-strip` with `data-tone="gold"`, shell `data-edge="gold"`, `leg-block` `data-action="gold"`; `actions=[]` → no strip, `data-edge="CSP_OPEN"`, no `data-action` (positive/negative pair).
  - `hasPendingAssignment` → `pending-assignment-indicator-<id>` with `aria-label="Assignment pending"`.
  - `isClosed` → testid `position-card-closed`, price `—` / `closed`, P&L `—` / `closed — no live marks`, leg `wheel complete`, no strip even when `actions` are passed, no TARGET, no flag, footer intact; phase `CSP_CLOSED_PROFIT` label `CSP ✓`.
  - click on the card calls the navigation (`window.location.hash` becomes `/positions/<id>`); click on the ticker link and the Open link navigate too.

**Green — implementation:**

- `deriveWheelCardDisplay` per `data-model.md` § 3, built from `computeUnrealizedPnl`, `resolveProfitTarget`, `formatSignedMoney`, `formatPnlPercentForDisplay`, `isWideSpread`, `hasNoBid`, `isDteUrgent`, `fmtMoney`.
- `WheelCard` composed from Area 3 primitives: `CardShell accent={item.phase}` with `edge = actions[0]?.tone` (only when not closed), `ActionStrip` when actions and not closed, `CardHeader` with ticker `<a>`, pending dot, `PhaseBadge variant="short"`, `TargetBadge`, `ExpiringSoonFlag compact`, `PriceBlock testId="position-card-{T}-price"` (keep `PriceCell`'s change line when `quote.prevClose` and session not closed), `Open ↗` link; body eyebrow + figure (`data-testid="position-card-{T}-pnl"`) + sub-line; one `LegBlock` (`tag` `P`/`C`/`·`, `actions`, mark span `data-testid="position-card-{T}-opt-mid"` with `opt-mid-spread-warning` or `no bid`); footer two `CardFooterCell`s.
- Delete the table-era files listed above and the `.wb-position-row*` CSS; remove now-unused imports.

**Refactor — cleanup to consider:**

- `PriceBlock` vs the old `PriceCell` change line: keep one implementation (`PriceBlock` takes `quote` + `session`), delete `PriceCell`.
- `WheelCard` should be composition only; any arithmetic belongs in `wheel-card-display.ts`.

**Acceptance criteria covered:** S2–S10, S17, S18, S19.

### 5. Minimal `PmccCard`

**Files to create or modify:**

- `src/renderer/src/components/position-card/PmccCard.tsx` + `PmccCard.test.tsx`.
- Delete `components/PmccPositionRow.tsx` and its test.

**Red — tests to write:**

- Renders `position-card` with `data-edge="PMCC"`, `position-ticker` `XYZ`, `Badge` text `PMCC` and no `PhaseBadge` label from `PHASE_LABEL_SHORT` other than the PMCC state (assert `LEAPS + short call open` present and `getByText('CSP Open')` absent with a wheel-phase positive control elsewhere).
- Price block `position-card-XYZ-price` `$104.20` with `7d to next decision` (short DTE 7, LEAPS 161) ; with `short: null` → `161d to next decision`.
- Two `leg-block`s in order L then S: `$80.00 LEAPS · 2028-01-21`, `161d`; `$118.00 call · 2027-08-20`, `7d`; each mark `—`. `short: null` → one block.
- P&L figure `—` with `no valuation yet`; no `action-strip`, no `target-badge`, no `expiring-soon-flag` even at short DTE 4.
- Footer `Cost basis` `$655.00` (`fmtMoneyGrouped(basisTotal)`) with `$6.55 / share`, `Premium collected` from `premiumCollected`.
- `isClosed` → `position-card-closed`, muted, price `—` / `closed`.
- Card click navigates to `#/positions/<id>`.

**Green — implementation:**

- `PmccCard({ item: PmccListItem, quote, session, isClosed })` from the Area 3 primitives: `CardShell accent="PMCC"`, `Badge color={PHASE_COLOR.PMCC_OPEN}`, state text `PHASE_LABEL[item.phase]`, `PriceBlock` with `nextDecisionDte = item.pmcc.short?.dte ?? item.pmcc.long.dte`, `LegBlock`s with `LegTag` `L` (sky, tooltip `LEAPS — long call, the synthetic stock`) and `S` (violet, `Short call — the income leg`) — add these two tags to `LegTag` in Area 3 if not already — mark `—`, footer with `fmtMoneyGrouped(item.pmcc.basisTotal)` and `fmtMoney(item.pmcc.basisPerShare)`.

**Refactor — cleanup to consider:**

- Share the header/footer layout with `WheelCard` through the primitives only; no `PositionCardBase` abstraction.

**Acceptance criteria covered:** S21.

### 6. `PositionsGrid` and page wiring

**Files to create or modify:**

- `src/renderer/src/components/PositionsGrid.tsx` + `PositionsGrid.test.tsx`.
- `src/renderer/src/pages/PositionsListPage.tsx` — replace `PositionTable` / `TABLE_COLUMNS` / `TableHeader`; call `useManagementQueue`; group rows by `positionId`; pass `actionsByPosition`.
- `src/renderer/src/pages/PositionsListPage.test.tsx` — re-point the component mocks.

**Red — tests to write:**

- `PositionsGrid.test.tsx`: given three wheel items and one PMCC item, renders four `position-card`s in input order inside an element with class `grid` (no `table`, no `columnheader` role — `queryByRole('columnheader')` null with a positive control that `getAllByTestId('position-card')` has 4); wheel items get `WheelCard`, the PMCC item `PmccCard` (mock both, assert the stub texts); `isClosed` passes through; `actionsByPosition.get(item.id)` reaches only the wheel card for that id (stub prints `mock-actions-{T}` with the status words) and the PMCC stub receives none.
- `PositionsListPage.test.tsx`: with `useManagementQueue` returning a `MANAGEMENT_WINDOW` row for AAPL's id and an `EXPIRATION_IMMINENT` row for MSFT's id, the AAPL stub shows `MANAGEMENT WINDOW` and the MSFT stub `EXPIRING`; a `PROFIT_TARGET` row for AAPL does not appear; quotes/snapshots plumbing cases unchanged (`mock-quote-AAPL`, `mock-snapshot-AAPL`); closed section renders `position-card-closed` stubs without snapshots.
- Sort: the page passes items in service order (assert the stub order for `[MSFT 10, AAPL 30, NVDA null]`).

**Green — implementation:**

- `PositionsGrid({ items, isClosed, quotes, session, snapshots, pendingPositionIds, profitTargetDefault, actionsByPosition })` renders `div.grid.grid-cols-[repeat(auto-fill,minmax(400px,1fr))].gap-3.px-[24px]` and branches on `item.strategyType`.
- In `PositionsListPage`: `const queue = useManagementQueue()`; `actionsByPosition = useMemo(() => groupActions(queue.data ?? [], quotes, activePositions))` using `rankWheelActions` with each item's `strike` and its quote price; remove `snapshotForItem`'s table coupling (keep the function); delete `TABLE_COLUMNS`, `PositionTable`, the `TableHeader` import.
- Section headers unchanged; closed grid gets `pb-[24px]`.

**Refactor — cleanup to consider:**

- `groupActions` is a pure helper in `lib/card-actions.ts` (`actionsByPosition(rows, ctxById)`), tested there, so the page stays wiring-only.

**Acceptance criteria covered:** S1, S11, S16, S19, S20, S21 (page level).

### 7. E2e Tests

**Files to create or modify:**

- `e2e/position-cards.spec.ts` (new) — launches with `FAKE_MARKET_DATA`, `WHEELBASE_MOCK_STOCK_QUOTES`, `WHEELBASE_MOCK_OPTION_SNAPSHOTS`; seeds with `seedCsp` / `cspAtDte`, `seedCcOpenPosition`, `seedHoldingSharesPosition`, `createPmccPosition`; queue rows via `runAlertEvaluation`; dismissal via `dismissAlertViaQueue`; pending assignment via `seedAssignmentFixture` + `runDetectionNow`; closed via the US-4 close flow.
- `e2e/option-pnl.spec.ts` — AC-1: replace the `thead th` / `Opt Mid` assertion with `position-card-AAPL-opt-mid` containing `$1.30` (already waited on) and `expect(await page.$('thead')).toBeNull()`.

**Red — tests to write (one per scenario, names mirror the AC):**

- `S1: the dashboard is one card grid, not a table` — 3 active `position-card`s, `thead` absent, grid element has `grid` class; viewport 480px → cards stack (each card's `x` equal).
- `S2: the card header names the position, its phase and its live price` — AAPL card has `position-ticker` `AAPL`, text `CSP Open`, `position-card-AAPL-price` `$182.45`, `30d to expiration`, link `Open ↗` href `#/positions/…`, shell `data-edge="CSP_OPEN"`.
- `S3: unrealized P&L is the card's big figure with its share of max profit` — AAPL `+$90.00` + `+25.7% of max profit` with `.text-wb-green`; MSFT `+$100.00` + `+35.7%`.
- `S4: unrealized P&L is red when the option has gained value` — `-$170.00` with `.text-wb-red` and `-48.6% of max profit` (must not pass on a `+`).
- `S5: the leg block shows the open option` — AAPL `leg-block` text contains `$180.00 put`, the expiration, `30d`, `$2.60`, `$3.50 credit`; tag `P`.
- `S6: a position holding shares shows a placeholder leg and no P&L` — NVDA texts; `position-card-NVDA-pnl` `—`.
- `S7: the TARGET badge fires when the leg reaches the profit target` — MSFT `target-badge` present at mid 1.30; AAPL absent; no `action-strip` on a card whose only queue row is `PROFIT_TARGET` (seed a 40-DTE CSP at mid 1.30).
- `S8: DTE inside 7 days is gold with the Expiring-soon flag` — MSFT at 4 DTE: DTE span `.text-wb-gold`, `expiring-soon-flag` count 1; AAPL count 0.
- `S9: a wide spread marks the mid and an unavailable snapshot blanks it` — AAPL `opt-mid-spread-warning` with title; MSFT (no snapshot fixture) `— unavailable` and `position-card-MSFT-pnl` `—`.
- `S10: the footer shows the two ledger figures` — `$176.50`, `/ share`, `$350.00`, `to date`.
- `S11: the management-window row rides on the card as a gold action strip` — MSFT `action-strip[data-tone="gold"]` text `◷ MANAGEMENT WINDOW · 10 DTE remaining — review for roll or close`, `leg-block[data-action="gold"]`, shell `data-edge="gold"`; AAPL has no strip and `data-edge="CSP_OPEN"`.
- `S12: the expiration-imminent row leads as EXPIRING` — 4-DTE MSFT: strip text `◷ EXPIRING · Expires in 4 days at $430.00 strike`; no `+` chip.
- `S13a: strike proximity on a put leads as ▲ STRIKE PROXIMITY — gold at $181.40` — strip `data-tone="gold"`, text `▲ STRIKE PROXIMITY · Stock is 0.8% above the $180.00 put strike`.
- `S13b: strike proximity on a put leads as ▲ STRIKE PROXIMITY — red at $178.90` — `data-tone="red"`, `… 0.6% below … — now in the money`, `data-edge="red"`.
- `S14: a covered-call breach leads as ▲ CALL BREACHED in red` — MSFT at $435.20: red strip text, chip `+1` with title containing `◷ MANAGEMENT WINDOW · 10 DTE remaining — review for roll or close`, leg marks `▲ ◷`.
- `S15: several open rows show the worst first with the rest on a +N chip` — 4-DTE MSFT at $435.20: strip leads `▲ CALL BREACHED`, chip title lists `◷ EXPIRING · Expires in 4 days at $430.00 strike`.
- `S16: a dismissed row does not ride on the card` — after `dismissAlertViaQueue(page, 'MSFT')`: no `action-strip` on MSFT, `data-edge="CC_OPEN"`, DTE still `10d` (positive control: strip present before dismissal).
- `S17: the whole card navigates to the detail page` — click card body → URL `#/positions/<id>`; back; click ticker; back; click `Open ↗`.
- `S18: a pending assignment keeps its indicator on the card` — `pending-assignment-indicator-<id>` visible.
- `S19: a closed position sits in the Closed section without live figures` — `position-card-closed` contains `TSLA`, `closed — no live marks`, `wheel complete`, no `action-strip`, `target-badge`, `expiring-soon-flag`; `$236.40` and `$1,240.00` present.
- `S20: cards keep the list's sort order` — `position-ticker` order `['MSFT','AAPL','NVDA']`.
- `S21: a PMCC renders as a minimal card in the same shell until US-108` — XYZ card: text `PMCC`, `LEAPS + short call open`, two `leg-block`s with `$80.00 LEAPS` and `$118.00 call`, marks `—`, no `action-strip`, no `target-badge`, no `expiring-soon-flag`, no `CSP Open` / `CC Open` text.

**Green — implementation:**

- The spec file and the one-line AC-1 rewrite; no production code.

**Refactor — cleanup to consider:**

- Lift the launch/seed helpers used by S1–S21 into `e2e/position-card-helpers.ts` if `position-cards.spec.ts` exceeds ~400 lines.

**Acceptance criteria covered:** S1–S21 (all).

## Post-change checklist

`pnpm test` → `pnpm lint` → `pnpm typecheck` → `pnpm format`; INFO/DEBUG logging unchanged (renderer and a projection-only service change). On completion: `/update-spec us-18` (feature page `docs/spec/features/us-18-position-cards.md`; patch `us-2`, `us-33`, `us-51` pages and `contracts/ipc-handlers.md` for `ruleCode`).
