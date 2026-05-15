# Implementation Plan: US-34 — Position Cockpit (Triage Cockpit) Redesign

## Summary

Replaces the flat Open-Leg / Cost-Basis / Leg-History / Notes stack in `PositionDetailContent` with the **Triage Cockpit** layout: a deterministic verdict block (HOLD / WATCH / CONSIDER ROLL / ACT NOW / TARGET HIT / NO ACTIVE LEG) above a delta-gauge + distance-thermometer risk card, above a 4-column greeks strip, above collapsible reference drawers. The original AC from US-34 (Greeks display) is fully subsumed — greeks now appear in the RiskSnapshot delta gauge and the ContextStrip, not a standalone GreeksPanel. Done state: `PositionDetailPage` shows the cockpit for all position phases, all 10 cockpit ACs pass, all 9 original US-34 greeks scenarios pass.

## Supporting Documents

- **User Story & Acceptance Criteria:** `docs/epics/06-stories/US-34-greeks-display.md`
- **Research & Design Decisions:** `plans/us-34/research.md`
- **Data Model:** `plans/us-34/data-model.md`
- **Quickstart & Verification:** `plans/us-34/quickstart.md`
- **Visual Mockup (canonical reference):** `plans/us-33/handoff/Position Cockpit Mockup.html` — six state toggles (target-hit, csp-safe, approaching, itm-urgent, cc-moderate, holding-shares). Every frontend area below maps to specific states in this mockup. Open it in a browser to see the pixel target before implementing each area.
- **Handoff components (reference only):** `plans/us-33/handoff/src/` — do NOT copy inline styles; they are the logic/shape reference, not the code source.

## Prerequisites

- US-31: MarketDataProvider adapter — ✅ complete
- US-33: option snapshot polling + `useOptionSnapshots` hook — ✅ complete
- US-32: `useStockQuotes` hook for live underlying price — ✅ complete
- shadcn `Collapsible` installed: run `pnpm dlx shadcn@latest add collapsible` before starting Area 5

## Implementation Areas

---

### 1. Pure verdict logic — `lib/verdict.ts`

**Files to create or modify:**

- `src/renderer/src/lib/verdict.ts` — new file; pure functions, no React

**Red — tests to write (`src/renderer/src/lib/verdict.spec.ts`):**

- `computeVerdict — target-hit branch`: input with `pnl.pct ≥ 50` (currentMid = 0.75 on a 3.50 premium) → verdict.kind === 'target-hit', verdict.color === 'var(--wb-green)'
- `computeVerdict — act-now branch`: input with dte ≤ 3 and |delta| > 0.50 → verdict.kind === 'act-now', verdict.color === 'var(--wb-red)', sub includes 'ITM'
- `computeVerdict — consider-roll branch (danger delta)`: CSP with |delta| = 0.52 (> 0.45 threshold) → verdict.kind === 'consider-roll'
- `computeVerdict — consider-roll branch (ITM)`: dist.isITM = true (underlying < strike for CSP) → verdict.kind === 'consider-roll', sub includes 'ITM by $'
- `computeVerdict — watch branch (warning delta)`: CSP with |delta| = 0.35 → verdict.kind === 'watch', verdict.color === 'var(--wb-gold)'
- `computeVerdict — watch branch (DTE window)`: |delta| = 0.15, dte = 14 → verdict.kind === 'watch', sub includes '14 DTE'
- `computeVerdict — hold branch`: |delta| = 0.15, dte = 30, pnl.pct = 20 → verdict.kind === 'hold', verdict.color === 'var(--wb-green)'
- `computeVerdict — no data`: greeks = null → verdict.kind === 'hold', sub === 'Awaiting market data'
- `deltaSeverity — DTE-aware shift`: CSP, |delta| = 0.41 (above 0.30 but below 0.45), dte = 5 → 'danger' (0.45 − 0.05 = 0.40 threshold)
- `deltaSeverity — CC thresholds`: CC, |delta| = 0.42 → 'warning' (between 0.35 and 0.50)
- `computePnl — captured %`: premiumPerContract=3.50, currentMid=1.75 → pct≈50
- `computeDistance — OTM CSP`: underlying=185, strike=180 → dollars=5, pct≈2.78, isITM=false
- `computeDistance — ITM CSP`: underlying=175, strike=180 → isITM=true, severity='danger'
- `computeThetaYield`: theta=-0.05, contracts=1, dte=21, premiumPerContract=3.50 → thetaDollar≈5, yieldPct=(5×21/350)×100≈30

