---
story: us-51
kind: feature
parent: null
topics: [alerts, dashboard]
status: planned
---

# Implementation Plan: US-51 — Display management queue on dashboard ordered by urgency tier

## Summary

Surface US-50's persisted open alerts as a prioritized "management queue" at the
top of the dashboard. A new enriched, sorted read path (`listManagementQueue`)
joins `alerts` to `positions`, is exposed through a new `alerts:list` IPC channel
and TanStack Query hook, and renders as a `SectionCard`-wrapped queue above the
positions grid — each row showing ticker, phase badge, trigger summary, an
urgency pill, and a "Review position" action that navigates to the position
detail page. Done state: the queue appears above positions sorted high→medium→low,
each row is actionable, and an empty state shows when no alerts are open.

## Supporting Documents

Read these before starting implementation — they contain the decisions, data model, and API contract:

- **User Story & Acceptance Criteria:** `docs/epics/07-stories/US-51-management-queue-dashboard.md`
- **Mockup:** `mockups/us-51-management-queue-dashboard.mdx`
- **Research & Design Decisions:** `plans/us-51/research.md`
- **Data Model & Selection Logic:** `plans/us-51/data-model.md`
- **API Contract:** `plans/us-51/contracts/alerts-list.md`
- **Quickstart & Verification:** `plans/us-51/quickstart.md`

## Prerequisites

US-50 already shipped everything the backend needs: the `alerts` table
(`migrations/009_create_alerts.sql` with `idx_alerts_status_urgency`), the alert
engine, the persistence primitives in `src/main/services/alerts.ts`
(`listOpenAlerts`, `upsertOpenAlert`, `resolveAlertsNotIn`), the
`AlertRecord`/`AlertUrgency`/`AlertStatus` types in `src/main/schemas.ts`, and
the scheduled `alert-evaluation` job. **No new migration or engine work is
required.** US-51 adds only a read path, an IPC surface, and dashboard UI.

## Implementation Areas

### 1. Management-queue service (`listManagementQueue`)

**Files to create or modify:**

- `src/main/schemas.ts` — add the `ManagementQueueItem` interface (see
  `data-model.md`): `alertId`, `positionId`, `ticker`, `phase` (`WheelPhase`),
  `urgency` (`AlertUrgency`), `summary`, `quickAction`, `triggeredAt`.
- `src/main/services/alerts.ts` — add `listManagementQueue(db)` plus its
  internal joined-row type and snake→camel mapper.
- `src/main/services/alerts.test.ts` — add a `listManagementQueue` describe block.

**Red — tests to write (in `src/main/services/alerts.test.ts`):**

- "returns open alerts joined with ticker and phase from positions": seed two
  positions and an open alert for each; assert each returned item carries the
  position's `ticker` and `phase` plus the alert's `summary`/`quickAction`/
  `urgency`/`triggeredAt` and `alertId`/`positionId`.
- "orders by urgency tier high → medium → low": seed three open alerts (low,
  high, medium in insertion order) for distinct positions; assert the returned
  order is high, medium, low.
- "breaks urgency ties by triggered_at ascending": seed two `medium` alerts with
  different `triggered_at`; assert the earlier `triggered_at` comes first.
- "excludes non-open alerts": seed one `open`, one `resolved`, one `dismissed`
  alert; assert only the `open` one is returned.
- "returns an empty array when there are no open alerts": assert `[]`.

**Green — implementation:**

- Add the `ManagementQueueItem` interface to `src/main/schemas.ts` near the
  existing `AlertRecord` block, reusing the exported `WheelPhase` and
  `AlertUrgency` types.
- Implement `listManagementQueue(db: Database.Database): ManagementQueueItem[]`
  in `src/main/services/alerts.ts` using the exact query in `data-model.md`
  (JOIN `alerts a` → `positions p`, `WHERE a.status = 'open'`, `ORDER BY` the
  urgency `CASE` rank then `a.triggered_at ASC`). Map joined rows to
  `ManagementQueueItem` with a dedicated mapper (mirroring `mapAlertRow`). Add a
  DEBUG `count` log on completion (service layer may log; engines may not).

**Refactor — cleanup to consider:**

- Keep the urgency-rank `CASE` readable; if it recurs later, factor a named SQL
  fragment. Check naming consistency with `listOpenAlerts`. Check for duplication
  and naming consistency.

