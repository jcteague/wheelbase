# US-68 — Promote a screener result to the new wheel form — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off

---

## Layer 1 — Foundation (no dependencies)

> This area can be started immediately. Everything downstream consumes its `PromotedCandidate` / `PromoteBanner` types and pure helpers.

### Promote Helpers Library

- [x] **[Red]** Write failing tests — `src/renderer/src/lib/promote.test.ts`
  - Test cases:
    - `buildPromoteSearch` encodes `promoted=1&ticker=AAPL&strike=180&expiration=2026-08-21&premium=2.70&quotedAt=…` — strike Decimal-normalized (`'180.0000'` → `'180'`), premium verbatim, `quotedAt` URL-encoded
    - `buildPromoteSearch` appends `thesis=<encoded>` when a note is passed; omits the param when `undefined`/empty
    - `parsePromotedParams` round-trips `buildPromoteSearch` output back to the `PromotedCandidate`
    - `parsePromotedParams` returns `null` for: missing `promoted=1` (bare `?ticker=AAPL`), missing required param, non-positive/non-numeric `strike`/`premium`, malformed `expiration`
    - `markMovedMaterially('2.70', '2.50')` → `true` (0.20 > max(0.05, 0.135))
    - `markMovedMaterially('2.70', '2.68')` → `false` (under the $0.05 floor)
    - `markMovedMaterially('2.70', '2.835')` → `false` (exactly at threshold — strict `>`)
    - Sub-$1 floor: `('0.60', '0.64')` → `false`; `('0.60', '0.66')` → `true`
    - `derivePromoteBanner` precedence, one assertion per state-machine row: failed fetch → `offline` (even CLOSED + moved); `CLOSED`/`EXT` display → `stale` (even when moved); open + moved → `moved` (even when edited); open + unmoved + edited premium → `edited`; open + unmoved + unedited → `match` (carrying `fresh.mark` + `timestamp`); pending fetch (LIVE, unedited) → `none`
  - Run `pnpm test src/renderer/src/lib/promote.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/lib/promote.ts` _(depends on: Promote Helpers Library Red ✓)_
  - `PromotedCandidate` type + internal Zod schema per `plans/us-68/data-model.md`
  - `buildPromoteSearch(candidate, note?)` / `parsePromotedParams(search)` via `URLSearchParams`, per `plans/us-68/contracts/promote-navigation.md`
  - `markMovedMaterially(promotedMark, freshMark)`: `Decimal(fresh).minus(promoted).abs().gt(Decimal.max('0.05', Decimal(promoted).times('0.05')))`
  - `derivePromoteBanner({ quote: 'pending' | 'failed' | { mark, timestamp }, marketDisplay, promotedPremium, currentPremium })` → discriminated union `{ kind: 'offline' | 'stale' | 'moved' | 'edited' | 'match' | 'none', … }` carrying the values each banner's copy needs
  - Module stays I/O-free — no hooks, no `window.api`
  - Run `pnpm test src/renderer/src/lib/promote.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/lib/promote.ts` _(depends on: Promote Helpers Library Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Check whether strike normalization duplicates an existing Decimal helper; reuse if one exists
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — Hook, Chrome Components, Screener Entry (depends on Layer 1)

> These three areas can run in parallel with each other **after** the Promote Helpers Library Green task is complete.

### Fresh-Quote Hook (`usePromotedQuote`)

**Requires:** Promote Helpers Library Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/hooks/usePromotedQuote.test.ts` _(depends on: Promote Helpers Library Green ✓)_
  - Mock `../api/market-data` following the `useOptionSnapshots.test.ts` pattern
  - Test cases:
    - Given a `PromotedCandidate` (AAPL / 180 / 2026-08-21), requests exactly one OCC symbol `AAPL260821P00180000` and resolves `quote` to `{ mark: <snapshot.mid>, timestamp: <snapshot.timestamp> }`
    - Resolves to `'failed'` when `getOptionSnapshots` rejects (ApiError 502)
    - Resolves to `'failed'` when `unavailable: true` or the symbol is absent from the snapshots map
    - Disabled (no fetch) when called with `undefined`
    - Single fetch only: no `refetchInterval`, `refetchOnWindowFocus: false`, `retry: false`
  - Run `pnpm test src/renderer/src/hooks/usePromotedQuote.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/hooks/usePromotedQuote.ts` + `src/renderer/src/hooks/marketDataQueryKeys.ts` _(depends on: Fresh-Quote Hook Red ✓)_
  - Add `promotedQuote(symbol)` key to `marketDataQueryKeys` (vendor-scoped-query-keys ADR)
  - `usePromotedQuote(promoted: PromotedCandidate | undefined): { quote: 'pending' | 'failed' | { mark: string; timestamp: string } }` — `buildOccSymbol({ ticker, expiration, strike, instrumentType: 'PUT' })`, `useQuery` over `getOptionSnapshots([symbol])` with `enabled: Boolean(promoted)`, `staleTime: Infinity`, `retry: false`, `refetchInterval: false`, `refetchOnWindowFocus: false`
  - Map query error / `unavailable` / missing symbol to `'failed'` — degrade, never throw (alert-evaluation-failure-isolation boundary-I/O rule)
  - Guard `buildOccSymbol` throws by disabling the query instead of crashing the form
  - Run `pnpm test src/renderer/src/hooks/usePromotedQuote.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` _(depends on: Fresh-Quote Hook Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Extract a shared `occPutSymbol` helper only if real duplication with `useOptionSnapshots` exists
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Promote Chrome Components

**Requires:** Promote Helpers Library Green ✓ (`PromoteBanner` type)

- [x] **[Red]** Write failing tests — `src/renderer/src/components/PromoteProvenance.test.tsx`, `PromotedQuoteNotice.test.tsx`, `NewWheelDerivedRow.test.tsx` _(depends on: Promote Helpers Library Green ✓)_
  - `PromoteProvenance`: renders "Promoted from Screener" + `Quoted 10:42:15` via `fmtQuoteTime`; shows the fresh time instead when given a fresh timestamp
  - `PromotedQuoteNotice`, one case per banner kind, exact copy + AlertBox tone:
    - `moved` → gold, `Price moved: quoted $2.70 → now $2.50 — review before submitting.`
    - `offline` → gold, `Couldn't refresh quote — showing screener snapshot from 10:42:15. Verify before recording.`
    - `stale` → gold, market-closed copy with the quoted time
    - `edited` → green, `Recording your entered price ($2.65), not the screener snapshot ($2.70).`
    - `match` → green, `Fresh quote matches the promoted mark — $2.70.` when equal; `Fresh quote $2.68 — no material move from the promoted $2.70.` otherwise
    - `none` → renders nothing
  - `NewWheelDerivedRow`: strike 180 / 1 contract → `$18,000` + caption `180 × 100 × 1 contract`; premium 2.70 / 37 DTE → `1.5% period · 14.8%/yr`; premium 2.65 → `1.47% period · 14.5%/yr` + `recomputed from your price` note, capital unchanged; unparseable inputs → `—`, no NaN
  - Run `pnpm test src/renderer/src/components/PromoteProvenance.test.tsx src/renderer/src/components/PromotedQuoteNotice.test.tsx src/renderer/src/components/NewWheelDerivedRow.test.tsx` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/PromoteProvenance.tsx`, `PromotedQuoteNotice.tsx`, `NewWheelDerivedRow.tsx` _(depends on: Promote Chrome Components Red ✓)_
  - `PromoteProvenance({ quotedAt })` — gold strip per the mockup's `Provenance` element (`border-wb-gold-border bg-wb-gold-subtle`, `font-wb-mono` uppercase label); `wb-*` tokens only, no inline color styles
  - `PromotedQuoteNotice({ banner })` — maps `PromoteBanner` to `AlertBox variant="warning" | "success"` with pinned copy; `data-testid="promote-banner"` + `data-kind={banner.kind}` as the e2e DOM contract
  - `NewWheelDerivedRow({ strike, contracts, premium, expiration })` — two-column mockup row (`Capital required` left with caption; `Yield if flat` right in `text-wb-green`, edited note when flagged); `decimal.js` math, capital `en-US` grouped 0dp, yields via `fmtYieldPercent`, DTE via `computeDte`
  - Run `pnpm test src/renderer/src/components/PromoteProvenance.test.tsx src/renderer/src/components/PromotedQuoteNotice.test.tsx src/renderer/src/components/NewWheelDerivedRow.test.tsx` — all tests must pass
- [x] **[Refactor]** `/refactor` _(depends on: Promote Chrome Components Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Banner copy strings live once (component or exported constants) so e2e asserts the same literals
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Screener Promote Entry Point

**Requires:** Promote Helpers Library Green ✓ (`buildPromoteSearch`, `parsePromotedParams`)

- [x] **[Red]** Write failing tests — `src/renderer/src/components/ScreenerResultsTable.test.tsx` (create if absent), `src/renderer/src/pages/ScreenerPage.test.tsx` _(depends on: Promote Helpers Library Green ✓)_
  - `ScreenerResultsTable`: each ranked row renders a `Promote to trade` button (aria-label; `data-testid="screener-promote-<ticker>"`); clicking AAPL's calls `onPromote` with AAPL's full `ScreenerCandidate`
  - `ScreenerResultsTable`: action column goes **last** — existing 12 data columns undisturbed (regression for US-66 `rowCells` ordering)
  - `ScreenerPage`: with a watchlist entry `{ ticker: 'AAPL', notes: 'Would own below $170…' }` (mock `useWatchlist`), promote navigates to a `/new?promoted=1&…` URL whose params round-trip via `parsePromotedParams` to candidate + thesis
  - `ScreenerPage`: with no note (or watchlist still loading), the URL omits `thesis` — promote never blocks on the watchlist query
  - `ScreenerPage`: clicking promote calls no create-position API (never auto-submits, source side)
  - Run `pnpm test src/renderer/src/components/ScreenerResultsTable.test.tsx src/renderer/src/pages/ScreenerPage.test.tsx` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/ScreenerResultsTable.tsx`, `src/renderer/src/pages/ScreenerPage.tsx` _(depends on: Screener Promote Entry Point Red ✓)_
  - Table: new `onPromote: (candidate: ScreenerCandidate) => void` prop; compact gold button in a new last `TableCell` per row (`border-wb-gold-border bg-wb-gold-dim text-wb-gold`, consistent with `CriteriaButton`); presentation-only — callback up, no navigation inside
  - Page: `useWatchlist()` + `useLocation()`; `handlePromote(candidate)` finds the note (`entries?.find(e => e.ticker === candidate.ticker)?.notes ?? undefined`, empty string → undefined) and calls `navigate('/new?' + buildPromoteSearch(candidate, note))`
  - Run `pnpm test src/renderer/src/components/ScreenerResultsTable.test.tsx src/renderer/src/pages/ScreenerPage.test.tsx` — all tests must pass
- [x] **[Refactor]** `/refactor` _(depends on: Screener Promote Entry Point Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Keep the page-owns-effects split US-66 established
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — Form Integration (depends on Layer 2)

### NewWheelForm Promoted Mode + NewWheelPage Wiring

**Requires:** Promote Helpers Library Green ✓, Fresh-Quote Hook Green ✓, Promote Chrome Components Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/components/NewWheelForm.test.tsx` (extend) _(depends on: Fresh-Quote Hook Green ✓, Promote Chrome Components Green ✓)_
  - Mock `usePromotedQuote` and `useMarketStatusDisplay` alongside the existing `useCreatePosition` mock; keep the DatePicker mock
  - Test cases:
    - Promoted render pre-fills: Ticker `AAPL`, Strike `180`, Expiration `2026-08-21`, Contracts `1`, Premium `2.70`; thesis input holds the promoted note (Advanced section opened by default in promoted mode)
    - Derived row shows `$18,000` capital for the promoted values
    - Premium editable: clear + type `2.65` → accepted, no error
    - Submit after edit calls `mutation.mutate` with `premium_per_contract: 2.65`, not 2.70
    - Fresh quote `{ mark: '2.68', timestamp: <fresh ISO> }` → provenance shows the fresh time, premium input still `2.70`, banner kind `match`
    - Fresh mark `2.50` → banner kind `moved` with pinned copy; premium still `2.70`; submit enabled
    - `usePromotedQuote` → `'failed'` → banner kind `offline` naming the promoted `10:42:15` time; form still submits
    - Market display `CLOSED` and `EXT` → banner kind `stale` in both
    - Non-promoted render: no provenance/banner/derived row; `defaultTicker` behavior intact (regression guard)
    - Mounting promoted does **not** call `mutation.mutate` (never auto-submits, unit level)
  - Run `pnpm test src/renderer/src/components/NewWheelForm.test.tsx` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/NewWheelForm.tsx`, `src/renderer/src/pages/NewWheelPage.tsx` _(depends on: NewWheelForm Promoted Mode Red ✓)_
  - Form: optional `promoted?: PromotedCandidate` prop; promoted `defaultValues` per data-model mapping (contracts `'1'`, premium = promoted mark, thesis = promoted note); `usePromotedQuote(promoted)` + `useMarketStatusDisplay()`; `useWatch` on `premiumPerContract`/`strike`/`contracts`/`expiration`; banner via `derivePromoteBanner`
  - Render order per mockup: `PromoteProvenance` (fresh timestamp when fetch succeeded, else `quotedAt`) → `PromotedQuoteNotice` → field grid (mockup hints: `from screener — editable` on Ticker, `editable — override with the price you'll work` on Premium, `{computeDte(expiration)} DTE` on Expiration) → `NewWheelDerivedRow`; Advanced open by default when promoted
  - Re-fetch result never writes into form state — no `setValue`/`reset` (research ADR)
  - Page: `const promoted = parsePromotedParams(search)`; pass `promoted ?? undefined`; keep `defaultTicker` for the legacy `?ticker=` flow
  - Submit path, success card, and error mapping stay byte-identical
  - Run `pnpm test src/renderer/src/components/NewWheelForm.test.tsx` — all tests must pass
- [x] **[Refactor]** `/refactor` _(depends on: NewWheelForm Promoted Mode Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider extracting a `PromotedFormHeader` composition only if the JSX passes ~2 screens and names a real concept
  - Verify no orphaned props/imports on the `defaultTicker` path
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — E2E Tests

**Requires:** All Green tasks from previous layers ✓

### E2E Tests

- [x] **[Red]** Write failing e2e tests — `e2e/promote-to-trade.spec.ts` + helper additions in `e2e/screener-helpers.ts` _(depends on: all Green tasks ✓)_
  - Helpers: `promoteRow(page, ticker)` (click `screener-promote-<ticker>`, wait for `input#ticker`), `setOptionSnapshotFixtures(app, fixtures)` / `setMarketDataError(app, code)` runtime-env mutators via `app.evaluate` (legal: `FakeMarketDataProvider` re-reads env per call), `seedWatchlist` variant accepting notes (through production `watchlist.add` IPC)
  - All launches via `launchScreener` with the AAPL fixture (mid 2.70, strike 180, dteOffset 37, `QUOTE_TIMESTAMP`); expected time strings via the same `date-fns` formatting as `fmtQuoteTime`
  - One test per AC — names mirror AC language:
    - AC-1: Promote pre-fills the new-wheel form → `test('promote pre-fills the new-wheel form')` — ticker `AAPL`, strike `180`, expiration = local date +37, premium `2.70`, contracts `1`, derived row `$18,000`
    - AC-2: Pre-filled premium is editable, not locked → `test('pre-filled premium is editable, not locked')` — clear, type `2.65`, input holds it, no validation error
    - AC-3: Submitting records the edited premium → `test('submitting records the edited premium')` — edit to `2.65`, submit, verify the created position's premium via the production read path
    - AC-4: A fresh quote is shown when the form opens → `test('a fresh quote is shown when the form opens')` — re-serve AAPL mid `2.68` + later timestamp before promoting; provenance shows the fresh time; premium still `2.70`
    - AC-5: Warn when the price has moved materially → `test('warns when the price has moved materially')` — re-serve mid `2.50`; gold banner `Price moved: quoted $2.70 → now $2.50 — review before submitting.`; premium `2.70`; submit still succeeds
    - AC-6: Warn when the market is not open (CLOSED) → `test('warns when the market is not open — CLOSED')` — `marketStatus` CLOSED fixture; `data-kind="stale"` gold banner
    - AC-7: Warn when the market is not open (EXT) → `test('warns when the market is not open — EXT')` — EXT session fixture; same stale banner
    - AC-8: Form still works when the fresh quote can't be fetched → `test('form still works when the fresh quote cannot be fetched')` — `setMarketDataError(app, 'unavailable')` after screener renders; promoted values pre-filled; `Couldn't refresh quote — showing screener snapshot from <fmtQuoteTime(QUOTE_TIMESTAMP)>`; clear error, submit succeeds
    - AC-9: Promote never auto-submits → `test('promote never auto-submits')` — promote, don't submit, assert zero positions via `window.api`; then submit, assert exactly one
  - Run `pnpm test:e2e e2e/promote-to-trade.spec.ts` — all new tests must fail
- [x] **[Green]** Make e2e tests pass _(depends on: E2E Red ✓)_
  - This layer adds no production code — only helper plumbing; if a test is green on arrival, falsify its assertions against flipped expected values (US-65/66 technique) before trusting it
  - If e2e hangs on `waiting for event 'window'`, run `npx electron-rebuild -f -w better-sqlite3` (ABI mismatch after `pnpm test`)
  - Run `pnpm test:e2e e2e/promote-to-trade.spec.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` e2e tests _(depends on: E2E Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Check for duplication between `promoteRow` plumbing and existing screener helpers
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Completion Checklist

- [x] All Red tasks complete (tests written and failing for right reason)
- [x] All Green tasks complete (all tests passing)
- [x] All Refactor tasks complete (lint + typecheck clean)
- [x] E2E tests cover every AC (9 tests — the market-not-open outline is two)
- [x] `pnpm test && pnpm lint && pnpm typecheck` — all clean
