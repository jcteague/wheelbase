---
page: docs/spec/architecture/02-adrs/verdict-precedence-chain.md
audited_at: 2026-06-27
findings: 1
---

# Audit: verdict-precedence-chain.md

# `computeVerdict` lives at `src/renderer/src/lib/verdict.ts:138`; thresholds in `MANAGEMENT_RULES` (`verdict.ts:38-63`).

## Verified (7)

- ✓ Six-rule first-match-wins chain confirmed — `verdict.ts:152-210`, top-down `if`/return with a final fallthrough.
- ✓ Rule 1: `dte <= actNowDte && absDelta > ccDangerDelta` → ACT NOW (red, `var(--wb-red)`) — `verdict.ts:153-162`. `actNowDte=3`, `ccDangerDelta=0.5` (`verdict.ts:41,49`), so "`dte ≤ 3 && |delta| > 0.50`" is accurate.
- ✓ Rule 2: `pnl.pct >= targetCapturePct (50)` → TARGET HIT (green) — `verdict.ts:165-171`.
- ✓ Rule 3: `sev === 'danger' || dist.isITM` → CONSIDER ROLL (red) — `verdict.ts:174-184`.
- ✓ Rule 4: `sev === 'warning'` → WATCH (gold) — `verdict.ts:187-193`.
- ✓ Rule 5: `dte <= managementWindowDte (21) && dte > tightDte (7)` → WATCH (gold) — `verdict.ts:196-202`. Matches "`dte ≤ 21 && dte > 7`".
- ✓ Rule 6: otherwise → HOLD (green) — `verdict.ts:205-210`. No-greeks branch returns HOLD with sub "Awaiting market data" — `verdict.ts:139-146`.

## Drift (1)

- ✗ The page says rule 3 reads "`deltaSeverity === 'danger'`" using the literal `0.50` delta band, but `deltaSeverity` (`verdict.ts:67-80`) is instrument- and DTE-aware: danger threshold is `cspDangerDelta=0.45` for PUTs / `ccDangerDelta=0.5` for CALLs, shifted down by `tightDeltaShift=0.05` when `dte ≤ 7`. The ADR's flat rule list omits this nuance, and the "No active leg → SHARES_VERDICT (NO ACTIVE LEG, sky)" routing happens upstream of `computeVerdict` (the function has no shares branch; `SHARES_VERDICT` is exported at `verdict.ts:213` for the caller). Minor: ADR phrasing implies `computeVerdict` itself returns SHARES_VERDICT. Suggested fix: note that severity bands are instrument/DTE-dependent and that the shares branch is applied by the component, not inside `computeVerdict`.

## Unverifiable (1)

- ? "Imminent expiration with ITM exposure trumps everything else... profit-target overrides delta" — rationale narrative; the ordering is verified but the justification is not auditable.

## Missing files (0)

None within src/ scope.
