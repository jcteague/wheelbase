# Architecture Decision Records

Each ADR captures one architectural choice that emerged from a plan/story. Decisions are grouped below by theme; many ADRs are referenced by multiple feature pages.

<!-- generated:from us-2,us-4,us-5,us-6,us-7,us-8,us-8-pct-fix,us-9,us-12,us-12-refactor,us-31,us-32,us-33,us-34,missing-ac,us-35 -->

## Engine & architecture

- [pure-core-engines](./pure-core-engines.md) — Lifecycle and cost-basis engines are pure functions with no DB/broker imports.
- [named-lifecycle-functions](./named-lifecycle-functions.md) — One named pure function per wheel-phase transition; same shape for cost basis.
- [single-step-phase-transitions](./single-step-phase-transitions.md) — No synthetic `*_PENDING` / `*_EXPIRED` intermediate phases.
- [standalone-service-per-operation](./standalone-service-per-operation.md) — One service file per mutation operation under `src/main/services/`.
- [decimal-money-math](./decimal-money-math.md) — `decimal.js` with `ROUND_HALF_UP` at 4 dp; stored as TEXT.
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

## IPC contracts

- [ipc-envelope-contract](./ipc-envelope-contract.md) — All handlers return `{ ok: true, ... } | { ok: false, errors: [...] }`; never throw.
- [ipc-channel-naming](./ipc-channel-naming.md) — `{domain}:{verb}-{noun}` channel pattern (`positions:close-csp`, `market-data:stock-quotes`, ...).
- [zod-payload-validation](./zod-payload-validation.md) — Zod schemas in `src/main/schemas.ts` validate every IPC payload at the boundary.
- [error-field-naming-convention](./error-field-naming-convention.md) — `__root__`, `__phase__`, or literal field name; canonical `code` vocabulary.
- [renderer-snake-case-adapter](./renderer-snake-case-adapter.md) — Renderer uses snake_case; adapters translate to/from IPC camelCase.

## Renderer & UI

- [sheet-component-pattern](./sheet-component-pattern.md) — Right-side portal sheets with form→success states for every mutation.
- [tanstack-query-mutation-hooks](./tanstack-query-mutation-hooks.md) — `useMutation` + invalidate `positionQueryKeys.all` on success.
- [react-hook-form-zod](./react-hook-form-zod.md) — All renderer forms use RHF + `zodResolver(schema)`; no hand-managed form state.
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

## Background polling & assignment detection

- [polling-scheduler-settimeout-chain](./polling-scheduler-settimeout-chain.md) — `PollingScheduler` uses a per-job `setTimeout` chain, not `setInterval`, so async handlers serialise naturally.
- [polling-scheduler-stateless](./polling-scheduler-stateless.md) — Scheduler is purely in-memory; handlers own their own watermarks (no `last_run_at` column).
- [assignment-watermark-poll-start](./assignment-watermark-poll-start.md) — Assignment-poll watermark is captured at the start of the poll to avoid losing activities that arrive mid-fetch.
- [pending-assignments-compound-unique](./pending-assignments-compound-unique.md) — `pending_assignments` uniqueness is compound on `(activity_id, position_id)`; one Alpaca activity can match multiple open CSPs.
- [pending-assignments-table-as-notification](./pending-assignments-table-as-notification.md) — The `pending_assignments` table IS the notification queue; no separate notification entity.
- [assignment-polling-cadence](./assignment-polling-cadence.md) — Assignment detection runs every 60 s during regular hours, 5 min in extended hours, and is parked overnight.
- [scheduler-singleton-safe-broker](./scheduler-singleton-safe-broker.md) — Scheduler is a module-level singleton wired with a safe-broker fallback when Alpaca credentials are missing.
- [dev-only-test-scheduler-ipc](./dev-only-test-scheduler-ipc.md) — Dev-only IPC channels drive the `PollingScheduler` from e2e tests without exposing them in production builds.
- [consolidated-before-quit](./consolidated-before-quit.md) — A single `before-quit` handler awaits scheduler and market-data shutdown in order.

<!-- /generated -->
