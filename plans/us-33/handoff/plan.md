# Position Detail · Triage Cockpit — Redesign Plan

**Source mockup:** `Position Detail Redesign.html` (Layout B · Triage Cockpit)
**Replaces:** `src/renderer/src/pages/PositionDetailContent.tsx`
**Related stories:** US-04 (position card), US-32 (live underlying), US-33 (option snapshot), US-34 (greeks panel)

---

## Vision

The current position detail is a stack of reference cards (Open Leg → Cost Basis → Leg History → Notes). It tells the trader _what_ the position is, not _what to do about it_. The Triage Cockpit reorganizes the page around a synthesized **verdict** (HOLD / WATCH / CONSIDER ROLL / ACT NOW / TARGET HIT) that sits above the evidence and is computed deterministically from existing fields (delta, DTE, distance-to-strike, P&L%, earnings). Reference data (strike, expiration, contracts, fill date, cost basis, history) collapses into quiet drawers below the fold.

---

## Hierarchy (top → bottom)

1. **Verdict Block** — ticker, phase pill, key facts strip (strike · DTE · underlying), market-pulse, big verdict pill + one-line reason, P&L progress bar with `% captured` headline number.
2. **Risk Snapshot** — two-pane card: circular delta gauge (color-coded by severity, "TIGHT" badge when DTE ≤ 7) + horizontal distance-to-strike thermometer.
3. **Context Strip** — four-column row: theta yield (`$X.XX/d · N% over Nd`), IV (+ IV rank), vega per 1% IV, gamma (amber when elevated near expiry).
4. **Leg Reference** (collapsed by default) — strike, expiration, contracts, premium/contract, fill date, current mid.
5. **Cost Basis & History** (collapsed by default) — effective basis, premium collected, cycles, leg history table.

---

## Acceptance Criteria

### AC-1 · Verdict computation

- [ ] Add `computeVerdict(detail, snapshot)` to `src/renderer/src/lib/` returning `{ kind, label, sub, color }`.
- [ ] Precedence (first match wins):
  1. `dte ≤ 3 && |delta| > 0.50` → `ACT NOW` (red) — sub: "ITM with Nd to expiration · roll, close, or accept"
  2. `pnlPercent ≥ 50` → `TARGET HIT` (green) — sub: "N% of max premium captured · 50% rule met"
  3. `deltaSeverity === 'danger' || distance.isITM` → `CONSIDER ROLL` (red) — sub: "ITM by $X" or "High assignment risk · evaluate roll for credit"
  4. `deltaSeverity === 'warning'` → `WATCH` (gold) — sub: "Delta in management band · monitor for breach"
  5. `dte ≤ 21 && dte > 7` → `WATCH` (gold) — sub: "Approaching management window · Nd DTE"
  6. otherwise → `HOLD` (green) — sub: "Position tracking to plan · no action required"
- [ ] If no active leg → `NO ACTIVE LEG` (sky) — sub: "Sell a covered call to begin the next cycle"
- [ ] Unit-tested with one case per branch.

### AC-2 · Delta severity is DTE-aware

- [ ] Reuse `deltaSeverity(absDelta, instrumentLabel, dte)` from US-34 — shifts thresholds down 0.05 when `dte ≤ 7`.
- [ ] Gauge label appends ` · TIGHT` when DTE ≤ 7.

### AC-3 · Verdict block layout

- [ ] Tinted background using verdict color at 12% → bg-surface gradient; border at verdict color × 40% alpha.
- [ ] Top row: ticker (22px, Inter Tight 700), phase pill (existing `PHASE_COLOR`/`PHASE_LABEL`), key-facts strip (`strike · DTE · underlying`). Market status is owned by the page-level `MarketStatusPill` in the detail header (reused from the list page), not duplicated inside the verdict block.
- [ ] Bottom row: 1.1fr / 1fr grid — verdict pill + one-line reason on the left; `% captured` (30px mono 700) + `+$X of $Y` sublabel + `PnlBar` on the right.
- [ ] P&L panel hidden when no active leg.

### AC-4 · Risk snapshot — delta gauge

