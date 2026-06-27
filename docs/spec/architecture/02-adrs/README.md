# Architecture Decision Records

Each ADR captures one architectural choice that emerged from a plan/story. Decisions are grouped below by theme; many ADRs are referenced by multiple feature pages.

<!-- generated:from us-2,us-4,us-5,us-6,us-7,us-8,us-8-pct-fix,us-9,us-12,us-12-refactor,us-31,us-32,us-33,us-34,us-35,us-37,us-44,us-50,missing-ac -->

## Engine & architecture

- [pure-core-engines](./pure-core-engines.md) — Lifecycle and cost-basis engines are pure functions with no DB/broker imports.
- [named-lifecycle-functions](./named-lifecycle-functions.md) — One named pure function per wheel-phase transition; same shape for cost basis.
- [single-step-phase-transitions](./single-step-phase-transitions.md) — No synthetic `*_PENDING` / `*_EXPIRED` intermediate phases.
- [standalone-service-per-operation](./standalone-service-per-operation.md) — One service file per mutation operation under `src/main/services/`.
- [save-verified-alpaca-service](./save-verified-alpaca-service.md) — Test-then-save orchestration for Alpaca credentials lives in its own service, not in the IPC handler.
- [decimal-money-math](./decimal-money-math.md) — `decimal.js` with `ROUND_HALF_UP` at 4 dp; stored as TEXT.
- [runtime-broker-provider-refresh](./runtime-broker-provider-refresh.md) — Broker settings changes recreate only broker state at runtime; market data stays untouched.
- [occ-symbol-pure-leaf](./occ-symbol-pure-leaf.md) — Build OCC symbols in a pure `src/main/core/option-symbol.ts` leaf; no `contract_id` column.
- [pnl-math-in-costbasis](./pnl-math-in-costbasis.md) — `computeUnrealizedPnl` lives in `costbasis.ts`; 4 dp decimal strings; pnlPercent on 0–100 scale.
- [spread-no-bid-renderer-predicates](./spread-no-bid-renderer-predicates.md) — `isWideSpread` and `hasNoBid` as pure renderer predicates.
- [verdict-pure-compute](./verdict-pure-compute.md) — Verdict routing as a pure function in `src/renderer/src/lib/verdict.ts`.
- [verdict-precedence-chain](./verdict-precedence-chain.md) — Six-rule first-match-wins precedence chain.
- [dte-aware-delta-severity](./dte-aware-delta-severity.md) — Delta-severity thresholds drop by 0.05 when DTE ≤ 7; gauge appends `· TIGHT`.

## Persistence & data model

- [append-only-cost-basis-snapshots](./append-only-cost-basis-snapshots.md) — Snapshots are inserted, never mutated; CC close/expire don't write one.
- [rolls-as-linked-leg-pairs](./rolls-as-linked-leg-pairs.md) — Rolls record ROLL_FROM + ROLL_TO legs sharing a `roll_chain_id`; original leg never mutated.
- [event-marker-legs](./event-marker-legs.md) — EXPIRE and ASSIGN legs are audit markers; `fill_price = NULL`, `activeLeg = null` for HOLDING_SHARES.
- [instrument-type-rename](./instrument-type-rename.md) — `OptionType` → `InstrumentType` adding `STOCK`; migration 003.
- [active-leg-resolution](./active-leg-resolution.md) — Phase-aware `activeLegSubquery()` shared by list and detail queries.
- [profit-target-nullable-column](./profit-target-nullable-column.md) — Nullable `profit_target_percent` column + hard-coded default constant.
- [active-leg-metadata-via-positions-list](./active-leg-metadata-via-positions-list.md) — `PositionListItem` extended with active-leg metadata via the existing subquery.
- [shared-massive-app-configuration](./shared-massive-app-configuration.md) — Massive credentials stay in shared app configuration; settings store Alpaca only.
- [fill-migration-gap-with-007](./fill-migration-gap-with-007.md) — Use migration `007_create_ivr_snapshot.sql` to fill the open numbering gap between `006` and `008`.
- [ivr-same-day-overwrite-delete-then-insert](./ivr-same-day-overwrite-delete-then-insert.md) — Same-day IVR refreshes delete the prior UTC-day row, then insert the fresh snapshot.
- [active-ivr-targets-from-positions](./active-ivr-targets-from-positions.md) — IVR collection targets come from distinct active `positions.ticker` values, not renderer list projections.

## IPC contracts