**Green — implementation:**

- Copy `plans/us-33/handoff/src/lib/verdict.ts` verbatim to `src/renderer/src/lib/verdict.ts`.
- The import `import { computeDte } from './format'` is already correct for the `lib/` directory — `computeDte` is exported from `src/renderer/src/lib/format.ts`. No path change needed.
- Do NOT add `SANS` to `lib/tokens.ts` — not used in production code.

**Refactor — cleanup:**

- Confirm `SEVERITY_COLOR` is exported (it is in the handoff). Verify it's typed as `Record<Severity, string>`.

**Acceptance criteria covered:**

- AC-1 (verdict computation — all 6 branches + data-absent case)
- AC-2 (DTE-aware delta severity — shift of −0.05 when DTE ≤ 7)
- US-34 scenarios: delta color coding (green/gold/red), threshold difference for CC

---

### 2. `PnlBar` — P&L progress bar

**Files to create or modify:**

- `src/renderer/src/components/position-cockpit/PnlBar.tsx` — new file

**Red — tests to write (`src/renderer/src/components/position-cockpit/PnlBar.spec.tsx`):**

- `renders progressbar role with aria-valuenow`: pnl = { pct: 35, captured: 122.5, max: 350 } → element with `role="progressbar"` and `aria-valuenow="35"`
- `aria-valuemin is 0 and aria-valuemax is 100`
- `renders without crashing when pct is negative` (loss scenario)

**Green — implementation:**

- Reference: `plans/us-33/handoff/src/components/position-cockpit/PnlBar.tsx`
- Track container: `relative h-2.5 rounded overflow-hidden border border-wb-border bg-wb-bg-base` (Tailwind, not inline)
- Fill `div`: inline `style={{ width: fillWidth, background: color }}` — both are runtime values (pct from prop, color derived from pct thresholds). `opacity-85 absolute inset-0 transition-[width] duration-400 ease-in-out` classes for the rest.
- 50% marker: `absolute top-[-2px] bottom-[-2px] left-1/2 w-px opacity-50 bg-wb-text-primary`
- Colors: pct ≥ 25 → `var(--wb-green)`, pct ≥ 0 → `var(--wb-gold)`, else → `var(--wb-red)` — runtime string, so inline `style={{ background: color }}`.
- `role="progressbar"`, `aria-valuenow={Math.round(pct)}`, `aria-valuemin={0}`, `aria-valuemax={100}`.

**Refactor:**

- Check for duplication and naming consistency.

**Acceptance criteria covered:**

- AC-3 (P&L progress bar in verdict block)

---

### 3. `DeltaGauge` — circular SVG gauge

**Files to create or modify:**

- `src/renderer/src/components/position-cockpit/DeltaGauge.tsx` — new file

**Red — tests to write (`src/renderer/src/components/position-cockpit/DeltaGauge.spec.tsx`):**

- `renders center delta value to 2dp`: absDelta=0.28 → text "0.28"
- `renders DELTA label without TIGHT suffix when tight=false`
- `renders DELTA · TIGHT when tight=true (DTE ≤ 7)`
- `renders two circles (track + fill)`: SVG has 2 `<circle>` elements

**Green — implementation:**

