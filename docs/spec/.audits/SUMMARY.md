# Spec Audit Summary — 2026-06-27

Full audit of every page under `docs/spec/` (excluding `.extracts/`, `.audits/`, and the index READMEs) against current `src/`, `migrations/`, and `e2e/`.

- **Pages audited:** 127 (11 topic/contract/schema, 29 features, 87 ADRs)
- **Clean:** 70
- **With drift and/or missing-file findings:** 57
- **The us-51 changes audited clean** — `alerts:list`, `listManagementQueue`, `ManagementQueueItem`, the new `management-queue-read-path` ADR, and `domain/alerts.md` all verified against `src/` with 0 drift.

Per-page reports live under `docs/spec/.audits/<same-path>.audit.md`.

---

## Dominant theme: Alpaca → Massive market-data migration

The single largest source of drift is the market-data layer's migration from Alpaca to the **Massive** REST/WS provider (the auditors traced it to commit `2debc14`), which post-dates the Epic-06 spec pages. ~14 pages still describe the Alpaca design (`createMarketDataProvider`/`AlpacaMarketDataProvider`/`config.provider:'alpaca'`, two-socket Alpaca streaming, msgpack framing, `broker:account-info`). These should be re-synthesised via `/update-spec` once a plan captures the migration, or hand-corrected:

- `domain/market-data.md` (7) — `marketDataFactory` not `createMarketDataProvider`; Massive URLs; `MarketDataFeed` not `DataFeed`; `STALE_THRESHOLD_MS` moved; `buildOccSymbol` in `src/shared/`
- `contracts/alpaca-integration.md` (5) — `broker:account` not `broker:account-info`; `environment:'paper'|'live'` not `paper` boolean
- `features/us-31-market-data-provider-adapter.md` (5) — adapter replaced by `MassiveMarketDataProvider`; factory renamed; interface narrowed; `alpaca-market-data.ts` absent
- `features/us-32-live-position-prices.md` (4) — preload methods namespaced under `marketData.*`/`broker.*`; `broker:market-status` not `market-data:market-status`
- `features/us-39-massive-market-data-provider.md` (3) — streaming now fully implemented (page says "deferred/throws"); `broker:account` rename; bulk `market-data:option-snapshots` retained, not deleted
- ADRs: `market-data-provider-interface` (3), `market-data-provider-lifecycle` (3), `market-data-tanstack-cache` (3), `market-status-pill` (3), `ws-package-streaming` (3), `market-data-stream-with-rest-seed` (1), `market-session-derivation` (1), `marketdataerror-structured-codes` (1), `msgpack-option-streaming` (1, describes infra absent from `src/`), `alpaca-sdk-rest-only` (1), `occ-symbol-pure-leaf` (1), `renderer-builds-occ-symbols` (1)

---

## Drift detected (57 pages)

### Topic / contract / schema (8)

- [architecture/01-overview.md](../architecture/01-overview.md) — 4 (`OpenWheelPayloadSchema`→`CreatePositionPayloadSchema`; `registerParsedPositionHandler` is private in `positions.ts`; `marketDataFactory.disconnect()`; channel list omits `positions:record-call-away`, `positions:roll-cc`, option-data channels)
- [architecture/03-design-system.md](../architecture/03-design-system.md) — 3 (`SIDEBAR_WIDTH` not exported; `e2e/design-system.spec.ts` absent; `CallAwaySheet` vs `CallAwaySuccess` tint naming)
- [contracts/alpaca-integration.md](../contracts/alpaca-integration.md) — 5 (see market-data theme)
- [contracts/zod-schemas.md](../contracts/zod-schemas.md) — 4 (`WheelStatus` has no `PAUSED`; `registerParsedPositionHandler` in `ipc/positions.ts` not `ipc/utils.ts`; `LEG_ACTION_VALUES` not exported)
- [contracts/ipc-handlers.md](../contracts/ipc-handlers.md) — 1 (documents `broker:account-info`; actual is `broker:account`)
- [schema/tables.md](../schema/tables.md) — 4 (**invented `roll_from_leg_id`/`roll_to_leg_id` columns** — only `roll_chain_id` exists; omits `legs.order_id`, `positions.account_id`, `positions.tags`; `round4` is private not a shared helper)
- [schema/migrations.md](../schema/migrations.md) — 1 (unverified renderer path `renderer/src/api/settings.ts`)
- [domain/cost-basis.md](../domain/cost-basis.md) — 5 (`CallAwayResult.sharesHeld` gone; `CcOpenBasisInput`/`RollBasisInput` now require `positionContracts`; CC formulas prorate; `sharesFromContracts`/`calculateCycleDays`/`SHARES_PER_CONTRACT` private)
- [domain/market-data.md](../domain/market-data.md) — 7 (see market-data theme)
- [domain/wheel-lifecycle.md](../domain/wheel-lifecycle.md) — 2 (`RollCspInput`/`RollCcInput` `costToClose`/`newPremium` are `string` not `number`; `LEG_ACTION_VALUES` private)

