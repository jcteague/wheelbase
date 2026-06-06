# US-34: Position Cockpit (Triage Cockpit)

<!-- generated:from us-34 -->

## Summary

US-34 began as "Display Greeks panel for active option legs"; the shipped scope ballooned into a full redesign of the position detail page — the **Position Cockpit** (a.k.a. Triage Cockpit). The flat Open-Leg / Cost-Basis / Leg-History / Notes stack on `PositionDetailContent` is replaced wholesale with a tight cockpit layout: a deterministic verdict block on top, a delta-gauge + distance-thermometer **Risk snapshot** card, a 4-column **Context** strip (Theta / IV / Vega / Gamma), and two collapsible reference drawers (Leg reference, Cost basis & history) below. The original story's nine greeks-display acceptance criteria are fully subsumed — there is no standalone `GreeksPanel`; delta lives in `RiskSnapshot.DeltaGauge` and theta/IV/vega/gamma live in `ContextStrip`. Notes, the closed-position banner, and `CloseCspForm` still render below the cockpit unchanged. No new IPC channels, no Zod schemas, no migrations: all data flows through existing hooks from [us-31](us-31-market-data-provider-adapter.md), [us-32](us-32-live-position-prices.md), and [us-33](us-33-option-mid-pnl.md).

## Acceptance criteria

### Cockpit ACs (defined by `plans/us-34/plan.md`)

- **AC-1 Verdict computation** — `computeVerdict(input)` deterministically routes to one of six labels via the precedence chain (ACT NOW → TARGET HIT → CONSIDER ROLL → WATCH-delta → WATCH-DTE → HOLD). Greeks-absent collapses to HOLD with sub "Awaiting market data"; no-active-leg routes to the `SHARES_VERDICT` constant ("NO ACTIVE LEG").
- **AC-2 DTE-aware delta severity** — When `dte ≤ 7`, every delta-severity threshold drops by 0.05 (CSP danger 0.45 → 0.40, CSP warning 0.30 → 0.25, CC danger 0.50 → 0.45, CC warning 0.35 → 0.30). The `DeltaGauge` label suffix flips from `DELTA` to `DELTA · TIGHT`.
- **AC-3 Verdict block layout** — Tinted-gradient container derived from `verdict.color` via runtime `color-mix()`. Top row: ticker (large, `font-sans`), phase pill (tinted from `phaseColor`), key facts strip (strike in gold, DTE red ≤3 / gold ≤7, underlying). Verdict + P&L row uses a two-column grid `minmax(280px, 1.1fr) 1fr` when `pnl` is present, single column when null. The verdict pill is a rounded full pill with a coloured dot, mono-uppercase label, and a sans-serif sub-reason line.
- **AC-4 Delta gauge** — 108 px default, stroke 6 px, clockwise arc fill (`-rotate-90`), `strokeLinecap="round"`, `stroke-dashoffset` transition 0.4 s ease. Centre shows `absDelta.toFixed(2)` at 22 px bold in the severity colour; sub-label is `DELTA` or `DELTA · TIGHT` (when `dte ≤ 7`) in 9 px mono.
- **AC-5 Distance thermometer** — Multi-stop `linear-gradient` track built with `color-mix()` (cannot be expressed as Tailwind); height 14 px, radius 7 px. Vertical strike marker at 50 % at 60 % opacity. Underlying marker `left` percentage clamped to `[0%, 100%]`. 26 px bold-mono dollar headline above the track in the severity colour.
- **AC-6 Context strip** — Four columns (Theta / IV / Vega / Gamma) in `grid grid-cols-4 gap-px bg-wb-border`. Theta: `computeThetaYield` rendered as `$X.XX/d`, green when `yieldPct ≥ 50`. IV: `(iv × 100).toFixed(1) + '%'`, sub-line "rank N" when `ivRank` provided. Vega: `fmtMoney(vega × 100)`. Gamma: `|gamma|.toFixed(3)`; cell turns gold and sub flips to "elevated near expiry" when `dte ≤ 7 && |gamma| ≥ 0.04`. `ContextStrip` returns `null` when greeks are absent.
- **AC-7 Collapsible drawers** — Two drawers under the risk / context cards: "Leg reference" (5 or 6 fields depending on whether a snapshot is present) and "Cost basis & history" (2 stats + optional `LegHistoryTable`). Header: chevron (▶ closed / ▼ open) + title + "N fields" right-label. Collapsed by default when an active leg exists; "Cost basis & history" is `defaultOpen` when there is no active leg. Built on shadcn `<Collapsible>` for accessible keyboard toggle + `aria-expanded`.
- **AC-8 No-active-leg state** — `HOLDING_SHARES` (or any state without `activeLeg`) renders only `<VerdictBlock>` with `SHARES_VERDICT` and `pnl={null}`, plus the "Cost basis & history" drawer `defaultOpen`. `RiskSnapshot`, `ContextStrip`, and the "Leg reference" drawer are not rendered.
- **AC-9 Live data binding** — `PositionDetailPage` calls both `useOptionSnapshots(legSummaries)` (greeks + mid) and `useStockQuotes([position.ticker])` (underlying). Snapshot-absent → no `<RiskSnapshot>` or `<ContextStrip>` (graceful null); the cockpit still renders verdict + drawers.
- **AC-10 Existing surfaces preserved below the cockpit** — Notes `<SectionCard>`, closed-position banner, and `<CloseCspForm>` (when `phase === 'CSP_OPEN' && activeLeg`) all render below `<PositionCockpit>` inside `PositionDetailContent`. The `DETAIL_OVERLAY_STYLE` blur on `<main>` and `data-testid="position-detail"` are preserved.

