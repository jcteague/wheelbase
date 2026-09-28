---
page: docs/spec/features/us-63-manage-watchlist.md
audited_at: 2026-09-28
findings: 9
---

# Audit: docs/spec/features/us-63-manage-watchlist.md

## Verified (20)

- ✓ `migrations/012_create_watchlist.sql` creates `watchlist` with `ticker TEXT PRIMARY KEY`, nullable `notes`/`own_below_price`/`ivr_trigger`, `post_earnings_only`/`core_holding INTEGER NOT NULL DEFAULT 0`, `added_at`, and `idx_watchlist_added_at_desc` — matches.
- ✓ `src/main/services/watchlist.ts` exports `addWatchlistEntry` (`:83`), `listWatchlist` (`:153`), `removeWatchlistEntry` (`:159`).
- ✓ Uppercase normalization at service boundary: `ticker.trim().toUpperCase()` (`watchlist.ts:48`).
- ✓ Duplicate throws `ValidationError('ticker','duplicate', '<T> is already on the watchlist')` (`watchlist.ts:91`).
- ✓ `own_below_price` stored via `new Decimal(...).toFixed(4)` (`watchlist.ts:76`).
- ✓ List orders by `added_at DESC` (`watchlist.ts:30`).
- ✓ `watchlist:add` and `watchlist:remove` registered via `handleIpcCall` in `src/main/ipc/watchlist.ts:38,51`; remove returns `{ ticker }` (`:55`), add returns `{ entry }` (`:40`).
- ✓ `registerWatchlistIpc` imported/called in `src/main/index.ts:15,221`.
- ✓ Preload `watchlist` namespace in `src/preload/index.ts:76-79`.
- ✓ `WatchlistRemovePayloadSchema` (`src/main/schemas.ts:543`) and `WatchlistEntryRecord` (`schemas.ts:548`) exist.
- ✓ Renderer adapter `src/renderer/src/api/watchlist.ts` maps `{ok:false}` through `throwMappedIpcErrors` (`api/error.ts` throws `apiError(400, …)`).
- ✓ `watchlistQueryKeys.all = ['watchlist']` (`src/renderer/src/hooks/watchlistQueryKeys.ts:2`).
- ✓ `useAddToWatchlist` / `useRemoveFromWatchlist` invalidate `watchlistQueryKeys.all` on success (via `useBenchMutation`, `src/renderer/src/hooks/useBenchMutation.ts:28`).
- ✓ `WatchlistEntryForm` uses RHF + `zodResolver` with 3-generic `useForm` (`src/renderer/src/components/WatchlistEntryForm.tsx:117-118`); IVR presets `[30, 50, 70]` (`:17`); 500-char thesis (`:18`); server `ticker` errors via `setError` (`:147`); `reset()` on success (`:180`).
- ✓ Renderer schema messages "Enter a ticker symbol" / "Enter a valid ticker symbol" and `.default(false)` booleans (`src/renderer/src/schemas/watchlist.ts:35,37,41-42`).
- ✓ Route `/watchlist` and `☰` nav item in `src/renderer/src/App.tsx:56-59,106`.
- ✓ Condition tag strings `≤ $…`, `IVR ≥ …`, `post-earnings`, `core` in `src/renderer/src/lib/watchlistConditionTags.ts:22-25`.
- ✓ `e2e/watchlist.spec.ts` exists with 11 `it(...)` cases, one per AC (`:84-198`).
- ✓ All linked spec pages exist: `schema/tables.md`, `schema/migrations.md`, `contracts/ipc-handlers.md`, `contracts/zod-schemas.md`, and ADRs `react-hook-form-zod`, `tanstack-query-mutation-hooks`, `vendor-scoped-query-keys`, `renderer-snake-case-adapter`.
- ✓ All other listed source files exist (Glob).

## Drift (9)

- ✗ Page claims a `watchlist:list` IPC channel (Summary, "Contracts touched": `watchlist:list → { ok, entries }`). No such channel is registered; `src/main/ipc/watchlist.ts:32` registers `watchlist:snapshot` instead (US-96), and preload exposes `snapshot/add/update/remove` only (`src/preload/index.ts:76-79`). `listWatchlist` survives only as an internal service call (`services/watchlist-snapshot.ts:125`, `services/candidate-chains.ts:83`). Suggested fix: note that US-96 replaced `watchlist:list` with `watchlist:snapshot`.
- ✗ Page lists `src/renderer/src/hooks/useWatchlist.ts` and a `useWatchlist` list query; the file does not exist (deleted in commit `152aabf` "combined screener with watchlist"). The bench is read via `useWatchlistSnapshot.ts` keyed on `watchlistQueryKeys.snapshot` (`watchlistQueryKeys.ts:4`).
- ✗ Page says "Remove of an absent ticker is a no-op" / "`watchlist:remove` … (absent ticker is a no-op success)". `removeWatchlistEntry` throws `ValidationError('ticker','not_found', '<T> is not on the watchlist')` when no row is deleted (`src/main/services/watchlist.ts:161-164`).
- ✗ Page names Zod payload `WatchlistAddPayloadSchema`; code has `WatchlistEntryPayloadSchema` (shared by add and update, `src/main/schemas.ts:538`; used at `ipc/watchlist.ts:40,47`). No `WatchlistAddPayloadSchema` in `src/`.
- ✗ Page names the pure helper `buildConditionTags`; grep finds no such symbol. `src/renderer/src/lib/watchlistConditionTags.ts:20` exports `conditionTagParts` (returning a `ConditionTagParts` object, `:11`) instead.
- ✗ Page says `WatchlistPage` renders "the always-visible `WatchlistEntryForm`". The form is conditional: `{(addOpen || rows.length === 0) && <WatchlistEntryForm />}` (`src/renderer/src/pages/WatchlistPage.tsx:181`).
- ✗ Page says the page renders "the entries table" with columns "Ticker · Thesis · Added · ✕ only — no Price/IVR/Signal". Present-tense, but US-96 replaced the table with a combined bench (snapshot + screener; `WatchlistPage.tsx:25,73`). Suggested fix: frame as US-63-era history.
- ✗ Page describes `useAddToWatchlist` / `useRemoveFromWatchlist` as invalidating only `['watchlist']`; both now go through `useBenchMutation`, which also invalidates `watchlistQueryKeys.snapshot` and `screenerQueryKeys.results` (`useBenchMutation.ts:28-30`). Minor/partial drift.
- ✗ "Contracts touched" omits `watchlist:update` (`ipc/watchlist.ts:45`, US-69). The page does say edit is US-69, so this is minor.

## Unverifiable (3)

- ? "Conditions stored but informational only — they drive the US-96 Signal, never a screener ranking input." Design intent; not mechanically verified.
- ? "Renderer/preload boundary types duplicated intentionally." Narrative rationale.
- ? First-run empty-state copy "explains that adding tickers enables the screener" (`WatchlistPage.tsx:53` has related copy; exact AC wording not checked).

## Missing files (1)

- ✗ `src/renderer/src/hooks/useWatchlist.ts` (listed in Source files) does not exist.
