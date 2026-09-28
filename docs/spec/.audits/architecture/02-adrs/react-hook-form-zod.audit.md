---
page: docs/spec/architecture/02-adrs/react-hook-form-zod.md
audited_at: 2026-09-28
findings: 1
---

# Audit: react-hook-form-zod.md

## Verified (5)

- ✓ `useForm` + `zodResolver` used by every form component found (`CloseCspForm`, `NewWheelForm`, `RollCspSheet`, `RollCcSheet`, `WatchlistEntryForm`, `ScreeningCriteriaForm`, `PositionAlertOverridesForm`, `SettingsPage`) — `grep zodResolver src/renderer/src`.
- ✓ `RollCspSheet` uses RHF + Zod with a `new_expiration > currentExpiration` refine — `src/renderer/src/components/RollCspSheet.tsx:2-3, 33-36`.
- ✓ `CloseCspForm` has a `makeCloseCspSchema(...)` factory with string fields and `.refine` checks — `src/renderer/src/components/CloseCspForm.tsx:15-32`.
- ✓ `useWatch` for reactive derived values — `CloseCspForm.tsx:2`, `NewWheelForm.tsx:97`.
- ✓ `NewWheelForm` uses `useForm({ resolver: zodResolver(newWheelSchema) })` and `Controller` — `src/renderer/src/components/NewWheelForm.tsx:3, 86-87`.

## Drift (1)

- ✗ Line 7: "Form field names use snake_case (matching the renderer's payload convention)". Only some older forms do (`CloseCspForm`: `close_price_per_contract`, `fill_date`; `RollCspSheet`: `new_expiration`). Many use camelCase: `NewWheelForm` (`premiumPerContract`), `WatchlistEntryForm` (`ownBelowPrice`, `ivrTrigger`), `ScreeningCriteriaForm` (`deltaMin`, `dteMax`), `PositionAlertOverridesForm` / `SettingsPage` (`profitTargetPercent`, `managementWindowDte`, `keyId`). Suggested fix: state that field-name case follows the form's payload, not a blanket snake_case rule.

## Unverifiable (2)

- ? "Mandatory for new forms — no hand-managed `useState` form state" — policy; no form without `useForm` found, but not exhaustively proven.
- ? NaN edge cases / Formik rejection — rationale.

## Missing files (0)

None.
