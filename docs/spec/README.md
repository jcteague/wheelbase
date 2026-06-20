# Wheelbase Spec Wiki

This directory is a generated source-of-truth wiki for the Wheelbase application. Pages are synthesized from the per-story plan dirs under `plans/` via the `/build-spec` (initial) and `/update-spec` (incremental) skills; each page's body sits between `<!-- generated:from <plan-list> -->` markers and is re-generated when any listed plan changes. Browse by topic (architecture, domain, contracts, schema) for cross-cutting concerns, or by feature (US-N) for story-level behaviour.

<!-- generated:from us-2,us-4,us-5,us-6,us-7,us-8,us-8-pct-fix,us-9,us-10,us-11,us-12,us-12-refactor,us-13,us-14,us-15,us-16,us-17,us-31,us-32,us-33,us-34,us-35,us-37,us-39,us-43,missing-ac,design-system,extract-sheet-primitives,fix-sheet-portal-styles,frontend-perf-reuse -->

## Maintenance

- `/build-spec` — one-time full extract + synthesize across every plan dir
- `/update-spec us-N` — refresh extracts and topic pages affected by a single story's plan
- `/audit-spec` — detect drift between spec pages and current `src/`
- `/spec-search <query>` — ranked search across topic, feature, and ADR pages

Generated regions are bounded by `<!-- generated:from ... -->` / `<!-- /generated -->`. Anything outside the markers is preserved on re-generation; anything inside is overwritten.

## Architecture

- [Overview](architecture/01-overview.md) — system shape, process boundaries, key engines
- [ADRs](architecture/02-adrs/README.md) — index of architecture decision records
- [Design System](architecture/03-design-system.md) — Tailwind v4 + `wb-*` token system, shared Sheet primitives, portal-target convention, and frontend reuse rules (formatters, sub-200-line components, CSS-hover)

## Domain

- [Wheel Lifecycle](domain/wheel-lifecycle.md) — phases, valid transitions, and the lifecycle engine's rejection rules
- [Cost Basis](domain/cost-basis.md) — how `assignment_strike − premiums + roll_debits − roll_credits` is recalculated after every leg event
- [Market Data](domain/market-data.md) — live underlying prices, polling cadence, market-status pill, and adapter pattern for data providers

## Contracts

- [IPC Handlers](contracts/ipc-handlers.md) — handler catalogue, request/response envelope, Zod validation pattern
- [Alpaca Integration](contracts/alpaca-integration.md) — broker SDK isolation, read-only Phase 2/3 calls, error handling
- [Zod Schemas](contracts/zod-schemas.md) — payload validation conventions, inferred types, schema reuse across IPC and forms

## Schema

- [Tables](schema/tables.md) — consolidated table catalogue with columns, types, and relationships
- [Migrations](schema/migrations.md) — ordered migration history and the custom runner in `src/main/db/migrate.ts`

## Features

### Epic 01 — Open and track CSP

- [US-2 — Position List](features/us-2-position-list.md) — list view of every open wheel with phase, symbol, and key dates
- [US-4 — Close CSP Early](features/us-4-close-csp.md) — close an open CSP by buying back the contract before expiry
- [US-5 — Expire CSP](features/us-5-expire-csp.md) — record a CSP expiring worthless and free the cash collateral

### Epic 02 — Assignment and covered calls

- [US-6 — Record Assignment](features/us-6-record-assignment.md) — transition CSP_OPEN → HOLDING_SHARES with migration 003 schema support
- [US-7 — Open Covered Call](features/us-7-open-covered-call.md) — sell a CC against held shares and move into CC_OPEN
- [US-8 — Close CC Early](features/us-8-close-cc-early.md) — buy back a covered call before expiry (includes us-8-pct-fix percentage handling)
- [US-9 — Expire CC](features/us-9-expire-cc.md) — record a covered call expiring worthless and return to HOLDING_SHARES
- [US-10 — Record Call-Away](features/us-10-call-away.md) — shares called away at CC expiration; transitions CC_OPEN → WHEEL_COMPLETE (terminal) with final-cycle P&L
- [US-11 — Leg History](features/us-11-leg-history.md) — 8-column wheel-chain table with renderer-derived running cost basis per leg and conditional Final P&L footer

### Epic 03 — Roll positions

