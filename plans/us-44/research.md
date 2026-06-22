# Research: US-44 — Persist IVR snapshots and schedule daily collection

## Migration Numbering

- **Decision:** Create the snapshot migration as `migrations/007_create_ivr_snapshot.sql`, not `008_create_ivr_snapshot.sql`.
- **Rationale:** The repo currently contains `006_add_credential_settings.sql` and `008_create_pending_assignments.sql`, with no `007` file present. The migration runner sorts filenames lexicographically and applies any unseen file, so filling the gap keeps the sequence contiguous and avoids baking the stale story note into the implementation.
- **Alternatives considered:** Keep `008` as written in the story. Rejected because `008` is already taken in the worktree, and renumbering a later migration would create unnecessary churn.

## Barchart as the Canonical IVR Source

- **Decision:** Build the collector on top of `fetchIVR` from `src/main/integrations/barchart-ivr-scraper.ts`, and persist `source = 'barchart'`.
- **Rationale:** The codebase already ships a Barchart scraper with a typed `IVRResult` union and `IVRDataSchema` whose `source` literal is `'barchart'`. The `US-44` story has already been corrected to match that implementation direction.
- **Alternatives considered:** Add an abstraction layer for multiple IVR vendors. Rejected because the story only requires one source, and no other IVR provider exists in the current app.

## Same-Day Overwrite Semantics

- **Decision:** Implement same-day overwrite as a transaction that deletes any existing `ivr_snapshot` rows for `(underlying, UTC-calendar-date(observed_at))` before inserting the fresh row.
- **Rationale:** The table primary key is `(underlying, observed_at)`, so a second run on the same day with a later timestamp will not naturally replace the earlier row. Explicit delete-then-insert matches the story requirement that the latest same-day value wins and keeps the SQL simple under SQLite.
- **Alternatives considered:** Change the primary key to `(underlying, observed_date)` or use a synthetic upsert key. Rejected because the story already fixes the table shape and downstream read paths benefit from retaining the exact observation timestamp.

## Collector-Level Throttling Boundary

- **Decision:** Enforce the 1 request/second politeness rule in `src/main/services/ivr-collector.ts`, even though `fetchIVR` already throttles internally.
- **Rationale:** The story explicitly requires the collector to own the rate limit so concurrent callers cannot bypass it. A collector-local queue or sequential loop with a sleep boundary makes batch behavior deterministic and guarantees spacing across the whole collection job.
- **Alternatives considered:** Rely only on the scraper module's module-level limiter. Rejected because separate collector invocations could still interleave in ways the story forbids.

## Active-Underlying Selection

- **Decision:** Derive collection targets from the `positions` table by selecting distinct `ticker` values where `status != 'CLOSED'`, then normalize to uppercase and de-duplicate before fetches.
- **Rationale:** The story defines the batch as "all active-position underlyings", and the existing schema already tracks `ticker`, `phase`, and `status` on `positions`. This keeps the collector independent from renderer list queries and aligned with SQLite as source of truth.
- **Alternatives considered:** Reuse `listPositions()` or inspect `phase` only. Rejected because `listPositions()` computes renderer-facing fields the collector does not need, and `status` is the clearest current marker for excluding closed wheels.

## Manual Trigger Integration

- **Decision:** Add a dedicated IVR IPC surface: main handler in `src/main/ipc/ivr.ts`, preload exposure under `window.api.ivr.collectNow()`, renderer adapter in `src/renderer/src/api/ivr.ts`, and a small mutation hook consumed by `SettingsPage`.
- **Rationale:** Existing feature areas use dedicated IPC namespaces (`assignments:*`, `settings:*`, `market-data:*`) rather than overloading unrelated handlers. A separate IVR namespace keeps `settings.ts` thin while still allowing the Settings page to host the button.
- **Alternatives considered:** Add `'ivr:collect-now'` directly inside `src/main/ipc/settings.ts` or call the scheduler from the renderer without a typed adapter. Rejected because both options blur feature boundaries and work against the existing typed preload/api pattern.

## Non-Trading-Day Guard

- **Decision:** Put the non-trading-day guard at the top of `collectIVRSnapshots`, returning an `ok` batch summary with zero successes and a skip indicator when `BrokerProvider.getMarketStatus()` reports `session: 'closed'` and the date is not a trading day.
- **Rationale:** The story requires the guard to cover both the scheduled path and manual trigger. Keeping it in the collector means the scheduler registration and the manual IPC both share one code path and one logging decision.
- **Alternatives considered:** Rely on `afterClose` scheduling alone or put the guard only in the IPC handler. Rejected because the manual trigger must also be safe on weekends and holidays.

## Settings-Page Placement

- **Decision:** Add the "Refresh IVR now" action to the existing `Market Data` section of `src/renderer/src/pages/SettingsPage.tsx` as a secondary action with inline success/error feedback.
- **Rationale:** No `US-44` mockup exists, so the safest path is to extend the existing market-data management surface rather than invent a new page or panel. The page already contains secondary actions, lightweight messages, and vendor-adjacent operational controls.
- **Alternatives considered:** Create a new settings subsection or put the trigger in the positions page. Rejected because the story explicitly names Settings and does not justify a larger navigation or layout expansion.
