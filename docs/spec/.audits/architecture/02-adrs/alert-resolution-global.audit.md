---
page: docs/spec/architecture/02-adrs/alert-resolution-global.md
audited_at: 2026-06-27
findings: 0
---

# Audit: alert-resolution-global.md

## Verified (3)

- ✓ Persist phase resolves every open alert whose `(position_id, rule_code)` key is absent from the matched set — `resolveAlertsNotIn` iterates open alerts and resolves those not in `matchedKeys` — `src/main/services/alerts.ts:115-129`; called at `evaluate-alerts.ts:120`.
- ✓ Resolution sets `status = 'resolved', resolved_at = ?` (no delete) — `alerts.ts:129` (`UPDATE alerts SET status = 'resolved', resolved_at = ? ...`).
- ✓ Shared `alertKey(positionId, ruleCode)` helper builds the identity — `alerts.ts:36`, used both for matched keys (`evaluate-alerts.ts:118`) and filtering (`alerts.ts:125`).

## Drift (0)

None.

## Unverifiable (1)

- ? "global, not position-scoped ... includes closed/rolled positions" — the implementation iterates all currently-open alert rows (not just evaluable positions), consistent with the claim; the specific scenario coverage is design rationale.

## Missing files (0)

None.