- Reference: `plans/us-33/handoff/src/components/position-cockpit/DeltaGauge.tsx`
- Wrapper `div`: `relative flex-shrink-0` with inline `style={{ width: size, height: size }}` (size is a numeric prop, not a Tailwind scale value).
- SVG: `transform: rotate(-90deg)` — inline `style` (rotation not easily Tailwind when combined with sizing).
- Track circle: `stroke="var(--wb-border)" strokeWidth={6} fill="none"` attributes on SVG circle.
- Fill circle: SVG `stroke={color}` is a runtime prop → attribute directly on circle, not inline style. `strokeDashoffset` computed from arc math. `strokeLinecap="round"`. Add `style={{ transition: 'stroke-dashoffset 0.4s ease' }}`.
- Center overlay `div`: `absolute inset-0 flex flex-col items-center justify-center font-wb-mono text-wb-text-primary`
- Delta value: inline `style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}` — all three depend on the runtime `color` prop, so inline is acceptable.
- DELTA label: `text-[9px] text-wb-text-muted tracking-[0.1em] mt-1` (Tailwind).

**Refactor:**

- Check for duplication and naming consistency.

**Acceptance criteria covered:**

- AC-4 (delta gauge — 108px, stroke 6px, clockwise fill, TIGHT badge when DTE ≤ 7)

---

### 4. `DistanceThermo` — horizontal distance thermometer

**Files to create or modify:**

- `src/renderer/src/components/position-cockpit/DistanceThermo.tsx` — new file

**Red — tests to write (`src/renderer/src/components/position-cockpit/DistanceThermo.spec.tsx`):**

- `renders without crashing for OTM position`: dist = { pct: 2.5, dollars: 4.5, severity: 'normal', isITM: false }
- `renders without crashing for ITM position`: dist = { pct: -1.2, dollars: -2.16, severity: 'danger', isITM: true }
- `underlying marker clamps to range`: pct = 10 (beyond range=5) → underlying marker left is clamped to '100%' or equivalent

**Green — implementation:**

- Reference: `plans/us-33/handoff/src/components/position-cockpit/DistanceThermo.tsx`
- Outer wrapper: `w-full`
- Track: inline `style={{ ...trackStyle }}` where trackStyle includes the multi-stop `linear-gradient` with `color-mix()` calls — this is a static complex CSS gradient that cannot be expressed as a single Tailwind class. Height 14px, borderRadius 7px are also in the style for consistency.
- Strike marker `div`: `absolute -top-1 -bottom-1 left-1/2 w-0.5 -translate-x-1/2 bg-wb-text-primary opacity-60`
- Underlying marker: inline `style={{ left: ${x}%, background: color }}` for the two runtime values; use `absolute -top-0.5 -bottom-0.5 w-1 -translate-x-1/2 rounded-sm` as Tailwind for the rest.
- Label row: `flex justify-between font-wb-mono text-[9px] text-wb-text-muted mt-1.5 tracking-[0.05em]`
- Strike center label: `text-wb-text-secondary`

**Refactor:**

- Check for duplication and naming consistency.

**Acceptance criteria covered:**

- AC-5 (distance thermometer — gradient track, strike marker, underlying marker, ±% headline)

---

### 5. `CollapsedDrawer` — collapsible section drawer

**Files to create or modify:**

- `src/renderer/src/components/ui/collapsible.tsx` — added by shadcn CLI (`pnpm dlx shadcn@latest add collapsible`)
- `src/renderer/src/components/position-cockpit/CollapsedDrawer.tsx` — new file (wraps shadcn Collapsible)

**Red — tests to write (`src/renderer/src/components/position-cockpit/CollapsedDrawer.spec.tsx`):**

- `shows title and N fields text in header`
- `content is hidden by default when defaultOpen is not set`
- `content is visible when defaultOpen={true}`
- `clicking header toggles content visibility`
- `aria-expanded is false by default, true after click`

**Green — implementation:**

- Import `{ Collapsible, CollapsibleTrigger, CollapsibleContent }` from `@/components/ui/collapsible` (shadcn path alias).
- `CollapsedDrawer` uses `<Collapsible defaultOpen={defaultOpen}>` as the root.
- Trigger: `<CollapsibleTrigger asChild><button type="button" ...>` — full-width button with `flex items-center justify-between` layout. Left side: chevron (▶/▼) + title using `font-wb-mono text-[11px] font-semibold tracking-[0.1em] uppercase text-wb-text-muted`. Right side: `{fieldCount} fields` in `font-wb-mono text-[11px] text-wb-text-muted`.
- The chevron must reflect open state. Use shadcn's `data-[state=open]:` variant or a separate `useState` tracking `open` for the icon. Simplest: wrap in `<Collapsible>` with `onOpenChange`.
- Container: `bg-wb-surface border border-wb-border rounded-lg`
- Trigger button border-bottom: `border-b border-wb-border` when open (use `data-[state=open]:border-b`).
- Content: `<CollapsibleContent>` wrapping `{children}`.

