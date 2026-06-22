# Quickstart: US-44 — Persist IVR snapshots and schedule daily collection

## Preconditions

1. Ensure dependencies are installed for this worktree.
2. If Vitest reports a `better-sqlite3` ABI mismatch, rebuild in this order:

```bash
npx electron-rebuild -f -w better-sqlite3
pnpm rebuild better-sqlite3
```

## Targeted Tests for This Story

Run the focused suite as each implementation area lands:

```bash
pnpm test src/main/db/migrate.test.ts
pnpm test src/main/services/ivr-collector.test.ts
pnpm test src/main/ipc/ivr.test.ts
pnpm test src/main/index.test.ts
pnpm test src/renderer/src/api/ivr.test.ts
pnpm test src/renderer/src/pages/SettingsPage.test.tsx
pnpm exec vitest run --config vitest.e2e.config.ts e2e/ivr-collector.spec.ts
```

Notes:

- `src/main/services/ivr-collector.test.ts`, `src/main/ipc/ivr.test.ts`, `src/renderer/src/api/ivr.test.ts`, and `e2e/ivr-collector.spec.ts` do not exist yet; `US-44` creates them.
- The e2e spec should rely on the existing test-only scheduler IPC (`_test:scheduler-*`) and mock environment hooks rather than real Barchart traffic.

## Full Verification Before Marking the Story Done

Run the repo-standard checks in order:

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm format
```

Passing criteria:

- The migration suite applies the new `ivr_snapshot` table successfully.
- The collector tests prove: non-trading-day skip, distinct-active-underlying targeting, 1-second spacing, same-day overwrite, continue-on-error, and not-available logging.
- The IPC/renderer tests prove `SettingsPage` can trigger the batch and display the returned summary.
- The e2e test proves the registered scheduler job and manual Settings trigger are wired end-to-end without live network dependencies.

## Local Manual Smoke Check

After tests pass, run the app locally:

```bash
pnpm dev
```

Then verify:

1. Open `#/settings`.
2. Click `Refresh IVR now`.
3. Confirm the page renders a success or skip message rather than hanging.
4. If running with mocked market-open conditions, confirm the main-process logs include the IVR collection job and per-ticker outcome logs.
