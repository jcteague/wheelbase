# Quickstart: US-9 — Record CC Expiring Worthless

## Prerequisites

1. **Merge local main into the worktree branch** — US-7 ("open cover calls", commit `9fb1928`) is on local `main` but not on `origin/main`. The worktree branch must include it:

   ```bash
   git merge main
   ```

2. **Rebuild better-sqlite3** (only needed after `pnpm install` or node version change):

   ```bash
   npx electron-rebuild -f -w better-sqlite3
   pnpm rebuild better-sqlite3
   ```

---

## Running Unit + Integration Tests

```bash
pnpm test
```

Tests specific to this story:

| File                                                     | What it covers                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------ |
| `src/main/core/lifecycle.test.ts`                        | `expireCc` lifecycle engine (phase guard, date guard)              |
| `src/main/services/expire-cc-position.test.ts`           | Service DB interactions (leg insert, position update)              |
| `src/main/ipc/positions.test.ts`                         | `positions:expire-cc` IPC handler (payload parsing, error mapping) |
| `src/renderer/src/api/positions.test.ts`                 | `expireCc` API adapter (snake_case ↔ camelCase, error shape)       |
| `src/renderer/src/components/CcExpirationSheet.test.tsx` | Confirmation state, success state, strategic nudge, CTA            |

---

## Fixture Setup for Tests

Integration tests in `expire-cc-position.test.ts` require a position in `CC_OPEN` phase. Use the existing test helper pattern:

```typescript
// 1. createPosition → CSP_OPEN
// 2. assignCspPosition → HOLDING_SHARES
// 3. openCoveredCallPosition → CC_OPEN   (available from US-7)
// Then call expireCcPosition with expirationDateOverride
```

Look at `src/main/services/assign-csp-position.test.ts` for the `makeDb()` helper and setup pattern.

---

## Running E2E Tests

E2E tests must be run from a GUI terminal (iTerm / Terminal.app), **not** from Claude Code's shell:

```bash
pnpm test:e2e --grep "cc-expiration"
```

E2E test file: `e2e/cc-expiration.spec.ts`

Expected result: all 5 AC-driven scenarios pass.

---

## Manual Verification Checklist

1. Open the app: `pnpm dev`
2. Create a wheel → assign → open CC (set expiration to today's date or earlier)
3. Navigate to the position detail
4. Confirm "Record Expiration →" button is visible in the header (only on/after CC expiration date)
5. Click the button → sheet opens showing confirmation state
6. Verify summary rows: position, contracts, expiration date, phase transition CC_OPEN → HOLDING_SHARES, "Premium captured: +$X.XX (100%)"
7. Click "Confirm Expiration" → success state appears
8. Verify: green hero "+$X.XX premium captured (100%)", "Still Holding: 100 shares", result summary card, strategic nudge, "Sell New Covered Call on TICKER →" CTA
9. Click the CTA → sheet closes; position detail shows HOLDING_SHARES with CC form visible
