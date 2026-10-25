# US-18 — Research: positions card grid with live price, option mark, P&L and action strip

Story: Linear [OPT-30 / US-18](https://linear.app/optionswheel/issue/OPT-30) (authoritative; reconciled
2026-10-24 from `docs/epics/04-stories/US-18-position-cards.md`).
Mockup: `WheelCard`, `PositionsGrid`, `CardShell`, `ActionStrip`, `LegMarks`, `LegTag`, `FootCell`,
`PriceBlock`, `QUEUE_ACTION`, `wheelActions`, `deriveWheel` in `mockups/epic-09-pmcc-dashboard.mdx`.
`mockups/us-18-position-cards.mdx` is history only.

Blocks US-108 (OPT-16). US-108's own research (`plans/us-108/research.md` § 1–2) was done first
and is the source for most of the starting-point table below.

## 1. Starting point (verified on `main` @ 8242372, 2026-10-24)

| Concern                | Today                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Page                   | `src/renderer/src/pages/PositionsListPage.tsx`: `PositionTable` renders a `<table>` with `TABLE_COLUMNS` (10 headers) for Active and Closed; `snapshotForItem` builds one OCC symbol per wheel item; `ManagementQueue` is rendered above the sections; the page already calls `useStockQuotes`, `useOptionSnapshots`, `useAlertDefaults`, `usePendingAssignments`, `useMarketStatusDisplay`.                                                                                                                                   |
| Row                    | `components/PositionCard.tsx` exports `PositionRow` (a `<tr>`): ticker, pending-assignment dot, `TargetBadge`, `ExpiringSoonFlag`, status text, `PhaseBadge variant="short"`, `PriceCell`, `OptMidCell`, `UnrealizedPnlCell`, strike, expiration, DTE (gold via `isDteUrgent`), premium, basis; `deriveRowDisplay` computes the target state from `computeUnrealizedPnl` + `resolveProfitTarget`; `rowStyle` (zebra + phase colour CSS vars) from `positionRowStyles.ts`; `.wb-position-row` CSS in `index.css` lines 210–227. |
| PMCC row               | `components/PmccPositionRow.tsx`: PMCC `Badge`, `PhaseBadge`, price, `—` mid/P&L, `long / short` strikes, two expirations, two DTEs, premium, `fmtMoneyGrouped(basisTotal)`.                                                                                                                                                                                                                                                                                                                                                   |
| Cells                  | `OptMidCell` (two-line: mid + `no bid` / ⚠ `opt-mid-spread-warning` with tooltip `Wide spread: $b × $a — P&L may be unreliable` / `unavailable`), `UnrealizedPnlCell` (`formatSignedMoney` + signed `formatPnlPercentForDisplay`%), `PriceCell` (price + change line unless session closed, `title="Price unavailable"`).                                                                                                                                                                                                      |
| Queue                  | `ManagementQueueItem` = `{ alertId, positionId, ticker, phase, urgency, summary, quickAction, triggeredAt }` — **no `ruleCode`**. `listManagementQueue` (`services/alerts.ts`) selects from `alerts a JOIN positions p WHERE a.status='open'`; `alerts.rule_code` is stored. Preload types `ManagementQueueItem` as an alias of the schema type. `useManagementQueue` polls every 30 s on key `['alerts','queue']`.                                                                                                            |
| Rule summaries         | `EXPIRATION_IMMINENT`: `Expires in N days at $S strike`; `MANAGEMENT_WINDOW`: `N DTE remaining — review for roll or close`; `STRIKE_PROXIMITY`: `Stock is P% above the $S put strike` / `… below … — now in the money`; `COVERED_CALL_BREACH`: `Stock is P% above the $S call strike — shares may be called away`; `PROFIT_TARGET`, `EARNINGS_PROXIMITY`, `PMCC_ASSIGNMENT_RISK` also exist.                                                                                                                                   |
| Sort                   | `sortPositionsByDte` in `core/position-order.ts`; already applied by the service. Unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Labels                 | `PHASE_LABEL_SHORT` (e.g. `CSP ✓`) and `PHASE_COLOR` (`PMCC_OPEN` = `#2dd4bf`).                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Tokens                 | `wb-teal`, `wb-sky`, `wb-violet(-dim)`, `wb-red-dim`, `wb-gold-dim`, `wb-gold-border`, `wb-bg-elevated`, `wb-border-subtle`, `wb-bg-hover` exist in `index.css`.                                                                                                                                                                                                                                                                                                                                                               |
| Test ids in use by e2e | `position-card`, `position-card-closed`, `position-ticker`, `position-card-{T}-price`, `position-card-{T}-opt-mid`, `position-card-{T}-pnl`, `target-badge`, `expiring-soon-flag`, `opt-mid-spread-warning`, `pending-assignment-indicator-{id}`, `management-queue-row`. `e2e/option-pnl.spec.ts` AC-1 additionally asserts `thead th` contains `Opt Mid`. `position-management.spec.ts` expects the closed card text to contain `CSP ✓`.                                                                                     |
| Page test              | `PositionsListPage.test.tsx` mocks `../components/PositionCard` (`PositionRow`) with a `<tr>` stub exposing `mock-quote-{T}` / `mock-snapshot-{T}` to prove plumbing.                                                                                                                                                                                                                                                                                                                                                          |
| E2E seams              | `seedCsp` + `cspAtDte` (CSP_OPEN at a DTE with OCC symbol), `seedCcOpenPosition` / `seedHoldingSharesPosition` (calendar-helpers), `runAlertEvaluation`, `dismissAlertViaQueue`, `seedAssignmentFixture` + `runDetectionNow`, `WHEELBASE_MOCK_STOCK_QUOTES`, `WHEELBASE_MOCK_OPTION_SNAPSHOTS`, `reloadPositionsList`, `createPmccPosition`. Dates are run-day-relative.                                                                                                                                                       |

