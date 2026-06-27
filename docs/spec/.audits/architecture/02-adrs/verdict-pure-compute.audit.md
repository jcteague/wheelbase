---
page: docs/spec/architecture/02-adrs/verdict-pure-compute.md
audited_at: 2026-06-27
findings: 1
---

# Audit: verdict-pure-compute.md

## Verified (8)

- ✓ Verdict logic lives at `src/renderer/src/lib/verdict.ts` (path exact).
- ✓ Consumes a `CockpitInput` shape — `export type CockpitInput` at `verdict.ts:19`.
- ✓ Exports `computeVerdict(input)` — `verdict.ts:138`.
- ✓ Exports `computePnl` — `verdict.ts:118`.
- ✓ Exports `computeDistance` — `verdict.ts:103`.
- ✓ Exports `computeThetaYield` — `verdict.ts:128`.
- ✓ Exports `deltaSeverity` (`verdict.ts:67`), `SEVERITY_COLOR` (`verdict.ts:88`), `SHARES_VERDICT` (`verdict.ts:213`), `MANAGEMENT_RULES` (`verdict.ts:38`).
- ✓ Functions are pure (no I/O imports; signatures take values and return results) — consistent with "pure functions" claim.

## Drift (1)

- ✗ The page claims "14 verdict tests cover every branch and threshold." The test file is `src/renderer/src/lib/verdict.spec.ts` (the ADR does not name it) and `grep -cE "\bit\(|\btest\("` reports exactly 14 — so the count matches today, but this is a fragile number that will drift as tests are added. Suggested fix: soften to "comprehensive branch coverage" or reference the spec file by path rather than asserting a fixed count.

## Unverifiable (2)

- ? "The component layer never decides which verdict" — would require auditing every consumer; the export surface supports it but it is not exhaustively verified here.
- ? "Threshold changes no longer require touching JSX" — design-intent narrative; flag for human review.

## Missing files (0)

None within src/ scope.
