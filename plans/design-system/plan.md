# Implementation Plan: Design System — Tailwind + wb-\* Migration

## Summary

Migrate the renderer from 367 static inline `style={{}}` instances across 38 files to a Tailwind-first design system. The `wb-*` CSS variable tokens are mapped into Tailwind utilities via `@theme inline` in `index.css`, a portal mount fix enables Tailwind classes inside sheet overlays, and every component is migrated area by area from inline styles to class names. Done state: only truly dynamic values (runtime-computed colors, prop-driven widths) remain as inline styles.

## Supporting Documents

- **Issue & Acceptance Criteria:** `docs/issues/design-system-tailwind-migration.md`
- **Research & Design Decisions:** `plans/design-system/research.md`
- **Token Catalog & Conversion Reference:** `plans/design-system/data-model.md`
- **Quickstart & Verification:** `plans/design-system/quickstart.md`

## Prerequisites

- Phase 2 complete: `src/renderer/src/components/ui/Sheet.tsx` exists with `SheetOverlay`, `SheetPanel`, `SheetHeader`, `SheetBody`, `SheetFooter`, `SheetCloseButton`; all 7 sheet consumers already use these primitives
- All existing tests pass: `pnpm test`

---

## Implementation Areas

### 1. wb-\* Token Integration

**Files to create or modify:**

- `src/renderer/src/index.css` — extend `@theme inline` block with all wb-\* color, font, and shadow entries

**Red — tests to write:**

- In `src/renderer/src/index.css.test.ts` (new file): write a test that imports the CSS and asserts that `--color-wb-gold`, `--color-wb-green`, `--color-wb-text-primary`, and `--font-wb-mono` are present in the file source. This is a source-level assertion (read the file, check for the string) since Tailwind CSS is not processed in Vitest. Test file: `src/renderer/src/lib/tokens.test.ts` — add a test asserting `MONO` constant matches the value that will be used in `--font-wb-mono` (regression guard for the font stack).

**Green — implementation:**

- In the existing `@theme inline` block in `index.css`, add all 27 `--color-wb-*` entries from `plans/design-system/data-model.md` (bg tokens, border tokens, text tokens, accent tokens)
- Add `--font-wb-mono: ui-monospace, 'SF Mono', Menlo, 'Cascadia Code', 'Fira Code', monospace`
- Add `--shadow-sheet: -12px 0 48px rgba(0, 0, 0, 0.5)`
- Do not remove the `MONO` constant yet — it is still used in many files

**Refactor — cleanup to consider:**

- Verify the `@theme inline` block is logically organized (shadcn tokens grouped separately from wb-\* tokens, with a comment separator)

**Acceptance criteria covered:**

- `wb-* tokens available as Tailwind utilities` — after this area, `bg-wb-gold`, `text-wb-text-primary`, `border-wb-border`, `font-wb-mono`, `shadow-sheet` all generate CSS

---

### 2. Portal Mount Point

**Files to create or modify:**

- `src/renderer/src/App.tsx` — add `<div id="sheet-portal" />` inside `AppShell`
- `src/renderer/src/components/ExpirationSheet.tsx` — update portal target
- `src/renderer/src/components/AssignmentSheet.tsx` — update portal target
- `src/renderer/src/components/CcExpirationSheet.tsx` — update portal target
- `src/renderer/src/components/OpenCoveredCallSheet.tsx` — update portal target
- `src/renderer/src/components/RollCspSheet.tsx` — update portal target
- `src/renderer/src/components/CloseCcEarlySheet.tsx` — update portal target
- `src/renderer/src/components/CallAwaySheet.tsx` — update portal target

**Red — tests to write:**

- In `src/renderer/src/App.test.tsx` (new or existing): render `<App />`, assert `document.getElementById('sheet-portal')` is in the document. Test will fail because the div does not exist yet.
- Verify all 7 existing sheet tests still pass after this change (they should — the portal target change does not affect rendered content).

**Green — implementation:**

- In `AppShell` in `App.tsx`, add `<div id="sheet-portal" />` as a sibling to `<main>` inside the outermost flex container. The div should be empty and have no styles.
- In each of the 7 sheet files, change `createPortal(content, document.body)` to `createPortal(content, document.getElementById('sheet-portal') ?? document.body)`. The fallback to `document.body` guards against server-side rendering or test environments where the div may not exist.

