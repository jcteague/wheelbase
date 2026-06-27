---
page: docs/spec/contracts/ipc-handlers.md
audited_at: 2026-06-27
findings: 4
---

# Audit: docs/spec/contracts/ipc-handlers.md

## Verified (28)

### Position handlers — all registered in `src/main/ipc/positions.ts`

- ✓ `positions:list` — `src/main/ipc/positions.ts:48`
- ✓ `positions:get` — `src/main/ipc/positions.ts:54`
- ✓ `positions:close-csp` — registered via `registerParsedPositionHandler`, channel literal at `src/main/ipc/positions.ts:67`
- ✓ `positions:assign-csp` — `src/main/ipc/positions.ts:75`
- ✓ `positions:expire-csp` — `src/main/ipc/positions.ts:83`
- ✓ `positions:open-cc` — `src/main/ipc/positions.ts:91`
- ✓ `positions:close-cc-early` — `src/main/ipc/positions.ts:99`
- ✓ `positions:record-call-away` — `src/main/ipc/positions.ts:107`; page's registration claim (label `positions_record_call_away_unhandled_error`, schema `RecordCallAwayPayloadSchema`) confirmed at lines 108-109
- ✓ `positions:expire-cc` — inline `ipcMain.handle` at `src/main/ipc/positions.ts:113` (page documents this is the one position-mutation handler not using the shared helper; matches code)
- ✓ `positions:roll-csp` — `src/main/ipc/positions.ts:122`; label `positions_roll_csp_unhandled_error` confirmed at line 123
- ✓ `positions:roll-cc` — `src/main/ipc/positions.ts:130`; label `positions_roll_cc_unhandled_error` confirmed at line 131

### Market-data handlers — `src/main/ipc/market-data.ts`

- ✓ `market-data:stock-quotes` — `src/main/ipc/market-data.ts:29`
- ✓ `market-data:set-stock-quote-tickers` — `src/main/ipc/market-data.ts:37`
- ✓ `market-data:option-snapshots` (documented as superseded but still registered) — `src/main/ipc/market-data.ts:52`
- ✓ `market-data:option-snapshot` — `src/main/ipc/market-data.ts:59`
- ✓ `market-data:option-chain` — `src/main/ipc/market-data.ts:67`
- ✓ Push event `market-data:stock-quote` — `webContents.send` at `src/main/ipc/market-data.ts:45`
- ✓ Push event `market-data:stream-error` — `webContents.send` at `src/main/ipc/market-data.ts:46` and `:91`

### Broker handlers — `src/main/ipc/broker.ts`

- ✓ `broker:market-status` — `src/main/ipc/broker.ts:24`
- ✓ `broker:activities` — `src/main/ipc/broker.ts:16`

### Assignments handlers — `src/main/ipc/assignments.ts`

- ✓ `assignments:list-pending` — `src/main/ipc/assignments.ts:16`
- ✓ `assignments:confirm` — `src/main/ipc/assignments.ts:20`
- ✓ `assignments:dismiss` — `src/main/ipc/assignments.ts:27`
- ✓ `assignments:run-detection-now` — `src/main/ipc/assignments.ts:35`

### alerts:list (newly-added — focus of this audit)

- ✓ `alerts:list` maps to `src/main/ipc/alerts.ts:7` as instructed. Registration shape matches the page exactly: `registerAlertsHandlers({ db })` (`src/main/ipc/alerts.ts:6`), handler body `handleIpcCall('alerts_list_error', () => ({ items: listManagementQueue(db) }))` (`src/main/ipc/alerts.ts:7-8`).
- ✓ Wired into `src/main/index.ts:175` (`registerAlertsHandlers({ db })`), import at `src/main/index.ts:14` — matches page claim.
- ✓ Service `listManagementQueue(db)` exists at `src/main/services/alerts.ts:184`. The page's sort-order and JOIN claims are accurate: SQL does `FROM alerts a JOIN positions p ON p.id = a.position_id WHERE a.status = 'open'` and `ORDER BY CASE a.urgency WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END, a.triggered_at ASC` (`src/main/services/alerts.ts:185-202`).
- ✓ `alerts:list` exposed in preload (`src/preload/index.ts`) — page claim consistent with `window.api.alerts.list` wiring.

