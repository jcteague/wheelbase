# Implementation Plan: Frontend Performance & Reuse Improvements

## Summary

Extract shared constants, formatters, and UI primitives from 7+ frontend files to eliminate duplication, bring all components under the 200-line limit, and fix React performance anti-patterns (unnecessary re-renders from hover state, effects used for derived state, missing query invalidation). The done state is: all existing tests pass, every component file is under 200 lines, `MONO` appears in exactly one file, and hover interactions use CSS instead of React state.

## Supporting Documents

- **Research & Design Decisions:** `plans/frontend-perf-reuse/research.md`
- **Data Model:** `plans/frontend-perf-reuse/data-model.md`
- **Quickstart & Verification:** `plans/frontend-perf-reuse/quickstart.md`

## Prerequisites

- Phase 1 complete — all core engines, manual trade entry, and existing tests are in place
- Tailwind CSS already configured in `index.css`
- shadcn/ui components available in `components/ui/`
- Existing test infrastructure: `@testing-library/react`, `vitest`, mock patterns established

## Implementation Areas

### 1. Shared Constants and Formatters

**Files to create or modify:**
- `src/renderer/src/lib/tokens.ts` — create; export `MONO` constant
- `src/renderer/src/lib/format.ts` — create; export `fmtMoney`, `fmtPct`, `fmtDate`, `pnlColor`, `computeDte`
- `src/renderer/src/lib/phase.ts` — add `PHASE_LABEL` and `PHASE_LABEL_SHORT` exports

**Red — tests to write:**
- `src/renderer/src/lib/format.test.ts`:
  - `fmtMoney("180.0000")` returns `"$180.00"`
  - `fmtMoney("3.2000")` returns `"$3.20"`
  - `fmtPct(30)` returns `"30%"`; `fmtPct(-15)` returns `"-15%"`
  - `fmtDate("2026-04-17")` returns `"Apr 17"` (local date, no timezone shift)
  - `pnlColor("250.00")` returns `"var(--wb-green)"`; `pnlColor("-50.00")` returns `"var(--wb-red)"`
  - `computeDte("FUTURE_DATE")` returns positive integer (use a date 10 days from test execution)
  - `computeDte("PAST_DATE")` returns negative integer
- `src/renderer/src/lib/phase.test.ts`:
  - `PHASE_LABEL.CSP_OPEN` equals `"Sell Put"`
  - `PHASE_LABEL_SHORT.CSP_OPEN` equals `"CSP Open"`
  - Every `WheelPhase` value has an entry in both `PHASE_LABEL` and `PHASE_LABEL_SHORT`
  - `PHASE_COLOR` still exports all phases (existing, verify not broken)

**Green — implementation:**
- `lib/tokens.ts`: export `const MONO = 'ui-monospace, "SF Mono", Menlo, monospace'`
- `lib/format.ts`: implement each formatter as a pure function. `fmtMoney` parses string to float, formats with `toFixed(2)`, prefixes `$`. `fmtDate` splits ISO string and constructs local `Date` to avoid UTC timezone shift (same pattern currently in `ExpirationSheet.tsx:14`). `computeDte` uses local midnight comparison (same pattern as `PositionDetailPage.tsx:48-53`).
- `lib/phase.ts`: add `PHASE_LABEL` record using descriptive labels from `PositionDetailPage.tsx:12-23` and `PHASE_LABEL_SHORT` using compact labels from `PositionCard.tsx:11-22`

**Refactor — cleanup to consider:**
- Remove local `MONO` declarations from all 7 files that define it
- Remove local `fmt`/`fmtMoney`/`formatPremium`/`fmtDate`/`pnlColor`/`computeDte` from `PositionDetailPage.tsx`, `PositionCard.tsx`, `CloseCspForm.tsx`, `ExpirationSheet.tsx`
- Remove local `PHASE_LABEL` from `PositionDetailPage.tsx` and `PositionCard.tsx`; import from `lib/phase.ts`
- Verify all existing tests still pass after imports are swapped

**Acceptance criteria covered:**
- Codebase is DRY — shared constants defined once
- No functional changes — identical output

---

### 2. LoadingState Component

**Files to create or modify:**
- `src/renderer/src/components/ui/LoadingState.tsx` — create
- `src/renderer/src/pages/PositionDetailPage.tsx` — replace inline loading JSX
- `src/renderer/src/pages/PositionsListPage.tsx` — replace inline loading JSX