**Refactor:**

- Check for duplication and naming consistency.

**Acceptance criteria covered:**

- AC-7 (collapsible drawers — chevron, title, field count, collapsed by default, click toggles)

---

### 6. `ContextStrip` — 4-column Greeks strip

**Files to create or modify:**

- `src/renderer/src/components/position-cockpit/ContextStrip.tsx` — new file

**Red — tests to write (`src/renderer/src/components/position-cockpit/ContextStrip.spec.tsx`):**

- `renders null when greeks are absent`: input with greeks=null → renders nothing
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

**Green — implementation:**

- Reference: `plans/us-33/handoff/src/components/position-cockpit/ContextStrip.tsx`
- Return null when `!input.greeks`.
- Wrap in `<SectionCard header="Context">` (existing component).
- Inner grid: `grid grid-cols-4 gap-px bg-wb-border`
- Each cell `KV`: `bg-wb-surface p-3.5 px-4.5 flex flex-col gap-0.5`
- Label: `font-wb-mono text-[9.5px] font-semibold tracking-[0.12em] uppercase text-wb-text-muted`
- Value: `font-wb-mono text-sm font-semibold text-wb-text-primary` + conditional `text-wb-green` or `text-wb-gold` for gamma/theta using Tailwind conditional class (derive a `valueClass` string in JSX, not inline style).
- Sub: `font-wb-mono text-[10px] text-wb-text-muted`
- Theta: `computeThetaYield(input, dte)` → `$X.XX/d` via `fmtMoney`
- IV: `(input.greeks.iv * 100).toFixed(1) + '%'`
- Vega: `fmtMoney(String(input.greeks.vega * 100))`
- Gamma: `Math.abs(input.greeks.gamma).toFixed(3)`

**Refactor:**

- The `KV` sub-component can be extracted to a local function in the same file.

**Acceptance criteria covered:**

- AC-6 (theta/IV/vega/gamma 4-column grid; gamma amber when elevated; IV rank sub)
- US-34 scenarios: theta as $X.XX/day, IV as XX.X%, gamma display, color thresholds

---

### 7. `RiskSnapshot` — two-pane risk card

**Files to create or modify:**

- `src/renderer/src/components/position-cockpit/RiskSnapshot.tsx` — new file

**Red — tests to write (`src/renderer/src/components/position-cockpit/RiskSnapshot.spec.tsx`):**

- `renders null when greeks are absent`: input with greeks=null → renders nothing (early return)
- `renders "Assignment probability" label for CSP (SELL PUT)`
- `renders "Call-away probability" label for CC (SELL CALL)`
- `delta gauge label reads "DELTA" without TIGHT when dte > 7`
- `delta gauge label reads "DELTA · TIGHT" when dte ≤ 7`
- `distance headline shows signed dollar amount and percentage`
- `OTM reading shows "Low — comfortably out of the money"`
- `danger reading shows "High — strike likely breached"`

**Green — implementation:**

- Reference: `plans/us-33/handoff/src/components/position-cockpit/RiskSnapshot.tsx`
- Guard: `if (!input.greeks) return null`
- Wrap in `<SectionCard header="Risk snapshot">` (existing component).
- Two-pane grid: `grid grid-cols-2 gap-px bg-wb-border`
- Each cell: `bg-wb-surface p-5 px-5.5`
- Left pane (delta gauge): `flex items-center gap-4.5` — contains `<DeltaGauge>` + label stack.
  - Probability label: `font-wb-mono text-[10px] text-wb-text-muted tracking-[0.1em] uppercase`
  - Reading text: `font-wb-mono text-xs text-wb-text-secondary leading-relaxed max-w-[200px]`
