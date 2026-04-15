# Quickstart: Design System Migration

## Prerequisites

No migrations, seed data, or IPC changes are required. This is a pure renderer-side CSS migration.

## Running Tests

```bash
# Run all tests (must pass before and after each area)
pnpm test

# Run only renderer component tests
pnpm test src/renderer

# Run a specific component test
pnpm test ExpirationSheet
pnpm test Sheet
```

## Visual Verification

After each area, start the app and visually verify:

```bash
pnpm dev
```

Open the app and exercise the migrated component. Verify:

- Colors match before/after (gold, green, borders, backgrounds)
- Borders render correctly (no missing or extra borders)
- Padding and spacing are preserved
- Font rendering is identical (monospace stack)
- Sheet animations still play (slide-in, slide-out)
- Portal positioning is correct (sheet anchored to right side of viewport, offset from 200px sidebar)

## DevTools Verification (per area)

For each migrated component, open DevTools → Elements and confirm:

1. The element has Tailwind class names (e.g. `bg-wb-bg-surface`, `border-t`, `flex-col`)
2. The computed styles panel shows the expected CSS values
3. No `style=""` attribute with static values remains (only dynamic values are permitted inline)

## Passing Criteria

Each area is complete when:

1. `pnpm test` — all tests pass (zero failures)
2. `pnpm lint` — zero ESLint errors
3. `pnpm typecheck` — zero TypeScript errors
4. Visual inspection in `pnpm dev` — component appearance is unchanged
5. No static inline `style={{}}` blocks remain in the migrated files (dynamic values excepted — see `data-model.md`)

## Checking Static Inline Style Count

After Phase 4 (full migration), run:

```bash
grep -rn "style={{" src/renderer/src --include="*.tsx"
```

Expected result: only dynamic inline styles remain (width from props, colors from data, etc.). No objects with static string values like `'var(--wb-gold)'` or `'1px solid ...'`.