**Red — tests to write:**
- `src/renderer/src/components/ui/LoadingState.test.tsx`:
  - Renders with `role="status"`
  - Displays the provided message text (e.g., "Loading positions…")
  - Defaults to "Loading…" when no message prop provided
  - Contains the pulsing dot element (check for animation style or class)

**Green — implementation:**
- `LoadingState` component with props: `{ message?: string }`. Renders the pulsing gold dot + message pattern currently in `PositionDetailPage.tsx:121-147` and `PositionsListPage.tsx:131-154`. Uses `MONO` from `lib/tokens.ts`.

**Refactor — cleanup to consider:**
- Replace inline loading blocks in `PositionDetailPage.tsx` and `PositionsListPage.tsx` with `<LoadingState message="..." />`
- Verify existing tests that check for loading text (`screen.getByText(/loading/i)`) still pass

**Acceptance criteria covered:**
- Shared UI primitives eliminate duplication
- Components move closer to 200-line limit

---

### 3. ErrorAlert Component

**Files to create or modify:**
- `src/renderer/src/components/ui/ErrorAlert.tsx` — create
- `src/renderer/src/pages/PositionDetailPage.tsx` — replace inline error JSX
- `src/renderer/src/pages/PositionsListPage.tsx` — replace inline error JSX
- `src/renderer/src/components/NewWheelForm.tsx` — replace inline server error JSX
- `src/renderer/src/components/ExpirationSheet.tsx` — replace inline error JSX

**Red — tests to write:**
- `src/renderer/src/components/ui/ErrorAlert.test.tsx`:
  - Renders with `role="alert"`
  - Displays the provided error message text
  - Applies error styling (red background/border)
  - Renders children when passed as children instead of message prop

**Green — implementation:**
- `ErrorAlert` component with props: `{ children: React.ReactNode }`. Renders the red error box pattern with `var(--wb-red-dim)` background and `var(--wb-red)` text. Uses `MONO` from `lib/tokens.ts`.

**Refactor — cleanup to consider:**
- Replace all 4 inline error blocks with `<ErrorAlert>message</ErrorAlert>`
- Verify no existing tests break (tests check for text content and `role="alert"`, both preserved)

**Acceptance criteria covered:**
- Shared UI primitives eliminate duplication
- Consistent error presentation across all pages

---

### 4. PhaseBadge Component

**Files to create or modify:**
- `src/renderer/src/components/PhaseBadge.tsx` — create
- `src/renderer/src/pages/PositionDetailPage.tsx` — replace inline phase badge JSX
- `src/renderer/src/components/PositionCard.tsx` — replace inline phase badge JSX

**Red — tests to write:**
- `src/renderer/src/components/PhaseBadge.test.tsx`:
  - Renders the phase label text for `CSP_OPEN` → "Sell Put" (default uses `PHASE_LABEL`)
  - Renders with `short` variant: `CSP_OPEN` → "CSP Open" (uses `PHASE_LABEL_SHORT`)
  - Applies the correct phase color from `PHASE_COLOR`
  - Renders the colored dot indicator

**Green — implementation:**
- `PhaseBadge` component with props: `{ phase: WheelPhase; variant?: 'default' | 'short' }`. Renders colored dot + label + tinted background. Uses `PHASE_COLOR` and `PHASE_LABEL`/`PHASE_LABEL_SHORT` from `lib/phase.ts`. The `short` variant is used in table rows (`PositionCard`), default in detail pages.

**Refactor — cleanup to consider:**
- Replace phase badge JSX in `PositionDetailPage.tsx:217-242` with `<PhaseBadge phase={position.phase} />`
- Replace phase badge JSX in `PositionCard.tsx:73-94` with `<PhaseBadge phase={item.phase} variant="short" />`
- Verify `PositionCard.test.tsx` test "renders phase badge" still finds "CSP Open" text

**Acceptance criteria covered:**
- Shared UI primitives eliminate duplication
- Phase display is consistent across list and detail views

---

### 5. SectionCard Component

**Files to create or modify:**
- `src/renderer/src/components/ui/SectionCard.tsx` — create
- `src/renderer/src/pages/PositionDetailPage.tsx` — replace inline section card JSX
- `src/renderer/src/components/CloseCspForm.tsx` — replace inline section card JSX

**Red — tests to write:**
- `src/renderer/src/components/ui/SectionCard.test.tsx`:
  - Renders children content
  - Renders header text when `header` prop provided
  - Does not render header div when `header` prop omitted
  - Applies surface background and border styling

**Green — implementation:**
- `SectionCard` component with props: `{ header?: string; children: React.ReactNode }`. Renders the bordered surface card with optional uppercase header bar. Uses `MONO` from `lib/tokens.ts`. Matches the pattern at `PositionDetailPage.tsx:25-41` (section + sectionHeader styles).