- Right pane (distance thermometer):
  - Header row: `flex justify-between items-baseline mb-2`
  - "Distance to strike" label: `font-wb-mono text-[10px] text-wb-text-muted tracking-[0.1em] uppercase`
  - Underlying vs strike right label: `font-wb-mono text-xs text-wb-text-secondary`
  - Dollar headline: inline `style={{ color: distColor }}` for the runtime severity color, `font-wb-mono text-[26px] font-bold leading-none` as Tailwind.
  - `<DistanceThermo dist={dist} />`
- DTE-aware tight flag: `const tight = computeDte(input.expiration) <= 7`

**Refactor:**

- Check for duplication and naming consistency.

**Acceptance criteria covered:**

- AC-2 (DTE-aware delta gauge — TIGHT badge), AC-4 (delta gauge visual), AC-5 (distance thermometer)
- US-34 scenarios: delta color coding for CSP vs CC, assignment/call-away probability label

---

### 8. `VerdictBlock` — verdict header + P&L summary

**Files to create or modify:**

- `src/renderer/src/components/position-cockpit/VerdictBlock.tsx` — new file

**Red — tests to write (`src/renderer/src/components/position-cockpit/VerdictBlock.spec.tsx`):**

- `renders ticker symbol prominently`
- `renders phase pill with phaseLabel text`
- `renders verdict pill with verdict.label text`
- `renders verdict.sub reason text`
- `renders DTE with red color class when dte ≤ 3`: expiration = today+2 days → DTE span has red styling
- `renders DTE with gold color when dte ≤ 7`
- `renders P&L % captured when pnl is provided`: pnl = { pct: 62, captured: 217, max: 350 } → "62%" visible
- `P&L panel is absent when pnl is null` (no active leg / no snapshot)
- `renders underlying price when present in input`

**Green — implementation:**

- Reference: `plans/us-33/handoff/src/components/position-cockpit/VerdictBlock.tsx`
- **Container** — truly dynamic gradient using `verdict.color` at runtime: keep inline `style={{ background: 'linear-gradient(180deg, color-mix(in srgb, ${verdict.color} 12%, transparent) 0%, var(--wb-bg-surface) 100%)', border: '1px solid color-mix(in srgb, ${verdict.color} 40%, transparent)', borderRadius: 12, padding: 22 }}`. This cannot be expressed in Tailwind because the `color-mix()` argument is a runtime CSS variable reference. Add `flex flex-col gap-4` as Tailwind on the same element.
- **Top row**: `flex items-center gap-3.5 flex-wrap`
  - Ticker: `font-sans text-[26px] font-bold tracking-[0.02em] text-wb-text-primary` (replaces `fontFamily: SANS`)
  - Phase pill: keep inline `style={{ background: 'color-mix(in srgb, ${phaseColor} 18%, transparent)', border: '1px solid color-mix(in srgb, ${phaseColor} 30%, transparent)', color: phaseColor }}` for runtime colors. Add `font-wb-mono text-[11px] font-semibold tracking-[0.08em] px-2 py-0.5 rounded-sm inline-flex items-center gap-1.5 whitespace-nowrap` as Tailwind.
  - Key facts strip (strike · DTE · underlying): `font-wb-mono text-xs text-wb-text-muted tracking-[0.05em]`
    - Strike: `text-wb-gold`
    - DTE: derive `dteClass = dte <= 3 ? 'text-wb-red font-semibold' : dte <= 7 ? 'text-wb-gold font-semibold' : ''` as Tailwind classes.