- [US-12 — Roll CSP](features/us-12-roll-csp.md) — close one CSP leg and open another as a linked roll pair (incorporates us-12-refactor cleanup)
- [US-13 — Roll Down and Out](features/us-13-roll-down-and-out.md) — extend the US-12 roll form to support strike changes (5-way Roll Out / Down & Out / Up & Out / Down / Up taxonomy) — **plan-only, not yet implemented**
- [US-14 — Roll CC](features/us-14-roll-cc.md) — close one CC leg and open another as a linked roll pair; mirror of US-12 for the covered-call side
- [US-15 — Roll Pair Timeline](features/us-15-roll-pair-timeline.md) — render linked ROLL_FROM/ROLL_TO pairs as grouped sections with cumulative roll summary in the leg-history table
- [US-16 — Cost Basis After Sequential Rolls](features/us-16-cost-basis-sequential-rolls.md) — fix `calculateRollBasis` for CSP different-strike rolls and `calculateAssignmentBasis` to net ROLL_FROM cost against ROLL_TO premium
- [US-17 — Reject Roll in Invalid Phase](features/us-17-reject-roll-invalid-phase.md) — comprehensive engine/service/component test coverage that rolls are rejected from every non-rollable phase

### Epic 06 — Live market data

- [US-31 — Market Data Provider Adapter](features/us-31-market-data-provider-adapter.md) — backend `MarketDataProvider` interface + `AlpacaMarketDataProvider` (REST + dual-socket streaming) + factory; foundation for all Epic 06 stories
- [US-32 — Live Position Prices](features/us-32-live-position-prices.md) — poll Alpaca for live underlying prices and surface them on position rows
- [US-33 — Option Mid + Unrealized P&L](features/us-33-option-mid-pnl.md) — `Opt Mid` and `P&L` columns on the positions list, `market-data:option-snapshots` IPC channel, gold `TARGET` badge, profit-target override column
- [US-34 — Position Cockpit](features/us-34-position-cockpit.md) — verdict-driven detail page (HOLD / WATCH / CONSIDER ROLL / ACT NOW / TARGET HIT / NO ACTIVE LEG) with delta gauge, distance thermometer, greeks strip, and collapsible drawers; subsumes original greeks-display ACs
- [US-35 — Assignment Detection & Auto-Transition](features/us-35-assignment-detection.md) — poll Alpaca for OPASN activities, surface confirm/dismiss banner on the positions list, transition to HOLDING_SHARES on confirm
- [US-37 — Paper/Live Broker Environment Toggle](features/us-37-paper-live-broker-environment-toggle.md) — encrypted Alpaca paper/live credential storage, persisted active broker environment, scoped broker-only provider refresh, separate broker badge vs market-data status, and vendor-specific degraded-state UX
- [US-39 — Massive Market Data Provider](features/us-39-massive-market-data-provider.md) — REST-based `MassiveMarketDataProvider` implementation; broker/market-data interface split; new `broker:*` IPC namespace; `market-data:option-snapshot` and `market-data:option-chain` channels replacing the old bulk snapshots endpoint
- [US-43 — IVR Scraper (Barchart)](features/us-43-barchart-ivr-scraper.md) — pure `fetchIVR(ticker)` integration module; fetches IV Rank + IV Percentile from Barchart's internal JSON API; typed discriminated union result; never throws; foundational primitive for US-44 (scheduled collection) and US-45 (UI display)
- [US-46 — Polling Scheduler](features/us-46-polling-scheduler.md) — generic market-session-aware setTimeout-chain job runner; foundation for all background poll jobs

## Gaps / not yet built

The following default topic pages are referenced by convention but have not yet been generated. They will be created when matching plans land and are extracted:

- `domain/alerts.md` — no Epic 03 alert plans extracted yet
- `glossary.md` — synthesis-heavy; terminology is currently scattered across feature pages and is a lower priority

Stories without a feature page:

- **US-1 (Open new wheel)** — plans exist at `plans/precious-wishing-boole.md` and `plans/us-1-open-new-wheel-plan.md` but are bare files, not plan dirs, and have not been extracted
- **US-3 (Position detail)** — no plan dir; gaps 1 and 2 of `missing-ac` patched the behaviour but no dedicated story-level extract exists

Bare-file plans needing a routing decision before they can be extracted: `wild-swinging-prism.md`, `witty-kindling-fairy.md`, `precious-wishing-boole.md`.

<!-- /generated -->