**Refactor — cleanup to consider:**
- Replace section wrappers in `PositionDetailPage.tsx` (Open Leg section, Cost Basis section) with `<SectionCard header="Open Leg">...</SectionCard>`
- Replace section wrapper in `CloseCspForm.tsx:100-121` with `<SectionCard header="Buy to Close">...</SectionCard>`
- Remove `sectionStyle` and `sectionHeaderStyle` constants from `PositionDetailPage.tsx`

**Acceptance criteria covered:**
- Shared UI primitives eliminate duplication
- Components move closer to 200-line limit

---

### 6. Replace Effects with Mutation Callbacks

**Files to modify:**
- `src/renderer/src/components/NewWheelForm.tsx` — remove two `useEffect` hooks, use `mutate()` callbacks
- `src/renderer/src/components/CloseCspForm.tsx` — remove one `useEffect` hook, use `mutate()` callbacks

**Red — tests to write:**
- No new test files needed. Existing tests in `NewWheelForm.test.tsx` and `CloseCspForm.test.tsx` already verify:
  - Successful submission triggers navigation
  - Server validation errors appear on form fields
  - These tests validate the behavior regardless of whether it's implemented via effects or callbacks
- If existing tests don't cover the error-mapping path, add to `src/renderer/src/components/NewWheelForm.test.tsx`:
  - When mutation returns 400 with field errors, form displays the error messages on the correct fields

**Green — implementation:**
- `NewWheelForm.tsx`: In the `onSubmit` function, replace `mutation.mutate(payload)` with `mutation.mutate(payload, { onSuccess: (data) => { navigate(...) }, onError: (err) => { mapFieldErrors(err) } })`. Remove the two `useEffect` hooks at lines 123-139. Remove `useState` import if no longer needed.
- `CloseCspForm.tsx`: Same pattern — move error mapping from `useEffect` at line 76-82 into `mutate(payload, { onError })`. The `onSuccess: () => navigate('/')` is already inline at line 90 — keep it there.

**Refactor — cleanup to consider:**
- Remove unused `useEffect` import from both files
- Verify `mutation.isSuccess` / `mutation.isError` checks in JSX still work (they do — mutation state is still tracked, just not driving effects)

**Acceptance criteria covered:**
- Unnecessary re-renders eliminated (effects fire on every render when deps match; callbacks fire once)
- Vercel best practice `rerender-derived-state-no-effect` satisfied

---

### 7. Add Query Invalidation to useCreatePosition

**Files to modify:**
- `src/renderer/src/hooks/useCreatePosition.ts` — add `onSuccess` with query invalidation

**Red — tests to write:**
- `src/renderer/src/hooks/useCreatePosition.test.ts`:
  - After successful mutation, `queryClient.invalidateQueries` is called with `{ queryKey: ['positions'] }`
  - (Follow the same pattern as `useClosePosition.ts` and `useExpirePosition.ts` which already do this)

**Green — implementation:**
- Add `useQueryClient()` call and `onSuccess` callback that invalidates `['positions']` query. Exact same pattern as `useClosePosition.ts:12-16`.

**Refactor — cleanup to consider:**
- Check for duplication and naming consistency across the three mutation hooks

**Acceptance criteria covered:**
- Position list shows fresh data after creating a new wheel (no stale cache)

---

### 8. Replace Hover useState with CSS :hover

**Files to modify:**
- `src/renderer/src/components/PositionCard.tsx` — remove `useState` for hover, use CSS classes
- `src/renderer/src/index.css` — add hover utility classes for position rows and nav links
- `src/renderer/src/App.tsx` — replace `onMouseEnter`/`onMouseLeave` on nav links with CSS class
- `src/renderer/src/pages/PositionsListPage.tsx` — replace `onMouseEnter`/`onMouseLeave` on "New Wheel" link
- `src/renderer/src/pages/PositionDetailPage.tsx` — replace `onMouseEnter`/`onMouseLeave` on back link and expiration button

**Red — tests to write:**
- No new test files needed. Existing tests verify rendered content, not hover visual state. The `PositionCard.test.tsx` tests check for text, `testid`, and formatting — none depend on hover state.
- Verify existing tests pass after `useState` removal (they will — no test triggers hover).
- Red verification note: reviewed `src/renderer/src/components/PositionCard.test.tsx`, `src/renderer/src/pages/PositionsListPage.test.tsx`, and `src/renderer/src/pages/PositionDetailPage.test.tsx`. These tests assert rendered text, test IDs, loading/error states, and click behavior only; none use hover events or depend on `useState`, `onMouseEnter`, or `onMouseLeave`.