## 2. Mockup extraction

- `PositionsGrid`: `Active` / `Closed` `SectionHeader`s; `grid grid-cols-[repeat(auto-fill,minmax(400px,1fr))] gap-3 px-[24px]`; closed section `pb-[24px]`.
- `CardShell`: `flex flex-col overflow-hidden rounded-[10px] border border-wb-border bg-wb-bg-surface transition-colors`; `border-l-2 ${ACCENT_CLASS[phase]}` (CSP_OPEN gold, CC_OPEN violet, HOLDING_SHARES sky, WHEEL_COMPLETE green, PMCC teal) or `border-l-4 ${EDGE_CLASS[tone]}` while an action is open; `opacity-50` when muted else `hover:border-wb-text-muted/60`; `cursor-pointer`; `data-edge`.
- `ActionStrip` (`data-testid="action-strip"`, `data-tone`, `role="status"`): `STRIP_CLASS` red `border-b border-wb-red/40 bg-wb-red/20`, gold `border-b border-wb-gold/40 bg-wb-gold/20`; 16px glyph; word `text-[12px] font-bold tracking-[0.12em]`; `· reason`; `+N` chip `ml-auto cursor-help rounded border px-[6px] py-px text-[10px] font-bold` with `title` = `Also open:\n` + one `glyph WORD · summary` per line.
- `CardHead`: `flex items-center gap-2 border-b border-wb-border-subtle px-[13px] py-[11px]`; `TICKER_LINK` mono 15px bold, underline on hover; `PhaseBadge variant="short"`; `TargetBadge`; `ExpiringSoonFlag compact`; `ml-auto` spacer; `PriceBlock` (price 12.5px tabular + `SUB` line `Nd to expiration` / `shares held · no option leg` / `closed`); `OPEN_LINK` chip `Open ↗`.
- Body `grid gap-[9px] px-[13px] py-[11px]`: `EYEBROW` `Unrealized P&L`; figure `font-wb-mono text-2xl font-semibold tabular-nums tracking-[-0.01em]` in tone; `SUB` line `+25.7% of max profit` / `unavailable` / `no option leg open` / `closed — no live marks`.
- Leg line `LEG_BASE` = `grid grid-cols-[auto_1fr_auto_auto] items-center gap-[10px] rounded-[7px] border px-[10px] py-2 font-wb-mono text-[11.5px] tabular-nums`; plain `border-wb-border-subtle bg-wb-bg-base`; highlighted red `border-wb-red/30 border-l-[3px] border-l-wb-red bg-wb-red-dim`, gold `border-wb-gold-border border-l-[3px] border-l-wb-gold bg-wb-gold-dim`. `LegTag` P gold / C violet / `·` muted with `TAG_TIP`. `LegMarks` = glyphs joined by space, `title` = one action line per state. Title `$180.00 put · 2027-09-12`; DTE gold + semibold when urgent; mark `$2.60` + ⚠ (`title` = US-33 tooltip) or `— unavailable`; `· $3.50 credit`.
- Footer `grid grid-cols-2 gap-px border-t border-wb-border bg-wb-border`; `FootCell` `bg-wb-bg-elevated px-3 py-[9px]` with `EYEBROW` label, value 13px tabular (basis `text-wb-sky`, premium `text-wb-green`), `SUB` note.
- Wheel actions: `wheelRows(w)` minus `PROFIT_TARGET` → `queueAction` → rank sort. `QUEUE_ACTION`: `STRIKE_PROXIMITY` ▲ `STRIKE PROXIMITY` tone/rank by `itm` (red 1 / gold 2); `COVERED_CALL_BREACH` ▲ `CALL BREACHED` red 1; `EXPIRATION_IMMINENT` ◷ `EXPIRING` gold 4; `MANAGEMENT_WINDOW` ◷ `MANAGEMENT WINDOW` gold 5. `EARNINGS_PROXIMITY` has no entry and does not ride on the wheel card.

## 3. Unknowns resolved

### U1 — The queue item has no rule code

Mapping a queue row to a glyph needs the rule. Text-matching the summary is fragile. Resolution: add `ruleCode: RuleCode` to `ManagementQueueItem` (`alerts.rule_code` is already stored and typed). Additive; the preload aliases the schema type so no preload edit. The Linear tech note was patched accordingly (2026-10-24).

### U2 — Where the wheel card gets its action rows

