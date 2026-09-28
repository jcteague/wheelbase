---
page: docs/spec/features/us-34-position-cockpit.md
audited_at: 2026-09-28
findings: 6
---

# Audit: docs/spec/features/us-34-position-cockpit.md

## Verified (24)

- ✓ Eight cockpit components + `*.spec.tsx` under `src/renderer/src/components/position-cockpit/` (PnlBar, DeltaGauge, DistanceThermo, CollapsedDrawer, ContextStrip, RiskSnapshot, VerdictBlock, PositionCockpit) — all present
- ✓ `src/renderer/src/lib/verdict.ts` + `verdict.spec.ts` exist; exports `computeVerdict` (`:143`), `computePnl` (`:123`), `computeDistance` (`:108`), `computeThetaYield` (`:133`), `deltaSeverity` (`:72`), `SEVERITY_COLOR` (`:93`), `SHARES_VERDICT` (`:218`), `MANAGEMENT_RULES` (`:43`)
- ✓ `Verdict = { kind, label, sub, color }` and `VerdictKind` union — `src/renderer/src/lib/verdict.ts:9-17`
- ✓ `Severity = 'normal' | 'warning' | 'danger'` — `src/renderer/src/lib/verdict.ts:7`
- ✓ `Pnl { captured, max, pct }`, `ThetaYield { thetaDollar, yieldPct }` — `src/renderer/src/lib/verdict.ts:121,131`
- ✓ Thresholds: `tightDte: 7`, `actNowDte: 3`, `managementWindowDte: 21`, `cspDangerDelta: 0.45`, `ccDangerDelta: 0.5`, `ccWarningDelta: 0.35`, `tightDeltaShift: 0.05` — `src/renderer/src/lib/verdict.ts:45-58`; shift applied in `deltaSeverity` — `:77-81`
- ✓ ACT NOW rule `dte ≤ actNowDte && absDelta > 0.50` — `src/renderer/src/lib/verdict.ts:158`; WATCH-DTE window — `:201`
- ✓ IV read from sibling `snapshot.impliedVolatility` (US-117 supersession) — `src/renderer/src/components/position-cockpit/PositionCockpit.tsx:247`; `CockpitInput.greeks` has no `iv` — `src/renderer/src/lib/verdict.ts:31`
- ✓ `buildCockpitInput` helper and local `CostBasisDrawer` in `PositionCockpit.tsx:228,129`
- ✓ `PositionCockpitProps` has `underlyingPrice?` and `ivRank?` — `PositionCockpit.tsx:24-28`; `ivRank` not sourced by any caller (only pass-through at `:95`), so "rank N" never renders
- ✓ ContextStrip "rank N" sub-line — `src/renderer/src/components/position-cockpit/ContextStrip.tsx:42`
- ✓ Leg reference drawer `fieldCount={snapshot ? 6 : 5}` — `PositionCockpit.tsx:97`
- ✓ `PositionDetailPage` calls `useStockQuotes(data ? [data.position.ticker] : [])` and `useOptionSnapshots(legSummaries)` — `src/renderer/src/pages/PositionDetailPage.tsx:53-55`
- ✓ `PositionDetailContentProps.underlyingPrice` — `src/renderer/src/pages/PositionDetailContent.tsx:20`
- ✓ `DETAIL_OVERLAY_STYLE`, `data-testid="position-detail"`, Notes `SectionCard`, closed banner, `CloseCspForm` preserved — `src/renderer/src/pages/PositionDetailContent.tsx:9,46,64,72,79`
- ✓ No new IPC channels / migrations attributable to the cockpit
- ✓ `e2e/position-cockpit.spec.ts` exists

## Drift (6)

- ✗ `CockpitInput` fields documented as `greeks: { delta, theta, gamma, vega, iv } | null` and `earnings: null`. Actual: `greeks` has four fields and IV is the sibling `impliedVolatility: number | null`; there is no `earnings` field — `src/renderer/src/lib/verdict.ts:19-38`. (The page's own US-117 note is correct; the Contracts bullet and "Earnings flag" deferred item were not updated.)
- ✗ `buildCockpitInput({ position, activeLeg, snapshot, underlyingPrice })` — actual call takes `{ activeLeg, snapshot, underlyingPrice }` — `PositionCockpit.tsx:78,228-231`.
- ✗ "`instrument = phase === 'CC_OPEN' ? 'CALL' : 'PUT'`" / instrument typed `'SELL PUT' | 'SELL CALL'`. Actual: `instrument: OptionInstrumentType` taken from `activeLeg.instrumentType` — `src/renderer/src/lib/verdict.ts:20`, `PositionCockpit.tsx:239`.
- ✗ "Cost-basis drawer always shows 2 stats". It shows 3 (Effective Basis/Share, Premium Collected, Cycles), `fieldCount={3}` — `PositionCockpit.tsx:138-152`.
- ✗ AC-8 no-active-leg branch "renders only `<VerdictBlock>` with `SHARES_VERDICT` ... plus the drawer". Code also picks `WHEEL_COMPLETE_VERDICT` when `phase === 'WHEEL_COMPLETE'` (`PositionCockpit.tsx:47-48`, `verdict.ts:225`) and renders a `PositionStatsCard` for `HOLDING_SHARES` with an ASSIGN leg (`PositionCockpit.tsx:49-67`).
- ✗ Stated test counts are stale: `verdict.spec.ts` "14" → 20 cases; `ContextStrip.spec.tsx` "11" → 17; `PositionCockpit.spec.tsx` "12" → 27; `PositionDetailPage.test.tsx` "42" → 45; `e2e/position-cockpit.spec.ts` "24" → 30 (grep of `it(`/`test(`).

## Unverifiable (5)

- ? Visual specs (108 px gauge, 14 px track, `color-mix()` gradients, grid `minmax(280px, 1.1fr) 1fr`) — styling detail not checked line by line.
- ? `RiskSnapshot` reading copy and probability labels — not checked.
- ? "Components never decide which verdict" — narrative.
- ? Handoff prototype files under `plans/us-33/handoff/` — plan-dir history.
- ? "`pnpm test:e2e` GUI-terminal requirement" — environment note, superseded by memory (e2e runs in Claude shell); not a code claim.

## Missing files (0)