**Refactor — cleanup to consider:**

- Extract the portal target lookup into a shared utility in `src/renderer/src/lib/portal.ts` to avoid repeating `document.getElementById('sheet-portal') ?? document.body` in all 7 sheets.

**Acceptance criteria covered:**

- Prerequisite for all subsequent Tailwind class usage in sheet content (without this fix, Tailwind box-model utilities fail inside portals)

---

### 3. Sheet.tsx Primitives Migration

**Files to create or modify:**

- `src/renderer/src/components/ui/Sheet.tsx` — replace static inline styles with Tailwind classes
- `src/renderer/src/components/ui/Sheet.test.tsx` — update style-attribute assertions to class assertions

**Red — tests to write:**

- `SheetOverlay` test: assert overlay div has class `fixed inset-0 z-50` and `left-[200px]`; scrim div has class `absolute inset-0`
- `SheetPanel` test: assert panel has class `absolute top-0 right-0 bottom-0 bg-wb-bg-surface border-l border-wb-border flex flex-col shadow-sheet font-wb-mono text-wb-text-primary`; update width assertion to remain as `style` check (dynamic prop)
- `SheetBody` test: assert body has class `overflow-y-auto flex flex-col flex-1`; remove assertion on `style` attribute containing `overflow-y: auto`
- `SheetFooter` test: assert footer has class `border-t border-wb-border flex shrink-0`; remove assertion on `style` attribute containing `border-top`
- `SheetCloseButton` test: assert button has class `rounded-md border border-wb-border bg-wb-bg-elevated text-wb-text-muted flex items-center justify-center`
- `SheetHeader` test: assert header wrapper has class `flex justify-between items-start border-b`; retain inline style assertion for `borderBottomColor` prop (dynamic); retain inline style assertion for eyebrow `color` prop (dynamic)

**Green — implementation:**

- `SheetOverlay`: replace all static inline styles with Tailwind classes per test expectations; the `left` offset is static (`SIDEBAR_WIDTH = 200`) so use `left-[200px]` class
- `SheetPanel`: replace all static styles with Tailwind; keep `style={{ width: '${width}px' }}` for the dynamic width prop; use `shadow-sheet`, `font-wb-mono`, `bg-wb-bg-surface`, `border-l`, `border-wb-border`
- `SheetBody`: replace with `className="p-6 overflow-y-auto flex flex-col gap-4 flex-1"`
- `SheetFooter`: replace with `className="px-6 py-4 border-t border-wb-border flex gap-2.5 shrink-0"`
- `SheetCloseButton`: replace inline object with Tailwind classes
- `SheetHeader`: replace static styles with Tailwind; keep dynamic `style` for `borderBottomColor` and eyebrow `color`

**Refactor — cleanup to consider:**

- Remove the `SIDEBAR_WIDTH` import from `lib/tokens.ts` if it was only used in the style object (it is exported from `Sheet.tsx` itself); verify no other imports were affected

**Acceptance criteria covered:**

- All sheet structural chrome uses Tailwind — sets the pattern for sheet content migration in areas 4–10

---

### 4. ExpirationSheet Content Migration

**Files to create or modify:**

- `src/renderer/src/components/ExpirationSheet.tsx` — replace 19 inline style instances with Tailwind classes

**Red — tests to write:**

- In `ExpirationSheet.test.tsx`, add: assert the summary card container has class `bg-wb-bg-elevated border border-wb-border rounded-lg overflow-hidden`
- Assert the warning callout has class `bg-wb-gold-dim border border-wb-gold-border rounded-md text-wb-gold`
- Assert the P&L success panel has class `bg-wb-green-dim border border-wb-green-border rounded-xl text-center`
- Existing behavior tests serve as regression guard

**Green — implementation:**

- Remove `summaryCardStyle`, `summaryRowStyle`, `summaryKeyStyle`, `summaryValStyle` style objects
- Convert each to Tailwind classes using the token mapping in `data-model.md`
- P&L display: use `bg-gradient-to-br from-wb-green-dim to-wb-bg-base` or keep the complex gradient as inline since `linear-gradient(135deg, ...)` is not expressible as a static Tailwind utility
- Warning callout: `bg-wb-gold-dim border border-[rgba(230,168,23,0.2)] rounded-md p-3 text-xs text-wb-gold leading-relaxed`
- Summary row key spans: `text-[11px] text-wb-text-secondary`; value spans: `text-[11px] font-semibold text-wb-text-primary text-right`
- Remove the `void isClosing` suppression if `isClosing` can be eliminated

