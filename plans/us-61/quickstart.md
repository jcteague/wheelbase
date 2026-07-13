# Quickstart: US-61 — Expiring-soon flags

## Prerequisites

- Deps installed (`pnpm install`).
- `better-sqlite3` built for both ABIs if you'll run e2e:
  - `npx electron-rebuild -f -w better-sqlite3` (Electron ABI)
  - `pnpm rebuild better-sqlite3` (system Node ABI — required for Vitest)
  - Run in that order. See the `better-sqlite3 ABI mismatch` memory.

No migrations, seed data, or env setup — this is a pure-renderer display change.

## Unit / component tests (Vitest)

```bash
pnpm test
```

Story-specific suites to watch:

```bash
pnpm test src/renderer/src/components/ExpiringSoonFlag.test.tsx
pnpm test src/renderer/src/components/PositionCard.test.tsx
pnpm test src/renderer/src/components/CalendarMonthGrid.test.tsx
pnpm test src/renderer/src/components/CalendarDayDetail.test.tsx
```

> Note: existing calendar test fixtures (`makeEntry`) default to `dte: 6`
> (already urgent). New negative-case assertions must override `dte` to a
> non-urgent value (e.g. `8` or `42`).

## E2E (Playwright `_electron`)

```bash
pnpm test:e2e
```

Story spec: `e2e/expiring-soon-flags.spec.ts`. It seeds positions through the
IPC bridge (`window.api.createPosition` / `assignPosition` / `openCoveredCall`)
using relative expiration offsets from `e2e/calendar-helpers.ts` (`futureDate(N)`)
so DTE lands deterministically: AAPL CSP @ 7 DTE, MSFT CC @ 4 DTE, NVDA CC @ 8
DTE, TSLA `HOLDING_SHARES` (no option).

## Post-change checklist (run in order)

```bash
pnpm test        # all pass
pnpm lint        # no errors
pnpm typecheck   # no TS errors
pnpm format      # prettier
```

## Passing criteria

- All new unit tests pass (flag renders at ≤ 7 DTE; absent at 8 DTE and for
  null DTE).
- All four e2e AC scenarios pass.
- `lint`, `typecheck`, `format` clean.
