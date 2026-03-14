# Research: Frontend Performance & Reuse Improvements

## CSS :hover vs useState for hover state

- **Decision:** Replace `useState(false)` hover tracking with CSS `:hover` pseudo-classes and utility classes
- **Rationale:** The app already uses Tailwind CSS (via `index.css` with `@tailwind` directives). CSS `:hover` is zero-cost from React's perspective — no re-renders, no event listeners. The current `PositionRow` component uses `useState` for hover which triggers a full re-render on every mouse enter/leave. For a table that could have dozens of rows, this adds up. The `onMouseEnter`/`onMouseLeave` imperative style manipulation in `App.tsx`, `PositionsListPage.tsx`, and `PositionDetailPage.tsx` is a mixed pattern (React + imperative DOM) that CSS hover rules eliminate entirely.
- **Alternatives considered:** `useRef` for transient hover values (still requires event listeners); CSS-in-JS solutions (adds bundle weight). Plain CSS/Tailwind is the simplest approach and already available.

## PHASE_LABEL reconciliation

- **Decision:** Use the more descriptive labels from `PositionDetailPage.tsx` as the canonical source, with short labels from `PositionCard.tsx` as a separate `PHASE_LABEL_SHORT` export
- **Rationale:** Two different `PHASE_LABEL` records exist:
  - `PositionDetailPage.tsx`: `'CSP_OPEN': 'Sell Put'`, `'HOLDING_SHARES': 'Holding Shares'`, etc. — more descriptive
  - `PositionCard.tsx`: `'CSP_OPEN': 'CSP Open'`, `'HOLDING_SHARES': 'Shares'`, etc. — shorter for table cells
  Both are valid for their contexts. A single canonical export with a short variant preserves intent while eliminating duplication.
- **Alternatives considered:** Single label set (loses context-appropriate sizing); label function with `short` parameter (over-engineered for a simple Record)

## Effect → mutation callback migration

- **Decision:** Move redirect and error-mapping logic from `useEffect` into `mutate()` callbacks (`onSuccess`, `onError`)
- **Rationale:** Per Vercel best practice `rerender-derived-state-no-effect`, effects that react to mutation state and call `setError` or `navigate` are indirect — the cause (mutation completes) and effect (set form errors) should be co-located. TanStack Query's `mutate()` accepts `onSuccess`/`onError` callbacks that fire once per mutation, avoiding the stale-closure and double-fire risks of effects.
- **Alternatives considered:** `useMutation({ onSuccess })` at the hook level (already used in `useClosePosition` — but form-level error mapping with `setError` is component-specific, so the callback belongs in the component's `mutate()` call, not the hook definition)

## Formatter consolidation approach

- **Decision:** Create `lib/format.ts` with pure functions: `fmtMoney`, `fmtPct`, `fmtDate`, `pnlColor`, `computeDte`
- **Rationale:** These functions are pure (input → string/number) and appear in 4+ files with slight naming variations (`fmt`, `fmtMoney`, `formatPremium`). Consolidating them reduces duplication and makes formatting consistent across the app.
- **Alternatives considered:** Intl.NumberFormat (heavier API for simple `$X.XX` formatting); a formatting library like `numeral.js` (unnecessary dependency for this scope)

## Shared component testing strategy

- **Decision:** Write unit tests for the new shared components (`LoadingState`, `ErrorAlert`, `PhaseBadge`, `SectionCard`) with `@testing-library/react`. Existing component tests should continue to pass without modification since the visual output doesn't change.
- **Rationale:** The refactoring replaces inline JSX with component calls. As long as the rendered output (text content, test IDs, roles) stays identical, existing tests pass. New tests verify the shared components in isolation.
- **Alternatives considered:** Snapshot tests (fragile, don't verify behavior); no new tests (misses the TDD requirement)