**Acceptance criteria covered:**

- "Queue appears above the position cards ordered by urgency then time" — the
  ordering and enrichment that the UI depends on.
- "Queue item shows the key fields traders need to act" — provides `ticker`,
  `phase`, `summary`, `quickAction`.

---

### 2. `alerts:list` IPC handler

**Files to create or modify:**

- `src/main/ipc/alerts.ts` — new file exporting `registerAlertsHandlers({ db })`.
- `src/main/ipc/alerts.test.ts` — new handler test.
- `src/main/index.ts` — import and call `registerAlertsHandlers({ db })` alongside
  the other `register*Handlers` calls.

**Red — tests to write (in `src/main/ipc/alerts.test.ts`):**

- "alerts:list returns { ok: true, items } sorted for the queue": register the
  handler against a test DB seeded with open alerts; invoke the registered
  channel handler; assert `result.ok === true` and `result.items` is the sorted
  `ManagementQueueItem[]`.
- "alerts:list returns an internal_error envelope when the query throws": stub
  the service/db to throw; assert
  `{ ok: false, errors: [{ field: '__root__', code: 'internal_error', ... }] }`.

**Green — implementation:**

- In `src/main/ipc/alerts.ts`, register
  `ipcMain.handle('alerts:list', () => handleIpcCall('alerts_list_error', () => ({ items: listManagementQueue(db) })))`,
  following `src/main/ipc/assignments.ts` (the `assignments:list-pending`
  shape). No Zod schema — there is no request payload.
- Wire `registerAlertsHandlers({ db })` into `src/main/index.ts` with the other
  handler registrations.

**Refactor — cleanup to consider:**

- Confirm the handler stays thin (single service call inside `handleIpcCall`, no
  branching). Check for duplication and naming consistency.

**Acceptance criteria covered:**

- All scenarios — this is the channel the renderer reads the queue from.

---

### 3. Preload bridge + typing

**Files to create or modify:**

- `src/preload/index.ts` — add `alerts: { list: () => invoke('alerts:list') }`
  to the `api` object.
- `src/preload/index.d.ts` — add a `ManagementQueueItem` interface and an
  `alerts: { list: () => Promise<{ ok: true; items: ManagementQueueItem[] } | { ok: false; errors: Array<{ field: string; code: string; message: string }> }> }`
  entry under `interface Window { api: { … } }`.

**Red — tests to write:**

- No dedicated unit test (preload is a thin bridge with no logic). Coverage comes
  from the renderer adapter test (Area 4) and the E2E (Area 7). State this
  explicitly so the absence is intentional.

**Green — implementation:**

- Add the `api.alerts.list` method and the matching `window.api.alerts.list`
  type, mirroring the existing `assignments` block in both files.

**Refactor — cleanup to consider:**

- Ensure the `ManagementQueueItem` shape in `index.d.ts` matches `schemas.ts`
  field-for-field. Check for duplication and naming consistency.

**Acceptance criteria covered:**

- All scenarios — exposes the channel to the renderer.

---

### 4. Renderer adapter + query hook

**Files to create or modify:**

- `src/renderer/src/api/alerts.ts` — new adapter: `ManagementQueueItem` type
  (re-export/local mirror) and `listManagementQueue(): Promise<ManagementQueueItem[]>`.
- `src/renderer/src/hooks/useManagementQueue.ts` — new TanStack Query hook.
- `src/renderer/src/api/alerts.test.ts` — adapter test.

**Red — tests to write (in `src/renderer/src/api/alerts.test.ts`):**

- "maps a successful response to the items array": stub `window.api.alerts.list`
  to resolve `{ ok: true, items: [...] }`; assert `listManagementQueue()`
  resolves to that array.
- "returns an empty array when the call fails": stub `{ ok: false, errors: [...] }`;
  assert `listManagementQueue()` resolves to `[]`.

**Green — implementation:**

- Implement `listManagementQueue()` in `src/renderer/src/api/alerts.ts`
  following `src/renderer/src/api/assignments.ts` (read `window.api.alerts.list()`,
  return `result.ok ? result.items : []`).