**Refactor — cleanup to consider:**

- The `summaryRowStyle` border-bottom uses a hardcoded `rgba(30,42,56,0.5)` — check if this should use `border-wb-border-subtle` or `border-wb-border` token instead; standardize if appropriate

**Acceptance criteria covered:**

- `Sheet content components use Tailwind classes` (ExpirationSheet)

---

### 5. CcExpirationSheet Content Migration

**Files to create or modify:**

- `src/renderer/src/components/CcExpirationSheet.tsx` — 22 inline style instances

**Red — tests to write:**

- In `CcExpirationSheet.test.tsx` (if exists) or create: assert summary card has class `bg-wb-bg-elevated border border-wb-border rounded-lg`
- Assert green success panel has class `bg-wb-green-dim border border-wb-green-border`
- Assert warning callout has class `bg-wb-gold-dim text-wb-gold`

**Green — implementation:**

- Apply the same pattern as ExpirationSheet (Area 4): convert summary card, summary rows, P&L panel, warning callout, action buttons
- Use `font-wb-mono` in place of `fontFamily: MONO`

**Refactor — cleanup to consider:**

- CcExpirationSheet and ExpirationSheet have nearly identical summary card markup — after migration, confirm the Tailwind class sets are identical; if so, note the duplication for a future extraction into a shared `SummaryCard` component (do not extract now — out of scope)

**Acceptance criteria covered:**

- `Sheet content components use Tailwind classes` (CcExpirationSheet)

---

### 6. AssignmentSheet Content Migration

**Files to create or modify:**

- `src/renderer/src/components/AssignmentSheet.tsx` — 41 inline style instances (highest count)

**Red — tests to write:**

- In `AssignmentSheet.test.tsx`: assert cost basis row container has class `bg-wb-bg-elevated border border-wb-border rounded-lg`
- Assert the phase transition badge/pill has appropriate `bg-wb-gold-dim text-wb-gold` or `bg-wb-green-dim text-wb-green` classes (verify actual markup first)
- Assert the warning callout has class `bg-wb-gold-dim border border-wb-gold-border`
- Existing behavior tests serve as regression guard

**Green — implementation:**

- This is the largest single-file migration — work top to bottom through the JSX
- Group style replacements into logical blocks: header section, cost basis card, phase info rows, warning, footer buttons
- Any inline gradients that use `linear-gradient` with dynamic color stops must remain inline
- `MONO` font references → `font-wb-mono`

**Refactor — cleanup to consider:**

- After migration, run a final grep for any remaining `style={{` in the file and verify each is a dynamic value

**Acceptance criteria covered:**

- `Sheet content components use Tailwind classes` (AssignmentSheet)

---

### 7. OpenCc Suite Migration

**Files to create or modify:**

- `src/renderer/src/components/OpenCoveredCallSheet.tsx`
- `src/renderer/src/components/OpenCcForm.tsx` — 7 inline style instances
- `src/renderer/src/components/OpenCcSuccess.tsx` — 17 inline style instances

**Red — tests to write:**

- In each component's test file: assert a key container has the expected Tailwind structural class (`bg-wb-bg-elevated`, `border-wb-border`, `rounded-lg`, etc.)
- Assert any success/result panels have green token classes

**Green — implementation:**

- Migrate all three files using the token mapping in `data-model.md`
- `OpenCcForm.tsx`: form field containers, labels, helper text — convert to Tailwind spacing and color utilities
- `OpenCcSuccess.tsx`: premium display, leg summary card, navigation buttons

**Refactor — cleanup to consider:**

- Check for shared markup patterns with other form/success components; note but do not extract

**Acceptance criteria covered:**

- `Sheet content components use Tailwind classes` (OpenCoveredCall suite)
- `Form components use Tailwind classes` (OpenCcForm)

---

### 8. RollCsp Suite Migration

**Files to create or modify:**

- `src/renderer/src/components/RollCspSheet.tsx`
- `src/renderer/src/components/RollCspForm.tsx` — 15 inline style instances
- `src/renderer/src/components/RollCspSuccess.tsx` — 8 inline style instances

