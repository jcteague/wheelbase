# US-51 — Display management queue on dashboard ordered by urgency tier — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off

> **Note on shape:** US-51 is a thin read/IPC/UI slice over the existing US-50
> alert backend. Its areas form a near-linear dependency chain (each layer
> consumes the type, channel, or hook produced by the previous one), so layers
> mostly contain a single area. No new migration or engine work is required.

---

## Layer 1 — Service + view-model type (no dependencies)

> Can start immediately. Builds on the existing `alerts` table and `positions`.

### Management-queue service (`listManagementQueue`)

- [x] **[Red]** Write failing tests — `src/main/services/alerts.test.ts`
  - Add a `listManagementQueue` describe block. Test cases:
    - "returns open alerts joined with ticker and phase from positions" — seed two positions + an open alert each; assert each item carries `ticker`/`phase` (from positions) plus `summary`/`quickAction`/`urgency`/`triggeredAt`/`alertId`/`positionId`
    - "orders by urgency tier high → medium → low" — seed three open alerts (insertion order low, high, medium) on distinct positions; assert returned order high, medium, low
    - "breaks urgency ties by triggered_at ascending" — two `medium` alerts with different `triggered_at`; earlier first
    - "excludes non-open alerts" — seed one `open`, one `resolved`, one `dismissed`; only `open` returned
    - "returns an empty array when there are no open alerts" — assert `[]`
  - Run `pnpm test alerts.test` — all new tests must fail