### Feature pages (16)

- [us-4-close-csp.md](../features/us-4-close-csp.md) — 1 (`cspClose`→`calculateCspClose`)
- [us-10-call-away.md](../features/us-10-call-away.md) — 1 + **broken link** (`./us-6-close-csp-early.md` → should be `./us-4-close-csp.md`)
- [us-13-roll-down-and-out.md](../features/us-13-roll-down-and-out.md) — 1 (plan-only status still **correct**; only error: cites now-deleted `plans/us-13/`)
- [us-14-roll-cc.md](../features/us-14-roll-cc.md) — 2 (no-change wording; unstated `__roll__` field)
- [us-15-roll-pair-timeline.md](../features/us-15-roll-pair-timeline.md) — 1 (color constants in `LegHistoryTable.tsx` not `rollGroups.ts`; 2 named constants don't exist; self-disclosed missing e2e)
- [us-31](../features/us-31-market-data-provider-adapter.md) — 5 · [us-32](../features/us-32-live-position-prices.md) — 4 · [us-39](../features/us-39-massive-market-data-provider.md) — 3 (market-data theme)
- [us-33-option-mid-pnl.md](../features/us-33-option-mid-pnl.md) — 3 (`buildOccSymbol` in `src/shared/`; `getOptionSnapshot` singular)
- [us-34-position-cockpit.md](../features/us-34-position-cockpit.md) — 2 + missing (`CollapsedDrawer` uses `useState`, not shadcn `Collapsible`; `ui/collapsible.tsx` absent)
- [us-35-assignment-detection.md](../features/us-35-assignment-detection.md) — 3 + missing (migration numbers wrong: `pending_assignments` is 008 not 006; no `007_create_app_settings.sql` — folded into `006_add_credential_settings.sql`; test-id is id-suffixed)
- [us-37](../features/us-37-paper-live-broker-environment-toggle.md) — 1 (e2e scenario count nit) · [us-43](../features/us-43-barchart-ivr-scraper.md) — 1 (host-spelling nit) · [us-46](../features/us-46-polling-scheduler.md) — 1 (`marketDataFactory.disconnect()`)
- [us-50-alert-engine.md](../features/us-50-alert-engine.md) — 1 (Source files: alert types live in `core/alerts.ts`, not `core/types.ts`)

### ADRs (33)

Market-data cluster listed above. Remaining notable ADR drift:

- [action-buttons-phase-gated](../architecture/02-adrs/action-buttons-phase-gated.md) — 2 (omits `Roll CC →`/`Record Call-Away →` on `CC_OPEN`; wrongly lists `Close Early →` on `CSP_OPEN`)
- [shadcn-collapsible-drawers](../architecture/02-adrs/shadcn-collapsible-drawers.md) — 1 (**contradicts impl** — uses the rejected `useState` approach; no shadcn `Collapsible`)
- [scheduler-singleton-safe-broker](../architecture/02-adrs/scheduler-singleton-safe-broker.md) — 2 (passes `getSafeBroker` uninvoked; stub `getAccountInfo` rejects, undocumented)
- [server-side-dte-and-derived-fields](../architecture/02-adrs/server-side-dte-and-derived-fields.md) — 1 (null DTE renders `—`, not `"Expired"`)
- [ipc-envelope-contract](../architecture/02-adrs/ipc-envelope-contract.md) — 1 (`TRANSITION_REJECTED` code doesn't exist; actual `NOT_PENDING|NOT_FOUND`)
- [pending-assignments-compound-unique](../architecture/02-adrs/pending-assignments-compound-unique.md) — 1 (table/index in migration **008**, not 006)
- [profit-target-nullable-column](../architecture/02-adrs/profit-target-nullable-column.md) — 1 ("no app_settings table" now false — exists from migration 006)
- [active-leg-metadata-via-positions-list](../architecture/02-adrs/active-leg-metadata-via-positions-list.md) — 1 (fields selected in list query, not via `activeLegSubquery()`)
- [event-marker-legs](../architecture/02-adrs/event-marker-legs.md) — 1 (`LegAction` now also has `EXERCISE`)
- [soft-client-side-warnings](../architecture/02-adrs/soft-client-side-warnings.md) — 1 (future-fill / zero-premium warnings not implemented)
- [client-side-pnl-preview](../architecture/02-adrs/client-side-pnl-preview.md) — 1 (`computePreview` local to `CloseCspForm.tsx`, not in `lib/`)
- [positions-list-active-closed-grouping](../architecture/02-adrs/positions-list-active-closed-grouping.md) — 1 (stale WHEEL_COMPLETE/Final-P&L copy; card is now a table)
- [consolidated-before-quit](../architecture/02-adrs/consolidated-before-quit.md) — 1 · [alert-rule-registry](../architecture/02-adrs/alert-rule-registry.md) — 1 (private const) · [tanstack-query-mutation-hooks](../architecture/02-adrs/tanstack-query-mutation-hooks.md) — 1 · [verdict-precedence-chain](../architecture/02-adrs/verdict-precedence-chain.md) — 1 · [verdict-pure-compute](../architecture/02-adrs/verdict-pure-compute.md) — 1 (fragile test count) · [wouter-hash-routing-query-prefill](../architecture/02-adrs/wouter-hash-routing-query-prefill.md) — 1 · [no-active-leg-cockpit-branch](../architecture/02-adrs/no-active-leg-cockpit-branch.md) — 1 · [park-wake-reuses-scheduletick](../architecture/02-adrs/park-wake-reuses-scheduletick.md) — 1

---

## Missing-link / missing-file findings

- **Only true broken intra-spec link:** `features/us-10-call-away.md` → `./us-6-close-csp-early.md` (does not exist; should be `./us-4-close-csp.md`).
- `features/us-34`: claims source `src/renderer/src/components/ui/collapsible.tsx` — file absent (implementation is `useState`-based).
- `features/us-35`: cites `migrations/006_create_pending_assignments.sql` and `migrations/007_create_app_settings.sql` — neither exists (actual: 008 + folded into 006).
- `features/us-13`: cites `plans/us-13/` — directory has been deleted (status claim itself is still accurate).
- `features/us-15` & `architecture/03-design-system`: reference e2e specs (`e2e/us15-roll-pair-timeline.spec.ts`, `e2e/design-system.spec.ts`) that don't exist — both self-disclosed as gaps.

No spec page links to a non-existent feature page other than the us-10 case.

---

## Clean (70 pages)

**Topic/feature (12):** domain/alerts.md, features us-2, us-5, us-6, us-7, us-8, us-9, us-11, us-12, us-16, us-17, us-44, us-47-49, us-48, **us-51**.

**ADRs (55):** active-ivr-targets-from-positions, active-leg-resolution, alert-compute-then-persist, alert-engine-pure-matches-skips, alert-evaluation-job-cadence, alert-resolution-global, alerts-partial-unique-open, append-only-cost-basis-snapshots, assignment-polling-cadence, assignment-watermark-poll-start, barchart-as-canonical-ivr-source, cockpit-component-decomposition, decimal-money-math, dedicated-ivr-ipc-surface, deeplink-in-ipc-error-envelope, dev-only-test-scheduler-ipc, dte-aware-delta-severity, error-field-naming-convention, fill-migration-gap-with-007, instrument-type-rename, ipc-channel-naming, ipc-returns-full-option-snapshot, ivr-collector-throttle-boundary, ivr-non-trading-day-guard-in-collector, ivr-same-day-overwrite-delete-then-insert, leg-history-in-cost-basis-drawer, **management-queue-read-path**, market-data-push-events, market-data-stale-detection, named-lifecycle-functions, option-data-availability, option-snapshots-rest-polling, pct-of-max-formula, pending-assignments-table-as-notification, pnl-math-in-costbasis, polling-scheduler-settimeout-chain, polling-scheduler-stateless, pure-core-engines, react-hook-form-zod, renderer-snake-case-adapter, rolls-as-linked-leg-pairs, runtime-broker-provider-refresh, rxjs-observables-for-streaming, save-verified-alpaca-service, settings-market-data-action-placement, shared-dte-helper, shared-massive-app-configuration, sheet-component-pattern, single-step-phase-transitions, spread-no-bid-renderer-predicates, standalone-service-per-operation, subsume-greeks-into-cockpit, underlying-via-stockquotes, vendor-scoped-query-keys, zod-payload-validation.

---

## Recommended next steps

1. **Market-data migration (biggest cluster).** The Alpaca→Massive switch never got a plan/extract, so `/update-spec` has nothing to regenerate from. Either author a plan capturing the migration and run `/update-spec`, or hand-correct the ~14 listed pages. This alone resolves ~36 of the findings.
2. **Quick hand-fixes (high-confidence, code-is-truth):**
   - `features/us-10`: fix the broken link to `./us-4-close-csp.md`.
   - `schema/tables.md`: remove invented `roll_*_leg_id` columns; add `order_id`/`account_id`/`tags`.
   - `features/us-35` & `pending-assignments-compound-unique`: correct migration numbers (008, folded-006).
   - `us-50` feature page: `core/types.ts` → `core/alerts.ts` for the alert types.
   - `shadcn-collapsible-drawers` ADR + `us-34`: reconcile with the `useState`-based `CollapsedDrawer`.
3. **Symbol-rename touch-ups:** `cspClose`→`calculateCspClose`, `OpenWheelPayloadSchema`→`CreatePositionPayloadSchema`, `DataFeed`→`MarketDataFeed`, and the several "exported" claims for now-private symbols.
4. **Low value / safe to leave:** e2e-count nits, host-spelling, fragile hard-coded test counts, and "unverifiable" narrative claims.
