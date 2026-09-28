---
page: docs/spec/architecture/02-adrs/verdict-precedence-chain.md
audited_at: 2026-09-28
findings: 1
---

# Audit: verdict-precedence-chain.md

## Verified (9)

- ✓ `computeVerdict` exists — `src/renderer/src/lib/verdict.ts:143`.
- ✓ No greeks → `HOLD` / "Awaiting market data" — `verdict.ts:147-148`.
- ✓ Rule 1: `dte ≤ actNowDte (3) && |delta| > ccDangerDelta (0.50)` → ACT NOW — `verdict.ts:46,54,158-164`.
- ✓ Rule 2: `pnl.pct ≥ targetCapturePct (50)` → TARGET HIT — `verdict.ts:170-173`.
- ✓ Rule 3: `sev === 'danger' || dist.isITM` → CONSIDER ROLL (red) — `verdict.ts:180-189`.
- ✓ Rule 4: `sev === 'warning'` → WATCH (gold) — `verdict.ts:192-198`; Rule 5: `dte ≤ 21 && dte > 7` → WATCH (gold) — `verdict.ts:201-207`; Rule 6: HOLD (green) — `verdict.ts:210-214`.
- ✓ `deltaSeverity` is instrument- and DTE-aware: `cspDangerDelta 0.45`, `ccDangerDelta 0.5`, `cspWarningDelta 0.3`, `ccWarningDelta 0.35`, `tightDeltaShift 0.05` when `dte ≤ tightDte (7)` — `verdict.ts:43-58,72-81`.
- ✓ No shares branch inside `computeVerdict`; `SHARES_VERDICT` exported (`verdict.ts:218`) and chosen by the caller — `src/renderer/src/components/position-cockpit/PositionCockpit.tsx:11,48`.
- ✓ Feature link `../../features/us-34-position-cockpit.md` exists.

## Drift (0)

None.

## Unverifiable (1)

- ? Rationale for the precedence ordering — narrative; `plans/us-34/*` sources are historical (dir not present, by design). Note: the caller also renders a `WHEEL_COMPLETE_VERDICT` (`verdict.ts:225`, `PositionCockpit.tsx:48`) the page does not mention — omission, not drift.

## Missing files (0)

None.
