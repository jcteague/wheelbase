---
page: docs/spec/architecture/02-adrs/react-hook-form-zod.md
audited_at: 2026-06-27
findings: 0
---

# Audit: react-hook-form-zod.md

## Verified (3)

- ✓ Renderer forms use `useForm` + `zodResolver`: `CloseCspForm.tsx`, `NewWheelForm.tsx`, `RollCspSheet.tsx`, `RollCcSheet.tsx`, `SettingsPage.tsx` all reference `zodResolver` (grep `src/renderer/src/`).
- ✓ `RollCspSheet` uses `zodResolver` (migrated from hand-managed state per us-12-refactor) (`src/renderer/src/components/RollCspSheet.tsx`).
- ✓ `CloseCspForm` exists and is referenced as the `makeXSchema(...)` factory exemplar (`src/renderer/src/components/CloseCspForm.tsx`).

## Drift (0)

## Unverifiable (2)

- ? "snake_case field names" / "`.refine(v => parseFloat(v) > 0, ...)`" patterns — consistent with the snake-case adapter ADR but the exact refine shape per form was not individually grepped.
- ? "no hand-managed `useState` form state" across ALL forms — a negative universal claim; spot-checks pass (the 5 forms above use RHF) but not exhaustively provable by grep.

## Missing files (0)
