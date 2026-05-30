# Quickstart: US-37

## Scope

This story adds the settings page, secure Alpaca credential storage, shared Massive status/test visibility, broker paper/live switching, environment badge, and scoped query invalidation.

## Test Commands

Run focused tests while implementing:

```bash
pnpm test -- src/main/services/settings.test.ts
pnpm test -- src/main/ipc/settings.test.ts
pnpm test -- src/main/integrations/market-data-factory.test.ts src/main/integrations/broker-factory.test.ts
pnpm test -- src/renderer/src/api/settings.test.ts src/renderer/src/hooks/useSettings.test.ts
pnpm test -- src/renderer/src/pages/SettingsPage.test.tsx src/renderer/src/components/EnvironmentBadge.test.tsx
pnpm test -- e2e/settings-environment.spec.ts
```

Full verification after the implementation:

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm format
```

E2E note: `pnpm test:e2e` must run from a GUI terminal for Electron.

## Manual Checks

1. Start the app with no broker env vars and a clean dev DB.
2. Open `#/settings`.
3. Verify the empty-state banner explains that Massive market data is app-provided and Alpaca is optional user setup.
4. Test Massive status with mocked app-level config and confirm there is no user key input, save, replace, or remove path.
5. Save/test Paper and Live Alpaca credentials and verify account masks are shown.
6. Switch Paper to Live and confirm the dialog copy, bullets, amber open-position warning, and gold confirm button.
7. Confirm the switch and verify `PAPER` changes to `LIVE`, broker queries refresh, and market data does not.
8. Switch back to Paper and verify no confirmation appears.
