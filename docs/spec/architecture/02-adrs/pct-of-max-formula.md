# ADR: "% of max profit captured" formula for CC close
<!-- generated:from us-8-pct-fix -->

## Decision

The "% of max" label shown in the profit branch of `CcPnlPreview` uses:

```
pct = (openPremium − closePrice) / openPremium × 100
```

This is the industry-standard tastytrade-popularised framing of how much of the maximum possible profit on a short call has been captured by closing early. Wheel traders use this number to apply the 50%-of-max close rule.

The loss-branch label ("% above open") keeps `(closePrice − openPremium) / openPremium × 100`. This is a Wheelbase-specific enhancement beyond the US-8 acceptance criteria and is intentional.

## Context / Why

- The initial US-8 implementation used `closePrice / openPremium × 100`, which is "percentage of premium paid back" — a valid complementary metric but not the one traders use for the 50%-rule decision.
- The only close price where both formulas agree is the exact 50% midpoint (`closePrice = openPremium / 2`); the bug was invisible at that fixture and only surfaced when the e2e fixture moved off the midpoint.
- The acceptance criterion AC3 in US-8 explicitly specifies "50% of max" framing.

## Alternatives considered

- **Keep the original formula and relabel it "% of premium returned"** — rejected; doesn't match trader mental models or the AC.
- **Remove the loss-branch percentage entirely** to match the original AC — deferred; the loss-branch enhancement is preserved as a useful (if non-standard) descriptive label.

## Consequences

- The e2e fixture in `e2e/close-cc-early.spec.ts` uses `closePrice = $1.10` (not the midpoint `$1.15`) so the test now falsifies the wrong implementation: `52.2%` under the corrected formula vs `47.8%` under the old one.
- The unit-test fixture in `CcPnlPreview.test.tsx` includes a negative assertion that `47.8% of max` is NOT rendered, guarding against regression.
- This is a renderer-only correction; no IPC, schema, or service changes.

## Sources

- [extract: us-8-pct-fix](../../.extracts/us-8-pct-fix.md) — ADR "'% of max profit captured' Formula in CcPnlPreview"
- [feature: us-8-close-cc-early](../../features/us-8-close-cc-early.md)
<!-- /generated -->