**Green — implementation:**
- `index.css`: Add CSS rules:
  ```css
  .wb-nav-link { color: var(--wb-text-secondary); text-decoration: none; transition: color 0.15s; }
  .wb-nav-link:hover { color: var(--wb-text-primary); }
  .wb-position-row { transition: background 0.1s; cursor: pointer; }
  .wb-position-row:hover { background: var(--wb-bg-hover); }
  ```
- `PositionCard.tsx`: Remove `useState` import and `hovered`/`setHovered` state. Remove `onMouseEnter`/`onMouseLeave`. Add `className="wb-position-row"` to `<tr>`. For the left border color accent on hover, use a CSS approach: `border-left: 3px solid transparent` default, and set `border-left-color` via a CSS custom property or inline style keyed to `color` (the border color is dynamic per phase — keep it as inline style but without state dependency, using CSS `:hover` to toggle visibility).
- `App.tsx`: Replace `onMouseEnter`/`onMouseLeave` on nav links with `className="wb-nav-link"`. Remove the inline style manipulation.
- `PositionsListPage.tsx`: Replace hover handlers on "New Wheel" button link with CSS `opacity` transition via class.
- `PositionDetailPage.tsx`: Replace hover handlers on back link and expiration button with CSS classes.

**Refactor — cleanup to consider:**
- Remove `useState` import from `PositionCard.tsx` if no other state remains
- Ensure the phase-colored left border on `PositionRow` hover still works (needs testing visually — the color is dynamic, so a pure CSS solution may use `border-left-color: var(--row-phase-color)` with a CSS custom property set via inline style)
- Verify all existing tests pass

**Acceptance criteria covered:**
- Unnecessary re-renders eliminated (zero React state changes on hover)
- Vercel best practice `rerender-use-ref-transient-values` satisfied

---

### 9. Extract NavItem Component from App.tsx

**Files to modify:**
- `src/renderer/src/App.tsx` — extract `navItem` function to `NavItem` component

**Red — tests to write:**
- No separate test file needed — `NavItem` is a simple presentational component used only in `Sidebar`. If `App` tests exist, verify they still pass. Otherwise, this is covered by E2E tests.
- Optionally add to a new `src/renderer/src/components/NavItem.test.tsx`:
  - Renders the label text
  - Renders with active styling when `active` prop is true
  - Renders as a link with correct `href`

**Green — implementation:**
- Extract the `navItem` inline function from `App.tsx:14-36` into either:
  - A `NavItem` component defined at module level in `App.tsx` (simplest, keeps it co-located with `Sidebar`)
  - Or a separate `components/NavItem.tsx` file if `App.tsx` is still over 200 lines after other extractions
- `NavItem` props: `{ href: string; label: string; icon: string; active: boolean }`
- Uses `wb-nav-link` CSS class from Area 8 instead of `onMouseEnter`/`onMouseLeave`

**Refactor — cleanup to consider:**
- Verify `App.tsx` is under 200 lines after extraction
- Check for duplication and naming consistency

**Acceptance criteria covered:**
- No inline component definitions (Vercel best practice `rerender-no-inline-components`)
- All component files under 200 lines

---

### 10. Final File Size Audit

**Files to verify:**
- All modified files are under 200 lines

**Red — tests to write:**
- No tests — this is a verification step

**Green — implementation:**
- Run `wc -l` on all modified files
- If any file still exceeds 200 lines, identify further extraction opportunities:
  - `NewWheelForm.tsx` (415 lines): After Areas 1, 3, 6 — the success confirmation view (lines 156-221) could be extracted to a `NewWheelSuccess` component; the form field grid could use `Field` and `SectionCard`
  - `PositionDetailPage.tsx` (407 lines): After Areas 1-5, 8 — the `StatGrid`/`Stat` components (lines 63-113) could move to `components/StatGrid.tsx`; the header breadcrumb could be its own component
  - `ExpirationSheet.tsx` (378 lines): After Areas 1, 3 — the success state view (lines 194-277) could be extracted to `ExpirationSuccess`; the confirmation state body could be `ExpirationConfirm`

**Refactor — cleanup to consider:**
- Split any remaining files over 200 lines
- Final `pnpm test && pnpm lint && pnpm typecheck` pass

**Acceptance criteria covered:**
- All component files under 200 lines
- All tests pass, lint clean, type-check clean
