# Quickstart: US-57 & US-58 — Global Alert Thresholds + Per-Position Overrides

## Environment setup

Nothing new is required to run the tests. The new migration (`010_add_management_window_dte_override.sql`) runs automatically on app start / test-db init via `runMigrations()`, same as every existing migration. No network, no broker credentials, no seed data beyond what each test seeds directly.

For **live manual verification** only (optional):

1. `pnpm dev`, open Settings, change the global profit target / management window, save, confirm the banner and that an existing position without overrides picks up the new values on the next alert-evaluation tick (60 s while the market is open).
2. Open a position detail page, enable custom alerts, set an override, save, confirm the badge/label changes and the position's alerts use the override on the next tick.

> If `pnpm test` was run before `pnpm dev` in the same checkout, remember the better-sqlite3 double-build: `npx electron-rebuild -f -w better-sqlite3` first, then `pnpm rebuild better-sqlite3`.

## Running the tests for this story

```bash
# Everything (required green before done)
pnpm test

# Story-focused, while developing:
pnpm vitest run src/main/core/profit-target.test.ts            # resolveProfitTarget default-param behavior
pnpm vitest run src/main/core/alerts.test.ts                    # resolved-thresholds resolution, per-position override behavior
pnpm vitest run src/main/services/alert-defaults.test.ts        # global defaults get/save + bounds validation
pnpm vitest run src/main/services/save-position-alert-overrides.test.ts  # per-position save/clear + bounds validation
pnpm vitest run src/main/ipc/settings.test.ts                   # get/save-alert-defaults IPC wiring + error envelope
pnpm vitest run src/main/ipc/positions.test.ts                  # save-alert-overrides IPC wiring + error envelope
pnpm vitest run src/main/services/evaluate-alerts.test.ts       # service wiring: per-position override column, global defaults threading
pnpm vitest run src/main/services/evaluate-alerts.e2e.test.ts   # AC-driven scenarios (US-57 + US-58 describe blocks)
pnpm vitest run src/renderer/src/pages/SettingsPage.test.tsx    # global alert-defaults form
pnpm vitest run src/renderer/src/pages/PositionDetailContent.test.tsx  # per-position override form
```

## Post-change checklist (per CLAUDE.md, after every change)

```bash
pnpm test && pnpm lint && pnpm typecheck && pnpm format
```

## Passing criteria

- All four US-57 Gherkin scenarios and all four US-58 Gherkin scenarios pass as named e2e tests (one test per scenario, no lumping).
- Existing US-50/52/53-56 alert-engine suites keep passing unmodified — the `AlertEvaluationInput` extension is additive (`managementWindowDteOverride`, `profitTargetPercentDefault`), and `resolveProfitTarget`'s new second parameter is optional with a default-preserving fallback.
- Saving global defaults never mutates any `positions` row; saving/clearing a per-position override never mutates `app_settings`.
- `pnpm lint` and `pnpm typecheck` clean.
