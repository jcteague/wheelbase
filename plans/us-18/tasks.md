# US-18 — Display positions as a card grid with live price, option mark, P&L and action strip — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off
- Plan: `plans/us-18/plan.md` · Types: `plans/us-18/data-model.md` § Type Design · Contract: `plans/us-18/contracts/alerts-list.md` · Mockup: `mockups/epic-09-pmcc-dashboard.mdx` (`WheelCard`, `PositionsGrid`, `CardShell`, `ActionStrip`, `LegTag`, `FootCell`, `PriceBlock`)
- **Sqlite ABI:** Vitest needs `pnpm rebuild:node`; e2e needs `pnpm rebuild:electron`. Never run a Vitest agent and an e2e agent at the same time.

### Sequencing note (deviation from plan.md)

`plan.md` Areas 4 and 5 delete the table-era files (`PositionCard.tsx`, `OptMidCell.tsx`,
`UnrealizedPnlCell.tsx`, `positionRowStyles.ts`, `PriceCell.tsx`, `PmccPositionRow.tsx`, their
tests, `.wb-position-row*` CSS). `PositionsListPage.tsx` still imports `PositionRow` and
`PmccPositionRow` until Area 6 rewires it, so deleting them earlier breaks `pnpm typecheck` and
the page tests. **All of those deletions move to Area 6 Green**, after the page stops importing
them. Likewise the `L` / `S` tags `plan.md` Area 5 adds to `LegTag` are built in **Area 3**,
so Areas 4 and 5 never edit the same file.

---

## Layer 1 — Queue read carries `ruleCode` (no dependencies)

> Start immediately.

### 1. `ruleCode` on the management-queue read

- [ ] **[Red]** Write failing tests — `src/main/services/alerts.test.ts`, `src/main/ipc/alerts.test.ts`
  - Test cases:
    - `listManagementQueue`: upsert an open `MANAGEMENT_WINDOW` and an open `EXPIRATION_IMMINENT` alert on two positions → each item `toEqual(expect.objectContaining({ ruleCode: '<stored rule_code>', summary: … }))`; ordering unchanged (high urgency first)
    - a dismissed and a resolved alert still do not appear, with the open one present as positive control
    - `alerts:list` IPC → `{ ok: true, items: [expect.objectContaining({ ruleCode: 'MANAGEMENT_WINDOW' })] }`
  - No property — service/IPC projection, not a core engine
  - Run `pnpm test src/main/services/alerts.test.ts src/main/ipc/alerts.test.ts` — all new tests must fail
- [ ] **[Green]** Implement — `src/main/services/alerts.ts`, `src/main/schemas.ts` _(depends on: 1 Red ✓)_
  - `listManagementQueue` selects `a.rule_code AS rule_code`; private `QueueRow` gains `rule_code`; `mapQueueRow` sets `ruleCode: row.rule_code`
  - `ManagementQueueItem.ruleCode: RuleCode` in `src/main/schemas.ts` (import `RuleCode` from `./core/alerts`); preload alias and `api/alerts.ts` unchanged
  - DEBUG `management_queue_listed` log unchanged
  - Run `pnpm test src/main/services/alerts.test.ts src/main/ipc/alerts.test.ts` — all tests must pass