- [ipc-envelope-contract](./ipc-envelope-contract.md) — All handlers return `{ ok: true, ... } | { ok: false, errors: [...] }`; never throw.
- [deeplink-in-ipc-error-envelope](./deeplink-in-ipc-error-envelope.md) — `deeplink` as a top-level field on broker auth-failed error envelopes (US-47).
- [ipc-channel-naming](./ipc-channel-naming.md) — `{domain}:{verb}-{noun}` channel pattern (`positions:close-csp`, `market-data:stock-quotes`, ...).
- [zod-payload-validation](./zod-payload-validation.md) — Zod schemas in `src/main/schemas.ts` validate every IPC payload at the boundary.
- [error-field-naming-convention](./error-field-naming-convention.md) — `__root__`, `__phase__`, or literal field name; canonical `code` vocabulary.
- [renderer-snake-case-adapter](./renderer-snake-case-adapter.md) — Renderer uses snake_case; adapters translate to/from IPC camelCase.
- [dedicated-ivr-ipc-surface](./dedicated-ivr-ipc-surface.md) — Manual IVR collection lives on a dedicated `ivr:*` IPC namespace instead of `settings:*`.

## Renderer & UI

- [sheet-component-pattern](./sheet-component-pattern.md) — Right-side portal sheets with form→success states for every mutation.
- [tanstack-query-mutation-hooks](./tanstack-query-mutation-hooks.md) — `useMutation` + invalidate `positionQueryKeys.all` on success.
- [react-hook-form-zod](./react-hook-form-zod.md) — All renderer forms use RHF + `zodResolver(schema)`; no hand-managed form state.
- [vendor-scoped-query-keys](./vendor-scoped-query-keys.md) — Broker and market queries use distinct prefixes so settings invalidation stays vendor-scoped.
- [client-side-pnl-preview](./client-side-pnl-preview.md) — Form previews compute locally with `decimal.js`; no IPC round-trip.
- [pct-of-max-formula](./pct-of-max-formula.md) — `(openPremium − closePrice) / openPremium × 100` ("% of max captured") for CC close.
- [action-buttons-phase-gated](./action-buttons-phase-gated.md) — UI hides mutation buttons when phase (and DTE) don't permit the action.
- [soft-client-side-warnings](./soft-client-side-warnings.md) — Future-date / zero-premium / cost-basis-guardrail warnings are non-blocking; backend doesn't reject.
- [wouter-hash-routing-query-prefill](./wouter-hash-routing-query-prefill.md) — `wouter` with `useHashLocation` for Electron; query string for cross-page pre-fill.
- [positions-list-active-closed-grouping](./positions-list-active-closed-grouping.md) — Active and Closed sections on the list page; opacity for closed.
- [server-side-dte-and-derived-fields](./server-side-dte-and-derived-fields.md) — DTE, sort order, and derived fields computed server-side; `null` for no-active-option.
- [subsume-greeks-into-cockpit](./subsume-greeks-into-cockpit.md) — Original Greeks-panel story superseded by the Position Cockpit.
- [underlying-via-stockquotes](./underlying-via-stockquotes.md) — Underlying price sourced via `useStockQuotes`, not `OptionSnapshot`.
- [shadcn-collapsible-drawers](./shadcn-collapsible-drawers.md) — Cockpit drawers wrap the shadcn `Collapsible` primitive.
- [leg-history-in-cost-basis-drawer](./leg-history-in-cost-basis-drawer.md) — Leg-history table lives inside the cockpit's cost-basis drawer.
- [no-active-leg-cockpit-branch](./no-active-leg-cockpit-branch.md) — No-active-leg branch renders verdict + cost-basis drawer only.
- [cockpit-component-decomposition](./cockpit-component-decomposition.md) — Eight files under `position-cockpit/`; one per cockpit part.
- [settings-market-data-action-placement](./settings-market-data-action-placement.md) — "Refresh IVR now" extends the Settings page Market Data section with inline feedback instead of a new page/panel.

## Market data

