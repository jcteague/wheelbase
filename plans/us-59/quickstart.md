# Quickstart: US-59 — Dismiss an alert with a record of the dismissal

## Setup

1. Ensure `better-sqlite3` is built for both targets before running tests (see
   root `CLAUDE.md` note): after `pnpm install`, run
   `npx electron-rebuild -f -w better-sqlite3` then `pnpm rebuild better-sqlite3`,
   in that order, in the same shell session.
2. No seed data or `.env` changes are required — this story adds one migration
   (`011_add_alerts_dismissal.sql`) that runs automatically via the existing
   migration runner (`src/main/db/migrate.ts`) against any fresh test DB.

## Running the tests for this story

Unit + integration (Vitest):

```bash
pnpm test -- alerts
```

This picks up:

- `src/main/services/alerts.test.ts` — `dismissAlert`, `upsertOpenAlert`
  dismissal-aware guard, `clearStaleDismissals`
- `src/main/services/evaluate-alerts.test.ts` — the persist-phase integration
  (Scenario 2 / Scenario 3 condition-clear-and-return behavior)
- `src/main/ipc/alerts.test.ts` — the `alerts:dismiss` handler and error mapping
- `src/renderer/src/components/ManagementQueueRow.test.tsx` /
  `ManagementQueue.test.tsx` — Dismiss button, inline confirm state
- `src/renderer/src/api/alerts.test.ts`, `src/renderer/src/hooks/useDismissAlert.test.ts`

E2E (Playwright, one spec per acceptance scenario):

```bash
pnpm test:e2e -- dismiss-alert
```

## Expected passing criteria

- `pnpm test` — all unit/integration tests green, including the new
  dismissal-aware upsert cases
- `pnpm test:e2e` — new `e2e/dismiss-alert.spec.ts` covers all four Gherkin
  scenarios end to end (dismiss → hidden from queue; dismissed + unchanged
  condition → stays hidden, no duplicate row; condition clears then re-triggers
  → new alert with new `triggered_at`; dismissing an already-resolved alert →
  rejected with the exact message)
- `pnpm lint`, `pnpm typecheck`, `pnpm format` — clean, per the standard
  post-change checklist