- [ ] **[Refactor]** `/refactor` — `src/main/services/alerts.ts` _(depends on: 1 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Check `QueueRow` is still the only hand-written row type in the file
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — Wheel-lane mapping (depends on Layer 1)

### 2. Pure wheel-lane mapping: `rankWheelActions`

**Requires:** 1 Green ✓ (`QueueRowForCard` is a `Pick` of `ManagementQueueItem` including `ruleCode`)

- [ ] **[Red]** Write failing tests — `src/renderer/src/lib/card-actions.test.ts` _(depends on: 1 Green ✓)_
  - Test cases (literal `toEqual`):
    - `MANAGEMENT_WINDOW` with summary `10 DTE remaining — review for roll or close`, ctx `{ price: '421.50', strike: '430.0000' }` → `[{ glyph: '◷', statusWord: 'MANAGEMENT WINDOW', tone: 'gold', rank: 5, summary: '10 DTE remaining — review for roll or close' }]`
    - `EXPIRATION_IMMINENT` → `◷ EXPIRING` gold rank 4; `COVERED_CALL_BREACH` → `▲ CALL BREACHED` red rank 1
    - `STRIKE_PROXIMITY` boundary vs strike `180.0000`: price `181.4000` → gold rank 2; `178.9000` → red rank 1; `180.0000` (equal) → gold; `price: null` → gold
    - Ordering: `[MANAGEMENT_WINDOW, EXPIRATION_IMMINENT, COVERED_CALL_BREACH]` → ranks `[1, 4, 5]`; two equal-rank rows keep input order (stable)
    - Dropped: `PROFIT_TARGET`, `EARNINGS_PROXIMITY`, `PMCC_ASSIGNMENT_RISK` → `[]`; a mixed list keeps only the lane rows (positive control in the same test)
    - `formatActionLine({ glyph: '◷', statusWord: 'EXPIRING', summary: 'Expires in 4 days at $430.00 strike', … })` → `'◷ EXPIRING · Expires in 4 days at $430.00 strike'`
  - No property — renderer lib over a finite enum; every branch has an example test
  - Run `pnpm test src/renderer/src/lib/card-actions.test.ts` — all new tests must fail
- [ ] **[Green]** Implement — `src/renderer/src/lib/card-actions.ts` _(depends on: 2 Red ✓)_
  - Types per `data-model.md` § Type Design: `CardTone = 'red' | 'gold'`, `CardAction` interface, `QueueRowForCard = Pick<ManagementQueueItem, 'ruleCode' | 'summary'>`
  - `WHEEL_LANES`: ordered registry of `{ ruleCode, glyph, statusWord, tone: (ctx) => CardTone, rank: (tone) => number }` for the four codes in `data-model.md` § 2 (registry pattern, no `if/return` chain)
  - `rankWheelActions(rows: QueueRowForCard[], ctx: { price: string | null; strike: string | null }): CardAction[]` — `flatMap` to lane entries, compute tone/rank, stable sort by rank; ITM via `Decimal(price).lt(strike)`
  - `formatActionLine(a: CardAction): string` → `` `${glyph} ${statusWord} · ${summary}` ``
  - Run `pnpm test src/renderer/src/lib/card-actions.test.ts` — all tests must pass
- [ ] **[Refactor]** `/refactor` — `src/renderer/src/lib/card-actions.ts` _(depends on: 2 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Lane numbers as named constants (`LANE_RED_ASSIGNMENT = 1` …) so US-108 can import them for ✕ 0 / ◆ 3
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — Card primitives (depends on Layer 2)

### 3. Card primitives: `CardShell`, `CardHeader`, `PriceBlock`, `ActionStrip`, `LegTag`, `LegBlock`, `CardFooterCell`

**Requires:** 2 Green ✓ (`CardTone`, `CardAction`, `formatActionLine`)

- [ ] **[Red]** Write failing tests — `src/renderer/src/components/position-card/*.test.tsx` (one per component) _(depends on: 2 Green ✓)_
  - Test cases:
    - `CardShell`: `accent="CSP_OPEN"` → `data-testid="position-card"`, `data-edge="CSP_OPEN"`, class `border-l-wb-gold`; `edge="red"` → `border-l-4 border-l-wb-red`, `data-edge="red"`; `muted` → `opacity-50`, no hover class; `clickable` + `onClick` fires on click; `testId="position-card-closed"` honoured; renders a `div`, never a `tr`
    - `ActionStrip`: one action → `role="status"`, `data-tone="gold"`, text `◷ MANAGEMENT WINDOW · 10 DTE remaining — review for roll or close`, no `+N` chip; two → leads with rank-1 text, chip `+1`, chip `title` = `Also open:\n◷ EXPIRING · Expires in 4 days at $430.00 strike`; three → `+2` with two lines (two-action case is the chip's positive control)
    - `LegTag`: `P` → title `Cash-secured put`; `C` → `Covered call`; `·` → `No option leg open`; `L` → `LEAPS — long call, the synthetic stock`; `S` → `Short call — the income leg` (L/S moved here from plan Area 5)
    - `LegBlock`: plain → `data-testid="leg-block"` without `data-action`; `actions=[gold]` → `data-action="gold"`, class contains `border-l-wb-gold`, marks `◷` with `title` = the action line; two actions → marks `▲ ◷` with both lines in the title; `title`, `dte`, `mark`, `trailing` slots render verbatim (query by text)
    - `PriceBlock`: `price="182.45"` + `sub="30d to expiration"` → `$182.45` and sub text; `price={null}` → `—`; `testId` forwarded; change line when `quote.prevClose` present and session not closed (carried over from `PriceCell`)
    - `CardFooterCell`: label eyebrow and children render
  - Run `pnpm test src/renderer/src/components/position-card` — all new tests must fail
- [ ] **[Green]** Implement — `src/renderer/src/components/position-card/{types.ts,CardShell,CardHeader,PriceBlock,ActionStrip,LegTag,LegBlock,CardFooterCell}.tsx` _(depends on: 3 Red ✓)_
  - `types.ts`: `CardAccent = WheelPhase | 'PMCC'`; re-export `CardTone` from `lib/card-actions`
  - Tailwind + `wb-*` tokens only; class maps `Record<CardTone, string>` (`STRIP_CLASS`, `CHIP_CLASS`, `EDGE_CLASS`, `LEG_ACTION_CLASS`) and `Record<CardAccent, string>` (`ACCENT_CLASS`)
  - `CardShell({ accent, edge, muted, clickable, onClick, testId, children })`; `ActionStrip({ actions: CardAction[] })` using `formatActionLine` for the chip tooltip; `LegBlock({ tag, actions, title, dte, mark, trailing, testId })` with `LegMarks` inline; `PriceBlock` takes `quote` + `session` for the change line
  - Shapes per mockup `CardShell`, `ActionStrip`, `LegTag`, `FootCell`, `PriceBlock` and `research.md` § 2
  - Run `pnpm test src/renderer/src/components/position-card` — all tests must pass
- [ ] **[Refactor]** `/refactor` — `src/renderer/src/components/position-card/` _(depends on: 3 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Collapse `EYEBROW` / `SUB` class strings into `position-card/styles.ts` shared by every primitive
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — Cards (depends on Layer 3)

> Areas 4 and 5 run in parallel. Neither deletes table-era files (see sequencing note).

### 4. `WheelCard` and `wheel-card-display`

**Requires:** 3 Green ✓

- [ ] **[Red]** Write failing tests — `src/renderer/src/lib/wheel-card-display.test.ts`, `src/renderer/src/components/position-card/WheelCard.test.tsx` _(depends on: 3 Green ✓)_
  - `wheel-card-display.test.ts`:
    - AAPL (`entryPremiumPerContract '3.5000'`, 1 contract, mid `2.60`) → `pnl: { amount: '+$90.00', percentOfMax: '+25.7' }`, `pnlSubline: '+25.7% of max profit'`, `targetReached: false`
    - mid `5.20` → `'-$170.00'`, `'-48.6% of max profit'`
    - MSFT mid `1.30` → `targetReached: true`, `pnlPercent '53.5714'`, `maxProfit '280.0000'`
    - HOLDING_SHARES → `pnl: null`, `pnlSubline: 'no option leg open'`, `priceSubline: 'shares held · no option leg'`, `mark: null`
    - leg with `snapshot` undefined → `pnlSubline: 'unavailable'`, `mark: 'unavailable'`
    - `closed: true` → `'closed — no live marks'`, `priceSubline: 'closed'`, `targetReached: false` even with a snapshot
    - `dteUrgent` at DTE 7 true, 8 false
    - `mark.wide` true for `0.50 × 1.50 / 1.00`, false for `2.55 × 2.65 / 2.60`; `mark.noBid` for bid `0`
  - `WheelCard.test.tsx`:
    - header: `position-ticker` `AAPL`, `CSP Open`, `position-card-AAPL-price` `$182.45` + `30d to expiration`, link `Open ↗` `href="#/positions/<id>"`
    - P&L: `position-card-AAPL-pnl` `+$90.00` with `text-wb-green` + `+25.7% of max profit`; loss fixture `-$170.00` with `text-wb-red`
    - leg: `$180.00 put · 2027-09-12`, `30d`, `position-card-AAPL-opt-mid` `$2.60`, `· $3.50 credit`; MSFT → `$430.00 call`, tag `C`
    - wide spread → `opt-mid-spread-warning` with the US-33 tooltip; no bid → `no bid` and no warning (positive-control pair); snapshot undefined → `— unavailable`, P&L `—` / `unavailable`
    - TARGET: `target-badge` present at mid `1.30`, absent at `1.80`
    - DTE 4 → DTE span `text-wb-gold` + `expiring-soon-flag`; DTE 30 → neither
    - HOLDING_SHARES → `no option leg open — sell a covered call`, tag `·`, P&L `—` / `no option leg open`, header `shares held · no option leg`
    - footer: `Cost basis` `$176.50` `/ share`; `Premium collected` `$350.00` `to date`
    - `actions=[MANAGEMENT_WINDOW gold]` → `action-strip[data-tone="gold"]`, shell `data-edge="gold"`, `leg-block[data-action="gold"]`; `actions=[]` → no strip, `data-edge="CSP_OPEN"`, no `data-action`
    - `hasPendingAssignment` → `pending-assignment-indicator-<id>` with `aria-label="Assignment pending"`
    - `isClosed` → `position-card-closed`, price `—` / `closed`, P&L `—` / `closed — no live marks`, leg `wheel complete`, no strip even with `actions`, no TARGET, no flag, footer intact; `CSP_CLOSED_PROFIT` label `CSP ✓`
    - click on card body, ticker link and `Open ↗` each navigate to `/positions/<id>`
  - No property — renderer lib composing existing tested helpers
  - Run `pnpm test src/renderer/src/lib/wheel-card-display.test.ts src/renderer/src/components/position-card/WheelCard.test.tsx` — all new tests must fail
- [ ] **[Green]** Implement — `src/renderer/src/lib/wheel-card-display.ts`, `src/renderer/src/components/position-card/WheelCard.tsx` _(depends on: 4 Red ✓)_
  - `deriveWheelCardDisplay(item, snapshot, quote, { closed, profitTargetDefault }): WheelCardDisplay` per `data-model.md` § 3, from `computeUnrealizedPnl`, `resolveProfitTarget`, `formatSignedMoney`, `formatPnlPercentForDisplay`, `isWideSpread`, `hasNoBid`, `isDteUrgent`, `fmtMoney` (extends today's `deriveRowDisplay`; leave the old one in `PositionCard.tsx` until Area 6 deletes it)
  - `WheelCard` composed from Area 3 primitives per mockup `WheelCard`: `CardShell accent={item.phase}` with `edge = actions[0]?.tone` when not closed; `ActionStrip` when actions and not closed; `CardHeader` (ticker `<a>`, pending dot, `PhaseBadge variant="short"`, `TargetBadge`, `ExpiringSoonFlag compact`, `PriceBlock testId="position-card-{T}-price"`, `Open ↗`); P&L figure `position-card-{T}-pnl` + sub-line; one `LegBlock` (`P`/`C`/`·`, mark span `position-card-{T}-opt-mid` with `opt-mid-spread-warning` or `no bid`); two `CardFooterCell`s
  - Run the two test files — all tests must pass
- [ ] **[Refactor]** `/refactor` — `wheel-card-display.ts`, `WheelCard.tsx` _(depends on: 4 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - `WheelCard` is composition only; any arithmetic belongs in `wheel-card-display.ts`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### 5. Minimal `PmccCard`

**Requires:** 3 Green ✓

- [ ] **[Red]** Write failing tests — `src/renderer/src/components/position-card/PmccCard.test.tsx` _(depends on: 3 Green ✓)_
  - Test cases:
    - `position-card` with `data-edge="PMCC"`, `position-ticker` `XYZ`, badge `PMCC`, state `LEAPS + short call open`; `getByText('CSP Open')` absent (positive control: the PMCC state text present)
    - `position-card-XYZ-price` `$104.20` + `7d to next decision` (short DTE 7, LEAPS 161); `short: null` → `161d to next decision`
    - two `leg-block`s in order L then S: `$80.00 LEAPS · 2028-01-21` / `161d`; `$118.00 call · 2027-08-20` / `7d`; each mark `—`; `short: null` → one block
    - P&L `—` with `no valuation yet`; no `action-strip`, `target-badge` or `expiring-soon-flag` even at short DTE 4
    - footer `Cost basis` `$655.00` with `$6.55 / share`; `Premium collected` from `premiumCollected`
    - `isClosed` → `position-card-closed`, muted, price `—` / `closed`
    - card click navigates to `#/positions/<id>`
  - Run `pnpm test src/renderer/src/components/position-card/PmccCard.test.tsx` — all new tests must fail
- [ ] **[Green]** Implement — `src/renderer/src/components/position-card/PmccCard.tsx` _(depends on: 5 Red ✓)_
  - `PmccCard({ item: PmccListItem, quote, session, isClosed })`: `CardShell accent="PMCC"`, `Badge color={PHASE_COLOR.PMCC_OPEN}`, state `PHASE_LABEL[item.phase]`, `PriceBlock` with next-decision DTE `item.pmcc.short?.dte ?? item.pmcc.long.dte`, `LegBlock`s tagged `L` / `S`, marks `—`, footer `fmtMoneyGrouped(item.pmcc.basisTotal)` + `fmtMoney(item.pmcc.basisPerShare)`
  - Run `pnpm test src/renderer/src/components/position-card/PmccCard.test.tsx` — all tests must pass
- [ ] **[Refactor]** `/refactor` — `PmccCard.tsx` _(depends on: 5 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Share layout with `WheelCard` through the primitives only; no `PositionCardBase` abstraction
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 5 — Grid + page wiring (depends on Layer 4)

### 6. `PositionsGrid` and page wiring

**Requires:** 2 Green ✓, 4 Green ✓, 5 Green ✓

- [ ] **[Red]** Write failing tests — `src/renderer/src/components/PositionsGrid.test.tsx`, `src/renderer/src/pages/PositionsListPage.test.tsx`, `src/renderer/src/lib/card-actions.test.ts` _(depends on: 4 Green ✓, 5 Green ✓)_
  - `PositionsGrid.test.tsx`: three wheel items + one PMCC → four `position-card`s in input order inside an element with class `grid`; `queryByRole('columnheader')` null (positive control: `getAllByTestId('position-card')` length 4); wheel items → `WheelCard` stub, PMCC → `PmccCard` stub; `isClosed` passes through; `actionsByPosition.get(item.id)` reaches only that wheel card (stub prints `mock-actions-{T}` with status words), PMCC stub receives none
  - `PositionsListPage.test.tsx`: `useManagementQueue` returns `MANAGEMENT_WINDOW` for AAPL and `EXPIRATION_IMMINENT` for MSFT → AAPL stub shows `MANAGEMENT WINDOW`, MSFT `EXPIRING`; a `PROFIT_TARGET` row for AAPL does not appear; `mock-quote-AAPL` / `mock-snapshot-AAPL` plumbing unchanged; closed section renders `position-card-closed` stubs without snapshots; order `[MSFT 10, AAPL 30, NVDA null]` preserved
  - `card-actions.test.ts`: `actionsByPosition(rows, ctxById)` groups by `positionId`, ranks each group with that position's price/strike, omits positions with only dropped codes
  - Run `pnpm test` on the three files — all new tests must fail
- [ ] **[Green]** Implement — `PositionsGrid.tsx`, `PositionsListPage.tsx`, `lib/card-actions.ts`; delete table-era files _(depends on: 6 Red ✓)_
  - `PositionsGrid({ items, isClosed, quotes, session, snapshots, pendingPositionIds, profitTargetDefault, actionsByPosition: ReadonlyMap<string, CardAction[]> })` → `div.grid.grid-cols-[repeat(auto-fill,minmax(400px,1fr))].gap-3.px-[24px]`, branches on `item.strategyType` (mockup `PositionsGrid`)
  - `actionsByPosition(rows, ctxById)` pure helper in `lib/card-actions.ts` built on `rankWheelActions`
  - `PositionsListPage`: `useManagementQueue()`; `useMemo` the map from queue rows + each item's `strike` and quote price; replace `PositionTable` / `TABLE_COLUMNS` / `TableHeader` import; keep `snapshotForItem`; section headers unchanged; closed grid `pb-[24px]`
  - **Delete** (moved here from plan Areas 4–5): `components/PositionCard.tsx(+test)`, `OptMidCell.tsx(+test)`, `UnrealizedPnlCell.tsx(+test)`, `positionRowStyles.ts(+test)`, `PriceCell.tsx(+test)`, `PmccPositionRow.tsx(+test)`, `.wb-position-row*` rules in `src/renderer/src/index.css`; remove now-unused imports (`TablePrimitives` stays — `LegHistoryTable` uses it)
  - Run `pnpm test && pnpm typecheck` — all tests must pass, no dangling imports
- [ ] **[Refactor]** `/refactor` — `PositionsGrid.tsx`, `PositionsListPage.tsx`, `lib/card-actions.ts` _(depends on: 6 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Page stays wiring-only; no grouping logic inline
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 6 — E2E Tests

**Requires:** All Green tasks from previous layers ✓ · `pnpm rebuild:electron` first

### 7. E2E Tests

- [ ] **[Red]** Write failing e2e tests — `e2e/position-cards.spec.ts` (new), `e2e/option-pnl.spec.ts` (AC-1 rewrite) _(depends on: all Green tasks ✓)_
  - Launch with `FAKE_MARKET_DATA`, `WHEELBASE_MOCK_STOCK_QUOTES`, `WHEELBASE_MOCK_OPTION_SNAPSHOTS`; seed with `seedCsp` / `cspAtDte`, `seedCcOpenPosition`, `seedHoldingSharesPosition`, `createPmccPosition`; queue rows via `runAlertEvaluation`; dismissal via `dismissAlertViaQueue`; pending via `seedAssignmentFixture` + `runDetectionNow`; closed via the US-4 close flow
  - `option-pnl.spec.ts` AC-1: replace the `thead th` / `Opt Mid` assertion with `position-card-AAPL-opt-mid` containing `$1.30` and `expect(await page.$('thead')).toBeNull()`
  - AC coverage (one `it()` each, assertions per `plan.md` Area 7):
    - S1: The dashboard is one card grid, not a table → `it('S1: the dashboard is one card grid, not a table')`
    - S2: The card header names the position, its phase and its live price → `it('S2: the card header names the position, its phase and its live price')`
    - S3: Unrealized P&L is the card's big figure with its share of max profit → `it("S3: unrealized P&L is the card's big figure with its share of max profit")`
    - S4: Unrealized P&L is red when the option has gained value → `it('S4: unrealized P&L is red when the option has gained value')`
    - S5: The leg block shows the open option → `it('S5: the leg block shows the open option')`
    - S6: A position holding shares shows a placeholder leg and no P&L → `it('S6: a position holding shares shows a placeholder leg and no P&L')`
    - S7: The TARGET badge fires when the leg reaches the profit target → `it('S7: the TARGET badge fires when the leg reaches the profit target')`
    - S8: DTE inside 7 days is gold with the Expiring-soon flag → `it('S8: DTE inside 7 days is gold with the Expiring-soon flag')`
    - S9: A wide spread marks the mid and an unavailable snapshot blanks it → `it('S9: a wide spread marks the mid and an unavailable snapshot blanks it')`
    - S10: The footer shows the two ledger figures → `it('S10: the footer shows the two ledger figures')`
    - S11: The management-window row rides on the card as a gold action strip → `it('S11: the management-window row rides on the card as a gold action strip')`
    - S12: The expiration-imminent row leads as EXPIRING → `it('S12: the expiration-imminent row leads as EXPIRING')`
    - S13a: Strike proximity on a put — gold at $181.40 → `it('S13a: strike proximity on a put leads as ▲ STRIKE PROXIMITY — gold at $181.40')`
    - S13b: Strike proximity on a put — red at $178.90 → `it('S13b: strike proximity on a put leads as ▲ STRIKE PROXIMITY — red at $178.90')`
    - S14: A covered-call breach leads as ▲ CALL BREACHED in red → `it('S14: a covered-call breach leads as ▲ CALL BREACHED in red')`
    - S15: Several open rows show the worst first with the rest on a +N chip → `it('S15: several open rows show the worst first with the rest on a +N chip')`
    - S16: A dismissed row does not ride on the card → `it('S16: a dismissed row does not ride on the card')`
    - S17: The whole card navigates to the detail page → `it('S17: the whole card navigates to the detail page')`
    - S18: A pending assignment keeps its indicator on the card → `it('S18: a pending assignment keeps its indicator on the card')`
    - S19: A closed position sits in the Closed section without live figures → `it('S19: a closed position sits in the Closed section without live figures')`
    - S20: Cards keep the list's sort order → `it("S20: cards keep the list's sort order")`
    - S21: A PMCC renders as a minimal card in the same shell until US-108 → `it('S21: a PMCC renders as a minimal card in the same shell until US-108')`
  - Run `pnpm test:e2e -- e2e/position-cards.spec.ts e2e/option-pnl.spec.ts` — new tests fail only for missing fixtures/assertions, not launch errors (UI already shipped by Layers 1–5, so most will pass on first write; confirm each can fail by flipping one expected literal)
- [ ] **[Green]** Make e2e tests pass _(depends on: 7 Red ✓)_
  - Run `pnpm test:e2e -- e2e/position-cards.spec.ts e2e/option-pnl.spec.ts e2e/expiring-soon-flags.spec.ts e2e/position-management.spec.ts e2e/management-queue.spec.ts e2e/live-underlying-price.spec.ts e2e/open-pmcc-position.spec.ts` — all pass; the pre-existing list specs stay green with only the `option-pnl.spec.ts` AC-1 header assertion rewritten
- [ ] **[Refactor]** `/refactor` e2e tests _(depends on: 7 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Lift launch/seed helpers into `e2e/position-card-helpers.ts` if `position-cards.spec.ts` exceeds ~400 lines

---

## Completion Checklist

- [ ] All Red tasks complete (tests written and failing for right reason)
- [ ] Core-engine areas have property tests, or a stated "no property" reason (none in this story — no `src/main/core/` change)
- [ ] All Green tasks complete (all tests passing)
- [ ] All Refactor tasks complete (lint + typecheck clean)
- [ ] E2E tests cover every AC (S1–S21, 22 cases)
- [ ] Table-era files and `.wb-position-row*` CSS deleted; no dangling imports
- [ ] `pnpm test && pnpm lint && pnpm typecheck && pnpm format` — all clean
- [ ] `/update-spec us-18`