- [market-data-stream-with-rest-seed](./market-data-stream-with-rest-seed.md) — Stream-first with one-shot REST seed for `prevClose`.
- [market-data-provider-lifecycle](./market-data-provider-lifecycle.md) — Singleton provider, connect-on-demand, disconnect on `before-quit`.
- [market-data-push-events](./market-data-push-events.md) — Two push channels: `market-data:stock-quote` (tick) and `market-data:stream-error`.
- [market-data-tanstack-cache](./market-data-tanstack-cache.md) — Single TanStack Query cache merges REST seeds and stream ticks via `setQueryData`.
- [market-status-pill](./market-status-pill.md) — LIVE/EXT/CLOSED/DELAYED pill polled at 60 s; `deriveMarketStatusDisplay` is pure.
- [market-data-stale-detection](./market-data-stale-detection.md) — `Date.now() - dataUpdatedAt > 5 min` → DELAYED banner + pill override.
- [alpaca-sdk-rest-only](./alpaca-sdk-rest-only.md) — Alpaca SDK for working REST endpoints; bypassed entirely for streaming.
- [ws-package-streaming](./ws-package-streaming.md) — Raw `ws` package; two dedicated sockets (stock JSON / option MessagePack).
- [rxjs-observables-for-streaming](./rxjs-observables-for-streaming.md) — `stream()` returns RxJS `Observable<StreamEvent<…>>`; REST stays on Promises.
- [msgpack-option-streaming](./msgpack-option-streaming.md) — `@msgpack/msgpack` `decodeMulti()` for Alpaca option frames.
- [marketdataerror-structured-codes](./marketdataerror-structured-codes.md) — `MarketDataError` with discriminating `code`; thrown not returned.
- [market-session-derivation](./market-session-derivation.md) — `session` derived client-side from clock + calendar.
- [option-data-availability](./option-data-availability.md) — Greeks/IV REST-only; `openInterest`/`volume` always null from Alpaca.
- [market-data-provider-interface](./market-data-provider-interface.md) — Provider-agnostic interface + `createMarketDataProvider` factory.
- [option-snapshots-rest-polling](./option-snapshots-rest-polling.md) — REST polling at 60 s, disabled when market closed; no stream bridge.
- [renderer-builds-occ-symbols](./renderer-builds-occ-symbols.md) — Renderer builds OCC symbols from active legs; no server-side building.
- [ipc-returns-full-option-snapshot](./ipc-returns-full-option-snapshot.md) — `market-data:option-snapshots` returns the full `OptionSnapshot` shape.
- [barchart-as-canonical-ivr-source](./barchart-as-canonical-ivr-source.md) — IVR collection builds on the existing Barchart scraper and persists `source='barchart'`.
- [ivr-collector-throttle-boundary](./ivr-collector-throttle-boundary.md) — The IVR collector enforces the 1 request/second batch throttle, even though the scraper also rate-limits.

## Background polling & assignment detection

- [polling-scheduler-settimeout-chain](./polling-scheduler-settimeout-chain.md) — PollingScheduler uses a setTimeout chain, not setInterval.
- [polling-scheduler-stateless](./polling-scheduler-stateless.md) — Scheduler keeps no persisted state; handlers own their own watermarks.
- [assignment-polling-cadence](./assignment-polling-cadence.md) — 60s regular, 5min extended, parked overnight; first poll on next market open.
- [assignment-watermark-poll-start](./assignment-watermark-poll-start.md) — Stamp `assignments_last_poll_at` at the start of the poll to avoid the read-then-update race.
- [pending-assignments-table-as-notification](./pending-assignments-table-as-notification.md) — A pending row in `pending_assignments` IS the renderer notification; survives restart.
- [pending-assignments-compound-unique](./pending-assignments-compound-unique.md) — Compound `UNIQUE(activity_id, position_id)` so one OPASN can fan out across colliding CSPs.
- [scheduler-singleton-safe-broker](./scheduler-singleton-safe-broker.md) — Module-level singleton scheduler with a safe-broker stub when credentials are missing.
- [park-wake-reuses-scheduletick](./park-wake-reuses-scheduletick.md) — Park-wake timer reuses `scheduleTick`; stale `nextOpen` falls back to `marketOpenMs` (US-49).
- [consolidated-before-quit](./consolidated-before-quit.md) — Single `before-quit` handler awaits scheduler + market-data shutdown concurrently.
- [dev-only-test-scheduler-ipc](./dev-only-test-scheduler-ipc.md) — `_test:scheduler-*` channels guarded by `NODE_ENV === 'test'` for e2e introspection.
- [ivr-non-trading-day-guard-in-collector](./ivr-non-trading-day-guard-in-collector.md) — The collector owns the weekend/holiday guard so scheduled and manual runs share one skip path.
- [alert-evaluation-job-cadence](./alert-evaluation-job-cadence.md) — `alert-evaluation` reuses the US-46 scheduler with a 60 s / 5 min interval cadence; parked overnight; not broker-gated.

## Management alerts

- [alert-engine-pure-matches-skips](./alert-engine-pure-matches-skips.md) — `evaluatePosition` is a pure function returning `{ matches, skipped }`; missing data is skipped, never thrown; the service logs skips.
- [alert-rule-registry](./alert-rule-registry.md) — Rules are an ordered open/closed registry; precedence via exclusive DTE ranges; management-window threshold as a defaulted parameter.
- [alert-compute-then-persist](./alert-compute-then-persist.md) — Compute all matches/skips outside any transaction, then upsert + resolve in one `db.transaction`; no partial writes.
- [alert-resolution-global](./alert-resolution-global.md) — Every open alert not re-matched this run resolves, including alerts for now-unevaluable (closed) positions.
- [alerts-partial-unique-open](./alerts-partial-unique-open.md) — Partial unique index `(position_id, rule_code) WHERE status='open'` allows one open alert per pair plus historical resolved rows.
- [shared-dte-helper](./shared-dte-helper.md) — `computeDte` extracted into a pure `src/main/core/dte.ts` shared by the positions list and the alert engine.

<!-- /generated -->