**Red — tests to write:**

- Same pattern as Area 7 — assert key container classes in each component's test file

**Green — implementation:**

- RollCspForm has the most inline styles of the three — work top to bottom
- Roll-specific UI (debit/credit display, net cost rows) — use `text-wb-gold`, `text-wb-green`, `text-wb-red` as appropriate

**Refactor — cleanup to consider:**

- Verify `MONO` is fully replaced with `font-wb-mono` in all three files

**Acceptance criteria covered:**

- `Sheet content components use Tailwind classes` (RollCsp suite)
- `Form components use Tailwind classes` (RollCspForm)

---

### 9. CloseCcEarly Suite Migration

**Files to create or modify:**

- `src/renderer/src/components/CloseCcEarlySheet.tsx`
- `src/renderer/src/components/CloseCcEarlyForm.tsx` — 21 inline style instances
- `src/renderer/src/components/CloseCcEarlySuccess.tsx` — 20 inline style instances

**Red — tests to write:**

- Assert key containers have expected Tailwind classes in each test file
- `CloseCcEarlySuccess.tsx` has a P&L display — assert the success panel has `bg-wb-green-dim` or `bg-wb-red-dim` class depending on positive/negative P&L; note that if the class is data-driven this must stay inline

**Green — implementation:**

- CloseCcEarlyForm (21 instances) and CloseCcEarlySuccess (20 instances) are the heaviest files in this suite
- For the P&L color: if positive/negative toggling is done by conditional class, this can be expressed as `pnl >= 0 ? 'text-wb-green' : 'text-wb-red'` — valid since both class strings are static

**Refactor — cleanup to consider:**

- Check for duplication between CloseCcEarlySuccess and other success components

**Acceptance criteria covered:**

- `Sheet content components use Tailwind classes` (CloseCcEarly suite)
- `Form components use Tailwind classes` (CloseCcEarlyForm)

---

### 10. CallAway Suite Migration

**Files to create or modify:**

- `src/renderer/src/components/CallAwaySheet.tsx`
- `src/renderer/src/components/CallAwayForm.tsx` — 38 inline style instances
- `src/renderer/src/components/CallAwaySuccess.tsx` — 31 inline style instances

**Red — tests to write:**

- Assert key containers in each test file; CallAwaySuccess likely has a large P&L display — assert it has the green success panel class
- Assert the cost basis table/grid has `bg-wb-bg-elevated border border-wb-border` class

**Green — implementation:**

- Highest total inline count across a suite (~69 instances) — work methodically file by file, top to bottom
- CallAwayForm (38): form fields, summary rows, cost basis preview
- CallAwaySuccess (31): P&L display, leg summary, phase indicator, navigation

**Refactor — cleanup to consider:**

- After all 4 suites are migrated (areas 7–10), run `grep -rn "style={{" src/renderer/src/components/*Sheet.tsx src/renderer/src/components/*Form.tsx src/renderer/src/components/*Success.tsx` and verify only dynamic values remain

**Acceptance criteria covered:**

- `Sheet content components use Tailwind classes` (CallAway suite)
- `Form components use Tailwind classes` (CallAwayForm)

---

### 11. Standalone Form Components

**Files to create or modify:**

- `src/renderer/src/components/NewWheelForm.tsx` — 13 inline style instances
- `src/renderer/src/components/ui/FormField.tsx` — 4 inline style instances
- `src/renderer/src/components/CloseCspForm.tsx` — 6 inline style instances

**Red — tests to write:**

- In `FormField.test.tsx` (if exists): assert label has class `text-wb-text-secondary font-wb-mono text-xs`
- In `NewWheelForm.test.tsx` or `CloseCspForm.test.tsx`: assert section headings/labels have appropriate Tailwind classes
- Existing form submission and validation tests serve as regression guard

**Green — implementation:**

- `FormField.tsx`: label styling, helper text, error text → Tailwind classes; this is a shared component so getting it right is high-value
- `NewWheelForm.tsx`: section containers, field groups, submit button area → Tailwind
- `CloseCspForm.tsx`: similar pattern to above

**Refactor — cleanup to consider:**

- After `FormField.tsx` is migrated, verify all form components that use it render correctly

**Acceptance criteria covered:**

- `Form components use Tailwind classes` (FormField, NewWheelForm, CloseCspForm)

---

