# ADR: Verdict precedence — six-rule first-match-wins chain

<!-- generated:from us-34 -->

## Decision

`computeVerdict` evaluates a six-rule chain top-down, returning the first match:

1. `dte ≤ 3 && |delta| > 0.50` → **ACT NOW** (red)
2. `pnl.pct ≥ 50` → **TARGET HIT** (green)
3. `deltaSeverity === 'danger' || dist.isITM` → **CONSIDER ROLL** (red)
4. `deltaSeverity === 'warning'` → **WATCH** (gold)
5. `dte ≤ 21 && dte > 7` → **WATCH** (gold)
6. otherwise → **HOLD** (green)

No active leg → `SHARES_VERDICT` ("NO ACTIVE LEG", sky). No greeks data → `HOLD` with sub "Awaiting market data".

## Why

Imminent expiration with ITM exposure (rule 1) trumps everything else — the trader needs to act today. Profit-target (rule 2) overrides delta concerns because if 50% is captured, closing is cheap regardless of severity. Danger delta or ITM (rule 3) ranks above warning bands because either alone is a roll signal. Warning delta (rule 4) and the 21–7 DTE window (rule 5) both reduce to "WATCH" — close enough to expiry to be on radar but not yet actionable.

## Alternatives considered

- **Score-and-rank** (weight each signal, sort) — opaque to traders; harder to reason about which rule fired and why.
- **Independent badges** (show every triggered rule simultaneously) — defeats the point of a single glanceable verdict.

## Source

- `plans/us-34/plan.md` (Area 1)
- `plans/us-34/data-model.md`
- Feature page: `../../features/us-34-position-cockpit.md`
<!-- /generated -->