- [ ] Circular SVG gauge, 108px, stroke 6px, value fills clockwise from 12 o'clock.
- [ ] Color = severity color (green / gold / red).
- [ ] Center text: |delta| to 2dp (22px 700) above `DELTA` (or `DELTA · TIGHT` when DTE ≤ 7).
- [ ] Right of gauge: probability label ("Assignment probability" for puts, "Call-away probability" for calls) and one-line interpretation matched to severity.

### AC-5 · Risk snapshot — distance thermometer

- [ ] Horizontal track with gradient red → gold → green from −5% to +5%.
- [ ] Strike marker at center (white tick, 60% opacity).
- [ ] Underlying marker at `((pct + 5) / 10) × 100%`, clamped, colored by `distanceSeverity`.
- [ ] Headline above track: signed `$X.XX` (26px 700, severity color) and `(±N.N%)`.
- [ ] Sublabel right-aligned: `<underlying> vs <strike>`.

### AC-6 · Context strip

- [ ] Four equal cells, single horizontal row, separated by 1px borders.
- [ ] **Theta** — `$X.XX/d`, sub: `N% yield over Nd` (yield = `|theta| × 100 × DTE ÷ maxPremium × 100`); value green when yield ≥ 50%.
- [ ] **IV** — `XX.X%`, sub: `rank N` when present else `implied vol`.
- [ ] **Vega** — `$X.XX` per 1% IV move (`vega × 100`).
- [ ] **Gamma** — `0.XXX`, value amber + sub "elevated near expiry" when `dte ≤ 7 && |gamma| ≥ 0.04`.

### AC-7 · Collapsible drawers

- [ ] Leg Reference and Cost Basis & History render as `<CollapsedDrawer>` — header row with `▶ / ▼` chevron, title, and `N fields` count on the right; click toggles.
- [ ] Both collapsed by default. State is local (does not persist).
- [ ] Leg Reference items: Strike (gold), Expiration, Contracts, Premium/Contract (green), Fill Date, Current Mid (+timestamp sub) when snapshot present.
- [ ] Cost Basis items: Effective Basis (sky), Premium Collected (green), Cycles. Leg history table renders inside this drawer when expanded.

### AC-8 · No-active-leg state

- [ ] When `activeLeg === null`: render verdict block (no P&L panel) + a `Position` card with Shares / Avg Basis / Current / Unrealized.
- [ ] Hide risk snapshot, context strip, and leg reference drawer entirely.
- [ ] Verdict shows `NO ACTIVE LEG` with sky accent.

### AC-9 · Live data binding

- [ ] Underlying price source: existing live-price service (US-32). Refresh respects existing polling interval.
- [ ] Option snapshot source: existing `getOptionsSnapshots()` (US-33) — read `mid` and `greeks`.
- [ ] Stale-data behavior: when snapshot is older than 5 min, dim P&L panel by 50%. Stale status is surfaced by the existing page-level `MarketStatusPill`; no additional in-block badge.

### AC-10 · Existing surfaces preserved

- [ ] `CloseCspForm` continues to render below the cockpit when phase is `CSP_OPEN`.
- [ ] `RollCcSheet` trigger continues to render when phase is `CC_OPEN`.
- [ ] Notes section (thesis + notes) appears beneath the Cost Basis drawer.
- [ ] Closed-position banner ("Closed on YYYY-MM-DD") still appears when applicable.

---

## Test states (cover in component tests)

| State            | Verdict       | Color | Demonstrates                |
| ---------------- | ------------- | ----- | --------------------------- |
| `target-hit`     | TARGET HIT    | green | 50% rule branch             |
| `csp-safe`       | HOLD          | green | clean OTM, early days       |
| `approaching`    | WATCH         | gold  | DTE ≤ 7 tightened threshold |
| `itm-urgent`     | ACT NOW       | red   | DTE ≤ 3 + ITM precedence    |
| `cc-moderate`    | WATCH         | gold  | call-side delta warning     |
| `holding-shares` | NO ACTIVE LEG | sky   | no-leg branch               |

---

## Out of scope

- Roll calculator (separate sheet, already exists).
- Charting of price history (not in mockup).
- Persisting drawer open/closed state across sessions.

## Open questions

1. Should the verdict pill be clickable to surface its rationale (which rule fired, threshold values)?
2. Should `TARGET HIT` automatically pre-fill the Close CSP form, or stay informational?
3. Stale-snapshot threshold — confirm 5 min vs. existing convention elsewhere in the app.
