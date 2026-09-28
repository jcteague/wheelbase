---
page: docs/spec/architecture/02-adrs/alert-resolution-global.md
audited_at: 2026-09-28
findings: 1
---

# Audit: docs/spec/architecture/02-adrs/alert-resolution-global.md

## Verified (7)

- ✓ Keep-open set = matched keys plus skipped keys — `src/main/services/evaluate-alerts.ts:275-281` (`new Set(skippedKeys)` then `keepOpenKeys.add(...)` per match).
- ✓ Every open alert absent from the set is resolved (`status = 'resolved'`, `resolved_at = now`) across all positions, not scoped to evaluable ones — `src/main/services/alerts.ts:145-167` (`resolveStaleRows` selects every row with the status), `resolveAlertsNotIn` at `alerts.ts:176`.
- ✓ Shared `alertKey(positionId, ruleCode)` helper — `src/main/services/alerts.ts:37`.
- ✓ `clearStaleDismissals(db, keepOpenKeys, now)` runs in the same transaction immediately after `resolveAlertsNotIn` — `evaluate-alerts.ts:282-283`.
- ✓ Dismissed rows transition to `resolved` preserving `dismissed_at` — the UPDATE at `alerts.ts:161` sets only `status`, `resolved_at`, `updated_at`; `clearStaleDismissals` at `alerts.ts:190`.
- ✓ Skip reasons `missing_option_mark` / `missing_underlying_price` exist — `src/main/core/alerts.ts:44-45`.
- ✓ Closed positions drop out of the evaluable query (`WHERE p.status = 'ACTIVE' AND p.phase IN ('CSP_OPEN','CC_OPEN')`, `evaluate-alerts.ts:54-68`), so global resolution is what retires their alerts.

## Drift (0)

## Unverifiable (0)

## Missing files (1)

- ✗ Source `plans/us-50/research.md` does not exist. (`plans/us-59/research.md` exists.)