- **Verdict + P&L row**: `grid gap-5 items-center` with inline `style={{ gridTemplateColumns: pnl ? 'minmax(280px, 1.1fr) 1fr' : '1fr' }}` (dynamic column count based on pnl presence — not expressible in Tailwind static config).
  - Verdict pill: keep inline `style={{ background: ..., border: ..., color: verdict.color }}` for runtime colors. Add `inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full font-wb-mono text-[11px] font-bold tracking-[0.18em] mb-3` as Tailwind.
  - Dot inside pill: `inline-block w-1.5 h-1.5 rounded-full` with inline `style={{ background: verdict.color, boxShadow: ... }}`.
  - Sub-reason: `font-sans text-[14.5px] text-wb-text-primary leading-relaxed max-w-sm`
  - `PnlSummary` sub-component: local function in the same file.
    - P&L header: `flex justify-between items-baseline mb-1.5`
    - Label: `font-wb-mono text-[10px] text-wb-text-muted tracking-[0.12em] uppercase`
    - Amount: `font-wb-mono text-[11px] text-wb-text-secondary`
    - Big % number: inline `style={{ color }}` for runtime severity color + `font-wb-mono text-[30px] font-bold leading-none` as Tailwind.
    - "captured" sub: `font-wb-mono text-xs text-wb-text-muted`
    - `<PnlBar pnl={pnl} height={8} />`

**Refactor:**

- Consider extracting `PnlSummary` to its own file if it grows (currently fine inline).

**Acceptance criteria covered:**

- AC-3 (verdict block layout: tinted background, top row, verdict pill + reason, P&L panel)
- AC-8 (P&L panel hidden when no active leg)
- US-34 scenario: verdict driven by delta severity shown prominently

---

### 9. `PositionCockpit` — top-level orchestrator

**Files to create or modify:**

- `src/renderer/src/components/position-cockpit/PositionCockpit.tsx` — new file

**Red — tests to write (`src/renderer/src/components/position-cockpit/PositionCockpit.spec.tsx`):**

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

**Green — implementation:**

- Reference shape: `plans/us-33/handoff/src/components/position-cockpit/PositionCockpit.tsx`
- **Props** (data-model.md):
  ```ts
  type PositionCockpitProps = {
    detail: PositionDetail
    snapshot?: OptionSnapshot
    underlyingPrice?: string | null
    ivRank?: number | null
  }
  ```
- **IV source fix**: `iv: parseFloat(snapshot.greeks.iv)` — NOT `snapshot.impliedVolatility`.
- **underlyingPrice fix**: `underlying: underlyingPrice ? parseFloat(underlyingPrice) || null : null` — takes the new prop, not `snapshot.underlyingPrice`.
- **`greeks` field parsing**: all `snapshot.greeks.*` are strings → `parseFloat()` each.
- **No-active-leg branch**: render `<VerdictBlock ... verdict={SHARES_VERDICT} pnl={null} />` + `<CollapsedDrawer title="Cost basis & history" fieldCount={2} defaultOpen>` with Effective Basis + Premium Collected stats. Do NOT render `<RiskSnapshot>`, `<ContextStrip>`, or "Leg reference" drawer.
- **Active leg branch**:
  - Build `CockpitInput` from `activeLeg` + snapshot + underlyingPrice
  - `computeVerdict(input)` → `verdict`
  - `computePnl(input)` → `pnl` (null when currentMid is null)
  - `computeDistance(input)` → `dist` (null when underlying is null)
  - Render: `<VerdictBlock>` → `{dist && <RiskSnapshot>}` → `{input.greeks && <ContextStrip>}` → "Leg reference" `<CollapsedDrawer>` → "Cost basis & history" `<CollapsedDrawer>`
- **"Leg reference" drawer**: `fieldCount={snapshot ? 6 : 5}`, items: Strike (text-wb-gold), Expiration, Contracts, Premium/Contract (text-wb-green), Fill Date, Current Mid (only when snapshot present).
- **"Cost basis & history" drawer**: `fieldCount={2}`, items: Effective Basis/Share (text-wb-sky), Premium Collected (text-wb-green). Below the StatGrid, render `<LegHistoryTable legs={enrichedLegs} finalPnl={costBasisSnapshot?.finalPnl ?? null} />` when `enrichedLegs.length > 0`. Compute `enrichedLegs = deriveRunningBasis(legs, allSnapshots ?? [])` at the top of the component.
- **Outer wrapper**: `flex flex-col gap-3`

**Refactor:**

- `asFallbackInput` helper for no-active-leg branch is a local function in the same file.

**Acceptance criteria covered:**

