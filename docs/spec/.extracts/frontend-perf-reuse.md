---
plan: frontend-perf-reuse
source: plans/frontend-perf-reuse/
extracted_at: 2026-06-01
status: complete
---

# Extract: frontend-perf-reuse

## Summary

Extract shared constants, formatters, and UI primitives from 7+ frontend files to eliminate duplication, bring all components under the 200-line limit, and fix React performance anti-patterns (unnecessary re-renders from hover state, effects used for derived state, missing query invalidation). The done state is: all existing tests pass, every component file is under 200 lines, `MONO` appears in exactly one file, and hover interactions use CSS instead of React state.

## Architecture Decisions

### ADR: CSS :hover replaces useState for hover state

- **Decision:** Replace `useState(false)` hover tracking with CSS `:hover` pseudo-classes and utility classes.
- **Why:** The app already uses Tailwind CSS. CSS `:hover` is zero-cost from React's perspective — no re-renders, no event listeners. The current `PositionRow` component uses `useState` for hover which triggers a full re-render on every mouse enter/leave; for a table with dozens of rows this adds up. The `onMouseEnter`/`onMouseLeave` imperative DOM style manipulation in `App.tsx`, `PositionsListPage.tsx`, and `PositionDetailPage.tsx` is a mixed pattern that CSS hover rules eliminate entirely.
- **Alternatives considered:** `useRef` for transient hover values (still requires event listeners); CSS-in-JS solutions (adds bundle weight).
- **Source:** `plans/frontend-perf-reuse/research.md`

### ADR: PHASE_LABEL reconciliation with PHASE_LABEL_SHORT variant

- **Decision:** Use the more descriptive labels from `PositionDetailPage.tsx` as the canonical `PHASE_LABEL`, with short labels from `PositionCard.tsx` as a separate `PHASE_LABEL_SHORT` export.
- **Why:** Two different `PHASE_LABEL` records existed — `PositionDetailPage.tsx` had `'CSP_OPEN': 'Sell Put'` (more descriptive), while `PositionCard.tsx` had `'CSP_OPEN': 'CSP Open'` (shorter for table cells). Both are valid for their contexts. A single canonical export with a short variant preserves intent while eliminating duplication.
- **Alternatives considered:** Single label set (loses context-appropriate sizing); label function with `short` parameter (over-engineered for a simple Record).
- **Source:** `plans/frontend-perf-reuse/research.md`

### ADR: Effect → mutation callback migration

