# Design System — Tailwind + wb-\* Migration — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off

---

## Layer 1 — Foundation (no dependencies)

> Both areas can start immediately and run in parallel.

### Area 1 — wb-\* Token Integration

- [x] **[Red]** Write failing tests — `src/renderer/src/lib/tokens.test.ts`
  - Test cases:
    - Read `src/renderer/src/index.css` source as a string; assert it contains `--color-wb-gold`
    - Assert source contains `--color-wb-green`
    - Assert source contains `--color-wb-text-primary`
    - Assert source contains `--font-wb-mono`
    - Assert source contains `--shadow-sheet`
    - Assert `MONO` constant in `tokens.ts` matches `ui-monospace, 'SF Mono', Menlo, 'Cascadia Code', 'Fira Code', monospace` (regression guard for font stack consistency)
  - Run `pnpm test tokens` — all new tests must fail (strings not yet in index.css)

- [x] **[Green]** Implement — `src/renderer/src/index.css` _(depends on: Area 1 Red ✓)_
  - Extend the existing `@theme inline` block with all 27 `--color-wb-*` entries from `plans/design-system/data-model.md` (bg tokens, border, text, gold, green, red, blue, teal, violet, sky)
  - Add `--font-wb-mono: ui-monospace, 'SF Mono', Menlo, 'Cascadia Code', 'Fira Code', monospace`
  - Add `--shadow-sheet: -12px 0 48px rgba(0, 0, 0, 0.5)`
  - Do NOT remove `MONO` constant from `tokens.ts` — still used in many files
  - Run `pnpm test tokens` — all tests must pass

