# Refactor Phase Results: Design System — Area 3 (Sheet.tsx Primitives)

## Automated Simplification

- code-simplifier agent run: skipped — file was small and targeted edits were sufficient

## Manual Refactorings Performed

### 1. Convert static inline styles to Tailwind — `SheetHeader`

**File**: `src/renderer/src/components/ui/Sheet.tsx`

**Before**: Eyebrow `<span>` had a mixed `style` object with both static and dynamic properties:

```tsx
style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: eyebrowColor }}
```

Title `<div>` had fully static inline styles:

```tsx
style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}
```

Subtitle `<div>` had fully static inline styles:

```tsx
style={{ fontSize: 12, color: 'var(--wb-text-muted)', marginTop: 2 }}
```

**After**:

- Eyebrow: `className="text-[10px] font-semibold uppercase tracking-[0.08em]"` + `style={{ color: eyebrowColor }}` (dynamic only)
- Title: `className="text-base font-semibold mt-1"`
- Subtitle: `className="text-xs text-wb-text-muted mt-0.5"`

**Reason**: All static styles belong in Tailwind; only truly dynamic values (caller-supplied colors) remain inline.

## Remaining Inline Styles in Sheet.tsx (all correct)

| Component             | Inline style          | Reason to keep                      |
| --------------------- | --------------------- | ----------------------------------- |
| `SheetPanel`          | `width: ${width}px`   | Dynamic prop                        |
| `SheetHeader` wrapper | `borderBottomColor`   | Dynamic prop (phase-colored accent) |
| `SheetHeader` eyebrow | `color: eyebrowColor` | Dynamic prop (phase-colored label)  |

## Test Execution Results

```
pnpm test Sheet

Test Files  7 passed (7)
      Tests  99 passed (99)
```

## Quality Checks

- ✅ `pnpm test Sheet` — 99 passed, 0 failed
- ✅ `pnpm lint` — Sheet.tsx has 0 errors, 0 warnings
- ✅ `pnpm typecheck` — no errors in Sheet.tsx (pre-existing error in PositionDetailContent.tsx from in-progress Layer 2 work)

## Remaining Tech Debt

- Layer 2 Areas 11–14 not yet implemented (Form components, Pages, List/Data, Remaining UI)
- Layer 3 Areas 4–10 (Sheet content) blocked on Area 3 Green completion (now done)
- `PositionDetailContent.tsx` has a pre-existing typecheck error (`DETAIL_BASE_STYLE` undefined) from in-progress migration work

---

# Refactor Phase Results: Design System — Area 12 (Page Components & App Shell)

## Manual Refactorings Performed

### 1. Convert remaining static inline styles — `App.tsx`

- `style={{ width: 200, minWidth: 200 }}` on `<aside>` → `w-[200px] min-w-[200px]` in className
- `style={{ width: 8, height: 8, boxShadow: ... }}` on logo dot → `w-2 h-2` in className; `boxShadow` kept inline (glow effect)
- `style={{ letterSpacing: '0.15em' }}` on Wheelbase label → `tracking-[0.15em]` in className; duplicate `tracking-widest` removed
- Nav section label: 4 static inline properties → `text-[0.65rem] font-semibold tracking-[0.1em] uppercase` in className
- Footer: `style={{ fontSize: '0.65rem' }}` → `text-[0.65rem]` in className

### 2. Convert remaining static inline styles — `PositionsListPage.tsx`

- "New Wheel" button: `letterSpacing: '0.02em'` → `tracking-[0.02em]`; `transition: 'opacity 0.15s'` removed (already handled by `wb-hover-opacity` CSS class)
- `SectionHeader`: 4 static inline properties → `text-[0.65rem] font-medium tracking-[0.08em] uppercase` in className
- `PositionTable`: `style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}` → `w-full border-collapse text-[0.8125rem]`; `style` prop removed; `isClosed` opacity now a conditional class `opacity-[0.55]`
- `TableHeader` calls: `style={{ padding: '8px 16px' }}` → `className="px-4 py-2"`

## Quality Checks

