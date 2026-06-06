---
plan: design-system
source: plans/design-system/
extracted_at: 2026-06-01
status: complete
---

# Extract: design-system

## Summary

Migrate the renderer from 367 static inline `style={{}}` instances across 38 files to a Tailwind-first design system. The `wb-*` CSS variable tokens are mapped into Tailwind utilities via `@theme inline` in `index.css`, a portal mount fix enables Tailwind classes inside sheet overlays, and every component is migrated area by area from inline styles to class names. Done state: only truly dynamic values (runtime-computed colors, prop-driven widths) remain as inline styles.

## Architecture Decisions

### ADR: Tailwind v4 Token Integration via `@theme inline`

- **Decision:** Extend the existing `@theme inline` block in `src/renderer/src/index.css` with `--color-wb-*` entries for every wb-\* color token. Add `--font-wb-mono` for the monospace stack. Add `--shadow-sheet` for the panel drop shadow.
- **Why:** The project already uses `@theme inline` for shadcn token mapping (e.g. `--color-background: var(--background)`). Tailwind v4 resolves `@theme inline` entries directly into utility output, so `--color-wb-gold: var(--wb-gold)` generates `bg-wb-gold`, `text-wb-gold`, `border-wb-gold`, etc. with no additional configuration file.
- **Alternatives considered:** `tailwind.config.ts` `theme.extend.colors` — not applicable for Tailwind v4 which has moved to CSS-based configuration. Adding tokens as arbitrary values at usage site (`bg-[var(--wb-gold)]`) — works today but requires brackets everywhere and provides no named utility; ruled out.
- **Source:** `plans/design-system/research.md`

### ADR: Portal Mount Point inside `#root` for Tailwind Classes

- **Decision:** Add `<div id="sheet-portal" />` as a sibling to `<main>` inside `AppShell` in `App.tsx`. All sheet consumers pass `document.getElementById('sheet-portal')` as the second argument to `createPortal` instead of `document.body`.
- **Why:** The `fix-sheet-portal-styles` plan identified this pattern as the correct fix. Elements inside `#root` are within the same CSS context as the rest of the app; Tailwind's `@layer utilities` rules apply without being overridden by body-level reset rules. Sheets currently mount to `document.body` which places them outside `#root` and causes Tailwind's layered utilities to lose specificity to base rules.
- **Alternatives considered:** Using `!important` on Tailwind utility classes — anti-pattern, not maintainable. Diagnosing as HMR artifact and doing a fresh restart — attempted approach suggested in the issue; did not resolve the underlying structural cause.
- **Source:** `plans/design-system/research.md`

### ADR: TDD via Class-Name Assertions

- **Decision:** For each component area, write tests that assert specific Tailwind class names on rendered elements (e.g., `expect(element).toHaveClass('border-t')`) before migrating. Existing behavior tests (text content, interactions) serve as regression guard. For `Sheet.tsx` specifically, update existing style-attribute assertions to class-name assertions as part of the Red phase.
- **Why:** Without class-asserting tests, the migration has no clear Red → Green signal. Asserting class names directly confirms the migration is complete and catches regressions in the refactor phase.
- **Alternatives considered:** Snapshot tests — brittle and verbose for class-heavy markup. No tests, verify visually only — no regression safety net.
- **Source:** `plans/design-system/research.md`

### ADR: Dynamic Prop Values Must Stay Inline

- **Decision:** Keep the following as inline `style` props even after migration: `SheetPanel.width` (runtime prop), `SheetHeader.eyebrowColor` and `SheetHeader.borderBottomColor` (runtime string props), per-row computed background gradients in success states where color is data-driven. Everything else (static structural styles) becomes Tailwind.
- **Why:** Tailwind arbitrary values must be statically present in source at build time. Runtime-computed class names (e.g., `` `w-[${width}px]` ``) are not scanned by the JIT and will not emit CSS. Inline styles are the correct tool for truly dynamic values.
- **Alternatives considered:** CSS custom properties on the element with a static utility class — viable but adds complexity; deferred as over-engineering for this migration.
- **Source:** `plans/design-system/research.md`