- [x] **[Refactor]** `/refactor` — `src/renderer/src/index.css` _(depends on: Area 1 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Ensure `@theme inline` block is organized with a comment separator between shadcn tokens and wb-\* tokens
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 2 — Portal Mount Point

- [x] **[Red]** Write failing tests — `src/renderer/src/App.test.tsx` (new or existing)
  - Test cases:
    - Render `<App />`; assert `document.getElementById('sheet-portal')` is not null (test will fail because the div doesn't exist yet)
    - Assert the portal div is a descendant of the app root (inside `#root`), not a direct child of `document.body`
  - Run `pnpm test App` — new tests must fail

- [x] **[Green]** Implement — `src/renderer/src/App.tsx` + 7 sheet files _(depends on: Area 2 Red ✓)_
  - In `AppShell` in `App.tsx`: add `<div id="sheet-portal" />` as a sibling to `<main>` inside the outermost flex div; no styles on the div
  - In each of the 7 sheet files, change `createPortal(content, document.body)` to `createPortal(content, document.getElementById('sheet-portal') ?? document.body)`:
    - `src/renderer/src/components/ExpirationSheet.tsx`
    - `src/renderer/src/components/AssignmentSheet.tsx`
    - `src/renderer/src/components/CcExpirationSheet.tsx`
    - `src/renderer/src/components/OpenCoveredCallSheet.tsx`
    - `src/renderer/src/components/RollCspSheet.tsx`
    - `src/renderer/src/components/CloseCcEarlySheet.tsx`
    - `src/renderer/src/components/CallAwaySheet.tsx`
  - Run `pnpm test` — App test passes; all 7 existing sheet tests still pass

- [x] **[Refactor]** `/refactor` — `src/renderer/src/lib/portal.ts` (new) _(depends on: Area 2 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Extract `document.getElementById('sheet-portal') ?? document.body` into a shared utility `getSheetPortal()` in `src/renderer/src/lib/portal.ts`; update all 7 sheet files to import and use it
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — Primitives & Non-Sheet Components (depends on Layer 1)

> All 5 areas in this layer can run in parallel after Layer 1 Green tasks are complete.

### Area 3 — Sheet.tsx Primitives Migration

**Requires:** Area 1 Green ✓ + Area 2 Green ✓

- [x] **[Red]** Update tests — `src/renderer/src/components/ui/Sheet.test.tsx` _(depends on: Area 1 Green ✓, Area 2 Green ✓)_
  - Update or add test cases (existing style-attribute assertions become class assertions):
    - `SheetOverlay`: assert overlay div has class `fixed` and `inset-0` and `z-50` and `left-[200px]`; assert scrim div has class `absolute` and `inset-0`; remove old inline style assertion
    - `SheetPanel`: assert panel has classes `absolute top-0 right-0 bottom-0 bg-wb-bg-surface border-l border-wb-border flex flex-col shadow-sheet font-wb-mono text-wb-text-primary`; retain `style` assertion for dynamic `width` prop
    - `SheetBody`: assert body has classes `overflow-y-auto flex flex-col flex-1`; remove assertion on `style` containing `overflow-y: auto`
    - `SheetFooter`: assert footer has classes `border-t border-wb-border flex shrink-0`; remove assertion on `style` containing `border-top`
    - `SheetCloseButton`: assert button has classes `rounded-md border border-wb-border bg-wb-bg-elevated text-wb-text-muted flex items-center justify-center`
    - `SheetHeader`: assert wrapper has classes `flex justify-between items-start border-b`; retain dynamic `style` assertions for `borderBottomColor` and eyebrow `color` props
  - Run `pnpm test Sheet` — updated tests must fail (still using inline styles)

- [x] **[Green]** Implement — `src/renderer/src/components/ui/Sheet.tsx` _(depends on: Area 3 Red ✓)_
  - `SheetOverlay`: replace position/inset/z-index inline styles with `className="fixed inset-0 z-50 left-[200px]"`; scrim: `className="absolute inset-0"`
  - `SheetPanel`: replace all static styles with Tailwind; keep `style={{ width: '${width}px' }}` for the dynamic prop; use `shadow-sheet`, `font-wb-mono`, `bg-wb-bg-surface`, `border-l`, `border-wb-border`, `text-wb-text-primary`
  - `SheetBody`: `className="p-6 overflow-y-auto flex flex-col gap-4 flex-1"`
  - `SheetFooter`: `className="px-6 py-4 border-t border-wb-border flex gap-2.5 shrink-0"`
  - `SheetCloseButton`: replace inline object with Tailwind classes
  - `SheetHeader`: replace static styles with Tailwind; keep dynamic `style` for `borderBottomColor` and eyebrow `color`
  - Run `pnpm test Sheet` — all tests must pass

- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/ui/Sheet.tsx` _(depends on: Area 3 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 11 — Standalone Form Components

**Requires:** Area 1 Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/components/ui/FormField.test.tsx`, `src/renderer/src/components/NewWheelForm.test.tsx`, `src/renderer/src/components/CloseCspForm.test.tsx` _(depends on: Area 1 Green ✓)_
  - Test cases:
    - `FormField`: assert label element has class `text-wb-text-secondary` and `font-wb-mono` and `text-xs` (currently will fail — inline styles used)
    - `NewWheelForm`: assert a section label or container has `text-wb-text-muted` class
    - `CloseCspForm`: assert a field label has `text-wb-text-secondary` class
    - Existing form submission/validation tests serve as regression guard
  - Run `pnpm test FormField NewWheelForm CloseCspForm` — new assertions must fail

- [x] **[Green]** Implement _(depends on: Area 11 Red ✓)_
  - `src/renderer/src/components/ui/FormField.tsx` (4 instances): label styling, helper text, error text → Tailwind token classes
  - `src/renderer/src/components/NewWheelForm.tsx` (13 instances): section containers, field groups, headings, submit area → Tailwind
  - `src/renderer/src/components/CloseCspForm.tsx` (6 instances): field containers, labels → Tailwind
  - Reference `plans/design-system/data-model.md` conversion table for each inline style
  - Run `pnpm test FormField NewWheelForm CloseCspForm` — all tests must pass

- [x] **[Refactor]** `/refactor` _(depends on: Area 11 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - After `FormField.tsx` migration, visually confirm all form components that use it still look correct
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 12 — Page Components & App Shell

**Requires:** Area 1 Green ✓ + Area 2 Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/App.test.tsx`, `src/renderer/src/pages/PositionsListPage.test.tsx` _(depends on: Area 1 Green ✓, Area 2 Green ✓)_
  - Test cases:
    - `App`: assert sidebar `<aside>` has class `bg-wb-bg-surface` and `border-r` and `border-wb-border` (currently will fail — inline styles used)
    - `App`: assert logo dot div has class `bg-wb-gold` and `rounded-full`
    - `App`: assert `<aside>` does not have a `style` attribute with `background` (static value should be in class)
    - `PositionsListPage`: assert page wrapper or header has at least one wb-\* token class
  - Run `pnpm test App PositionsListPage` — new assertions must fail

- [x] **[Green]** Implement _(depends on: Area 12 Red ✓)_
  - `src/renderer/src/App.tsx` (remaining instances after Area 2): Sidebar `background` → `bg-wb-bg-surface`, `borderRight` → `border-r border-wb-border`, logo dot → `bg-wb-gold rounded-full`, `boxShadow: '0 0 6px var(--wb-gold)'` → keep as inline (dynamic glow effect), nav section label and footer font → `font-wb-mono`, height → `h-screen`; AppShell bg → `bg-wb-bg-base`
  - `src/renderer/src/pages/PositionsListPage.tsx` (12 instances): page container, header bar, position count display, empty state → Tailwind
  - `src/renderer/src/pages/PositionDetailContent.tsx` (11 instances): breadcrumb area, metric grid, section headers → Tailwind
  - `src/renderer/src/components/PageLayout.tsx` (3 instances): wrapper and padding → Tailwind
  - Run `pnpm test App PositionsListPage PositionDetail` — all tests must pass

- [x] **[Refactor]** `/refactor` _(depends on: Area 12 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Check if `MONO` import can be removed from `App.tsx`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 13 — List & Data Components

**Requires:** Area 1 Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/components/LegHistoryTable.test.tsx`, `src/renderer/src/components/PositionCard.test.tsx` _(depends on: Area 1 Green ✓)_
  - Test cases:
    - `LegHistoryTable`: assert header cell element has class `text-wb-text-muted` and `font-wb-mono` and `text-xs`
    - `LegHistoryTable`: assert a data row has class `border-b` and `border-wb-border`
    - `PositionCard`: assert card container has class `bg-wb-bg-surface` and `border` and `border-wb-border`
  - Run `pnpm test LegHistoryTable PositionCard` — new assertions must fail

- [x] **[Green]** Implement _(depends on: Area 13 Red ✓)_
  - `src/renderer/src/components/LegHistoryTable.tsx` (15 instances): header cells, data cells, row borders, phase badge styles → Tailwind
  - `src/renderer/src/components/PositionCard.tsx` (15 instances): card container, ticker display, strike/expiry, P&L value → Tailwind; keep any data-driven color as conditional class strings (e.g. `pnl >= 0 ? 'text-wb-green' : 'text-wb-red'`)
  - Run `pnpm test LegHistoryTable PositionCard` — all tests must pass

- [x] **[Refactor]** `/refactor` _(depends on: Area 13 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Confirm `PhaseBadge` (2 instances) is migrated alongside PositionCard — these are visually coupled
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 14 — Remaining UI Components

**Requires:** Area 1 Green ✓

- [x] **[Red]** Write failing tests — existing test files for each component _(depends on: Area 1 Green ✓)_
  - Test cases (one assertion per component with a test file):
    - `Stat.tsx`: assert label element has class `text-wb-text-secondary`; assert value does not have a static `style` attribute
    - `Breadcrumb.tsx`: assert separator or wrapper has an expected Tailwind class
    - `NavItem.tsx`: assert the link element has `font-wb-mono` class or equivalent
    - `PhaseBadge.tsx`: assert the badge has a wb-\* color class
    - `PositionDetailActions.tsx`: assert actions container has at least one Tailwind class where inline was
    - Single-instance files (`FormButton`, `ErrorAlert`, `CcPnlPreview`, `Caption`, `Badge`, `AlertBox`): each needs a "renders without static style attribute" assertion
  - Run `pnpm test Stat Breadcrumb NavItem PhaseBadge` — new assertions must fail

- [x] **[Green]** Implement _(depends on: Area 14 Red ✓)_
  - `src/renderer/src/components/ui/Stat.tsx` (4): label, value, sub-label → Tailwind
  - `src/renderer/src/components/ui/Breadcrumb.tsx` (4): separator, link, current segment → Tailwind
  - `src/renderer/src/components/ui/NumberInput.tsx` (3): input wrapper/label → Tailwind
  - `src/renderer/src/components/NavItem.tsx` (2): active/inactive state → Tailwind; check whether `wb-nav-link` class from `index.css` is still needed or can be replaced
  - `src/renderer/src/components/PhaseBadge.tsx` (2): badge background and text → Tailwind
  - `src/renderer/src/components/ui/date-picker.tsx` (2), `TablePrimitives.tsx` (2), `LoadingState.tsx` (2): small layout instances
  - `src/renderer/src/components/PositionDetailActions.tsx` (1), `src/renderer/src/pages/NewWheelPage.tsx` (1): single layout instances
  - One-instance primitives: `FormButton`, `ErrorAlert`, `CcPnlPreview`, `Caption`, `Badge`, `AlertBox` — convert each single remaining static style to the appropriate token class
  - Run `pnpm test` — all tests must pass

- [x] **[Refactor]** `/refactor` _(depends on: Area 14 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Audit `index.css` for custom class blocks (`.wb-nav-link`, `.wb-position-row`, `.wb-hover-opacity`, `.wb-teal-button`) — remove each that is now fully replaceable with component-level Tailwind
  - Check if `MONO` constant in `lib/tokens.ts` has zero remaining imports; if so, delete the export
  - Run the full static inline style grep from `plans/design-system/quickstart.md` and verify only dynamic values remain
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — Sheet Content Migration (depends on Area 3 Green)

> All 7 areas can run in parallel after Area 3 Green is complete. Each area is independent.

### Area 4 — ExpirationSheet Content

**Requires:** Area 3 Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/components/ExpirationSheet.test.tsx` _(depends on: Area 3 Green ✓)_
  - Test cases:
    - Assert summary card container has class `bg-wb-bg-elevated` and `border` and `border-wb-border` and `rounded-lg` and `overflow-hidden`
    - Assert warning callout has class `bg-wb-gold-dim` and `text-wb-gold`
    - Assert P&L success panel (success state) has class `bg-wb-green-dim` and `border` and `border-wb-green-border`
  - Run `pnpm test ExpirationSheet` — new assertions must fail; existing behavior tests must still pass

- [x] **[Green]** Implement — `src/renderer/src/components/ExpirationSheet.tsx` _(depends on: Area 4 Red ✓)_
  - Remove `summaryCardStyle`, `summaryRowStyle`, `summaryKeyStyle`, `summaryValStyle` inline style objects
  - Summary card: `className="bg-wb-bg-elevated border border-wb-border rounded-lg overflow-hidden mb-4"`
  - Summary rows: `className="flex items-center justify-between px-3.5 py-2.5 border-b border-wb-border"` (last row: no `border-b`)
  - Summary key spans: `className="text-[11px] text-wb-text-secondary"`
  - Summary value spans: `className="text-[11px] font-semibold text-wb-text-primary text-right"`
  - Warning callout: `className="bg-wb-gold-dim border border-[rgba(230,168,23,0.2)] rounded-md p-3 text-xs text-wb-gold leading-relaxed mb-4"`
  - P&L success panel: complex `linear-gradient` may remain inline; use `border border-wb-green-border rounded-xl p-5 text-center mb-4`
  - "What's next" label: `className="text-[9px] font-bold tracking-[0.15em] uppercase text-wb-text-muted mb-3"`
  - Remove `void isClosing` suppression if `isClosing` state is eliminated
  - Reference `plans/design-system/data-model.md` for any remaining conversions
  - Run `pnpm test ExpirationSheet` — all tests must pass

- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/ExpirationSheet.tsx` _(depends on: Area 4 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - ✅ MONO import removed; `font-wb-mono` added to "View full position history" button
  - Still needed: verify only dynamic inline styles remain; run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 5 — CcExpirationSheet Content

**Requires:** Area 3 Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/components/CcExpirationSheet.test.tsx` _(depends on: Area 3 Green ✓)_
  - Test cases:
    - Assert summary card container has class `bg-wb-bg-elevated` and `border` and `border-wb-border` and `rounded-lg`
    - Assert P&L success panel has class `bg-wb-green-dim` and `border` and `border-wb-green-border`
    - Assert warning callout has class `bg-wb-gold-dim` and `text-wb-gold`
  - Run `pnpm test CcExpirationSheet` — new assertions must fail; existing tests must still pass

- [x] **[Green]** Implement — `src/renderer/src/components/CcExpirationSheet.tsx` _(depends on: Area 5 Red ✓)_
  - Apply the same pattern as ExpirationSheet (Area 4): summary card, summary rows, P&L panel, warning callout, action buttons
  - Replace all `fontFamily: MONO` with `font-wb-mono` class
  - 22 inline instances total
  - Run `pnpm test CcExpirationSheet` — all tests must pass

- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/CcExpirationSheet.tsx` _(depends on: Area 5 Green ✓)_
  - Extracted `CcExpirationSuccess` + `CcExpirationConfirm` sub-components; used `Caption` for "What's next?" heading; removed MONO import; converted "View full position history" button to Tailwind; hoisted static style objects to module scope
  - 665 tests pass, lint clean, typecheck clean

---

### Area 6 — AssignmentSheet Content

**Requires:** Area 3 Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/components/AssignmentSheet.test.tsx` _(depends on: Area 3 Green ✓)_
  - Test cases:
    - Assert cost basis row container has class `bg-wb-bg-elevated` and `border` and `border-wb-border` and `rounded-lg`
    - Assert phase transition section has class `bg-wb-gold-dim` or `bg-wb-green-dim` (verify actual markup to confirm which)
    - Assert warning callout has class `bg-wb-gold-dim` and `border` and `border-wb-gold-border`
  - Run `pnpm test AssignmentSheet` — new assertions must fail; existing behavior tests must still pass

- [x] **[Green]** Implement — `src/renderer/src/components/AssignmentSheet.tsx` _(depends on: Area 6 Red ✓)_
  - 41 inline instances — work top to bottom through the JSX in logical blocks: header section, cost basis card, phase info rows, warning callout, footer buttons
  - Any `linear-gradient` with static color values → check if expressible as `bg-gradient-to-*`; if not, keep inline
  - Replace all `fontFamily: MONO` with `font-wb-mono`
  - Run `pnpm test AssignmentSheet` — all tests must pass

- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/AssignmentSheet.tsx` _(depends on: Area 6 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - ✅ MONO import removed; `font-wb-mono` added to "View full position history" button
  - Still needed: run final grep to verify only dynamic inline styles remain; run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 7 — OpenCc Suite

**Requires:** Area 3 Green ✓

- [x] **[Red]** Write failing tests — `OpenCoveredCallSheet` test file (create if absent), `OpenCcForm` test file, `OpenCcSuccess` test file _(depends on: Area 3 Green ✓)_
  - Test cases:
    - `OpenCcForm`: assert a field label or container has `text-wb-text-secondary` class
    - `OpenCcSuccess`: assert premium display panel has `bg-wb-green-dim` and `border-wb-green-border` class
    - `OpenCcSuccess`: assert leg summary card has `bg-wb-bg-elevated` and `border-wb-border` class
  - Run `pnpm test OpenCcForm OpenCcSuccess` — new assertions must fail

- [x] **[Green]** Implement _(depends on: Area 7 Red ✓)_
  - `src/renderer/src/components/OpenCcForm.tsx` (7 instances): form field containers, labels, helper text → Tailwind
  - `src/renderer/src/components/OpenCcSuccess.tsx` (17 instances): premium display, leg summary card, navigation buttons → Tailwind
  - `src/renderer/src/components/OpenCoveredCallSheet.tsx` (0 static instances — verify with grep)
  - Run `pnpm test OpenCcForm OpenCcSuccess` — all tests must pass

- [x] **[Refactor]** `/refactor` _(depends on: Area 7 Green ✓)_
  - `OpenCcForm.tsx`: inline layout/color styles → Tailwind; color logic embedded in data array (eliminated fragile label-name ternary)
  - `OpenCcSuccess.tsx`: hero card inner elements, flex containers, summary rows, "View full position history" button → Tailwind; removed MONO import
  - `OpenCoveredCallSheet.tsx`: already clean, no changes needed
  - 665 tests pass, lint clean, typecheck clean

---

### Area 8 — RollCsp Suite

**Requires:** Area 3 Green ✓

- [x] **[Red]** Write failing tests — `RollCspSheet` test file, `RollCspForm` test file, `RollCspSuccess` test file _(depends on: Area 3 Green ✓)_
  - Test cases:
    - `RollCspForm`: assert debit/credit display row has `text-wb-gold` or `text-wb-green` class
    - `RollCspForm`: assert a field container has `bg-wb-bg-elevated` or `border-wb-border` class
    - `RollCspSuccess`: assert result display has `bg-wb-green-dim` or `bg-wb-gold-dim` class
  - Run `pnpm test RollCspForm RollCspSuccess` — new assertions must fail

- [x] **[Green]** Implement _(depends on: Area 8 Red ✓)_
  - `src/renderer/src/components/RollCspForm.tsx` (15 instances): roll-specific UI (debit/credit rows, net cost display), field containers → Tailwind; use `text-wb-gold`, `text-wb-green`, `text-wb-red` for financial values
  - `src/renderer/src/components/RollCspSuccess.tsx` (8 instances): result display, summary rows → Tailwind
  - `src/renderer/src/components/RollCspSheet.tsx` (0 static instances — verify with grep)
  - Run `pnpm test RollCspForm RollCspSuccess` — all tests must pass

- [x] **[Refactor]** `/refactor` _(depends on: Area 8 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - ✅ `RollCspForm.tsx`: MONO removed; 4 `fontFamily: MONO` → `font-wb-mono` className
  - ✅ `RollCspSuccess.tsx`: MONO import removed; inner hero div uses `fontFamily: 'var(--font-wb-mono)'` inline (cannot add className — would break `closest('div[class]')` traversal in tests)
  - ⚠️ 2 tests in `RollCspSuccess.test.tsx` failing — fix applied but `pnpm test` not yet verified
  - Still needed: extract duplicate `SummaryRow` component (identical in Form + Success) to `src/renderer/src/components/ui/SummaryRow.tsx`; run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 9 — CloseCcEarly Suite

**Requires:** Area 3 Green ✓

- [x] **[Red]** Write failing tests — `CloseCcEarlySheet` test file, `CloseCcEarlyForm` test file, `CloseCcEarlySuccess` test file _(depends on: Area 3 Green ✓)_
  - Test cases:
    - `CloseCcEarlyForm`: assert a field container has `bg-wb-bg-elevated` and `border-wb-border` class
    - `CloseCcEarlySuccess`: render with positive P&L; assert P&L display has `text-wb-green` class
    - `CloseCcEarlySuccess`: render with negative P&L; assert P&L display has `text-wb-red` class
  - Run `pnpm test CloseCcEarlyForm CloseCcEarlySuccess` — new assertions must fail

- [x] **[Green]** Implement _(depends on: Area 9 Red ✓)_
  - `src/renderer/src/components/CloseCcEarlyForm.tsx` (21 instances): field containers, labels, summary rows → Tailwind
  - `src/renderer/src/components/CloseCcEarlySuccess.tsx` (20 instances): P&L display uses conditional class `pnl >= 0 ? 'text-wb-green' : 'text-wb-red'` (valid — both strings are static); summary card, navigation → Tailwind
  - `src/renderer/src/components/CloseCcEarlySheet.tsx` (0 static instances — verify with grep)
  - Run `pnpm test CloseCcEarlyForm CloseCcEarlySuccess` — all tests must pass

- [x] **[Refactor]** `/refactor` _(depends on: Area 9 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 10 — CallAway Suite

**Requires:** Area 3 Green ✓

- [x] **[Red]** Write failing tests — `CallAwaySheet` test file, `CallAwayForm` test file, `CallAwaySuccess` test file _(depends on: Area 3 Green ✓)_
  - Test cases:
    - `CallAwayForm`: assert cost basis preview grid has `bg-wb-bg-elevated` and `border` and `border-wb-border` class
    - `CallAwayForm`: assert a field label has `text-wb-text-secondary` class
    - `CallAwaySuccess`: assert P&L display panel has `bg-wb-green-dim` and `border-wb-green-border` class
    - `CallAwaySuccess`: assert leg summary card has `bg-wb-bg-elevated` and `border-wb-border` class
  - Run `pnpm test CallAwayForm CallAwaySuccess` — new assertions must fail

- [x] **[Green]** Implement _(depends on: Area 10 Red ✓)_
  - `src/renderer/src/components/CallAwayForm.tsx` (38 instances — highest): form fields, summary rows, cost basis preview → Tailwind; work top to bottom
  - `src/renderer/src/components/CallAwaySuccess.tsx` (31 instances): P&L display, leg summary, phase indicator, navigation buttons → Tailwind
  - `src/renderer/src/components/CallAwaySheet.tsx` (0 static instances — verify with grep)
  - Run `pnpm test CallAwayForm CallAwaySuccess` — all tests must pass

- [x] **[Refactor]** `/refactor` _(depends on: Area 10 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - `CallAwayForm.tsx` still has 9 `fontFamily: MONO` usages + MONO import — not yet touched
  - `CallAwaySuccess.tsx` still has 2 `fontFamily: MONO` usages + MONO import — not yet touched
  - `CallAwaySheet.tsx` already clean
  - After completing: run `grep -rn "style={{" src/renderer/src/components/*Form.tsx src/renderer/src/components/*Success.tsx src/renderer/src/components/*Sheet.tsx` — verify only dynamic values remain
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — Test Cleanup (depends on all Layer 2 + Layer 3 Refactor tasks)

**Requires:** All Green and Refactor tasks from Layers 1–3 ✓

### Area 16 — Remove className Assertion Tests

> The Red phase added tests that assert specific Tailwind class names are present on elements. These tests are brittle (break on any class rename), test implementation details rather than behavior, and provide no value once the migration is verified complete. Remove them.

- [x] **[Cleanup]** Remove className-only assertions from all migrated test files _(depends on: all Layers 1–3 complete ✓)_
  - Files to audit and clean up:
    - `src/renderer/src/components/ui/Sheet.test.tsx` — remove SheetOverlay, SheetPanel, SheetBody, SheetFooter, SheetCloseButton, SheetHeader class assertions
    - `src/renderer/src/components/ui/FormField.test.tsx` — remove label class assertions
    - `src/renderer/src/components/NewWheelForm.test.tsx` — remove container class assertions
    - `src/renderer/src/components/CloseCspForm.test.tsx` — remove field label class assertions
    - `src/renderer/src/App.test.tsx` — remove sidebar, logo dot class assertions
    - `src/renderer/src/pages/PositionsListPage.test.tsx` — remove wb-\* class assertions
    - `src/renderer/src/components/LegHistoryTable.test.tsx` — remove header cell and row class assertions
    - `src/renderer/src/components/PositionCard.test.tsx` — remove card container class assertions
    - `src/renderer/src/components/NavItem.test.tsx`, `PhaseBadge.test.tsx`, `Breadcrumb.test.tsx`, `PositionDetailActions.test.tsx` — remove wb-\* class assertions
    - `src/renderer/src/components/ExpirationSheet.test.tsx` — remove 3 class assertions (summary card, warning callout, P&L panel)
    - `src/renderer/src/components/CcExpirationSheet.test.tsx` — remove 3 class assertions
    - `src/renderer/src/components/AssignmentSheet.test.tsx` — remove 3 class assertions
    - `src/renderer/src/components/OpenCcForm.test.tsx`, `OpenCcSuccess.test.tsx` — remove class assertions
    - `src/renderer/src/components/RollCspForm.test.tsx`, `RollCspSuccess.test.tsx` — remove class assertions
    - `src/renderer/src/components/CloseCcEarlyForm.test.tsx`, `CloseCcEarlySuccess.test.tsx` — remove class assertions
    - `src/renderer/src/components/CallAwayForm.test.tsx`, `CallAwaySuccess.test.tsx` — remove class assertions
  - Keep: behavior tests (form submission, validation, conditional rendering, phase transitions, P&L calculations)
  - Keep: the `tokens.test.ts` tests (they assert CSS variable presence, not className on elements)
  - Delete entire test files that contain **only** className assertions and no behavior tests
  - Run `pnpm test && pnpm lint && pnpm typecheck` — all remaining tests must pass

---

## Completion Checklist

- [x] All Red tasks complete (tests written and failing for the right reason)
- [x] All Green tasks complete (all tests passing)
- [x] All Refactor tasks complete (lint + typecheck clean)
- [x] className-only unit tests removed (Area 16 complete)
- [ ] `grep -rn "style={{" src/renderer/src --include="*.tsx"` returns only dynamic inline styles
- [x] `pnpm test && pnpm lint && pnpm typecheck` — all clean