### Subsumed US-34 greeks-display ACs (from `docs/epics/06-stories/US-34-greeks-display.md`)

All nine of the original greeks-display ACs are satisfied via `RiskSnapshot` + `ContextStrip`, not a dedicated `GreeksPanel`:

- **Greeks panel displays on position detail page** — delta in `RiskSnapshot.DeltaGauge`; theta / IV / vega / gamma in `ContextStrip`.
- **Delta with assignment-probability color coding for CSP** — `|delta| < 0.30` green, 0.30–0.45 gold, > 0.45 red. The centre value shows the absolute delta (sign stripped per display convention).
- **Delta turns gold at moderate assignment risk** — warning tier of `deltaSeverity`, reflected in the gauge fill colour.
- **Delta turns red at high assignment risk** — danger tier of `deltaSeverity`.
- **Delta thresholds differ for covered calls** — CC: green < 0.35, gold 0.35–0.50, red > 0.50.
- **Theta displays as daily dollar decay** — `computeThetaYield(...)` converts `|theta| × 100 × contracts` to `$X.XX/d` via `fmtMoney`.
- **IV displays with context label** — `ContextStrip` IV cell shows `(iv × 100).toFixed(1) + '%'` with label "IV" and optional "rank N" sub-line.
- **Greeks unavailable — placeholder** — `ContextStrip` returns `null` (entire strip absent), verdict falls back to "HOLD — Awaiting market data". No error alert.
- **HOLDING_SHARES with no open leg — no Greeks panel** — the no-active-leg branch omits both `ContextStrip` and `RiskSnapshot`.
- **Greeks update on poll without page reload** — reactive via TanStack Query (`useOptionSnapshots`); no new wiring needed (inherited from [us-33](us-33-option-mid-pnl.md)).

## What was built

### Cockpit component decomposition

Eight new files under `src/renderer/src/components/position-cockpit/`, each independently testable. One-line descriptions:

- **`PnlBar`** — horizontal progress bar with runtime fill width and threshold-coloured fill (green ≥ 25 %, gold ≥ 0 %, red < 0 %), with a thin marker at 50 %.
- **`DeltaGauge`** — 108 px circular SVG gauge with track + fill circles, centre-rendered `absDelta`, and a `DELTA` / `DELTA · TIGHT` sub-label.
- **`DistanceThermo`** — horizontal gradient thermometer with a strike marker at 50 % and a clamped underlying marker keyed to `dist.pct`.
- **`ContextStrip`** — four-column greeks strip (Theta / IV / Vega / Gamma) wrapped in `<SectionCard header="Context">`; returns `null` when greeks are absent.
- **`RiskSnapshot`** — two-pane card composing `<DeltaGauge>` and `<DistanceThermo>` inside `<SectionCard header="Risk snapshot">`; returns `null` when greeks are absent.
- **`VerdictBlock`** — tinted-gradient container with top row (ticker / phase pill / key facts) plus the verdict pill on the left and a `PnlSummary` (sub-component over `<PnlBar>`) on the right.
- **`CollapsedDrawer`** — shadcn-`Collapsible` wrapper with a chevron header, title, "N fields" right label, and `data-[state=open]:` attribute-variant styling for the chevron.
- **`PositionCockpit`** — top-level orchestrator composing the seven primitives plus `<LegHistoryTable>`; assembles `CockpitInput` via the `buildCockpitInput` helper and switches between active-leg and no-active-leg branches.

