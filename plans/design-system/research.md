# Research: Design System — Tailwind + wb-\* Migration

## Tailwind v4 Token Integration Approach

- **Decision:** Extend the existing `@theme inline` block in `src/renderer/src/index.css` with `--color-wb-*` entries for every wb-\* color token. Add `--font-wb-mono` for the monospace stack. Add `--shadow-sheet` for the panel drop shadow.
- **Rationale:** The project already uses `@theme inline` for shadcn token mapping (e.g. `--color-background: var(--background)`). Tailwind v4 resolves `@theme inline` entries directly into utility output, so `--color-wb-gold: var(--wb-gold)` generates `bg-wb-gold`, `text-wb-gold`, `border-wb-gold`, etc. with no additional configuration file.
- **Alternatives considered:** `tailwind.config.ts` `theme.extend.colors` — not applicable for Tailwind v4 which has moved to CSS-based configuration. Adding tokens as arbitrary values at usage site (`bg-[var(--wb-gold)]`) — this works today but requires brackets everywhere and provides no named utility; ruled out.

## Tailwind Classes Inside createPortal (Portal Fix)

- **Decision:** Add `<div id="sheet-portal" />` as a sibling to `<main>` inside `AppShell` in `App.tsx`. All sheet consumers pass `document.getElementById('sheet-portal')` as the second argument to `createPortal` instead of `document.body`.
- **Rationale:** The `fix-sheet-portal-styles` plan (`plans/fix-sheet-portal-styles/plan.md`) identified this pattern as the correct fix. Elements inside `#root` are within the same CSS context as the rest of the app; Tailwind's `@layer utilities` rules apply without being overridden by body-level reset rules. Sheets currently mount to `document.body` which places them outside `#root` and causes Tailwind's layered utilities to lose specificity to base rules.
- **Alternatives considered:** Using `!important` on Tailwind utility classes — anti-pattern, not maintainable. Diagnosing as HMR artifact and doing a fresh restart — attempted approach suggested in the issue; did not resolve the underlying structural cause.

## TDD Approach for CSS Migration

- **Decision:** For each component area, write tests that assert specific Tailwind class names on rendered elements (e.g., `expect(element).toHaveClass('border-t')`) before migrating. Existing behavior tests (text content, interactions) serve as regression guard. For Sheet.tsx specifically, update existing style-attribute assertions to class-name assertions as part of the Red phase.
- **Rationale:** Without class-asserting tests, the migration has no clear Red → Green signal. Asserting class names directly confirms the migration is complete and catches regressions in the refactor phase.
- **Alternatives considered:** Snapshot tests — brittle and verbose for class-heavy markup. No tests, verify visually only — no regression safety net.

## Dynamic Prop Values That Must Stay Inline

- **Decision:** Keep the following as inline `style` props even after migration: `SheetPanel.width` (runtime prop, can vary), `SheetHeader.eyebrowColor` and `SheetHeader.borderBottomColor` (runtime string props), per-row computed background gradients in success states where color is data-driven. Everything else (static structural styles) becomes Tailwind.
- **Rationale:** Tailwind arbitrary values must be statically present in source at build time. Runtime-computed class names (e.g., `` `w-[${width}px]` ``) are not scanned by the JIT and will not emit CSS. Inline styles are the correct tool for truly dynamic values.
- **Alternatives considered:** CSS custom properties on the element with a static utility class — viable but adds complexity; deferred as over-engineering for this migration.

## Migration Scope for MONO font token

- **Decision:** Add `--font-wb-mono` to the `@theme inline` block, mapping to the same stack as the `MONO` constant in `src/renderer/src/lib/tokens.ts`. At call sites, replace `fontFamily: MONO` inline style with `className="font-wb-mono"`. Do not delete `tokens.ts` until all references are migrated.
- **Rationale:** The MONO constant is imported in ~15+ files; deleting it before migration would cause type errors. Gradual replacement allows the migration to proceed area by area.
- **Alternatives considered:** Rename/re-export from tokens.ts — unnecessary indirection; ruled out.