- **Decision:** Move redirect and error-mapping logic from `useEffect` into `mutate()` callbacks (`onSuccess`, `onError`).
- **Why:** Per Vercel best practice `rerender-derived-state-no-effect`, effects that react to mutation state and call `setError` or `navigate` are indirect — the cause (mutation completes) and effect (set form errors) should be co-located. TanStack Query's `mutate()` accepts `onSuccess`/`onError` callbacks that fire once per mutation, avoiding the stale-closure and double-fire risks of effects.
- **Alternatives considered:** `useMutation({ onSuccess })` at the hook level (already used in `useClosePosition` — but form-level error mapping with `setError` is component-specific, so the callback belongs in the component's `mutate()` call, not the hook definition).
- **Source:** `plans/frontend-perf-reuse/research.md`

### ADR: Formatter consolidation into lib/format.ts

- **Decision:** Create `lib/format.ts` with pure functions: `fmtMoney`, `fmtPct`, `fmtDate`, `pnlColor`, `computeDte`.
- **Why:** These functions are pure (input → string/number) and appear in 4+ files with slight naming variations (`fmt`, `fmtMoney`, `formatPremium`). Consolidating them reduces duplication and makes formatting consistent across the app.
- **Alternatives considered:** `Intl.NumberFormat` (heavier API for simple `$X.XX` formatting); a formatting library like `numeral.js` (unnecessary dependency for this scope).
- **Source:** `plans/frontend-perf-reuse/research.md`

### ADR: Shared component testing strategy

- **Decision:** Write unit tests for the new shared components (`LoadingState`, `ErrorAlert`, `PhaseBadge`, `SectionCard`) with `@testing-library/react`. Existing component tests should continue to pass without modification since the visual output doesn't change.
- **Why:** The refactoring replaces inline JSX with component calls. As long as the rendered output (text content, test IDs, roles) stays identical, existing tests pass. New tests verify the shared components in isolation.
- **Alternatives considered:** Snapshot tests (fragile, don't verify behavior); no new tests (misses the TDD requirement).
- **Source:** `plans/frontend-perf-reuse/research.md`

## Contracts

None recorded.

## Schema Changes

None recorded. This story is a pure frontend refactoring — no new entities, database changes, or API endpoints. The data model is unchanged.

## Acceptance Criteria

- Codebase is DRY — shared constants defined once (`MONO` appears in exactly one file).
- No functional changes — identical output after refactor.
- Shared UI primitives (`LoadingState`, `ErrorAlert`, `PhaseBadge`, `SectionCard`) eliminate duplication.
- Consistent error presentation across all pages.
- Phase display is consistent across list and detail views.
- Unnecessary re-renders eliminated (effects fire on every render when deps match; callbacks fire once). Vercel best practice `rerender-derived-state-no-effect` satisfied.
- Position list shows fresh data after creating a new wheel (no stale cache).
- Unnecessary re-renders eliminated from hover (zero React state changes on hover). Vercel best practice `rerender-use-ref-transient-values` satisfied.
- No inline component definitions (Vercel best practice `rerender-no-inline-components`).
- All component files under 200 lines.
- All tests pass, lint clean, type-check clean.

## Decisions & Tradeoffs

### New exports (constants/utilities only)

- `lib/tokens.ts` → `MONO: string` — monospace font-family constant (`'ui-monospace, "SF Mono", Menlo, monospace'`).
- `lib/format.ts`:
  - `fmtMoney(value: string): string` — `"180.0000"` → `"$180.00"`.
  - `fmtPct(n: number): string` — `-15` → `"-15%"`, `30` → `"30%"`.
  - `fmtDate(iso: string): string` — `"2026-04-17"` → `"Apr 17"` (local date, no timezone shift; splits ISO string and constructs local `Date`).
  - `pnlColor(value: string): string` — returns CSS variable name based on sign (`"var(--wb-green)"` / `"var(--wb-red)"`).
  - `computeDte(expiration: string): number` — days to expiration from today using local midnight comparison.
- `lib/phase.ts` updates:
  - `PHASE_LABEL: Record<WheelPhase, string>` — descriptive labels (e.g., `CSP_OPEN: "Sell Put"`).
  - `PHASE_LABEL_SHORT: Record<WheelPhase, string>` — compact labels (e.g., `CSP_OPEN: "CSP Open"`).
  - `PHASE_COLOR` — already exists, unchanged.

### New shared components

- `LoadingState` — props `{ message?: string }`, defaults to "Loading…", uses `role="status"` with pulsing gold dot pattern; uses `MONO` from `lib/tokens.ts`.
- `ErrorAlert` — props `{ children: React.ReactNode }`, uses `role="alert"` with `var(--wb-red-dim)` background and `var(--wb-red)` text; uses `MONO`.
- `PhaseBadge` — props `{ phase: WheelPhase; variant?: 'default' | 'short' }`. Renders colored dot + label + tinted background. The `short` variant is used in table rows (`PositionCard`), default in detail pages.
- `SectionCard` — props `{ header?: string; children: React.ReactNode }`. Renders bordered surface card with optional uppercase header bar; uses `MONO`.

### Effect-to-callback migration specifics

- `NewWheelForm.tsx`: Replace `mutation.mutate(payload)` with `mutation.mutate(payload, { onSuccess: (data) => { navigate(...) }, onError: (err) => { mapFieldErrors(err) } })`. Remove the two `useEffect` hooks at lines 123-139. Remove `useState` import if no longer needed.
- `CloseCspForm.tsx`: Same pattern — move error mapping from `useEffect` at line 76-82 into `mutate(payload, { onError })`. The `onSuccess: () => navigate('/')` is already inline at line 90 — keep it there.

### Query invalidation for `useCreatePosition`

- Add `useQueryClient()` call and `onSuccess` callback that invalidates `['positions']` query — exact same pattern as `useClosePosition.ts:12-16` and `useExpirePosition.ts`.

### Hover CSS approach

- `index.css` adds utility classes:
  ```css
  .wb-nav-link {
    color: var(--wb-text-secondary);
    text-decoration: none;
    transition: color 0.15s;
  }
  .wb-nav-link:hover {
    color: var(--wb-text-primary);
  }
  .wb-position-row {
    transition: background 0.1s;
    cursor: pointer;
  }
  .wb-position-row:hover {
    background: var(--wb-bg-hover);
  }
  ```
- Phase-colored left border on `PositionRow` hover must still work — color is dynamic per phase, so a pure CSS approach uses `border-left-color: var(--row-phase-color)` with a CSS custom property set via inline style (keep that one inline style; remove state).

### NavItem extraction

- Extract inline `navItem` function from `App.tsx:14-36` into a `NavItem` component (props `{ href: string; label: string; icon: string; active: boolean }`). May live at module level in `App.tsx` (simplest) or in `components/NavItem.tsx` if `App.tsx` is still over 200 lines after other extractions. Uses `wb-nav-link` CSS class instead of `onMouseEnter`/`onMouseLeave`.

### Final file size audit

- All modified files must be under 200 lines. Identified further extraction candidates if needed:
  - `NewWheelForm.tsx` (415 lines): success confirmation view (lines 156-221) could be extracted to `NewWheelSuccess`; field grid could use `Field` and `SectionCard`.
  - `PositionDetailPage.tsx` (407 lines): `StatGrid`/`Stat` components (lines 63-113) could move to `components/StatGrid.tsx`; header breadcrumb could be its own component.
  - `ExpirationSheet.tsx` (378 lines): success state view (lines 194-277) could be extracted to `ExpirationSuccess`; confirmation state body could be `ExpirationConfirm`.

## Source Code References

New files (per plan):

- `src/renderer/src/lib/tokens.ts`
- `src/renderer/src/lib/format.ts`
- `src/renderer/src/components/ui/LoadingState.tsx`
- `src/renderer/src/components/ui/ErrorAlert.tsx`
- `src/renderer/src/components/PhaseBadge.tsx`
- `src/renderer/src/components/ui/SectionCard.tsx`
- `src/renderer/src/components/NavItem.tsx` (optional — only if extracted to its own file)

Modified files (per plan):

- `src/renderer/src/lib/phase.ts` — added `PHASE_LABEL` and `PHASE_LABEL_SHORT`
- `src/renderer/src/App.tsx` — extract `NavItem`, replace hover handlers with CSS class
- `src/renderer/src/index.css` — add `.wb-nav-link` and `.wb-position-row` hover rules
- `src/renderer/src/pages/PositionDetailPage.tsx` — replace inline loading/error/phase-badge/section JSX with shared components; remove local formatters and `PHASE_LABEL`; replace hover handlers with CSS classes
- `src/renderer/src/pages/PositionsListPage.tsx` — replace inline loading/error JSX; replace hover handlers with CSS classes
- `src/renderer/src/components/PositionCard.tsx` — replace inline phase badge JSX; remove `useState` hover state; use `wb-position-row` class
- `src/renderer/src/components/NewWheelForm.tsx` — replace inline server error JSX; remove two `useEffect` hooks; move logic to `mutate()` callbacks
- `src/renderer/src/components/CloseCspForm.tsx` — replace inline section card and error JSX; remove `useEffect`; move error mapping to `mutate()` callback
- `src/renderer/src/components/ExpirationSheet.tsx` — replace inline error JSX
- `src/renderer/src/hooks/useCreatePosition.ts` — add `useQueryClient` + `onSuccess` invalidation of `['positions']`

Verified to exist under `src/`.

## Open Questions

None recorded.