### IVR + Settings + ping

- ✓ `ivr:collect-now` — `src/main/ipc/ivr.ts:8`
- ✓ All six `settings:*` channels registered in `src/main/ipc/settings.ts:48-109` (`get-credential-status`, `save-alpaca-credentials`, `remove-alpaca-credentials`, `set-active-broker-environment`, `test-connection`, `test-stored-alpaca-connection`) — matches page.

### Dev-only scheduler handlers (NODE_ENV=test)

- ✓ `_test:scheduler-registry` — `src/main/ipc/test-scheduler.ts:46`
- ✓ `_test:scheduler-run-now` — `src/main/ipc/test-scheduler.ts:48`
- ✓ `_test:scheduler-register` — `src/main/ipc/test-scheduler.ts:52`
- ✓ `_test:scheduler-simulate-wake` — `src/main/ipc/test-scheduler.ts:72`

### Migrations / files referenced

- ✓ `migrations/003_rename_option_type_to_instrument_type.sql`, `005_add_profit_target_percent.sql`, `006_add_credential_settings.sql`, `007_create_ivr_snapshot.sql`, `008_create_pending_assignments.sql`, `009_create_alerts.sql` all exist (page references each).
- ✓ Source files cited exist: `src/main/services/list-positions.ts`, `src/main/services/active-leg-sql.ts`, `src/main/services/alerts.ts`, `src/main/integrations/alpaca-broker.ts`, `src/main/integrations/massive-market-data.ts`.

## Drift (1)

- ✗ **`broker:account-info` channel name mismatch.** The page documents the channel as `broker:account-info` (heading at line 870, plus references in the us-39 Overview at line 13 and the "Driven by" footnote at line 1322). The actual registration is `broker:account` — `src/main/ipc/broker.ts:9` (`ipcMain.handle('broker:account', …)`), and the preload invokes the same literal: `src/preload/index.ts:36` (`account: () => invoke('broker:account')`). No `broker:account-info` registration exists anywhere in `src/main/ipc/`. Suggested fix: rename the documented channel `broker:account-info` → `broker:account` throughout the page (heading, Overview note, and footnote), OR rename the handler+preload literal to `broker:account-info` if the documented name is the intended canonical one.

## Unverifiable (2)

- ? Numerous narrative claims about renderer behaviour (e.g. "the renderer's banner state machine switches on the top-level `code`", `deriveRunningBasis()` carry-forward semantics, TanStack Query `refetchInterval` cadences). These are renderer-side and behavioural; not mechanically auditable from the IPC handler registrations and out of scope for a channel-registration audit. Flag for human review only if renderer behaviour is in question.
- ? "Planned (us-13)" fields (`rollCount` on `positions:get`, the `no_change` / `must_not_be_earlier` relaxation on `positions:roll-csp`) are explicitly documented as **planned / not yet implemented**. Consistent with code (the current `positions:roll-csp` still enforces the us-12 rule); these are intentional forward-looking notes, not drift.

## Missing files (0)

- No broken source-path references found. Every `src/...` and `migrations/...` path cited and spot-checked exists. (Feature-page links under `../features/` were not exhaustively followed — out of scope for this contract audit.)

## Notes on registered-but-omitted channels

- The page does not document `broker:account` as a registered channel (it documents `broker:account-info` instead) — captured above as drift, not a separate omission.
- Registered channels intentionally omitted from the page and not flagged: `ping` (`src/main/ipc/ping.ts:4`), `test:trigger-stock-tick` / `test:trigger-stream-error` (`src/main/ipc/market-data.ts:78,89`), and `_test:ivr-set-outcomes` / `_test:ivr-snapshots` (`src/main/ipc/test-ivr.ts:9,14`). These are test/dev-only scaffolding channels consistent with the page's stated scope (it documents only `_test:scheduler-*` among dev handlers). Low value to document; noting for completeness.
