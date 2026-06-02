---
plan: fix-sheet-portal-styles
source: plans/fix-sheet-portal-styles/
extracted_at: 2026-06-01
status: complete
---

# Extract: fix-sheet-portal-styles

## Summary
Restores the shadcn Sheet component (Radix Dialog) for the ExpirationSheet after a workaround used inline `React.CSSProperties` because Tailwind classes stopped working inside Radix portals. Diagnoses the root cause as Radix portals mounting into `document.body` outside Tailwind v4's `@layer` scope, and fixes it once by adding a `#sheet-portal` mount point inside `#root` so every future Sheet uses Tailwind classes correctly.

## Architecture Decisions

### ADR: Portal target inside `#root` for Tailwind v4 `@layer` scope
- **Decision:** Modify `SheetPortal` to mount into a `#sheet-portal` div placed inside `#root` (the app layout), rather than the default `document.body`.
- **Why:** "Radix portals into `document.body` by default. Elements outside `#root` fall outside Tailwind v4's `@layer` scope — box-model utilities (border, padding, background, border-radius) lose to base/reset rules. Text color works because it inherits from `:root`." A one-time portal-target fix means every future Sheet automatically uses the correct portal target.
- **Alternatives considered:** HMR artifact hypothesis (candidate #4 in the issue doc) — to be ruled out first via a fresh `pnpm dev` restart before applying the portal fix.
- **Source:** `plans/fix-sheet-portal-styles/plan.md`

### ADR: Reinstall shadcn Sheet rather than keep inline-style workaround
- **Decision:** Reinstall `src/renderer/src/components/ui/sheet.tsx` via `pnpm dlx shadcn@latest add sheet --yes` and rewrite ExpirationSheet to use Tailwind classes via shadcn primitives.
- **Why:** "The inline-style workaround is functional but inconsistent with the rest of the codebase. Future screens will need sheets (close CSP, roll, assignment, covered call), so this needs a reusable fix."
- **Alternatives considered:** None recorded.
- **Source:** `plans/fix-sheet-portal-styles/plan.md`

## Contracts

### SheetPortal (modified)
- **Type:** React component (shadcn/Radix wrapper)
- **Shape:**
  ```tsx
  const SheetPortal = ({ ...props }: DialogPrimitive.DialogPortalProps) => (
    <DialogPrimitive.Portal container={document.getElementById('sheet-portal')} {...props} />
  )
  ```
- **Source:** `plans/fix-sheet-portal-styles/plan.md`
- **Implementation:** `src/renderer/src/components/ui/sheet.tsx`

### `#sheet-portal` mount point
- **Type:** DOM element in app layout
- **Shape:**
  ```tsx
  <div id="sheet-portal" />
  ```
- **Source:** `plans/fix-sheet-portal-styles/plan.md`
- **Implementation:** `src/renderer/src/App.tsx`

### ExpirationSheet (rewritten)
- **Type:** React component
- **Shape:** Uses `SheetContent side="right"` with `className="w-[400px]"`; handles sidebar offset via `left-[200px]` or a CSS variable on `SheetOverlay`/`SheetContent`; keeps two internal states (`confirmation` | `success`).
- **Source:** `plans/fix-sheet-portal-styles/plan.md`
- **Implementation:** `src/renderer/src/components/ExpirationSheet.tsx`

## Schema Changes
None recorded.

## Acceptance Criteria
- Diagnose via fresh `pnpm dev` restart: temporarily restore a single Tailwind class (e.g., `border border-red-500`) on the ExpirationSheet panel div alongside inline styles; inspect in DevTools whether the class is present and applies.
- If classes work after restart → issue was HMR-only; skip the portal-target fix.
- If classes still fail → confirmed `@layer` scope issue; apply portal-target fix.
- Reinstall shadcn Sheet via `pnpm dlx shadcn@latest add sheet --yes`.
- Verify `src/renderer/src/components/ui/sheet.tsx` is created with exports: `Sheet`, `SheetPortal`, `SheetOverlay`, `SheetContent`, `SheetHeader`, `SheetFooter`, `SheetTitle`, `SheetDescription`, `SheetClose`.
- Add `<div id="sheet-portal" />` to app layout (e.g., `App.tsx`) if needed.
- Modify `SheetPortal` in `sheet.tsx` to use `container={document.getElementById('sheet-portal')}`.
- Rewrite ExpirationSheet replacing all inline `React.CSSProperties` objects with Tailwind classes.
- Preserve all existing ExpirationSheet functionality and test coverage.
- `pnpm test` — all ExpirationSheet tests pass.
- `pnpm lint` — clean.
- `pnpm typecheck` — clean.
- Manual: open ExpirationSheet in dev, confirm borders/backgrounds/padding render correctly.
- Manual: confirm animation (slide-in/out), Escape key dismissal, scrim click dismissal.
- Delete inline style objects from ExpirationSheet.
- Close issue wheelbase-6lx and update `docs/issues/expiration-sheet-portal-styles.md` status to resolved.

## Decisions & Tradeoffs
- Diagnostic step ordering: rule out HMR artifact via a fresh `pnpm dev` restart before applying the portal-target fix, to avoid unnecessary structural changes if HMR was the only culprit.
- One-time portal fix is preferred over per-component workarounds so future sheets (close CSP, roll, assignment, covered call) inherit correct behavior automatically.
- Sidebar offset handled directly on `SheetOverlay`/`SheetContent` via `left-[200px]` or a CSS variable rather than wrapping/reparenting.

## Source Code References
- `src/renderer/src/components/ui/sheet.tsx` — reinstalled via shadcn CLI (verified exists)
- `src/renderer/src/components/ExpirationSheet.tsx` — rewritten from inline styles to shadcn Sheet (verified exists)
- `src/renderer/src/App.tsx` — `#sheet-portal` div added if step 3 was needed (verified exists)

## Open Questions
- Whether the portal-target fix is actually required, or whether the original failure was an HMR artifact only — to be determined by the step 1 diagnostic.