- Implement `useManagementQueue()` in `src/renderer/src/hooks/useManagementQueue.ts`
  with `useQuery({ queryKey: ['alerts','queue'] as const, queryFn: listManagementQueue, refetchInterval: 30_000 })`,
  mirroring `usePendingAssignments`.

**Refactor — cleanup to consider:**

- Consider a small `alertQueryKeys` object if a second alert query appears; for
  now an inline key is fine. Check for duplication and naming consistency.

**Acceptance criteria covered:**

- All scenarios — supplies the queue data to the UI.

---

### 5. Queue UI components (`UrgencyPill`, `ManagementQueueRow`, `ManagementQueue`)

**Files to create or modify:**

- `src/renderer/src/components/UrgencyPill.tsx` — new.
- `src/renderer/src/components/ManagementQueueRow.tsx` — new.
- `src/renderer/src/components/ManagementQueue.tsx` — new.
- `src/renderer/src/components/UrgencyPill.test.tsx`,
  `ManagementQueueRow.test.tsx`, `ManagementQueue.test.tsx` — new.

**Red — tests to write:**

- `UrgencyPill.test.tsx`:
  - "renders HIGH with red urgency tokens" / "MED with gold" / "LOW with blue" —
    assert the rendered label text (HIGH/MED/LOW) and that the element carries the
    expected `wb-*` token classes (`text-wb-red`/`bg-wb-red-dim`, gold, blue).
- `ManagementQueueRow.test.tsx`:
  - "renders ticker, urgency pill, phase badge, summary, and action button":
    given a `ManagementQueueItem`, assert the ticker text, the `UrgencyPill`, a
    `PhaseBadge` for the phase, the verbatim `summary`, and a button whose label
    equals `item.quickAction`.
  - "navigates to the position detail route when the action is clicked": click
    the button; assert `window.location.hash` becomes `/positions/${positionId}`.
- `ManagementQueue.test.tsx` (mock `useManagementQueue`):
  - "renders one row per open alert in returned order": mock three items
    (high, medium, low); assert three rows in that DOM order.
  - "renders the empty state with no action buttons when there are no alerts":
    mock `[]`; assert the text "No positions need attention right now" is present
    and no "Review position" button exists.

**Green — implementation (drive directly from `mockups/us-51-management-queue-dashboard.mdx`):**

- `UrgencyPill` — small rounded pill, uppercase label. Map
  `high → HIGH` (red: `text-wb-red bg-wb-red-dim`), `medium → MED`
  (gold: `text-wb-gold bg-wb-gold-dim`), `low → LOW` (blue:
  `text-wb-blue bg-wb-blue-dim`). Tailwind `wb-*` tokens only — no inline color
  styles (per project rule). Matches the mockup's `UrgencyPill` (red/gold/blue
  tinted pills).
- `ManagementQueueRow` — one row matching the mockup's `QueueCard` grid: a left
  cell with the **ticker** (bold) stacked over the `UrgencyPill`; the
  `PhaseBadge` (`variant="short"` → "CSP Open"/"CC Open", matching the mockup's
  phase pill); the **summary** text; and a right-aligned action **button**
  labeled with `item.quickAction` ("Review position"). On click, navigate via
  `window.location.hash = `/positions/${item.positionId}``(same pattern as`PositionCard`). Use the gold-accented button treatment from the mockup
(`bg-wb-gold-dim`/`text-wb-gold`/`border-wb-gold-border`).
- `ManagementQueue` — wrap in `SectionCard` with header "Management Queue".
  Reproduce the mockup's queue header: an eyebrow "MANAGEMENT QUEUE" + title
  "What Needs Attention First" on the left, and a right-side count
  (`${n} open alerts`, or "All clear" when empty). Calls `useManagementQueue()`;
  renders a `ManagementQueueRow` per item; when the list is empty, renders the
  mockup's empty state — primary line "No positions need attention right now"
  plus the secondary explanatory line — and **no** action buttons. Use mono
  numeric/label text via `font-wb-mono` as in the mockup.

**Refactor — cleanup to consider:**

- Factor the urgency→token mapping into a single record in `UrgencyPill`. Ensure
  no inline `style` color/spacing leaked in from the mockup (tokens only). Check
  for duplication and naming consistency.

**Acceptance criteria covered:**

- "Queue item shows the key fields traders need to act" (ticker, phase badge,
  trigger summary, "Review position" button).