- ✅ `pnpm test` — 621/621 passed
- ✅ `pnpm lint` — 0 errors (1 pre-existing warning in CloseCspForm.tsx)
- ✅ `pnpm typecheck` — 0 errors

## Remaining Inline Styles (all correct)

| Component             | Inline style                          | Reason                                                     |
| --------------------- | ------------------------------------- | ---------------------------------------------------------- |
| Logo dot in `App.tsx` | `boxShadow: '0 0 6px var(--wb-gold)'` | Glow effect — no Tailwind equivalent without custom config |
| `PageLayout`          | `contentStyle` prop spread            | Caller-supplied dynamic override                           |

---

# Refactor Phase Results: Design System — Area 1 wb-\* Token Integration

## Automated Simplification

- code-simplifier agent run: not invoked — scope was CSS-only; manual refactor was sufficient and complete in one step

## Manual Refactorings Performed

### 1. Add `/* ── shadcn/ui tokens ── */` section header to `@theme inline`

**File**: `src/renderer/src/index.css`
**Before**: The `@theme inline` block opened directly with `--radius-sm` — the shadcn token group had no label
**After**: Added `/* ── shadcn/ui tokens ── */` comment immediately after `@theme inline {`, mirroring the existing `/* ── wb-* tokens ── */` separator already present at the bottom of the block
**Reason**: Symmetric section headers make it immediately clear where shadcn tokens end and wb-\* tokens begin — important as the block grows through subsequent migration areas

### 2. Fix prettier warning in `tokens.test.ts`

**File**: `src/renderer/src/lib/tokens.test.ts`
**Before**: Multi-line `expect(MONO).toBe(...)` call with the string argument on its own indented line — triggered a `prettier/prettier` warning
**After**: Single-line assertion
**Reason**: Keep lint output clean; no warnings from Area 1 files

## Test Execution Results

```
pnpm test tokens

 ✓  renderer  src/renderer/src/lib/tokens.test.ts (6 tests) 3ms

 Test Files  1 passed (1)
       Tests  6 passed (6)
   Duration  709ms
```

## Quality Checks

- ✅ `pnpm test tokens` passed (6/6)
- ✅ `pnpm lint` — 0 errors, 22 warnings all pre-existing in Sheet.tsx (not from Area 1 files)
- ✅ `pnpm typecheck` — 0 errors (both node and web tsconfig)

## Remaining Tech Debt

None for Area 1.

## Notes

All refactorings performed with tests passing after each step. The `@theme inline` block is now clearly divided into two labeled sections: shadcn/ui tokens and wb-\* tokens.

---

# Refactor Phase Results: Design System — Area 13 (Position List Components)

## Manual Refactorings Performed

### 1. Convert last static inline style — `LegHistoryTable`

**File**: `src/renderer/src/components/LegHistoryTable.tsx`

**Before**: `TableHeader` for "Running Basis / Share" column had `style={{ color: '#79c0ff' }}` alongside Tailwind classes
**After**: `text-[#79c0ff]` added to `className`; `style` prop removed
**Reason**: `BasisCell` already used `text-[#79c0ff]` as a class — consistent; no inline style needed

### 2. Fix Prettier warning — `CloseCspForm.tsx`

**File**: `src/renderer/src/components/CloseCspForm.tsx`

**Before**: `<form>` element had attributes on separate lines triggering a Prettier line-length warning
**After**: Collapsed to single line `<form onSubmit={handleSubmit(onSubmit)} className="p-5 flex flex-col gap-4">`
**Reason**: Keep lint output clean

## Test Execution Results

```
pnpm test LegHistory

Test Files  1 passed (1)
      Tests  16 passed (16)
```

## Quality Checks

- ✅ `pnpm test` — all passing
- ✅ `pnpm lint` — 0 errors, 0 warnings
- ✅ `pnpm typecheck` — 0 errors

## Remaining Inline Styles (all correct)

| Component               | Inline style                                   | Reason                                    |
| ----------------------- | ---------------------------------------------- | ----------------------------------------- |
| `PositionRow`           | `--wb-row-bg`, `--wb-row-phase-color` CSS vars | Dynamic CSS custom properties set per-row |
| `LegHistoryTable` tfoot | `color: pnlColor(finalPnl)`                    | Dynamic P&L color computed at runtime     |