- AC-1 (verdict computation), AC-7 (drawers), AC-8 (no-active-leg state), AC-9 (snapshot absent = graceful null)
- US-34: "Greeks panel displays on position detail page" (via ContextStrip + RiskSnapshot), "Greeks unavailable — shows placeholder" (ContextStrip returns null), "HOLDING_SHARES with no open leg — no Greeks section"

---

### 10. `PositionDetailContent` + `PositionDetailPage` wiring

**Files to create or modify:**

- `src/renderer/src/pages/PositionDetailContent.tsx` — replace internal body with `<PositionCockpit>`, keep notes/forms/banner below
- `src/renderer/src/pages/PositionDetailPage.tsx` — add `useStockQuotes`, pass `underlyingPrice`
- `src/renderer/src/pages/PositionDetailPage.test.tsx` — update assertions for new cockpit UI

**Red — tests to update in `PositionDetailPage.test.tsx`:**

These tests currently pass against `PositionDetailContent`'s old layout and will break when `PositionCockpit` replaces it. Update each to match the cockpit's new structure:

- `it('Open Leg section renders Current Mid stat...')` → "Current Mid" now lives inside the "Leg reference" CollapsedDrawer (collapsed by default). Update: expand the drawer or assert the drawer exists with the text inside. Simplest: open the drawer via `fireEvent.click` on the "Leg reference" trigger button, then assert.
- `it('Open Leg section renders Unrealized P&L stat...')` → P&L is no longer a labeled stat; it appears as "% captured" in VerdictBlock. Update: assert "% captured" text is present and the `<progress>` bar is in the DOM.
- `it('Open Leg section renders % of Max Profit stat...')` → same — assert `% captured` instead.
- `it('does not render... Current Mid / Unrealized P&L / % of Max Profit when snapshot absent')` → still valid intent; update to assert no "% captured" or PnlBar when snapshot is absent.
- `it('renders leg history section with two legs in order')` → leg history is now inside the "Cost basis & history" drawer. Update: click the drawer trigger to expand, then assert leg rows.
- `it('does not render leg history section when legs array is empty')` → still valid; confirm drawer renders but `<LegHistoryTable>` is absent.
- `it('leg history table shows running cost basis column header')` → expand drawer first.
- `it('leg history table shows running basis value for CSP_OPEN leg')` → expand drawer first.
- `it('leg history table renders final P&L footer for WHEEL_COMPLETE position')` → expand drawer first.
- `it('leg history table has no P&L footer when finalPnl is null')` → expand drawer first.
- Add new test: `it('renders VerdictBlock with verdict pill when active leg and snapshot present')`
- Add new test: `it('renders NO ACTIVE LEG verdict when position is HOLDING_SHARES with no active leg')`
- Add new test: `it('renders ContextStrip theta/IV/vega/gamma when snapshot with greeks is present')` — asserts the 4 values appear in DOM.
- Add new test: `it('does not render RiskSnapshot when snapshot is absent')`

**Green — `PositionDetailPage.tsx`:**

- Add import: `import { useStockQuotes } from '../hooks/useStockQuotes'`
- Add hook call (after `useOptionSnapshots`):
  ```tsx
  const stockQuotesQuery = useStockQuotes(data ? [data.position.ticker] : [])
  const underlyingPrice = data
    ? (stockQuotesQuery.data?.[data.position.ticker]?.price ?? null)
    : null
  ```
- Pass `underlyingPrice` to `<PositionDetailContent>`:
  ```tsx
  <PositionDetailContent
    detail={data}
    overlayOpen={overlayOpen}
    snapshot={activeSnapshot}
    underlyingPrice={underlyingPrice}
  />
  ```
- `useStockQuotes` accepts an empty array when `data` is null — this is safe (hook is no-op when tickers is empty).

**Green — `PositionDetailContent.tsx`:**

- Add `underlyingPrice?: string | null` to `PositionDetailContentProps`.
- Remove all local stat derivation code (openLegStats, pnlResult, enrichedLegs, etc.) and the SectionCard imports for Open Leg / Cost Basis / Leg History.
- Replace the body of the `<main>` with:
  ```tsx
  <PositionCockpit detail={detail} snapshot={snapshot} underlyingPrice={underlyingPrice} />
  ```
  Followed by the preserved below-fold elements (already there):
  - Notes `<SectionCard>` block (keep as-is — uses `position.thesis` / `position.notes`)
  - Closed-position banner (keep as-is)
  - `<CloseCspForm>` (keep as-is — condition `position.phase === 'CSP_OPEN' && activeLeg`)
