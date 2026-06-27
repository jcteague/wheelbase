---
page: docs/spec/architecture/02-adrs/settings-market-data-action-placement.md
audited_at: 2026-06-27
findings: 0
---

# Audit: settings-market-data-action-placement.md

## Verified (3)

- ✓ Manual IVR trigger lives in `SettingsPage.tsx` — `src/renderer/src/pages/SettingsPage.tsx:467` ("Refresh IVR now" button).
- ✓ Placed in the existing Market Data section — section labeled "Market Data — Massive" at `SettingsPage.tsx:448`, `aria-label="Market Data"` at `:443`; button rendered within it (`:467`).
- ✓ Inline success/error feedback — `SettingsPage.tsx:408` ("IVR refresh skipped...") and `:415` ("IVR refresh complete: N snapshots saved, M errors."); corroborated by tests `SettingsPage.test.tsx:97-158`.

## Drift (0)

None.

## Unverifiable (1)

- ? "secondary action" styling and "matches the page's current lightweight control style" — visual/design rationale, narrative.

## Missing files (0)

- `plans/us-44/...` and feature page — plan/feature references, not code claims.