### Pure logic module

All verdict, severity, and derived-math logic lives in `src/renderer/src/lib/verdict.ts` as pure functions (mirroring the project rule that `src/main/core/` engines have no I/O imports, applied at the renderer layer): `computeVerdict`, `computePnl`, `computeDistance`, `computeThetaYield`, `deltaSeverity`, plus the constants `SEVERITY_COLOR`, `SHARES_VERDICT`, and `MANAGEMENT_RULES`. Components never decide "which verdict?" — they call `computeVerdict(input)` and render. Fourteen unit tests cover every branch and threshold.

### Page wiring

`PositionDetailPage` calls `useStockQuotes(data ? [data.position.ticker] : [])` alongside `useOptionSnapshots(legSummaries)` and derives `underlyingPrice = stockQuotesQuery.data?.[ticker]?.price ?? null`. The new prop threads down through `PositionDetailContent` → `PositionCockpit` (`OptionSnapshot` is **not** extended to carry the underlying — out-of-scope backend change). `PositionDetailContent` becomes a thin wrapper that renders `<PositionCockpit>` plus the preserved Notes / closed-banner / `CloseCspForm` below it; it retains the `DETAIL_OVERLAY_STYLE` blur on its `<main>` and `data-testid="position-detail"`.

## Architecture decisions

