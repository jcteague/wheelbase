# Tech Debt Backlog

Consolidated from refactor-phase-results.md files. Verified against codebase 2026-03-14.

## Priority 1 — Fix during next related work

### Duplicate `fmt()` / `formatPremium()` helpers
- **Status:** Still exists — `PositionCard.tsx:8` and `PositionDetailPage.tsx:56` both define `fmt(value)` doing `parseFloat(value).toFixed(2)`. `ExpirationSheet.tsx:7` has `formatPremium()`. Three copies.
- **Fix:** Extract to `lib/format.ts`. Already planned in `plans/frontend-perf-reuse/plan.md`.
- **When:** Next time any component touches currency formatting.

### `ClosedSnapshotData` mixed casing
- **Status:** Still exists — `api/positions.ts:167`. `ClosedSnapshotData` extends `CostBasisSnapshotData` (snake_case: `basis_per_share`) but adds camelCase fields (`positionId`, `snapshotAt`, `finalPnl`). Mixed conventions in a single type.
- **Fix:** Pick one casing for the renderer API types. Since IPC returns camelCase, convert `CostBasisSnapshotData` to camelCase too.
- **When:** Next time the API types are touched.

### Re-export in `services/positions.ts`
- **Status:** Still exists — `services/positions.ts:12` re-exports `listPositions` from `./list-positions`. The only consumer (`ipc/positions.ts:12`) imports from `../services/positions`.
- **Fix:** Change `ipc/positions.ts` to import from `../services/list-positions` directly, then remove the re-export.
- **When:** Next time either file is modified.

## Priority 2 — Address in a visual polish pass

### ExpirationSheet inline styles (portal issue)
- **Status:** Still exists — entire component (378 lines) uses `React.CSSProperties` objects because Tailwind classes don't apply inside `createPortal(…, document.body)`.
- **Fix:** Separate plan exists at `plans/fix-sheet-portal-styles/plan.md`. Reinstall shadcn Sheet, fix portal target, rewrite to Tailwind.
- **When:** Before building the next sheet-based UI (close CSP sheet, roll sheet, etc.).

### PositionCard / PositionRow inline styles
- **Status:** Still exists — `PositionCard.tsx` (now `PositionRow`) uses inline style objects for all layout, borders, and colors. Same portal-independent issue: dynamic color values (`${color}18`) can't be Tailwind classes.
- **Fix:** Move dynamic colors to CSS custom properties set via `style`, keep layout in Tailwind. Part of visual polish.
- **When:** Visual polish pass or design system extraction.

## Priority 3 — Low urgency, fix when convenient

### `ExpireCspResponse.leg` carries unused fields
- **Status:** Still exists — `api/positions.ts:186-196`. The `leg` type includes `positionId`, `legRole`, `action`, `optionType`, `premiumPerContract`, `fillDate`, `createdAt`, `updatedAt` — none read by ExpirationSheet.
- **Fix:** Narrow the type to only what the component uses, or leave as-is since it matches the IPC shape (no runtime cost).
- **When:** Optional. No functional impact.

### Electron window dimensions are magic numbers
- **Status:** Still exists — `src/main/index.ts:11-12` has `width: 900, height: 670`.
- **Fix:** Extract to a config constant. Very low priority.
- **When:** When window management gets more sophisticated.

## Resolved — No longer applicable

### ~~Remaining `fetch()` calls in renderer~~
- **Resolved.** `src/renderer/src/api/positions.ts` now uses `window.api.*()` IPC calls exclusively. No `fetch()` calls remain.

### ~~`WheelStatus` casing inconsistency (legacy lowercase)~~
- **Resolved.** `WheelStatus` in `api/positions.ts:15` is now `'ACTIVE' | 'CLOSED'` only. No legacy lowercase values remain.

### ~~ExpirationSheet `useEffect` eslint-disable~~
- **Resolved.** No `eslint-disable` comments exist in `ExpirationSheet.tsx`. The component uses conditional rendering (`if (!open) return null`) instead of effect-based state reset.

### ~~PositionCard phase label/color mismatch (10 legacy phases vs 4)~~
- **Resolved.** `WheelPhase` in `core/types.ts` defines 10 phases. Both `PHASE_LABEL` in `PositionCard.tsx` and `PHASE_COLOR` in `lib/phase.ts` cover all 10. The "4 canonical phases" note was wrong — the Electron app kept the full phase set.

### ~~API codegen for WheelPhase/WheelStatus~~
- **Not applicable.** This is an Electron app with no HTTP API. The renderer types in `api/positions.ts` and the Zod enums in `core/types.ts` are both hand-maintained, but they're in the same repo and change together. Codegen adds no value here.