- "Queue item opens the related position from the quick action".
- "Empty state renders when there are no open alerts" (message + no buttons).

---

### 6. Mount the queue on the dashboard

**Files to create or modify:**

- `src/renderer/src/pages/PositionsListPage.tsx` — render `<ManagementQueue />`
  immediately after `AssignmentNotificationBanner` and above the `Active`
  section / positions grid.
- `src/renderer/src/pages/PositionsListPage.test.tsx` — add coverage (mock
  `useManagementQueue` alongside the other hook mocks).

**Red — tests to write (in `PositionsListPage.test.tsx`):**

- "renders the management queue above the positions grid": mock
  `useManagementQueue` to return one item and `usePositions` to return active
  positions; assert the management queue heading appears before the "Active"
  section header / position rows in document order.
- "renders the management queue even when there are no positions": mock
  `usePositions` empty and `useManagementQueue` empty; assert the queue's empty
  state still renders.

**Green — implementation:**

- Import and mount `<ManagementQueue />` in `PositionsListPage` right after
  `<AssignmentNotificationBanner />` (line ~206), before the loading/active
  blocks, so it sits above the positions grid regardless of position-query state.
- Add `vi.mock('../hooks/useManagementQueue')` with a default return to the
  test's `beforeEach`, matching the existing hook-mock pattern in the file.

**Refactor — cleanup to consider:**

- Confirm the queue does not duplicate the page's loading/error handling (it owns
  its own state). Check for duplication and naming consistency.

**Acceptance criteria covered:**

- "Queue appears above the position cards ordered by urgency then time" (placement).

---

### 7. E2e Tests

**Files to create or modify:**

- `e2e/management-queue.spec.ts` — new Playwright/`_electron` spec following the
  patterns in `e2e/` (`csp-flow.spec.ts`, `assignment-detection.spec.ts`):
  launch with a fresh `WHEELBASE_DB_PATH`, `FAKE_MARKET_DATA=true`,
  `FAKE_BROKER=true`; seed positions at known DTEs; trigger evaluation via
  `window.api.testSchedulerRunNow('alert-evaluation')`; assert the dashboard.

**Red — tests to write (one test per AC):**

- "queue appears above the positions grid ordered by urgency then time": seed an
  AAPL CSP at ~3 DTE (high), a TSLA CSP at ~9 DTE (medium), and an NVDA CSP at
  ~14 DTE (low); run evaluation; load the dashboard; assert the management queue
  renders above the positions grid and the rows appear in order AAPL, TSLA, NVDA.
- "queue item shows ticker, phase badge, trigger summary, and a Review position
  action": for the AAPL `EXPIRATION_IMMINENT` row, assert the ticker "AAPL", a
  phase badge, the trigger summary text (e.g. "Expires in 3 days at $180.00
  strike"), and a button labeled "Review position".
- "quick action opens the related position detail page": click the TSLA row's
  "Review position" button; assert the app navigates to the TSLA position detail
  page (hash `/positions/<id>`).
- "empty state renders when there are no open alerts": launch with no
  alert-triggering positions (or none open); load the dashboard; assert the queue
  shows "No positions need attention right now" and renders no quick action
  buttons.

**Green — implementation:**

- Implement the spec and the seeding/trigger helpers as described in
  `quickstart.md`. Reuse existing `e2e/helpers.ts` / `e2e/dates.ts` for DTE math
  and position creation.

**Refactor — cleanup to consider:**

- Extract any repeated seed/trigger steps into a local helper in the spec. Check
  for duplication and naming consistency.

**Acceptance criteria covered:**

- All four story scenarios (one e2e test each, listed above).

---

## AC Audit

Every AC bullet from the story, mapped to an e2e test case in Area 7:

| Story AC scenario                                                   | E2e test case (Area 7)                                                                |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Queue appears above the position cards ordered by urgency then time | "queue appears above the positions grid ordered by urgency then time"                 |
| Queue item shows the key fields traders need to act                 | "queue item shows ticker, phase badge, trigger summary, and a Review position action" |
| Queue item opens the related position from the quick action         | "quick action opens the related position detail page"                                 |
| Empty state renders when there are no open alerts                   | "empty state renders when there are no open alerts"                                   |

All four ACs are covered. No uncovered ACs remain.