### 12. Page Components & App Shell

**Files to create or modify:**

- `src/renderer/src/pages/PositionsListPage.tsx` — 12 inline style instances
- `src/renderer/src/pages/PositionDetailContent.tsx` — 11 inline style instances
- `src/renderer/src/App.tsx` — remaining inline styles after portal fix in Area 2
- `src/renderer/src/components/PageLayout.tsx` — 3 inline style instances

**Red — tests to write:**

- In `App.test.tsx`: assert sidebar has class `bg-wb-bg-surface border-r border-wb-border`; assert logo dot has class `bg-wb-gold rounded-full`
- In `PositionsListPage.test.tsx` (if exists): assert empty state or header has appropriate Tailwind classes

**Green — implementation:**

- `App.tsx` Sidebar: convert `background: 'var(--wb-bg-surface)'`, `borderRight`, logo dot, nav section label, footer — all to Tailwind; `fontFamily: MONO` → `font-wb-mono`; `height: '100vh'` → `h-screen`
- `AppShell`: `height: '100vh'` → `h-screen`; `background: 'var(--wb-bg-base)'` → `bg-wb-bg-base`; `flex 1` → `flex-1`
- `PositionsListPage.tsx`: page container, header bar, position count, empty state → Tailwind
- `PositionDetailContent.tsx`: breadcrumb area, metric grid, section headers → Tailwind
- `PageLayout.tsx`: wrapper and padding → Tailwind

**Refactor — cleanup to consider:**

- After App.tsx migration, check if `MONO` import is still needed; if App.tsx was the only remaining user, remove the import

**Acceptance criteria covered:**

- Partial Phase 4: page-level static inline styles eliminated

---

### 13. List & Data Components

**Files to create or modify:**

- `src/renderer/src/components/LegHistoryTable.tsx` — 15 inline style instances
- `src/renderer/src/components/PositionCard.tsx` — 15 inline style instances

**Red — tests to write:**

- In `LegHistoryTable.test.tsx`: assert table header cells have class `text-wb-text-muted font-wb-mono text-xs`; assert data rows have class `border-b border-wb-border`
- In `PositionCard.test.tsx` (if exists): assert card container has class `bg-wb-bg-surface border border-wb-border`

**Green — implementation:**

- `LegHistoryTable.tsx`: table/grid layout, header cells, data cells, phase badges → Tailwind; column widths that are fixed may use Tailwind or arbitrary values
- `PositionCard.tsx`: card container, ticker, strike/expiry line, P&L value, phase badge area → Tailwind

**Refactor — cleanup to consider:**

- Verify `PhaseBadge` component (2 inline instances) is migrated alongside PositionCard since they are visually coupled

**Acceptance criteria covered:**

- Partial Phase 4: list/data component static inline styles eliminated

---

### 14. Remaining UI Components

**Files to create or modify:**

- `src/renderer/src/components/ui/Stat.tsx` — 4 inline style instances
- `src/renderer/src/components/ui/Breadcrumb.tsx` — 4 inline style instances
- `src/renderer/src/components/ui/NumberInput.tsx` — 3 inline style instances
- `src/renderer/src/components/NavItem.tsx` — 2 inline style instances
- `src/renderer/src/components/PhaseBadge.tsx` — 2 inline style instances
- `src/renderer/src/components/ui/date-picker.tsx` — 2 inline style instances
- `src/renderer/src/components/ui/TablePrimitives.tsx` — 2 inline style instances
- `src/renderer/src/components/ui/LoadingState.tsx` — 2 inline style instances
- `src/renderer/src/components/PositionDetailActions.tsx` — 1 inline style instance
- `src/renderer/src/pages/NewWheelPage.tsx` — 1 inline style instance
- `src/renderer/src/components/ui/FormButton.tsx` — 1 inline style instance
- `src/renderer/src/components/ui/ErrorAlert.tsx` — 1 inline style instance
- `src/renderer/src/components/ui/CcPnlPreview.tsx` — 1 inline style instance
- `src/renderer/src/components/ui/Caption.tsx` — 1 inline style instance
- `src/renderer/src/components/ui/Badge.tsx` — 1 inline style instance
- `src/renderer/src/components/ui/AlertBox.tsx` — 1 inline style instance

**Red — tests to write:**