### ADR: Gradual MONO Font Migration via `font-wb-mono`

- **Decision:** Add `--font-wb-mono` to the `@theme inline` block, mapping to the same stack as the `MONO` constant in `src/renderer/src/lib/tokens.ts`. At call sites, replace `fontFamily: MONO` inline style with `className="font-wb-mono"`. Do not delete `tokens.ts` until all references are migrated.
- **Why:** The MONO constant is imported in ~15+ files; deleting it before migration would cause type errors. Gradual replacement allows the migration to proceed area by area.
- **Alternatives considered:** Rename/re-export from tokens.ts — unnecessary indirection; ruled out.
- **Source:** `plans/design-system/research.md`

## Contracts

None recorded. This is a renderer-side CSS/structural migration; no IPC handlers, Alpaca calls, events, or Zod schemas are added or modified.

## Schema Changes

None recorded. `plans/design-system/quickstart.md` explicitly states: "No migrations, seed data, or IPC changes are required. This is a pure renderer-side CSS migration."

## Acceptance Criteria

From `docs/issues/design-system-tailwind-migration.md` (per the AC Audit table in `plans/design-system/plan.md`):

- wb-\* tokens available as Tailwind utilities
- MONO font available as Tailwind utility
- All sheets use shared layout primitives
- Style change propagates to all sheets
- Sheet content components use Tailwind classes
- Form components use Tailwind classes
- No static inline styles remain

E2E coverage (Area 15) verifies each via `e2e/design-system.spec.ts`, including:

- Rendering a known element (Wheelbase logo dot) and asserting computed `background-color` matches `--wb-gold` (`rgb(230, 168, 23)`)
- Inspecting the sidebar "Wheelbase" label and asserting computed `font-family` contains `ui-monospace`
- Opening `ExpirationSheet` and asserting its panel has class `bg-wb-bg-surface` (not an inline style)
- Opening `ExpirationSheet` and `AssignmentSheet` sequentially and asserting their panel elements share the same class set for background and border (single source of truth via `Sheet.tsx`)
- Opening `ExpirationSheet` confirmation state and asserting the summary card has `bg-wb-bg-elevated border border-wb-border rounded-lg`
- Opening `NewWheelForm`, asserting a label has no `style` attribute and carries `text-wb-text-secondary`
- Using `page.evaluate()` to query every element with a non-empty `style` attribute inside `#root` and asserting none contains a known static token string (e.g. `var(--wb-gold)` or `var(--wb-bg-surface)`)

## Decisions & Tradeoffs

