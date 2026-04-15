# Fix Sheet Portal Styles — Restore shadcn Sheet Component

**Issue:** `docs/issues/expiration-sheet-portal-styles.md` (wheelbase-6lx)
**Priority:** P3

## Background

The US-5 plan (`plans/us-5/research.md:32-36`) originally chose shadcn Sheet (Radix Dialog) for the ExpirationSheet. During implementation, Tailwind classes stopped working inside the portal — borders, backgrounds, padding, and border-radius all failed. The component was rewritten with inline `React.CSSProperties` as a workaround, and `sheet.tsx` was removed from `ui/`.

The inline-style workaround is functional but inconsistent with the rest of the codebase. Future screens will need sheets (close CSP, roll, assignment, covered call), so this needs a reusable fix.

## Root Cause

Radix portals into `document.body` by default. Elements outside `#root` fall outside Tailwind v4's `@layer` scope — box-model utilities (border, padding, background, border-radius) lose to base/reset rules. Text color works because it inherits from `:root`.

It may also have been an HMR artifact (candidate #4 in the issue doc) — a fresh `pnpm dev` restart should be tested first.

## Plan

### 1. Diagnose — fresh restart test

- Kill any running dev server
- `pnpm dev` from scratch (full restart, not HMR)
- Temporarily restore a single Tailwind class (e.g., `border border-red-500`) on the ExpirationSheet panel div alongside the inline styles
- Inspect in DevTools: is the class present in the stylesheet? Does it apply?
- **If classes work after restart** → the issue was HMR-only. Skip step 3, proceed to step 2.
- **If classes still fail** → confirmed `@layer` scope issue. Proceed to steps 2 and 3.

### 2. Reinstall shadcn Sheet

```bash
pnpm dlx shadcn@latest add sheet --yes
```

Verify `src/renderer/src/components/ui/sheet.tsx` is created with exports: `Sheet`, `SheetPortal`, `SheetOverlay`, `SheetContent`, `SheetHeader`, `SheetFooter`, `SheetTitle`, `SheetDescription`, `SheetClose`.

### 3. Fix portal target (if needed based on step 1)

Add a portal mount point inside `#root` so portal content stays within Tailwind's `@layer` scope.

**In the app layout (e.g., `App.tsx`):**

```tsx
<div id="sheet-portal" />
```

**In `sheet.tsx`, modify `SheetPortal`:**

```tsx
const SheetPortal = ({ ...props }: DialogPrimitive.DialogPortalProps) => (
  <DialogPrimitive.Portal container={document.getElementById('sheet-portal')} {...props} />
)
```

This is a one-time fix — every future Sheet automatically uses the correct portal target.

### 4. Rewrite ExpirationSheet to use shadcn Sheet

Follow the original US-5 plan structure (`plans/us-5/plan.md:248-286`):

- Replace all inline `React.CSSProperties` objects with Tailwind classes
- Use `SheetContent side="right"` with `className="w-[400px]"`
- Handle sidebar offset: add `left-[200px]` or a CSS variable to `SheetOverlay`/`SheetContent`
- Keep the two internal states (`confirmation` | `success`)
- Preserve all existing functionality and test coverage

### 5. Verify

- `pnpm test` — all ExpirationSheet tests pass
- `pnpm lint` — clean
- `pnpm typecheck` — clean
- Manual: open ExpirationSheet in dev, confirm borders/backgrounds/padding render correctly
- Manual: confirm animation (slide-in/out), Escape key dismissal, scrim click dismissal

### 6. Clean up

- Delete inline style objects from ExpirationSheet
- Close issue wheelbase-6lx
- Update `docs/issues/expiration-sheet-portal-styles.md` status to resolved

## Files Affected

- `src/renderer/src/components/ui/sheet.tsx` — new (reinstalled via shadcn CLI)
- `src/renderer/src/components/ExpirationSheet.tsx` — rewrite from inline styles to shadcn Sheet
- `src/renderer/src/App.tsx` (or layout root) — add `#sheet-portal` div if step 3 is needed

## Future Impact

Once this is fixed, all future sheet components (close CSP, roll, assignment, covered call) use the same `Sheet`/`SheetContent` primitives with Tailwind classes — no more one-off portal workarounds.