`useManagementQueue` is already called by `ManagementQueue`; TanStack Query dedupes a second subscriber on the same key, so `PositionsListPage` calls it too and groups items by `positionId`. Only wheel items receive rows; the minimal PMCC card has no strip (US-108's is a live derivation).

### U3 — STRIKE_PROXIMITY tone

The row carries no "in the money" flag. Resolution: tone is red when the live quote price is strictly below the put strike (`Decimal(price).lt(strike)`), gold otherwise or when the quote is missing. The engine's summary already says `— now in the money` for the same condition (`priceDirection` → `'below'`), so the two agree.

### U4 — `no bid` on the card

The story's AC omit it, but US-33's `no bid` indicator is asserted by `e2e/option-pnl.spec.ts` AC-8 and still describes real data. Resolution: the leg mark keeps the `no bid` subtext via `hasNoBid`; the ⚠ is suppressed in that case as today.

### U5 — Closed cards and phase labels

`position-management.spec.ts` expects `CSP ✓` in the closed card, so the card keeps `PhaseBadge variant="short"`. A closed card shows `—` for price, mid, DTE and P&L with the mockup's `closed` / `closed — no live marks` sub-lines; snapshots and quotes are not requested for closed items (already the case).

### U6 — What the page test should mock

The existing page test mocks `PositionRow` to prove quote/snapshot plumbing. Resolution: mock `WheelCard` and `PmccCard` from `components/position-card/` with the same `mock-quote-{T}` / `mock-snapshot-{T}` stubs, plus a `mock-actions-{T}` stub so the queue-to-card grouping is asserted at the page level.

### U7 — HOLDING_SHARES and the `wb-position-row--soon` highlight

The row highlighted the whole row gold at ≤ 7 DTE. The mockup highlights only the DTE and shows the flag; the card edge is reserved for action tones. Resolution: follow the mockup; drop the row CSS.

## Architecture Decisions

### ADR: The wheel strip mirrors the management queue, not re-evaluated predicates

- **Decision:** `rankWheelActions(rows, legContext)` in `src/renderer/src/lib/card-actions.ts` maps a position's open `ManagementQueueItem`s (by `ruleCode`) to `{ glyph, statusWord, tone, rank, summary }`, drops `PROFIT_TARGET` and any code without a lane entry, and sorts by rank. The summary is the queue's text verbatim.
- **Why:** the mockup assigns exactly this to US-18 ("its strip text is the queue summary word for word"); dismissals are honoured for free; no second copy of the thresholds. US-108's PMCC strip is a live derivation by its own story's choice; both share `ActionStrip` and the lane numbers.
- **Alternatives considered:** evaluating `evaluatePosition` in the renderer from quotes (duplicate inputs, ignores dismissals); parsing summaries for the rule (fragile).

### ADR: `ruleCode` joins `ManagementQueueItem`

- **Decision:** `listManagementQueue` selects `a.rule_code AS rule_code`; `mapQueueRow` sets `ruleCode`; `ManagementQueueItem.ruleCode: RuleCode`.
- **Why:** the only honest way to know which rule a row is; additive and already stored.
- **Alternatives considered:** a separate `alerts:list-by-position` channel (a second read path for the same rows).

### ADR: One `CardShell` and `ActionStrip` for both strategies

- **Decision:** primitives live in `src/renderer/src/components/position-card/` (`CardShell`, `CardHeader`, `PriceBlock`, `ActionStrip`, `LegBlock`, `LegTag`, `CardFooterCell`), typed on plain props (`tone: 'red' | 'gold'`, `accent: WheelPhase | 'PMCC'`), with no knowledge of queue rows or list items.
- **Why:** US-108 reuses them unchanged for the PMCC card; the mockup draws both cards from the same pieces.
- **Alternatives considered:** a single `PositionCard` with branches (the wheel card would carry PMCC concerns).

### ADR: The PMCC row becomes a minimal card, replaced by US-108

- **Decision:** `PmccCard` (minimal) renders in the same shell: teal accent, PMCC badge, state label, price block, one `LegBlock` per open leg with a `—` mark, `—` P&L with `no valuation yet`, basis and premium footer. No strip, no TARGET, no flag.
- **Why:** mixed table-plus-card is rejected by US-108; the grid must have one presentation the day it ships. Everything shown is what `PmccPositionRow` shows today.
- **Alternatives considered:** keeping `PmccPositionRow` inside a one-row table (two presentations).

### ADR: Delete the table cells rather than wrap them

- **Decision:** `PositionRow`, `PmccPositionRow`, `OptMidCell`, `UnrealizedPnlCell`, `positionRowStyles.ts`, their tests, `TABLE_COLUMNS` and the `.wb-position-row*` CSS are removed. `PriceCell` stays (it is a `<td>` used nowhere else — delete it too if the only consumer was the row; verify in Green). `lib/option-display.ts` helpers stay.
- **Why:** the cells are `<td>`s and cannot live in a card; keeping them dead contradicts the orphan rule.
- **Alternatives considered:** keeping them as an alternate view (rejected by the reconciled story).

## Open Questions

None. No `NEEDS CLARIFICATION` items remain.
