# US-63: Create and remove watchlist entries

<!-- generated:from us-63 -->

## Summary

US-63 is the foundation of the candidate-screener watchlist. A trader maintains a
curated bench of tickers, each optionally carrying a free-text thesis and the
structured entry conditions they are waiting for (would-own price, IV-rank trigger,
post-earnings gate, core-holding). The feature spans the full stack: a `watchlist`
table keyed by normalized ticker, `watchlist:list/add/remove` IPC handlers, renderer
API adapter + TanStack Query hooks, and a Watchlist page (route `/watchlist`, `☰`
nav item) that lists entries newest-first with their thesis and compact condition
tags, an add form that validates symbols / rejects duplicates / normalizes to
uppercase, a per-row remove action, and a first-run empty state explaining the
screener.

Creating and removing entries is US-63. The live Price / IV-rank / earnings columns
and the derived **Signal** chip are [US-96]; editing an existing entry reuses the
same add form and is [US-69]. The add form is built to support that future edit mode
(ticker fixed) without a rewrite, but edit mode is not implemented here.

## Acceptance criteria

- **Add a ticker** — with AAPL and MSFT present, adding NVDA shows NVDA and a count
  of 3.
- **Newest at top** — a newly added ticker is the first row.
- **Thesis + conditions** — adding PLTR with a thesis, own-below $38, and IVR ≥ 50
  shows the note plus the tags `≤ $38` and `IVR ≥ 50`.
- **Optional** — an entry with no thesis and no conditions is created and carries no
  condition tags.
- **Uppercase normalization** — `nvda` is stored and shown as `NVDA`.
- **Reject duplicate** — re-adding AAPL surfaces inline "AAPL is already on the
  watchlist" and AAPL appears once.
- **Reject empty/malformed** — empty → "Enter a ticker symbol"; `12345` and `AB CD`
  → "Enter a valid ticker symbol"; nothing is added.
- **Remove** — removing AAPL leaves MSFT only.
- **Empty guidance** — an empty watchlist explains that adding tickers enables the
  screener.

## What was built

**Persistence.** `migrations/012_create_watchlist.sql` creates the `watchlist` table
keyed by `ticker TEXT PRIMARY KEY`, with nullable `notes` / `own_below_price` (4dp
TEXT money) / `ivr_trigger`, boolean `post_earnings_only` / `core_holding` (INTEGER
0/1, default 0), and `added_at`, plus `idx_watchlist_added_at_desc` for the
newest-first list. See [Tables](../schema/tables.md) and
[Migrations](../schema/migrations.md).

**Service.** `src/main/services/watchlist.ts` exposes `addWatchlistEntry`,
`listWatchlist`, and `removeWatchlistEntry`. Ticker normalization (uppercase) happens
at this boundary; add performs an existence check and throws
`ValidationError('ticker','duplicate', '<T> is already on the watchlist')` on a
collision; `own_below_price` is stored via `decimal.js` at 4dp; booleans map to 0/1
and back. `list` orders by `added_at DESC`. Remove of an absent ticker is a no-op.

**IPC + transport.** `src/main/ipc/watchlist.ts` registers the three channels through
`handleIpcCall` (thin: Zod parse + single service call), registered from
`src/main/index.ts`. The preload `watchlist` namespace (`src/preload/index.ts` +
`index.d.ts`) bridges them to the renderer. See [IPC Handlers](../contracts/ipc-handlers.md)
and [Zod Schemas](../contracts/zod-schemas.md).

**Renderer data layer.** `src/renderer/src/api/watchlist.ts` adapts
`window.api.watchlist.*`, mapping `{ ok:false }` envelopes to a 400 `ApiError` via
`throwMappedIpcErrors` (the `ticker` error field is already camelCase-aligned, so no
remapping). `watchlistQueryKeys.all = ['watchlist']` keys the `useWatchlist` list
query; `useAddToWatchlist` / `useRemoveFromWatchlist` invalidate that key on success.

