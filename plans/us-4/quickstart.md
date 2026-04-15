# Quickstart: US-4 — Close a CSP Early

## Prerequisites

No new migrations are required. The existing `migrations/001_initial_schema.sql` schema already has all columns needed (`cost_basis_snapshots.final_pnl`, `positions.closed_date`, `positions.status`).

---

## Running unit and integration tests

```bash
# From repo root — runs all Vitest tests (unit + integration)
pnpm test
```

Expected output after US-4 is complete: all tests pass, including new tests in:

- `src/main/core/lifecycle.test.ts` — `closeCsp()` test cases
- `src/main/core/costbasis.test.ts` — `calculateCspClose()` test cases
- `src/main/services/get-position.test.ts` — `getPosition()` integration tests
- `src/main/services/close-csp-position.test.ts` — `closeCspPosition()` integration tests
- `src/renderer/src/components/CloseCspForm.test.tsx` — form rendering and P&L preview tests
- `src/renderer/src/pages/PositionDetailPage.test.tsx` — page rendering with mock data

---

## Running the app

```bash
pnpm dev
```

Manual verification steps:

1. Open the app — positions list should load as before
2. Click an existing CSP_OPEN position — the detail page should display its data
3. Enter a close price and observe the P&L preview updating instantly (no API call)
4. Submit — the position should disappear from the "Active Positions" list (status = CLOSED)
5. The position phase should reflect `CSP_CLOSED_PROFIT` or `CSP_CLOSED_LOSS`

---

## Seeding a test position (if needed)

The `pnpm dev` app auto-creates `~/.config/electron/wheelbase-dev.db`. Use the UI to open a CSP:

1. Click "Open Wheel" in the sidebar
2. Create a position with ticker `AAPL`, strike `180`, premium `2.50`, contracts `1`, expiration any future date

Then navigate to the position detail to test close.

---

## Type-check and lint

```bash
pnpm typecheck   # must report 0 errors
pnpm lint        # must report 0 errors
```

---

## E2E tests

```bash
# Must run from a GUI terminal (iTerm / Terminal.app), NOT from Claude Code's shell
pnpm test:e2e
```

New E2E scenarios to add to `e2e/electron.spec.ts`:

- Navigate to a CSP_OPEN position, submit close form, verify redirect and phase change
