# Research: US-46 (Polling Scheduler) + US-35 (Assignment Detection & Auto-Transition)

This plan bundles US-46 with US-35 because the scheduler is the immediate prerequisite that US-35 depends on, and US-44 (IVR collector) will reuse it later.

**Hard prerequisite:** `plans/us-39/` must be implemented first. US-35 calls `BrokerProvider.getActivities` (US-40); the scheduler reads `BrokerProvider.getMarketStatus` (US-40). Without the provider split shipped, neither story has a callable surface.

---

## Existing Code That Is Affected

| File                                                             | Current role                      | Action in this plan                                                   |
| ---------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------- |
| `src/main/integrations/broker-provider.ts`                       | Interface created in US-39 plan   | **Read.** Detection service depends on `getActivities`.               |
| `src/main/integrations/alpaca-broker.ts`                         | Alpaca impl created in US-39 plan | **Read.** Real OPASN activities source.                               |
| `src/main/services/assign-csp-position.ts`                       | Existing Epic 01 service          | **Reuse.** Confirmation step calls this unchanged.                    |
| `src/main/core/option-symbol.ts`                                 | Existing OCC symbol helpers       | **Reuse.** Detection parses OCC symbols to match positions.           |
| `src/main/db/migrate.ts` + `migrations/`                         | Migration runner                  | **Add migration** `006_create_pending_assignments.sql`.               |
| `src/main/index.ts`                                              | Main process bootstrap            | **Wire** scheduler start on `app.on('ready')`, stop on `before-quit`. |
| `src/preload/index.ts`                                           | contextBridge                     | **Expose** `assignments.*` channel methods.                           |
| `src/renderer/src/api/`                                          | Renderer API hooks                | **Add** `useAssignmentsApi` and related hook.                         |
| `src/renderer/src/components/PageLayout.tsx` (or positions list) | Where banner renders              | **Mount** `AssignmentNotificationBanner` at top of position list.     |

---

## Decisions

### Scheduler primitive: setTimeout chain (US-46)

- **Decision:** Each registered job manages its own setTimeout chain. After `handler` settles, schedule the next tick with `setTimeout(..., cadenceMs)`.
- **Rationale:** `setInterval` does not respect async handlers and can stack runs if a tick takes longer than the interval. setTimeout chains naturally serialise. Plus, chain pattern composes cleanly with market-session reads (decide cadence per tick).
- **Alternatives considered:** `node-cron` — overkill, adds a dependency, weak fit for interval-with-market-awareness; rxjs `interval()` — fine but project already has rxjs; chose plain primitives to keep cognitive load low.

### Scheduler does not persist state (US-46)

- **Decision:** No `last_run_at` column or settings row. Scheduler is purely in-memory.
- **Rationale:** Any handler that cares about "what did I see last time" owns its own watermark (US-35 stores `lastPollTimestamp` in app settings). Keeps the scheduler dumb and easy to test.

### Activity watermark storage (US-35)

- **Decision:** Store `assignments_last_poll_at` in a small `app_settings` key-value table (create if not present).
- **Rationale:** The detection service needs to ask Alpaca for activities `since X` to avoid re-processing the entire history every poll. The watermark is per-environment (paper vs live separate keys).
- **Alternative:** Compute the watermark from `MAX(transaction_time)` over the `pending_assignments` table — rejected because dismissed-and-cleared assignments lose this signal.

### Deduplication via UNIQUE on activity_id (US-35)

- **Decision:** `pending_assignments.activity_id` is UNIQUE. INSERT IGNORE on conflict.
- **Rationale:** Alpaca activity IDs are stable, so the database enforces "process each activity at most once" without app-level checks.

### OCC symbol matching (US-35)

- **Decision:** Match OPASN activity symbol against `legs.option_symbol` where the parent position is `CSP_OPEN` and the leg is open.
- **Rationale:** OPASN symbol is the put that got assigned. Matching on `option_symbol` avoids ticker/strike/expiration parsing in the match query. Parsing still happens for the notification banner display.

### Notification persistence (US-35)

- **Decision:** A "pending" row in `pending_assignments` IS the notification. Renderer queries the table.
- **Rationale:** Survives app restart automatically. Confirm/dismiss are state transitions on the same row.

### Polling cadence for assignment detection (US-35)

- **Decision:** 60s during regular market hours, 5 minutes during extended hours, parked overnight (runs once on next market open).
- **Rationale:** OPASN events post overnight after expiration; the next morning's first poll catches them. Frequent during-hours polling is for same-day assignments (early-exercise corner case).
- **Open item:** Could be tightened to "once 30 minutes after market open" — defer until user feedback.

### Banner UX (US-35)

- **Decision:** One banner per pending assignment, stacked. Each has its own Confirm / Dismiss.
- **Rationale:** Bulk confirm/dismiss is out of scope per the story. Stacking keeps each decision discrete.

---

## Open Items (Not Blockers)

- **`app_settings` table** — confirm whether one already exists; if not, this plan adds a tiny migration.
- **`AssignmentNotificationBanner` styling** — defer to mockup; US-35 currently does not have a mockup file. The implementer can use the existing `AlertBox` / `StaleDataBanner` components for visual consistency.
- **Toast component for "AAPL assigned — now holding 100 shares at $180 strike"** — verify if a toast primitive exists (likely `react-hot-toast` or similar already in repo).

---

## References

- Stories: `docs/epics/06-stories/US-46-polling-scheduler.md`, `docs/epics/06-stories/US-35-assignment-detection-and-auto-transition.md`
- Existing services: `src/main/services/assign-csp-position.ts`
- Provider interfaces produced by `plans/us-39/`
