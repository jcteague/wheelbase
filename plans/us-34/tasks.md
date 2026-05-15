# US-34 — Position Cockpit (Triage Cockpit) Redesign — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off

---

## Layer 1 — Foundation (no cross-area dependencies)

> All five areas can be started immediately and run in parallel.

### Area 1: Verdict Logic (`lib/verdict.ts`)

- [x] **[Red]** Write failing tests — `src/renderer/src/lib/verdict.spec.ts`
  - Test cases:
    - `computeVerdict — target-hit branch`: pnl.pct ≥ 50 (currentMid=0.75 on 3.50 premium) → kind==='target-hit', color==='var(--wb-green)'
    - `computeVerdict — act-now branch`: dte ≤ 3 and |delta| > 0.50 → kind==='act-now', color==='var(--wb-red)', sub includes 'ITM'
    - `computeVerdict — consider-roll (danger delta)`: CSP with |delta|=0.52 → kind==='consider-roll'
    - `computeVerdict — consider-roll (ITM)`: dist.isITM=true → kind==='consider-roll', sub includes 'ITM by $'
    - `computeVerdict — watch (warning delta)`: CSP with |delta|=0.35 → kind==='watch', color==='var(--wb-gold)'
    - `computeVerdict — watch (DTE window)`: |delta|=0.15, dte=14 → kind==='watch', sub includes '14 DTE'
    - `computeVerdict — hold`: |delta|=0.15, dte=30, pnl.pct=20 → kind==='hold', color==='var(--wb-green)'
    - `computeVerdict — no data`: greeks=null → kind==='hold', sub==='Awaiting market data'
    - `deltaSeverity — DTE-aware shift`: CSP, |delta|=0.41, dte=5 → 'danger' (threshold drops to 0.40)
    - `deltaSeverity — CC thresholds`: CC, |delta|=0.42 → 'warning' (between 0.35 and 0.50)
    - `computePnl — captured %`: premiumPerContract=3.50, currentMid=1.75 → pct≈50
    - `computeDistance — OTM CSP`: underlying=185, strike=180 → dollars=5, pct≈2.78, isITM=false
    - `computeDistance — ITM CSP`: underlying=175, strike=180 → isITM=true, severity='danger'
    - `computeThetaYield`: theta=-0.05, contracts=1, dte=21, premiumPerContract=3.50 → thetaDollar≈5, yieldPct≈30
  - Run `pnpm test src/renderer/src/lib/verdict.spec.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/lib/verdict.ts` _(depends on: Verdict Logic Red ✓)_
  - Copy `plans/us-33/handoff/src/lib/verdict.ts` verbatim
  - Fix import: `import { computeDte } from './format'` (already correct for lib/ dir)
  - Do NOT add `SANS` to `lib/tokens.ts`
  - Export `SEVERITY_COLOR` typed as `Record<Severity, string>`
  - Run `pnpm test src/renderer/src/lib/verdict.spec.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/lib/verdict.ts` _(depends on: Verdict Logic Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Confirm `SEVERITY_COLOR` is exported and typed as `Record<Severity, string>`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 2: `PnlBar` component

- [x] **[Red]** Write failing tests — `src/renderer/src/components/position-cockpit/PnlBar.spec.tsx`
  - Test cases:
    - `renders progressbar role with aria-valuenow`: pnl={pct:35, captured:122.5, max:350} → role="progressbar" and aria-valuenow="35"
    - `aria-valuemin is 0 and aria-valuemax is 100`
    - `renders without crashing when pct is negative` (loss scenario)
  - Run `pnpm test src/renderer/src/components/position-cockpit/PnlBar.spec.tsx` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/position-cockpit/PnlBar.tsx` _(depends on: PnlBar Red ✓)_
  - Reference: `plans/us-33/handoff/src/components/position-cockpit/PnlBar.tsx`
  - Track container: `relative h-2.5 rounded overflow-hidden border border-wb-border bg-wb-bg-base` (Tailwind)
  - Fill div: inline `style={{ width: fillWidth, background: color }}` for runtime values; `opacity-85 absolute inset-0 transition-[width] duration-400 ease-in-out` as Tailwind
  - 50% marker: `absolute top-[-2px] bottom-[-2px] left-1/2 w-px opacity-50 bg-wb-text-primary`
  - Colors: pct ≥ 25 → `var(--wb-green)`, pct ≥ 0 → `var(--wb-gold)`, else → `var(--wb-red)`
  - `role="progressbar"`, `aria-valuenow={Math.round(pct)}`, `aria-valuemin={0}`, `aria-valuemax={100}`
  - Run `pnpm test src/renderer/src/components/position-cockpit/PnlBar.spec.tsx` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/position-cockpit/PnlBar.tsx` _(depends on: PnlBar Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 3: `DeltaGauge` component

- [x] **[Red]** Write failing tests — `src/renderer/src/components/position-cockpit/DeltaGauge.spec.tsx`
  - Test cases:
    - `renders center delta value to 2dp`: absDelta=0.28 → text "0.28"
    - `renders DELTA label without TIGHT suffix when tight=false`
    - `renders DELTA · TIGHT when tight=true (DTE ≤ 7)`
    - `renders two circles (track + fill)`: SVG has 2 `<circle>` elements
  - Run `pnpm test src/renderer/src/components/position-cockpit/DeltaGauge.spec.tsx` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/position-cockpit/DeltaGauge.tsx` _(depends on: DeltaGauge Red ✓)_
  - Reference: `plans/us-33/handoff/src/components/position-cockpit/DeltaGauge.tsx`
  - Wrapper: `relative flex-shrink-0` with inline `style={{ width: size, height: size }}` (runtime numeric)
  - SVG: `transform: rotate(-90deg)` inline (rotation + sizing combination)
  - Track circle: `stroke="var(--wb-border)" strokeWidth={6} fill="none"` attributes
  - Fill circle: `stroke={color}` attribute (runtime), `strokeDashoffset` from arc math, `strokeLinecap="round"`, inline `style={{ transition: 'stroke-dashoffset 0.4s ease' }}`
  - Center overlay: `absolute inset-0 flex flex-col items-center justify-center font-wb-mono text-wb-text-primary`
  - Delta value: inline `style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}`
  - DELTA label: `text-[9px] text-wb-text-muted tracking-[0.1em] mt-1` (Tailwind)
  - Run `pnpm test src/renderer/src/components/position-cockpit/DeltaGauge.spec.tsx` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/position-cockpit/DeltaGauge.tsx` _(depends on: DeltaGauge Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 4: `DistanceThermo` component

- [x] **[Red]** Write failing tests — `src/renderer/src/components/position-cockpit/DistanceThermo.spec.tsx`
  - Test cases:
    - `renders without crashing for OTM position`: dist={pct:2.5, dollars:4.5, severity:'normal', isITM:false}
    - `renders without crashing for ITM position`: dist={pct:-1.2, dollars:-2.16, severity:'danger', isITM:true}
    - `underlying marker clamps to range`: pct=10 (beyond range=5) → underlying marker left clamped to '100%' or equivalent
  - Run `pnpm test src/renderer/src/components/position-cockpit/DistanceThermo.spec.tsx` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/position-cockpit/DistanceThermo.tsx` _(depends on: DistanceThermo Red ✓)_
  - Reference: `plans/us-33/handoff/src/components/position-cockpit/DistanceThermo.tsx`
  - Outer wrapper: `w-full`
  - Track: inline `style={{ ...trackStyle }}` for multi-stop `linear-gradient` with `color-mix()` — cannot be Tailwind
  - Strike marker: `absolute -top-1 -bottom-1 left-1/2 w-0.5 -translate-x-1/2 bg-wb-text-primary opacity-60`
  - Underlying marker: inline `style={{ left: '${x}%', background: color }}` for runtime values; `absolute -top-0.5 -bottom-0.5 w-1 -translate-x-1/2 rounded-sm` as Tailwind
  - Label row: `flex justify-between font-wb-mono text-[9px] text-wb-text-muted mt-1.5 tracking-[0.05em]`
  - Run `pnpm test src/renderer/src/components/position-cockpit/DistanceThermo.spec.tsx` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/position-cockpit/DistanceThermo.tsx` _(depends on: DistanceThermo Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 5: `CollapsedDrawer` component

> **Prerequisite:** Run `pnpm dlx shadcn@latest add collapsible` before implementing Green.

- [x] **[Red]** Write failing tests — `src/renderer/src/components/position-cockpit/CollapsedDrawer.spec.tsx`
  - Test cases:
    - `shows title and N fields text in header`
    - `content is hidden by default when defaultOpen is not set`
    - `content is visible when defaultOpen={true}`
    - `clicking header toggles content visibility`
    - `aria-expanded is false by default, true after click`
  - Run `pnpm test src/renderer/src/components/position-cockpit/CollapsedDrawer.spec.tsx` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/position-cockpit/CollapsedDrawer.tsx` _(depends on: CollapsedDrawer Red ✓)_
  - First: `pnpm dlx shadcn@latest add collapsible` (adds `src/renderer/src/components/ui/collapsible.tsx`)
  - Import `{ Collapsible, CollapsibleTrigger, CollapsibleContent }` from `@/components/ui/collapsible`
  - Root: `<Collapsible defaultOpen={defaultOpen}>`
  - Trigger: `<CollapsibleTrigger asChild><button type="button" ...>` — full-width, `flex items-center justify-between`
  - Left side: chevron (▶/▼, open-state aware) + title `font-wb-mono text-[11px] font-semibold tracking-[0.1em] uppercase text-wb-text-muted`
  - Right side: `{fieldCount} fields` in `font-wb-mono text-[11px] text-wb-text-muted`
  - Container: `bg-wb-surface border border-wb-border rounded-lg`
  - Content: `<CollapsibleContent>{children}</CollapsibleContent>`
  - Run `pnpm test src/renderer/src/components/position-cockpit/CollapsedDrawer.spec.tsx` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/position-cockpit/CollapsedDrawer.tsx` _(depends on: CollapsedDrawer Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — Composite Components (depends on Layer 1 Green tasks)

> These three areas can run in parallel with each other after their Layer 1 dependencies are complete.

### Area 6: `ContextStrip` component

**Requires:** Verdict Logic Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/components/position-cockpit/ContextStrip.spec.tsx` _(depends on: Verdict Logic Green ✓)_
  - Test cases:
    - `renders null when greeks are absent`: greeks=null → renders nothing
    - `renders Theta as dollar-per-day`: theta=-0.05, contracts=1, dte=21 → displays `$5.00/d`
    - `renders IV as percentage`: greeks.iv=0.32 → displays `32.0%`
    - `renders Vega per 1% IV move`: greeks.vega=0.12 → displays `$12.00` (vega × 100)
    - `renders Gamma to 3dp`: greeks.gamma=0.015 → displays `0.015`
    - `gamma cell is amber (text-wb-gold) when dte ≤ 7 and |gamma| ≥ 0.04`
    - `gamma cell is not amber when dte > 7 even if |gamma| ≥ 0.04`
    - `gamma cell is not amber when dte ≤ 7 but |gamma| < 0.04`
    - `gamma sub reads "elevated near expiry" when elevated, "delta sensitivity" otherwise`
    - `theta sub shows ivRank when provided`: ivRank=42 → IV cell sub reads `rank 42`
    - `theta value is text-wb-green when yieldPct ≥ 50`
  - Run `pnpm test src/renderer/src/components/position-cockpit/ContextStrip.spec.tsx` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/position-cockpit/ContextStrip.tsx` _(depends on: ContextStrip Red ✓)_
  - Reference: `plans/us-33/handoff/src/components/position-cockpit/ContextStrip.tsx`
  - Return null when `!input.greeks`
  - Wrap in `<SectionCard header="Context">`
  - Inner grid: `grid grid-cols-4 gap-px bg-wb-border`
  - Each KV cell: `bg-wb-surface p-3.5 px-4.5 flex flex-col gap-0.5`
  - Label: `font-wb-mono text-[9.5px] font-semibold tracking-[0.12em] uppercase text-wb-text-muted`
  - Value: `font-wb-mono text-sm font-semibold text-wb-text-primary` + conditional `text-wb-green` or `text-wb-gold`
  - Theta: `computeThetaYield(input, dte)` → `$X.XX/d` via `fmtMoney`
  - IV: `(greeks.iv * 100).toFixed(1) + '%'`; Vega: `fmtMoney(String(greeks.vega * 100))`; Gamma: `Math.abs(greeks.gamma).toFixed(3)`
  - Run `pnpm test src/renderer/src/components/position-cockpit/ContextStrip.spec.tsx` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/position-cockpit/ContextStrip.tsx` _(depends on: ContextStrip Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Extract `KV` as a local function in the same file if not already done
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 7: `RiskSnapshot` component

**Requires:** DeltaGauge Green ✓, DistanceThermo Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/components/position-cockpit/RiskSnapshot.spec.tsx` _(depends on: DeltaGauge Green ✓, DistanceThermo Green ✓)_
  - Test cases:
    - `renders null when greeks are absent`: greeks=null → renders nothing
    - `renders "Assignment probability" label for CSP (SELL PUT)`
    - `renders "Call-away probability" label for CC (SELL CALL)`
    - `delta gauge label reads "DELTA" without TIGHT when dte > 7`
    - `delta gauge label reads "DELTA · TIGHT" when dte ≤ 7`
    - `distance headline shows signed dollar amount and percentage`
    - `OTM reading shows "Low — comfortably out of the money"`
    - `danger reading shows "High — strike likely breached"`
  - Run `pnpm test src/renderer/src/components/position-cockpit/RiskSnapshot.spec.tsx` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/position-cockpit/RiskSnapshot.tsx` _(depends on: RiskSnapshot Red ✓)_
  - Reference: `plans/us-33/handoff/src/components/position-cockpit/RiskSnapshot.tsx`
  - Guard: `if (!input.greeks) return null`
  - Wrap in `<SectionCard header="Risk snapshot">`
  - Two-pane grid: `grid grid-cols-2 gap-px bg-wb-border`; each cell: `bg-wb-surface p-5 px-5.5`
  - Left (delta): `flex items-center gap-4.5` — `<DeltaGauge>` + label stack
  - Right (distance): header row `flex justify-between items-baseline mb-2`; dollar headline inline `style={{ color: distColor }}` + `font-wb-mono text-[26px] font-bold leading-none`; `<DistanceThermo>`
  - `const tight = computeDte(input.expiration) <= 7`
  - Run `pnpm test src/renderer/src/components/position-cockpit/RiskSnapshot.spec.tsx` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/position-cockpit/RiskSnapshot.tsx` _(depends on: RiskSnapshot Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 8: `VerdictBlock` component

**Requires:** Verdict Logic Green ✓, PnlBar Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/components/position-cockpit/VerdictBlock.spec.tsx` _(depends on: Verdict Logic Green ✓, PnlBar Green ✓)_
  - Test cases:
    - `renders ticker symbol prominently`
    - `renders phase pill with phaseLabel text`
    - `renders verdict pill with verdict.label text`
    - `renders verdict.sub reason text`
    - `renders DTE with red color class when dte ≤ 3`: expiration=today+2 days → DTE span has red styling
    - `renders DTE with gold color when dte ≤ 7`
    - `renders P&L % captured when pnl is provided`: pnl={pct:62, captured:217, max:350} → "62%" visible
    - `P&L panel is absent when pnl is null` (no active leg / no snapshot)
    - `renders underlying price when present in input`
  - Run `pnpm test src/renderer/src/components/position-cockpit/VerdictBlock.spec.tsx` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/position-cockpit/VerdictBlock.tsx` _(depends on: VerdictBlock Red ✓)_
  - Reference: `plans/us-33/handoff/src/components/position-cockpit/VerdictBlock.tsx`
  - Container: inline `style={{ background: 'linear-gradient(...color-mix...)', border: ..., borderRadius: 12, padding: 22 }}` + `flex flex-col gap-4` Tailwind
  - Ticker: `font-sans text-[26px] font-bold tracking-[0.02em] text-wb-text-primary`
  - Phase pill: inline `style={{ background: color-mix, border: color-mix, color: phaseColor }}` + Tailwind for layout/font
  - DTE: `dteClass = dte <= 3 ? 'text-wb-red font-semibold' : dte <= 7 ? 'text-wb-gold font-semibold' : ''`
  - Verdict+P&L grid: inline `style={{ gridTemplateColumns: pnl ? '...' : '1fr' }}`
  - `PnlSummary` local sub-component in same file; big % inline `style={{ color }}` + `font-wb-mono text-[30px] font-bold leading-none`
  - Run `pnpm test src/renderer/src/components/position-cockpit/VerdictBlock.spec.tsx` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/position-cockpit/VerdictBlock.tsx` _(depends on: VerdictBlock Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — Orchestrator (depends on Layer 2 Green tasks)

### Area 9: `PositionCockpit` component

**Requires:** CollapsedDrawer Green ✓, ContextStrip Green ✓, RiskSnapshot Green ✓, VerdictBlock Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/components/position-cockpit/PositionCockpit.spec.tsx` _(depends on: all Layer 2 Green ✓)_
  - Test cases:
    - `renders VerdictBlock with ticker when active leg exists and snapshot present`
    - `renders RiskSnapshot when snapshot and underlyingPrice are present`
    - `renders ContextStrip when snapshot with greeks is present`
    - `renders "Leg reference" CollapsedDrawer when active leg exists`
    - `renders "Cost basis & history" CollapsedDrawer when costBasisSnapshot is present`
    - `no-active-leg: renders VerdictBlock with NO ACTIVE LEG label`
    - `no-active-leg: does not render RiskSnapshot`
    - `no-active-leg: does not render ContextStrip`
    - `no-active-leg: "Cost basis & history" drawer is open by default (defaultOpen=true)`
    - `snapshot-absent: renders cockpit without RiskSnapshot or ContextStrip`
    - `underlying price null: renders cockpit without Distance thermometer content`
    - `leg history table appears inside "Cost basis & history" drawer content` (legs array non-empty)
  - Run `pnpm test src/renderer/src/components/position-cockpit/PositionCockpit.spec.tsx` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/position-cockpit/PositionCockpit.tsx` _(depends on: PositionCockpit Red ✓)_
  - Reference: `plans/us-33/handoff/src/components/position-cockpit/PositionCockpit.tsx`
  - Props: `{ detail: PositionDetail, snapshot?: OptionSnapshot, underlyingPrice?: string | null, ivRank?: number | null }`
  - IV fix: `iv: parseFloat(snapshot.greeks.iv)` (NOT `snapshot.impliedVolatility`)
  - underlyingPrice fix: `underlying: underlyingPrice ? parseFloat(underlyingPrice) || null : null`
  - Parse all `snapshot.greeks.*` as strings via `parseFloat()`
  - No-active-leg branch: `<VerdictBlock ... verdict={SHARES_VERDICT} pnl={null} />` + cost-basis `<CollapsedDrawer defaultOpen>`. No RiskSnapshot, ContextStrip, or leg-reference drawer.
  - Active-leg branch: `computeVerdict`, `computePnl`, `computeDistance` → `<VerdictBlock>` → `{dist && <RiskSnapshot>}` → `{input.greeks && <ContextStrip>}` → leg-reference drawer → cost-basis drawer
  - Leg-reference drawer: `fieldCount={snapshot ? 6 : 5}` items: Strike, Expiration, Contracts, Premium/Contract, Fill Date, Current Mid (only when snapshot)
  - Cost-basis drawer: `fieldCount={2}`, Effective Basis/Share + Premium Collected. Below stats: `<LegHistoryTable>` when `enrichedLegs.length > 0`. Compute `enrichedLegs = deriveRunningBasis(legs, allSnapshots ?? [])`.
  - Outer wrapper: `flex flex-col gap-3`
  - Run `pnpm test src/renderer/src/components/position-cockpit/PositionCockpit.spec.tsx` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/position-cockpit/PositionCockpit.tsx` _(depends on: PositionCockpit Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - `asFallbackInput` helper should be a local function in the same file
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — Page Wiring (depends on PositionCockpit Green ✓)

### Area 10: `PositionDetailContent` + `PositionDetailPage`

**Requires:** PositionCockpit Green ✓

- [x] **[Red]** Update tests — `src/renderer/src/pages/PositionDetailPage.test.tsx` _(depends on: PositionCockpit Green ✓)_
  - Update existing tests (they will now fail against old layout):
    - `it('Open Leg section renders Current Mid stat...')` → expand "Leg reference" drawer first, then assert
    - `it('Open Leg section renders Unrealized P&L stat...')` → assert "% captured" text + `<progress>` bar present
    - `it('Open Leg section renders % of Max Profit stat...')` → assert "% captured" instead
    - `it('does not render... Current Mid / Unrealized P&L / % of Max Profit when snapshot absent')` → assert no "% captured" or PnlBar
    - `it('renders leg history section with two legs in order')` → click "Cost basis & history" trigger first, then assert
    - `it('does not render leg history section when legs array is empty')` → drawer renders but LegHistoryTable absent
    - `it('leg history table shows running cost basis column header')` → expand drawer first
    - `it('leg history table shows running basis value for CSP_OPEN leg')` → expand drawer first
    - `it('leg history table renders final P&L footer for WHEEL_COMPLETE position')` → expand drawer first
    - `it('leg history table has no P&L footer when finalPnl is null')` → expand drawer first
  - Add new tests:
    - `it('renders VerdictBlock with verdict pill when active leg and snapshot present')`
    - `it('renders NO ACTIVE LEG verdict when position is HOLDING_SHARES with no active leg')`
    - `it('renders ContextStrip theta/IV/vega/gamma when snapshot with greeks is present')`
    - `it('does not render RiskSnapshot when snapshot is absent')`
  - Run `pnpm test src/renderer/src/pages/PositionDetailPage.test.tsx` — all new/updated tests must fail
- [x] **[Green]** Implement — `src/renderer/src/pages/PositionDetailContent.tsx` + `src/renderer/src/pages/PositionDetailPage.tsx` _(depends on: Area 10 Red ✓)_
  - `PositionDetailPage.tsx`:
    - Add `import { useStockQuotes } from '../hooks/useStockQuotes'`
    - After `useOptionSnapshots`: `const stockQuotesQuery = useStockQuotes(data ? [data.position.ticker] : [])`
    - Derive: `const underlyingPrice = data ? (stockQuotesQuery.data?.[data.position.ticker]?.price ?? null) : null`
    - Pass `underlyingPrice` to `<PositionDetailContent>`
  - `PositionDetailContent.tsx`:
    - Add `underlyingPrice?: string | null` to props type
    - Remove all local stat derivation (openLegStats, pnlResult, enrichedLegs, etc.) and old SectionCard imports
    - Replace main body with `<PositionCockpit detail={detail} snapshot={snapshot} underlyingPrice={underlyingPrice} />`
    - Preserve below-fold: Notes SectionCard, closed-position banner, `<CloseCspForm>`
    - Keep `DETAIL_OVERLAY_STYLE`, `overlayOpen`, and `data-testid="position-detail"` on `<main>`
  - Run `pnpm test src/renderer/src/pages/PositionDetailPage.test.tsx` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/pages/PositionDetailContent.tsx`, `src/renderer/src/pages/PositionDetailPage.tsx` _(depends on: Area 10 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Delete unused imports from `PositionDetailContent.tsx` (computeUnrealizedPnl, pnlClass, formatPnlPercentForDisplay, formatSignedMoney, deriveRunningBasis, LegHistoryTable, StatGrid, etc.)
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 5 — E2E Tests (depends on all Green tasks ✓)

**Requires:** All Green tasks from Layers 1–4 ✓

### Area 11: E2E Tests

- [x] **[Red]** Write failing e2e tests — `e2e/position-cockpit.spec.ts` _(depends on: all Green tasks ✓)_
  - One `it()` per AC (cockpit ACs + US-34 scenarios):
    - AC-1: verdict TARGET HIT → `it('AC-1 — verdict TARGET HIT: position with 50%+ P&L shows TARGET HIT pill')`
    - AC-1: verdict HOLD → `it('AC-1 — verdict HOLD: position with low delta and ample DTE shows HOLD')`
    - AC-1: verdict ACT NOW → `it('AC-1 — verdict ACT NOW: position with DTE ≤ 3 and |delta| > 0.50 shows ACT NOW')`
    - AC-1: verdict WATCH delta → `it('AC-1 — verdict WATCH (delta warning): position in warning band shows WATCH')`
    - AC-1: verdict CONSIDER ROLL → `it('AC-1 — verdict CONSIDER ROLL: danger delta shows CONSIDER ROLL')`
    - AC-1: no data → `it('AC-1 — no data verdict: no snapshot shows HOLD with Awaiting market data')`
    - AC-2: TIGHT badge → `it('AC-2 — DTE-aware delta: TIGHT badge appears in gauge when DTE ≤ 7')`
    - AC-3: VerdictBlock renders → `it('AC-3 — verdict block: tinted background renders, ticker and phase pill visible')`
    - AC-4: delta gauge → `it('AC-4 — delta gauge: SVG circle gauge visible in Risk snapshot section')`
    - AC-5: distance thermo → `it('AC-5 — distance thermometer: track and underlying marker visible in Risk snapshot')`
    - AC-6: context strip → `it('AC-6 — context strip: Theta, IV, Vega, Gamma labels visible in Context section')`
    - AC-7: drawers collapsed → `it('AC-7 — drawers collapsed by default: Leg reference and Cost basis content not visible on load')`
    - AC-7: drawers expand → `it('AC-7 — drawers expand on click: clicking Leg reference reveals Strike and Expiration')`
    - AC-8: no-active-leg → `it('AC-8 — no-active-leg: HOLDING_SHARES shows NO ACTIVE LEG verdict, no Risk snapshot')`
    - AC-9: live poll → `it('AC-9 — live poll: navigating to position detail with snapshot triggers ContextStrip render')`
    - AC-10: CloseCspForm preserved → `it('AC-10 — CloseCspForm preserved: CSP_OPEN position shows close form below cockpit')`
    - AC-10: Notes preserved → `it('AC-10 — Notes preserved: position with thesis text shows Notes section below cockpit')`
    - US-34: delta green → `it('US-34 AC: delta green for CSP with |delta| < 0.30')`
    - US-34: delta gold → `it('US-34 AC: delta gold for CSP with |delta| between 0.30 and 0.45')`
    - US-34: delta red → `it('US-34 AC: delta red for CSP with |delta| > 0.45')`
    - US-34: theta format → `it('US-34 AC: theta displayed as $X.XX/d not raw per-share')`
    - US-34: IV format → `it('US-34 AC: IV displayed as XX.X% not decimal')`
    - US-34: Greeks unavailable → `it('US-34 AC: Greeks unavailable — ContextStrip absent, no error alert')`
    - US-34: HOLDING_SHARES → `it('US-34 AC: HOLDING_SHARES — ContextStrip and RiskSnapshot not rendered')`
  - Run `pnpm test:e2e` — all new tests must fail
- [x] **[Green]** Make e2e tests pass _(depends on: E2E Red ✓)_
  - Use Playwright `_electron` helpers from `e2e/`
  - Seed test data via existing E2E fixture helpers in `e2e/fixtures/`
  - Mock `useOptionSnapshots` and `useStockQuotes` via IPC stub pattern used in other E2E tests
  - Run `pnpm test:e2e` — all tests must pass
- [x] **[Refactor]** `/refactor` e2e tests _(depends on: E2E Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Extract `navigateToPosition(page, positionId)` helper to `e2e/helpers/` if not already present
  - Run `pnpm test:e2e && pnpm lint && pnpm typecheck`

---

## Completion Checklist

- [ ] All Red tasks complete (tests written and failing for right reason)
- [ ] All Green tasks complete (all tests passing)
- [ ] All Refactor tasks complete (lint + typecheck clean)
- [ ] E2E tests cover every AC (10 cockpit ACs + 9 US-34 scenarios)
- [ ] `pnpm test && pnpm lint && pnpm typecheck` — all clean