---

# Refactor Phase Results: Design System — Area 14 (Remaining UI Components)

## Manual Refactorings Performed

### 1. Extract duplicate button — `PositionDetailActions`

**File**: `src/renderer/src/components/PositionDetailActions.tsx`

**Before**: The "Record Expiration →" button in the `CC_OPEN && ccExpired` branch was an inline `<button>` element with the full className string duplicated
**After**: Replaced with `<ActionButton testId="record-cc-expiration-btn" label="Record Expiration →" onClick={onRecordCcExpiration} />`
**Reason**: `ActionButton` already existed for exactly this purpose; duplicating its markup is a code smell

### 2. Convert static borderRadius — `PhaseBadge` dot

**File**: `src/renderer/src/components/PhaseBadge.tsx`

**Before**: `style={{ background: color, borderRadius: '50%' }}` on the dot indicator span
**After**: `className="w-[5px] h-[5px] shrink-0 rounded-full"` + `style={{ background: color }}` (dynamic only)
**Reason**: `borderRadius: '50%'` is static — always round; `rounded-full` is the Tailwind equivalent

**Test updated**: `PhaseBadge.test.tsx` — changed `toHaveStyle({ borderRadius: '50%' })` to `toHaveClass('rounded-full')`

### 3. Convert static SVG styles — `CalendarIcon` in `date-picker.tsx`

**File**: `src/renderer/src/components/ui/date-picker.tsx`

**Before**: `style={{ opacity: 0.5, flexShrink: 0 }}` on the SVG element
**After**: `className="opacity-50 shrink-0"` — `style` prop removed
**Reason**: Both are static, no dynamic values

### 4. Convert static inline styles — `FormButton`

**File**: `src/renderer/src/components/ui/FormButton.tsx`

**Before**: Seven static properties in the `style` object: `padding`, `borderRadius`, `fontSize`, `fontWeight`, `cursor` (conditional), `letterSpacing`, `transition`
**After**:

- `className="font-wb-mono py-[11px] px-6 rounded-[6px] text-[0.9375rem] font-semibold tracking-[0.04em] transition-opacity duration-150 cursor-not-allowed|cursor-pointer"`
- `style` now only contains dynamic variant styles (`...variantStyles[variant](isPending)`) and caller-supplied override (`...style`)
  **Reason**: All seven were static or conditionally static; moved to Tailwind per design system conventions

## Test Execution Results

```
pnpm test

Test Files  57 passed (57)
      Tests  621 passed (621)
```

## Quality Checks

- ✅ `pnpm test` — 621/621 passed
- ✅ `pnpm lint` — 0 errors, 0 warnings
- ✅ `pnpm typecheck` — 0 errors

## Remaining Inline Styles (all correct)

| Component           | Inline style                            | Reason                                                                         |
| ------------------- | --------------------------------------- | ------------------------------------------------------------------------------ |
| `Badge`             | `background`, `color`, `border`         | Dynamic: derived from caller-supplied `color` prop                             |
| `PhaseBadge` dot    | `background: color`                     | Dynamic: phase color from `PHASE_COLOR` map                                    |
| `AlertBox`          | `background`, `border`, `color`         | Dynamic: derived from `VARIANT_STYLES[variant]`                                |
| `ErrorAlert`        | `border: 1px solid rgba(...)`           | No wb-\* token for this rgba value                                             |
| `FormButton`        | variant `border`, `background`, `color` | Dynamic: isPending state changes appearance                                    |
| `NumberInput`       | border, background, color, padding      | Complex interactive input; static + dynamic mixed with caller `style` override |
| `DatePicker` button | border, background, color               | Dynamic: error state, selected state                                           |
| `LoadingState` dot  | animation, background, border-radius    | Custom CSS animation — no Tailwind equivalent                                  |
| `StatGrid`          | `gridTemplateColumns`                   | Dynamic: computed from `minWidth` prop                                         |