- [x] **[Green]** Implement — `src/main/schemas.ts`, `src/main/services/alerts.ts` _(depends on: Management-queue service Red ✓)_
  - Add `ManagementQueueItem` interface to `src/main/schemas.ts` near `AlertRecord`: `alertId`, `positionId`, `ticker`, `phase` (`WheelPhase`), `urgency` (`AlertUrgency`), `summary`, `quickAction`, `triggeredAt` — reuse the exported `WheelPhase`/`AlertUrgency` types
  - Implement `listManagementQueue(db: Database.Database): ManagementQueueItem[]` in `src/main/services/alerts.ts` using the `data-model.md` query: JOIN `alerts a` → `positions p`, `WHERE a.status = 'open'`, `ORDER BY CASE a.urgency WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END, a.triggered_at ASC`; dedicated snake→camel mapper (mirror `mapAlertRow`); DEBUG `count` log on completion
  - Run `pnpm test alerts.test` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/alerts.ts` _(depends on: Management-queue service Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Keep the urgency-rank `CASE` readable; check naming consistency with `listOpenAlerts`/`mapAlertRow`; reduce duplication
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — IPC handler (depends on Layer 1)

### `alerts:list` IPC handler

**Requires:** Management-queue service Green ✓

- [x] **[Red]** Write failing tests — `src/main/ipc/alerts.test.ts` _(depends on: Management-queue service Green ✓)_
  - Test cases:
    - "alerts:list returns { ok: true, items } sorted for the queue" — register the handler against a test DB seeded with open alerts; invoke the registered channel handler; assert `result.ok === true` and `result.items` is the sorted `ManagementQueueItem[]`
    - "alerts:list returns an internal_error envelope when the query throws" — force the service/db to throw; assert `{ ok: false, errors: [{ field: '__root__', code: 'internal_error', ... }] }`
  - Run `pnpm test ipc/alerts.test` — all new tests must fail
- [x] **[Green]** Implement — `src/main/ipc/alerts.ts`, `src/main/index.ts` _(depends on: `alerts:list` IPC handler Red ✓)_
  - New `src/main/ipc/alerts.ts` exporting `registerAlertsHandlers({ db })`; register `ipcMain.handle('alerts:list', () => handleIpcCall('alerts_list_error', () => ({ items: listManagementQueue(db) })))` — follow `src/main/ipc/assignments.ts` (`assignments:list-pending`). No Zod schema (no payload)
  - Wire `registerAlertsHandlers({ db })` into `src/main/index.ts` with the other `register*Handlers` calls
  - Run `pnpm test ipc/alerts.test` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/ipc/alerts.ts` _(depends on: `alerts:list` IPC handler Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Confirm the handler stays thin (single service call inside `handleIpcCall`, no branching)
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — Preload bridge + typing (depends on Layer 2)

### Preload bridge + typing

**Requires:** `alerts:list` IPC handler Green ✓

- [x] **[Red]** _No dedicated unit test_ — preload is a thin bridge with no logic. Coverage comes from the renderer adapter test (Layer 4) and the E2E (Layer 7). This omission is intentional.
- [x] **[Green]** Implement — `src/preload/index.ts`, `src/preload/index.d.ts` _(depends on: `alerts:list` IPC handler Green ✓)_
  - `src/preload/index.ts`: add `alerts: { list: () => invoke('alerts:list') }` to the `api` object
  - `src/preload/index.d.ts`: add a `ManagementQueueItem` interface and `alerts: { list: () => Promise<{ ok: true; items: ManagementQueueItem[] } | { ok: false; errors: Array<{ field: string; code: string; message: string }> }> }` under `interface Window { api: { … } }` — mirror the existing `assignments` block
  - Run `pnpm typecheck` — clean
- [x] **[Refactor]** `/refactor` — `src/preload/index.d.ts` _(depends on: Preload bridge + typing Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Ensure the `ManagementQueueItem` shape in `index.d.ts` matches `schemas.ts` field-for-field
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — Renderer adapter + query hook (depends on Layer 3)

### Renderer adapter + query hook

**Requires:** Preload bridge + typing Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/api/alerts.test.ts` _(depends on: Preload bridge + typing Green ✓)_
  - Test cases:
    - "maps a successful response to the items array" — stub `window.api.alerts.list` → `{ ok: true, items: [...] }`; assert `listManagementQueue()` resolves to that array
    - "returns an empty array when the call fails" — stub `{ ok: false, errors: [...] }`; assert `listManagementQueue()` resolves to `[]`
  - Run `pnpm test api/alerts.test` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/api/alerts.ts`, `src/renderer/src/hooks/useManagementQueue.ts` _(depends on: Renderer adapter + query hook Red ✓)_
  - `src/renderer/src/api/alerts.ts`: `ManagementQueueItem` type (local mirror/re-export) + `listManagementQueue(): Promise<ManagementQueueItem[]>` reading `window.api.alerts.list()`, returning `result.ok ? result.items : []` (follow `src/renderer/src/api/assignments.ts`)
  - `src/renderer/src/hooks/useManagementQueue.ts`: `useQuery({ queryKey: ['alerts','queue'] as const, queryFn: listManagementQueue, refetchInterval: 30_000 })` (mirror `usePendingAssignments`)
  - Run `pnpm test api/alerts.test` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/api/alerts.ts` _(depends on: Renderer adapter + query hook Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider a small `alertQueryKeys` object only if a second alert query appears; reduce duplication, check naming consistency
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 5 — Queue UI components (depends on Layer 4)

### Queue UI components (`UrgencyPill`, `ManagementQueueRow`, `ManagementQueue`)

**Requires:** Renderer adapter + query hook Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/components/UrgencyPill.test.tsx`, `ManagementQueueRow.test.tsx`, `ManagementQueue.test.tsx` _(depends on: Renderer adapter + query hook Green ✓)_
  - `UrgencyPill.test.tsx`: "renders HIGH with red urgency tokens" / "MED with gold" / "LOW with blue" — assert label text (HIGH/MED/LOW) and the expected `wb-*` token classes (`text-wb-red`/`bg-wb-red-dim`, gold, blue)
  - `ManagementQueueRow.test.tsx`:
    - "renders ticker, urgency pill, phase badge, summary, and action button" — assert ticker text, `UrgencyPill`, a `PhaseBadge` for the phase, verbatim `summary`, and a button labeled `item.quickAction`
    - "navigates to the position detail route when the action is clicked" — click the button; assert `window.location.hash` becomes `/positions/${positionId}`
  - `ManagementQueue.test.tsx` (mock `useManagementQueue`):
    - "renders one row per open alert in returned order" — mock three items (high, medium, low); assert three rows in that DOM order
    - "renders the empty state with no action buttons when there are no alerts" — mock `[]`; assert "No positions need attention right now" present and no "Review position" button exists
  - Run `pnpm test components` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/UrgencyPill.tsx`, `ManagementQueueRow.tsx`, `ManagementQueue.tsx` _(depends on: Queue UI components Red ✓)_
  - Drive directly from `mockups/us-51-management-queue-dashboard.mdx`. Tailwind `wb-*` tokens only — no inline color/spacing styles
  - `UrgencyPill` — small rounded uppercase pill: `high → HIGH` (`text-wb-red bg-wb-red-dim`), `medium → MED` (`text-wb-gold bg-wb-gold-dim`), `low → LOW` (`text-wb-blue bg-wb-blue-dim`)
  - `ManagementQueueRow` — mockup `QueueCard` grid: left cell with bold **ticker** stacked over `UrgencyPill`; `PhaseBadge variant="short"`; **summary** text; right-aligned action **button** labeled `item.quickAction`, gold treatment (`bg-wb-gold-dim`/`text-wb-gold`/`border-wb-gold-border`); on click `window.location.hash = `/positions/${item.positionId}``(same as`PositionCard`)
  - `ManagementQueue` — wrap in `SectionCard` (header "Management Queue"); eyebrow "MANAGEMENT QUEUE" + title "What Needs Attention First" left, right-side count (`${n} open alerts` / "All clear"); calls `useManagementQueue()`; one `ManagementQueueRow` per item; empty list → mockup empty state ("No positions need attention right now" + secondary line) and **no** action buttons; `font-wb-mono` for label/numeric text
  - Run `pnpm test components` — all tests must pass
- [x] **[Refactor]** `/refactor` — queue components _(depends on: Queue UI components Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Factor the urgency→token mapping into a single record in `UrgencyPill`; ensure no inline `style` color/spacing leaked from the mockup (tokens only); reduce duplication
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 6 — Mount the queue on the dashboard (depends on Layer 5)

### Mount the queue on the dashboard

**Requires:** Queue UI components Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/pages/PositionsListPage.test.tsx` _(depends on: Queue UI components Green ✓)_
  - Add `vi.mock('../hooks/useManagementQueue')` with a default return to `beforeEach` (match the existing hook-mock pattern). Test cases:
    - "renders the management queue above the positions grid" — mock `useManagementQueue` → one item and `usePositions` → active positions; assert the management queue heading appears before the "Active" section header / position rows in document order
    - "renders the management queue even when there are no positions" — mock `usePositions` empty and `useManagementQueue` empty; assert the queue's empty state still renders
  - Run `pnpm test PositionsListPage` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/pages/PositionsListPage.tsx` _(depends on: Mount the queue on the dashboard Red ✓)_
  - Import and mount `<ManagementQueue />` right after `<AssignmentNotificationBanner />` (line ~206), before the loading/active blocks, so it sits above the positions grid regardless of position-query state
  - Run `pnpm test PositionsListPage` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/pages/PositionsListPage.tsx` _(depends on: Mount the queue on the dashboard Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Confirm the queue owns its own loading/empty state and does not duplicate the page's handling
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 7 — E2E Tests

**Requires:** All Green tasks from Layers 1–6 ✓

### E2E Tests

- [x] **[Red]** Write failing e2e tests — `e2e/management-queue.spec.ts` _(depends on: all Green tasks ✓)_
  - Follow `e2e/` patterns (`csp-flow.spec.ts`, `assignment-detection.spec.ts`): launch with fresh `WHEELBASE_DB_PATH`, `FAKE_MARKET_DATA=true`, `FAKE_BROKER=true`; seed positions at known DTEs; trigger evaluation via `window.api.testSchedulerRunNow('alert-evaluation')`; reuse `e2e/helpers.ts`/`e2e/dates.ts`. One `it()` per AC — test names mirror AC language.
  - AC coverage:
    - AC-1: Queue appears above the position cards ordered by urgency then time → `it('queue appears above the positions grid ordered by urgency then time')` — seed AAPL ~3 DTE (high), TSLA ~9 DTE (medium), NVDA ~14 DTE (low); assert queue above grid and rows ordered AAPL, TSLA, NVDA
    - AC-2: Queue item shows the key fields traders need to act → `it('queue item shows ticker, phase badge, trigger summary, and a Review position action')` — for the AAPL row assert ticker "AAPL", a phase badge, the trigger summary (e.g. "Expires in 3 days at $180.00 strike"), and a button labeled "Review position"
    - AC-3: Queue item opens the related position from the quick action → `it('quick action opens the related position detail page')` — click TSLA "Review position"; assert navigation to the TSLA detail page (hash `/positions/<id>`)
    - AC-4: Empty state renders when there are no open alerts → `it('empty state renders when there are no open alerts')` — no alert-triggering positions; assert "No positions need attention right now" and no quick action buttons
  - Run `pnpm test:e2e` — all new tests must fail
- [x] **[Green]** Make e2e tests pass _(depends on: E2E Red ✓)_
  - Implement the spec + seeding/trigger helpers per `quickstart.md`
  - Run `pnpm test:e2e` — all tests must pass
- [x] **[Refactor]** `/refactor` e2e tests — `e2e/management-queue.spec.ts` _(depends on: E2E Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Extract repeated seed/trigger steps into a local helper; check naming consistency

---

## Completion Checklist

- [x] All Red tasks complete (tests written and failing for right reason)
- [x] All Green tasks complete (all tests passing)
- [x] All Refactor tasks complete (lint + typecheck clean)
- [x] E2E tests cover every AC
- [x] `pnpm test && pnpm lint && pnpm typecheck` — all clean