**UI.** `WatchlistPage` renders the header + count badge, the always-visible
`WatchlistAddForm`, and either the entries table or the empty-state guidance card.
The table columns are **Ticker · Thesis (+ condition tags) · Added · ✕** only — no
Price/IVR/Signal (US-96). `WatchlistAddForm` is React Hook Form + `zodResolver`
(`src/renderer/src/schemas/watchlist.ts`): a ticker input with client-side symbol
validation, quick-pick condition chips (own-below `$` field, high-IV `IVR ≥` field
with 30/50/70 presets, post-earnings and core toggles), and a thesis textarea with a
NN/500 counter. Server `ticker`/duplicate errors are surfaced inline via `setError`;
the form resets on success and the invalidated query refreshes the list.
`buildConditionTags` (`src/renderer/src/lib/watchlistConditionTags.ts`) is a pure
helper deriving the tag strings (`≤ $38`, `IVR ≥ 50`, `post-earnings`, `core`),
reused by the page and available to US-96.

## Architecture decisions

- **Keyed by normalized ticker (no surrogate id)** — the ticker is the entry's
  identity; uppercase normalization at the service boundary + a PK constraint plus an
  explicit existence check give friendly duplicate rejection.
- **Conditions stored but informational only** — persisted as columns; they drive the
  US-96 Signal, never a screener ranking input.
- **Shared add/edit form** — `WatchlistAddForm` is built for [US-69] to reuse in edit
  mode; edit mode not built here. See [React Hook Form + Zod](../architecture/02-adrs/react-hook-form-zod.md).
- **RHF input/output typing + reset-on-`onSuccess`** — the schema's `.default(false)`
  booleans make Zod input ≠ output, so the form uses the 3-generic `useForm` form;
  reset runs in the mutation's per-call `onSuccess` to avoid the
  `react-hooks/set-state-in-effect` rule while keeping hook-level cache invalidation.
  See [TanStack Query mutation hooks](../architecture/02-adrs/tanstack-query-mutation-hooks.md)
  and [Vendor-scoped query keys](../architecture/02-adrs/vendor-scoped-query-keys.md).
- **Renderer/preload boundary types duplicated intentionally** per the repo's
  [renderer adapter](../architecture/02-adrs/renderer-snake-case-adapter.md) pattern.

## Contracts touched

- `watchlist:list` → `{ ok, entries }` (ordered `added_at DESC`)
- `watchlist:add` → `{ ok, entry }` | duplicate error on `ticker`
- `watchlist:remove` → `{ ok, ticker }` (absent ticker is a no-op success)
- `WatchlistEntryRecord` result interface; `WatchlistAddPayloadSchema` /
  `WatchlistRemovePayloadSchema` Zod payloads

See [IPC Handlers](../contracts/ipc-handlers.md) for full envelopes.

## Source files

- `migrations/012_create_watchlist.sql`
- `src/main/schemas.ts` — watchlist payload schemas + `WatchlistEntryRecord`
- `src/main/services/watchlist.ts`
- `src/main/ipc/watchlist.ts`
- `src/main/index.ts` — registers `registerWatchlistIpc`
- `src/preload/index.ts`, `src/preload/index.d.ts` — watchlist namespace
- `src/renderer/src/schemas/watchlist.ts`
- `src/renderer/src/api/watchlist.ts`
- `src/renderer/src/hooks/watchlistQueryKeys.ts`, `useWatchlist.ts`,
  `useAddToWatchlist.ts`, `useRemoveFromWatchlist.ts`
- `src/renderer/src/lib/watchlistConditionTags.ts`
- `src/renderer/src/components/WatchlistAddForm.tsx`
- `src/renderer/src/pages/WatchlistPage.tsx`
- `src/renderer/src/App.tsx` — route/nav/header wiring
- `e2e/watchlist.spec.ts` — one scenario per AC (11 cases)

<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