- **Token Catalog (per `plans/design-system/data-model.md`):** 27 color tokens (`--wb-bg-base`, `--wb-bg-surface`, `--wb-bg-elevated`, `--wb-bg-hover`, `--wb-border`, `--wb-border-subtle`, `--wb-text-primary`, `--wb-text-secondary`, `--wb-text-muted`, `--wb-gold`/`-dim`/`-border`/`-subtle`, `--wb-green`/`-dim`/`-border`/`-subtle`, `--wb-red`/`-dim`, `--wb-blue`/`-dim`, `--wb-teal`/`-dim`/`-bright`, `--wb-violet`/`-dim`, `--wb-sky`) plus `--font-wb-mono: ui-monospace, 'SF Mono', Menlo, 'Cascadia Code', 'Fira Code', monospace` and `--shadow-sheet: -12px 0 48px rgba(0, 0, 0, 0.5)`.
- **Inline style conversion table** in `data-model.md` standardizes common patterns: `fontFamily: MONO` → `font-wb-mono`; `background: 'var(--wb-bg-elevated)'` → `bg-wb-bg-elevated`; `border: '1px solid var(--wb-border)'` → `border border-wb-border`; `borderRadius: 8` → `rounded-lg`; `borderRadius: 6` → `rounded-md`; `flex 1` → `flex-1`; `flexShrink: 0` → `shrink-0`; etc.
- **Static-to-Tailwind threshold:** `SheetOverlay.left = SIDEBAR_WIDTH` (constant 200) is migrated to `left-[200px]` because the value is static even if held in a constant; `SheetPanel.width` stays inline because it's a prop.
- **Conditional class strings are safe:** P&L color toggling expressed as `pnl >= 0 ? 'text-wb-green' : 'text-wb-red'` is valid because both class strings are statically present in source for the JIT scanner.
- **Linear gradients stay inline:** `linear-gradient(135deg, ...)` with multiple color stops is not expressible as a single static Tailwind utility and remains as `style={{ background: ... }}`.
- **Custom CSS classes audited for removal post-migration:** `index.css` blocks `.wb-nav-link`, `.wb-position-row`, `.wb-hover-opacity`, `.wb-teal-button` are flagged in Area 14 refactor for potential removal if Tailwind utilities supersede them.
- **`MONO` constant deletion deferred** until all imports are removed; tracked in Area 14 refactor.
- **Sheet content de-duplication noted but deferred:** `CcExpirationSheet` and `ExpirationSheet` have nearly identical summary card markup; extraction into a shared `SummaryCard` component is explicitly out of scope (mentioned in Area 5 refactor notes).
- **Refactor outcomes (per `refactor-phase-results.md`):**
  - Area 1: Added symmetric `/* ── shadcn/ui tokens ── */` and `/* ── wb-* tokens ── */` section headers in `@theme inline` block for clarity.
  - Area 3 (`Sheet.tsx`): `SheetHeader` eyebrow keeps only dynamic `color: eyebrowColor` inline; title/subtitle/eyebrow static props moved to Tailwind. 99/99 sheet tests passing.
  - Area 12 (`App.tsx`, `PositionsListPage.tsx`): logo dot keeps `boxShadow: '0 0 6px var(--wb-gold)'` inline (glow effect has no Tailwind equivalent without custom config); `PageLayout` keeps `contentStyle` prop spread (caller-supplied override).
  - Area 13 (`LegHistoryTable`, `PositionCard`): `PositionRow` retains `--wb-row-bg` and `--wb-row-phase-color` inline CSS custom properties set per-row; `tfoot` P&L color remains dynamic.
  - Area 14: `PhaseBadge` dot static `borderRadius: '50%'` → `rounded-full` (test updated from `toHaveStyle({ borderRadius: '50%' })` to `toHaveClass('rounded-full')`); `FormButton` 7 static style properties converted; `PositionDetailActions` "Record Expiration →" inline button replaced with existing `ActionButton` component to remove duplication; `CalendarIcon` in `date-picker.tsx` `opacity: 0.5, flexShrink: 0` → `opacity-50 shrink-0`.
  - `Badge`, `AlertBox`, `ErrorAlert`, `NumberInput`, `DatePicker` button, `LoadingState` dot, `StatGrid` retain inline styles for documented dynamic reasons.

## Source Code References

Files introduced or modified by this plan (verified to exist):

