---
page: docs/spec/architecture/02-adrs/settings-market-data-action-placement.md
audited_at: 2026-09-28
findings: 1
---

# Audit: settings-market-data-action-placement.md

## Verified (4)

- ✓ `src/renderer/src/pages/SettingsPage.tsx` exists and has a `Market Data` section — `aria-label="Market Data"` at line 545.
- ✓ "Refresh IVR now" is a secondary (bordered, non-primary) button in that section — `SettingsPage.tsx:565-572`.
- ✓ Inline success/error feedback — `{ivrMessage && <MessageText message={ivrMessage} />}` at `SettingsPage.tsx:575`.
- ✓ Feature link `../../features/us-44-ivr-snapshot-store-and-scheduler.md` exists.

## Drift (0)

None.

## Unverifiable (1)

- ? Rationale (smallest change, matches lightweight control style) — narrative. `plans/us-44/research.md` and `plans/us-44/plan.md` are historical sources (not audited).

## Missing files (0)

None.