- For each component with a test file, assert one key structural class; one-instance files just need a "renders without errors" regression guard
- `Stat.tsx`: assert label has `text-wb-text-secondary` class; assert value element does not have a static `style` attribute
- `Breadcrumb.tsx`: assert separator or container has an expected Tailwind class
- `PositionDetailActions.tsx`: assert the actions container renders and has an expected class (the 1 inline instance is likely a small layout detail)

**Green — implementation:**

- Work from most instances to fewest to minimize context switching
- `Stat.tsx`, `Breadcrumb.tsx`, `NumberInput.tsx`: label/value/separator styling → Tailwind
- `NavItem.tsx`: active/inactive states — verify whether the CSS-class-based styling (`wb-nav-link`) in `index.css` is still used or can be replaced with Tailwind conditional classes
- `date-picker.tsx`, `TablePrimitives.tsx`, `LoadingState.tsx`: small layout instances
- `PositionDetailActions.tsx`, `NewWheelPage.tsx`: single layout instances; likely a wrapper padding or flex container
- One-instance UI primitives (`FormButton`, `ErrorAlert`, `CcPnlPreview`, `Caption`, `Badge`, `AlertBox`): each has a single leftover static style; convert each to the appropriate token class

**Refactor — cleanup to consider:**

- After all components are migrated, audit `index.css` for custom class blocks (`.wb-nav-link`, `.wb-position-row`, `.wb-hover-opacity`, `.wb-teal-button`) that are now replaceable with Tailwind utilities; remove them from `index.css` if unused
- If `MONO` constant in `lib/tokens.ts` has zero remaining imports, delete the export
- Run the full grep from `quickstart.md` and confirm the result is only dynamic inline styles

**Acceptance criteria covered:**

- Phase 4: `No static inline styles remain` — all static layout, color, spacing, typography use Tailwind utilities

---

### 15. E2e Tests

**Files to create or modify:**

- `e2e/design-system.spec.ts` — new Playwright test file

**Red — tests to write:**

One test per AC from `docs/issues/design-system-tailwind-migration.md`:

- `wb-* color tokens generate Tailwind utilities` — render the app, inspect a known element (e.g. the Wheelbase logo dot), assert computed `background-color` matches `--wb-gold` value (`rgb(230, 168, 23)`)
- `MONO font available as Tailwind utility` — inspect the sidebar "Wheelbase" label, assert computed `font-family` contains `ui-monospace`
- `all sheets use shared Sheet primitives` — open ExpirationSheet, inspect panel element, assert it has `bg-wb-bg-surface` class (not an inline `style` attribute with that value)
- `style change propagates to all sheets` — open ExpirationSheet and AssignmentSheet sequentially, assert both panel elements share the same class set for background and border (verifies Sheet.tsx is the single source of truth)
- `sheet content uses Tailwind classes` — open ExpirationSheet confirmation state, assert the summary card has `bg-wb-bg-elevated border border-wb-border rounded-lg` class
- `form components use Tailwind classes` — open NewWheelForm, assert a label element does not have a `style` attribute; assert it has `text-wb-text-secondary` class
- `no static inline styles remain` — use `page.evaluate()` to query all elements with a non-empty `style` attribute inside `#root`; assert that no element has a `style` value matching a known static token string (e.g. `var(--wb-gold)` or `var(--wb-bg-surface)`)

**Green — implementation:**

- Implement the Playwright tests in `e2e/design-system.spec.ts`
- Use `electronApp.firstWindow()` per existing E2e pattern

**Refactor — cleanup to consider:**

- Check for duplication with any existing E2e visual tests; extract shared `openSheet(name)` helper if used in multiple specs

**Acceptance criteria covered:**

- All four phases of `docs/issues/design-system-tailwind-migration.md` have E2e coverage

---

## AC Audit

Every acceptance criterion from `docs/issues/design-system-tailwind-migration.md` is covered:

| AC                                            | Area(s)   |
| --------------------------------------------- | --------- |
| wb-\* tokens available as Tailwind utilities  | 1, 15     |
| MONO font available as Tailwind utility       | 1, 15     |
| All sheets use shared layout primitives       | 2, 3, 15  |
| Style change propagates to all sheets         | 3, 15     |
| Sheet content components use Tailwind classes | 4–10, 15  |
| Form components use Tailwind classes          | 7–11, 15  |
| No static inline styles remain                | 12–14, 15 |