- `src/renderer/src/index.css` — `@theme inline` block extended with wb-\* color, font, shadow tokens
- `src/renderer/src/lib/tokens.ts` — `MONO` constant (deletion deferred)
- `src/renderer/src/App.tsx` — `#sheet-portal` div added; sidebar/AppShell static styles migrated
- `src/renderer/src/components/ui/Sheet.tsx` — `SheetOverlay`, `SheetPanel`, `SheetBody`, `SheetFooter`, `SheetCloseButton`, `SheetHeader` migrated
- `src/renderer/src/components/ExpirationSheet.tsx`
- `src/renderer/src/components/CcExpirationSheet.tsx`
- `src/renderer/src/components/AssignmentSheet.tsx`
- `src/renderer/src/components/OpenCoveredCallSheet.tsx`
- `src/renderer/src/components/OpenCcForm.tsx`
- `src/renderer/src/components/OpenCcSuccess.tsx`
- `src/renderer/src/components/RollCspSheet.tsx`
- `src/renderer/src/components/RollCspForm.tsx`
- `src/renderer/src/components/RollCspSuccess.tsx`
- `src/renderer/src/components/CloseCcEarlySheet.tsx`
- `src/renderer/src/components/CloseCcEarlyForm.tsx`
- `src/renderer/src/components/CloseCcEarlySuccess.tsx`
- `src/renderer/src/components/CallAwaySheet.tsx`
- `src/renderer/src/components/CallAwayForm.tsx`
- `src/renderer/src/components/CallAwaySuccess.tsx`
- `src/renderer/src/components/NewWheelForm.tsx`
- `src/renderer/src/components/ui/FormField.tsx`
- `src/renderer/src/components/CloseCspForm.tsx`
- `src/renderer/src/pages/PositionsListPage.tsx`
- `src/renderer/src/pages/PositionDetailContent.tsx`
- `src/renderer/src/components/PageLayout.tsx`
- `src/renderer/src/components/LegHistoryTable.tsx`
- `src/renderer/src/components/PositionCard.tsx`
- `src/renderer/src/components/PhaseBadge.tsx`
- `src/renderer/src/components/NavItem.tsx`
- `src/renderer/src/components/PositionDetailActions.tsx`
- `src/renderer/src/components/ui/Stat.tsx`
- `src/renderer/src/components/ui/Breadcrumb.tsx`
- `src/renderer/src/components/ui/NumberInput.tsx`
- `src/renderer/src/components/ui/date-picker.tsx`
- `src/renderer/src/components/ui/TablePrimitives.tsx`
- `src/renderer/src/components/ui/LoadingState.tsx`
- `src/renderer/src/components/ui/FormButton.tsx`
- `src/renderer/src/components/ui/ErrorAlert.tsx`
- `src/renderer/src/components/ui/CcPnlPreview.tsx`
- `src/renderer/src/components/ui/Caption.tsx`
- `src/renderer/src/components/ui/Badge.tsx`
- `src/renderer/src/components/ui/AlertBox.tsx`
- `src/renderer/src/pages/NewWheelPage.tsx`

Planned but not yet present (per `plans/design-system/plan.md` Area 15):

- `e2e/design-system.spec.ts` — Playwright E2E spec covering 7 ACs (not yet wired)

## Open Questions

Per `plans/design-system/session-handoff.md` (last updated 2026-04-11):

- 2 tests in `src/renderer/src/components/RollCspSuccess.test.tsx` were failing at session pause (`credit roll hero display container has bg-wb-green-dim class`, `debit roll hero display container has bg-wb-gold-dim class`); fix applied (`fontFamily: 'var(--font-wb-mono)'` inline on inner div), needs `pnpm test` confirmation.
- Layer 3 Refactors not yet applied to main repo: `CallAwayForm.tsx` (9 `fontFamily: MONO` usages remaining + import to remove); `CallAwaySuccess.tsx` (2 usages + import); Area 8 RollCsp duplicate `SummaryRow` component to extract to `src/renderer/src/components/ui/SummaryRow.tsx`; Area 9 CloseCcEarly suite has ~95 lines of inline-layout reductions identified by worktree agent.
- Area 14 Refactor (Layer 2) still marked `[ ]` in tasks.md: `Stat.tsx`, `Breadcrumb.tsx`, `NavItem.tsx`, `PhaseBadge.tsx`, `PositionDetailActions.tsx`, single-instance primitives.
- Area 15 E2E Tests (Layer 4) — Red/Green/Refactor for `e2e/design-system.spec.ts` not yet started; covers all 7 ACs.
- `SectionCard.tsx` still imports and uses `MONO` — scoped to Layer 2 Area 14, not yet migrated.
- Background refactor agents ran in isolated worktrees cut from HEAD with pre-migration code; only Areas 5 and 7 work landed on the main repo from those agents. Worktree branches must not be cherry-picked.
