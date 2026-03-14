# Quickstart: US-5 — Run Tests Locally

## Prerequisites

No new migrations are needed. No new packages are required. `better-sqlite3` must be built for both Electron and system Node:

```bash
npx electron-rebuild -f -w better-sqlite3   # build for Electron (dev/prod)
pnpm rebuild better-sqlite3                 # rebuild for system Node (Vitest)
```

## Running All Tests

```bash
pnpm test
```

All new tests for this story live in:

- `src/main/core/lifecycle.test.ts` — `expireCsp` function
- `src/main/core/costbasis.test.ts` — `calculateCspExpiration` function
- `src/main/services/expire-csp-position.test.ts` — `expireCspPosition` service
- `src/renderer/src/components/ExpirationSheet.test.tsx` — sheet component
- `src/renderer/src/pages/PositionDetailPage.test.tsx` — integration with button + sheet

## Running a Single Test File

```bash
pnpm test src/main/core/lifecycle.test.ts
pnpm test src/main/services/expire-csp-position.test.ts
```

## Verification Criteria

All tests pass with:
```
✓ src/main/core/lifecycle.test.ts
✓ src/main/core/costbasis.test.ts
✓ src/main/services/expire-csp-position.test.ts
✓ src/renderer/src/components/ExpirationSheet.test.tsx
✓ src/renderer/src/pages/PositionDetailPage.test.tsx
```

And the overall post-change checklist:
```bash
pnpm test       # all pass
pnpm lint       # zero errors
pnpm typecheck  # zero errors
```

## Manual Smoke Test

1. `pnpm dev` — open the app
2. Create a new wheel with expiration date set to today or earlier
3. Navigate to the position detail page
4. Click "Record Expiration →" — confirm the sheet slides in
5. Review the summary card (position, contracts, phase transition, Final P&L)
6. Click "Confirm Expiration" — confirm the success sheet appears with P&L display and "Open new wheel" shortcut
7. Click "Open new wheel on AAPL" — confirm navigation to New Wheel form with ticker pre-filled
8. Navigate back to Positions list — confirm the AAPL position shows WHEEL_COMPLETE badge in the Closed section