- Keep the `DETAIL_OVERLAY_STYLE` and `overlayOpen` logic on the `<main>` wrapper.
- `data-testid="position-detail"` remains on the `<main>`.

**Refactor:**

- Delete now-unused imports from `PositionDetailContent.tsx` (computeUnrealizedPnl, pnlClass, formatPnlPercentForDisplay, formatSignedMoney, deriveRunningBasis, LegHistoryTable, StatGrid, Stat types, fmtMoney — these are now used inside PositionCockpit instead).

**Acceptance criteria covered:**

- AC-9 (live data binding — useStockQuotes for underlying price, useOptionSnapshots for greeks)
- AC-10 (existing surfaces preserved — CloseCspForm, Notes, closed banner below cockpit)
- US-34: "Greeks update on poll without page reload" — TanStack Query handles reactive updates; no new code needed.

---

### 11. E2E tests

**Files to create or modify:**

- `e2e/position-cockpit.spec.ts` — new file

**Red — one test per AC:**

- `AC-1 — verdict TARGET HIT: position with 50%+ P&L captured shows TARGET HIT verdict pill`
- `AC-1 — verdict HOLD: position with low delta and ample DTE shows HOLD`
- `AC-1 — verdict ACT NOW: position with DTE ≤ 3 and |delta| > 0.50 shows ACT NOW`
- `AC-1 — verdict WATCH (delta warning): position with delta in warning band shows WATCH`
- `AC-1 — verdict CONSIDER ROLL: position with danger delta shows CONSIDER ROLL`
- `AC-1 — no data verdict: position with no snapshot shows HOLD with "Awaiting market data"`
- `AC-2 — DTE-aware delta: TIGHT badge appears in gauge label when DTE ≤ 7`
- `AC-3 — verdict block: VerdictBlock tinted background renders, ticker and phase pill visible`
- `AC-4 — delta gauge: SVG circle gauge visible in Risk snapshot section`
- `AC-5 — distance thermometer: distance track and underlying marker visible in Risk snapshot`
- `AC-6 — context strip: Theta, IV, Vega, Gamma labels visible in Context section`
- `AC-7 — drawers collapsed by default: "Leg reference" and "Cost basis & history" content not visible on load`
- `AC-7 — drawers expand on click: clicking "Leg reference" trigger reveals Strike and Expiration`
- `AC-8 — no-active-leg: HOLDING_SHARES position shows NO ACTIVE LEG verdict, no Risk snapshot`
- `AC-9 — live poll: navigating to position detail with snapshot triggers ContextStrip render`
- `AC-10 — CloseCspForm preserved: CSP_OPEN position shows close form below cockpit`
- `AC-10 — Notes preserved: position with thesis text shows Notes section below cockpit`
- `US-34 AC: delta green for CSP with |delta| < 0.30`
- `US-34 AC: delta gold for CSP with |delta| between 0.30 and 0.45`
- `US-34 AC: delta red for CSP with |delta| > 0.45`
- `US-34 AC: theta displayed as "$X.XX/d" not raw per-share`
- `US-34 AC: IV displayed as "XX.X%" not decimal`
- `US-34 AC: Greeks unavailable — ContextStrip absent, no error alert`
- `US-34 AC: HOLDING_SHARES — ContextStrip and RiskSnapshot not rendered`

**Green:**

- Use existing Playwright `_electron` test helpers from `e2e/` to navigate to a position detail page.
- Seed test data via the existing E2E fixture helpers (check `e2e/fixtures/` for existing patterns).
- Mock `useOptionSnapshots` and `useStockQuotes` responses in E2E via IPC stub pattern already used in other E2E tests.

**Refactor:**

- Extract shared `navigateToPosition(page, positionId)` helper if one doesn't already exist in `e2e/helpers/`.