- **Subsume the greeks story into a cockpit redesign** — replace `PositionDetailContent`'s body with `<PositionCockpit>` rather than ship a standalone `GreeksPanel`. A single glanceable verdict ("ACT NOW", "TARGET HIT") is more actionable than five raw numbers → [[subsume-greeks-into-cockpit]]
- **Deterministic verdict via pure `computeVerdict`** — all routing lives in `src/renderer/src/lib/verdict.ts`; the component layer renders pre-computed values. Mirrors the `src/main/core/` purity rule at the renderer → [[verdict-pure-compute]]
- **Six-rule precedence chain, first match wins** — ACT NOW (dte ≤ 3 && |delta| > 0.50) → TARGET HIT (pnl ≥ 50 %) → CONSIDER ROLL (danger delta or ITM) → WATCH (warning delta) → WATCH (21 ≥ dte > 7) → HOLD. Imminent expiration with ITM exposure trumps everything; profit target overrides delta severity → [[verdict-precedence-chain]]
- **DTE-aware delta severity shift** — when `dte ≤ 7`, all delta-severity thresholds drop by 0.05. Gamma rises sharply near expiry, so a constant threshold under-warns close to expiration → [[dte-aware-delta-severity]]
- **Underlying price via `useStockQuotes` from US-32** — `OptionSnapshot` does not carry the underlying; the stock-quote stream (built in [us-31](us-31-market-data-provider-adapter.md), consumed in [us-32](us-32-live-position-prices.md)) is the correct source. `PositionDetailPage` calls `useStockQuotes([position.ticker])` and threads the price down as a prop → [[underlying-via-stockquotes]]
- **shadcn `Collapsible` for drawers** — the primitive ships accessible keyboard toggle + `aria-expanded` for free; rolling our own with `useState` (as the handoff prototype did) would duplicate that → [[shadcn-collapsible-drawers]]
- **Leg history table lives inside the Cost-basis drawer** — AC-7 specifies the drawer "contains the leg history table when expanded". The cockpit's premise is "compress everything below the verdict into collapsible reference"; history is reference, not action → [[leg-history-in-cost-basis-drawer]]
- **No-active-leg branch renders differently** — without an option leg there are no greeks, no distance-to-strike, no P&L. Render only `<VerdictBlock>` with `SHARES_VERDICT` and the "Cost basis & history" drawer `defaultOpen` → [[no-active-leg-cockpit-branch]]
- **One file per cockpit part** — eight files under `components/position-cockpit/` plus the verdict module. Mirrors the handoff prototype's structure so the visual reference maps file-for-file; each unit gets its own `*.spec.tsx` → [[cockpit-component-decomposition]]
- **IV reads from `snapshot.greeks.iv`** — the handoff component incorrectly read `snapshot.impliedVolatility`, which does not exist on `OptionSnapshot`. The real field is `OptionGreeks.iv: string` (parseFloat'd in `buildCockpitInput`).
- **Inline `style` only for runtime values** — permitted exclusively for `color-mix()` over runtime colour variables, dynamic SVG attributes, dynamic widths/positions, and the `gridTemplateColumns` switch in `VerdictBlock` (two-column vs single-column based on whether `pnl` is present). All static layout uses Tailwind `wb-*` tokens.
- **`MANAGEMENT_RULES` constants drive tests** — test files reference `MANAGEMENT_RULES.tightDte`, `MANAGEMENT_RULES.actNowDte`, `MANAGEMENT_RULES.cspDangerDelta`, etc. — not hardcoded magic numbers. Keeps assertions valid if thresholds become user-configurable in a later story.

## Contracts touched

**No new IPC channels, no Zod schemas, no preload bridge additions.** All renderer-side types:

- **`CockpitInput`** — pure-logic input assembled by `buildCockpitInput({ position, activeLeg, snapshot, underlyingPrice })`. Fields: `instrument` ('SELL PUT' | 'SELL CALL'), `expiration`, `strike`, `contracts`, `premiumPerContract`, `currentMid`, `underlying`, `greeks: { delta, theta, gamma, vega, iv } | null`, `earnings: null`. All numerics are `parseFloat`'d off the underlying string fields. The verdict module accepts both `'PUT'/'CALL'` (short form derived from `phase`) and `'SELL PUT'/'SELL CALL'` (long form documented in `data-model.md`).
- **`Verdict`** — `{ kind: VerdictKind; label: string; sub: string; color: string }`. `VerdictKind = 'hold' | 'watch' | 'consider-roll' | 'act-now' | 'target-hit' | 'shares'`. Labels: `'HOLD' | 'WATCH' | 'CONSIDER ROLL' | 'ACT NOW' | 'TARGET HIT' | 'NO ACTIVE LEG'`. `color` is a CSS-variable reference (`var(--wb-green)` / `var(--wb-gold)` / `var(--wb-red)` / `var(--wb-sky)`). The no-active-leg constant is exported as `SHARES_VERDICT`.
- **`Severity` + `SEVERITY_COLOR`** — `'normal' | 'warning' | 'danger'` mapped to `var(--wb-green)` / `var(--wb-gold)` / `var(--wb-red)`. `deltaSeverity(absDelta, instrument, dte)` returns the appropriate tier with the −0.05 shift applied when `dte ≤ 7`.
- **`Distance` / `Pnl` / `ThetaYield`** — derived shapes produced by `computeDistance` / `computePnl` / `computeThetaYield`. `Distance` carries `{ dollars, pct, severity, isITM }`; `Pnl` carries `{ captured, max, pct }`; `ThetaYield` carries `{ thetaDollar, yieldPct }`.
- **`PositionCockpitProps`** — `{ detail: PositionDetail; snapshot?: OptionSnapshot; underlyingPrice?: string | null; ivRank?: number | null }`. `ivRank` is forward-compat only; not yet sourced.
- **`PositionDetailContentProps`** — gains optional `underlyingPrice?: string | null` (mirrors the page's derivation).

No changes to [contracts/ipc-handlers.md](../contracts/ipc-handlers.md) — `positions:get`, `market-data:option-snapshots`, `market-data:stock-quotes`, and `market-data:market-status` are unchanged. The cockpit re-uses the existing hooks from [us-32](us-32-live-position-prices.md) (`useStockQuotes`, `useMarketStatus`) and [us-33](us-33-option-mid-pnl.md) (`useOptionSnapshots`).

## Schema changes

None. No SQLite tables added, no migrations, no IPC channels. All data is transient — fetched from existing US-31 / US-32 / US-33 hooks and held in renderer memory.

## Decisions & tradeoffs

- **`instrument` encoding is dual.** `CockpitInput.instrument` is documented as `'SELL PUT' | 'SELL CALL'` in `data-model.md`; the actual code in `PositionCockpit.tsx` derives `instrument = phase === 'CC_OPEN' ? 'CALL' : 'PUT'` and passes the short form. `computeVerdict` accepts both.
- **Leg-reference drawer field count is `snapshot ? 6 : 5`.** The sixth field (Current Mid) only renders when a snapshot is present. Other fields: Strike (gold), Expiration, Contracts, Premium/Contract (green), Fill Date.
- **Cost-basis drawer always shows 2 stats.** Effective Basis/Share (sky) + Premium Collected (green). `<LegHistoryTable>` renders below the stats only when `enrichedLegs.length > 0`.
- **`PnlBar` color thresholds.** pct ≥ 25 → green; pct ≥ 0 → gold; pct < 0 → red; centre marker at 50 %.
- **`DeltaGauge` is two SVG circles.** Track is `stroke="var(--wb-border)" strokeWidth={6}`; fill uses runtime `stroke={color}` and `strokeDashoffset` from arc math. Rotation `-rotate-90` puts 0° at 12 o'clock so the arc fills clockwise.
- **`DistanceThermo` underlying marker clamps.** When `|dist.pct|` exceeds the hard-coded range, the marker `left` percentage clamps to 0 % or 100 % instead of overflowing.
- **`RiskSnapshot` reading copy.** `severityReading(sev)`: normal → "Low — comfortably out of the money"; warning → "Elevated — monitor closely"; danger → "High — strike likely breached". Probability label is "Assignment probability" for SELL PUT, "Call-away probability" for SELL CALL.
- **`VerdictBlock` color-mix helpers** — `tintBackground` / `tintBorder` / `tintFill` / `pnlPctColor` extracted to remove duplicated `color-mix(in srgb, ${color} X%, transparent)` strings across the component.
- **`CostBasisDrawer` extracted during refactor** — identical drawer JSX in the no-active-leg and active-leg branches was hoisted to a single local component called with different `defaultOpen` / `enrichedLegs` props.
- **`buildCockpitInput` helper extracted** — `CockpitInput` construction (the parseFloat chain + conditional greeks) factored out of the render path with a typed `BuildCockpitInputArgs` parameter.
- **`phaseLabel` / `phaseColor` hoisted** — `PHASE_LABEL[position.phase]` and `PHASE_COLOR[position.phase]` looked up once at the top of `PositionCockpit` rather than re-derived at each `VerdictBlock` call site.
- **`deltaSeverity` thresholds extracted to instrument-keyed table** — replaces parallel if/else per-instrument branches with a single threshold lookup; 12 lines of duplicated comparison logic collapsed to 8.
- **`PositionDetailPage` error fallback uses Tailwind margins.** `<div className="my-4 mx-6">` replaces an inline `style={{ margin: '16px 24px' }}`. The unrelated `DETAIL_OVERLAY_STYLE` blur / opacity object on `<main>` is intentionally preserved inline because three pre-existing tests assert `toHaveStyle({ filter: 'blur(1.5px)', ... })`, which only matches inline styles in JSDOM.
- **`useStockQuotes` is a no-op for empty ticker lists.** `PositionDetailPage` calls `useStockQuotes(data ? [data.position.ticker] : [])` so the hook is safely invoked even when `data` is null (US-32 behaviour).
- **No new `SectionCard` cousins.** `RiskSnapshot` and `ContextStrip` both wrap themselves in the existing `<SectionCard header="...">`. No new card primitive added.
- **No standalone `SANS` token in `lib/tokens.ts`.** The ticker headline uses Tailwind's `font-sans` class; adding an `export const SANS = '...'` would only enable inline `style.fontFamily`, violating the inline-style rule.
- **`MarketStatusPill` placement** — pre-existing market-status pill on the detail header is unchanged by this story. No "POLL" / timing copy is introduced (see project memory).
- **42 page-level integration tests pass.** `PositionDetailPage.test.tsx` had 16 existing tests rewritten to expand the relevant drawer before asserting (since "Current Mid", leg history rows, etc. now sit inside collapsed drawers), plus 4 new tests (verdict pill present; NO ACTIVE LEG; ContextStrip greeks visible; RiskSnapshot absent when snapshot absent).
- **E2E fixture defaults** — `launchWithMocks(dbPath, opts?)` defaults `quotes` to `{ AAPL: AAPL_QUOTE }` and `optionSnapshots` to `{}`. Tests that want "no market data" call `launchWithMocks(dbPath)` with no options.

## Source files

- `src/renderer/src/lib/verdict.ts` — pure verdict module: `computeVerdict`, `computePnl`, `computeDistance`, `computeThetaYield`, `deltaSeverity`, `SEVERITY_COLOR`, `SHARES_VERDICT`, `MANAGEMENT_RULES`
- `src/renderer/src/lib/verdict.spec.ts` — 14 unit tests across every verdict branch, severity shift, and helper
- `src/renderer/src/components/position-cockpit/PnlBar.tsx` + `PnlBar.spec.tsx`
- `src/renderer/src/components/position-cockpit/DeltaGauge.tsx` + `DeltaGauge.spec.tsx`
- `src/renderer/src/components/position-cockpit/DistanceThermo.tsx` + `DistanceThermo.spec.tsx`
- `src/renderer/src/components/position-cockpit/CollapsedDrawer.tsx` + `CollapsedDrawer.spec.tsx`
- `src/renderer/src/components/position-cockpit/ContextStrip.tsx` + `ContextStrip.spec.tsx` (11 tests, includes the gamma-amber near-expiry rule)
- `src/renderer/src/components/position-cockpit/RiskSnapshot.tsx` + `RiskSnapshot.spec.tsx`
- `src/renderer/src/components/position-cockpit/VerdictBlock.tsx` + `VerdictBlock.spec.tsx` — verdict pill + `PnlSummary` local sub-component
- `src/renderer/src/components/position-cockpit/PositionCockpit.tsx` + `PositionCockpit.spec.tsx` (12 integration tests); houses `buildCockpitInput` helper + `CostBasisDrawer` local component
- `src/renderer/src/components/ui/collapsible.tsx` — shadcn primitive added via `pnpm dlx shadcn@latest add collapsible`
- `src/renderer/src/pages/PositionDetailPage.tsx` — adds `useStockQuotes(data ? [data.position.ticker] : [])` and derives `underlyingPrice`
- `src/renderer/src/pages/PositionDetailContent.tsx` — body replaced with `<PositionCockpit>`; removes prior stat-derivation imports (`computeUnrealizedPnl`, `pnlClass`, `formatPnlPercentForDisplay`, `formatSignedMoney`, `deriveRunningBasis`, `LegHistoryTable`, `StatGrid`, `fmtMoney`); preserves Notes / closed-position banner / `CloseCspForm` below the cockpit
- `src/renderer/src/pages/PositionDetailPage.test.tsx` — 16 tests rewritten + 4 new tests added (42 total)
- `e2e/position-cockpit.spec.ts` — 24 Playwright `_electron` tests (10 cockpit ACs + 9 US-34 scenarios + verdict-routing variants)

Reference-only (handoff prototype, not the source of truth):

- `plans/us-33/handoff/Position Cockpit Mockup.html` — pixel target with six state toggles (target-hit, csp-safe, approaching, itm-urgent, cc-moderate, holding-shares)
- `plans/us-33/handoff/src/components/position-cockpit/*.tsx` — handoff React components used as shape/logic reference; two corrections applied when porting: `iv` reads from `snapshot.greeks.iv` (not `snapshot.impliedVolatility`), and `underlying` reads from the new `underlyingPrice` prop (not the snapshot)

## Open questions

None recorded. `plans/us-34/research.md`: "All unknowns resolved; no NEEDS CLARIFICATION items remain."

Deferred / out-of-scope items called out in the story or research:

- **`ivRank`** — accepted on `PositionCockpit` props for forward compatibility but not yet sourced; the IV cell's "rank N" sub-line never renders today. Requires historical IV data (future enhancement).
- **Earnings flag** — `CockpitInput.earnings: null` is hard-wired; no earnings calendar integration.
- **Greeks-based alerts** — Tier 3 alerts (Epic 08 Alert Engine) reference cockpit thresholds but are not implemented here.
- **Greeks on the position list** — out of scope; only the cockpit (detail page) exposes greeks today.
- **`pnpm test:e2e` GUI-terminal requirement** — CLAUDE.md says e2e must run from a GUI terminal; the 24 e2e tests have been written and validated by the implementing agent in their own environment.
<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
