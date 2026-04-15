# Quickstart: Frontend Performance & Reuse Improvements

## Prerequisites

- Node.js and pnpm installed
- Dependencies installed: `pnpm install`
- `better-sqlite3` rebuilt for system Node: `pnpm rebuild better-sqlite3`

## Running Tests

```bash
# All unit + integration tests (Vitest)
pnpm test

# Run only renderer tests (faster feedback during frontend work)
pnpm test -- src/renderer/

# Run a specific test file
pnpm test -- src/renderer/src/lib/format.test.ts
pnpm test -- src/renderer/src/components/PhaseBadge.test.tsx
```

## Verification Checklist

After each implementation area, run all three:

```bash
pnpm test        # All tests pass
pnpm lint        # No lint errors
pnpm typecheck   # No TypeScript errors
```

## Key Files to Watch

| New file                                          | Purpose                                         |
| ------------------------------------------------- | ----------------------------------------------- |
| `src/renderer/src/lib/tokens.ts`                  | `MONO` font constant                            |
| `src/renderer/src/lib/format.ts`                  | Shared formatters                               |
| `src/renderer/src/lib/phase.ts`                   | `PHASE_LABEL` + `PHASE_LABEL_SHORT` (additions) |
| `src/renderer/src/components/ui/LoadingState.tsx` | Pulsing dot + message                           |
| `src/renderer/src/components/ui/ErrorAlert.tsx`   | Red error box                                   |
| `src/renderer/src/components/PhaseBadge.tsx`      | Phase dot + label badge                         |
| `src/renderer/src/components/ui/SectionCard.tsx`  | Bordered card with header                       |

## No Migrations Required

This is a pure frontend refactoring — no database or API changes.
