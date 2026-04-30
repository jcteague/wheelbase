# Implementation Plan: US-32 — Display live underlying price on position list with market status indicator

## Summary

Add a live `Price` column to the Positions list (between `Phase` and `Strike`) showing real-time underlying price and signed daily change, plus a session-aware market status pill in the page header. The renderer's TanStack Query cache is seeded once via REST (`market-data:stock-quotes`) and continuously updated by WebSocket ticks bridged through `market-data:stock-quote` push events from the existing US-31 `MarketDataProvider`. Done state: every active position row shows price + change during market hours, the pill reflects `LIVE`/`EXT`/`CLOSED`/`DELAYED`, missing tickers render `—` with a tooltip, and a stale-data banner appears when no quotes have arrived for >5 min.

## Supporting Documents

Read these before starting implementation — they contain the decisions, data model, and API contracts:

- **User Story & Acceptance Criteria:** `docs/epics/06-stories/US-32-live-underlying-price.md`
- **Mockup:** `mockups/us-32-live-underlying-price.mdx`
- **Research & Design Decisions:** `plans/us-32/research.md`
- **Data Model & Derived UI States:** `plans/us-32/data-model.md`
- **API Contracts:**
  - `plans/us-32/contracts/market-data-stock-quotes.md` (REST seed)
  - `plans/us-32/contracts/market-data-set-stock-quote-tickers.md` (stream control)
  - `plans/us-32/contracts/market-data-events.md` (push events)
  - `plans/us-32/contracts/market-data-market-status.md` (status poll)
- **Quickstart & Verification:** `plans/us-32/quickstart.md`

## Prerequisites

- US-31 already shipped: `MarketDataProvider` interface, `AlpacaMarketDataProvider` (with `connect`/`stream`/`disconnect`), `createMarketDataProvider` factory.
- The provider's `getStockQuotes` currently returns `change: '0.00'` (US-31 stub) and has no `prevClose` field — both gaps are filled in Area 1 below.
- Renderer already uses TanStack Query (`QueryClientProvider` set up in `App.tsx`).
- `usePositions()` already returns the active position list with tickers.

---

## Implementation Areas

### 1. Adapter: real `change` and new `prevClose` field

**Files to create or modify:**

- `src/main/integrations/market-data-provider.ts` — add `prevClose: string` to `StockQuote` type.
- `src/main/integrations/alpaca-market-data.ts` — replace the `getStockQuotes` SDK call with `getStocksSnapshots` (raw cast), compute `change` / `changePercent` / `prevClose` from `latest_quote` + `prev_daily_bar`. Update `mapQuoteToStockQuote` (used by stream events) to leave `prevClose` as empty string `''` since stream frames have no prev-close info.
- `src/main/integrations/alpaca-market-data.test.ts` — extended cases for the new behavior.

**Red — tests to write (in `src/main/integrations/alpaca-market-data.test.ts`):**

- `getStockQuotes returns prevClose from prev_daily_bar.c` — mock `getStocksSnapshots` raw response with `latest_quote: { bp: 182.44, ap: 182.46, t: '...' }` and `prev_daily_bar: { c: 181.00 }` for AAPL. Assert returned `StockQuote.prevClose === '181.00'`.
- `getStockQuotes computes change as (mid − prevClose)` — same fixture as above; assert `change === '1.45'` (mid `182.45` − prev `181.00`).
- `getStockQuotes computes changePercent as (change / prevClose)` — assert `changePercent === '0.0080'` (rounded to 4dp from `1.45 / 181.00`).
- `getStockQuotes returns negative change when price below prevClose` — fixture with mid `418.30`, prevClose `420.00`; assert `change === '-1.70'`, `changePercent === '-0.0040'`.
- `getStockQuotes omits unknown tickers from result` — mock raw `getStocksSnapshots` to return only AAPL when asked for `['AAPL', 'ZZZZZ']`. Assert result Map has AAPL and not ZZZZZ; no throw.
- `getStockQuotes throws MarketDataError(auth_failed) on 401` — mock SDK call to throw a 401; assert `MarketDataError` with `code === 'auth_failed'`.
- `getStockQuotes throws MarketDataError(network_error) on connection failure` — mock SDK call to throw `ECONNREFUSED`; assert `MarketDataError` with `code === 'network_error'`.

**Green — implementation:**

- Add `prevClose: string` field to the `StockQuote` type in `market-data-provider.ts`.
- In `alpaca-market-data.ts`, replace the body of `getStockQuotes(tickers)` to call `client.getStocksSnapshots({ symbols: tickers.join(',') })`, cast the response to a local raw shape `AlpacaStockSnapshot` that includes `latest_quote` and `prev_daily_bar`, then iterate and build `StockQuote` entries:
  - `bid = new Decimal(latest_quote.bp).toFixed(2)`
  - `ask = new Decimal(latest_quote.ap).toFixed(2)`
  - `mid = bid.plus(ask).dividedBy(2)`
  - `prevClose = new Decimal(prev_daily_bar.c).toFixed(2)`
  - `change = mid.minus(prevClose).toFixed(2)`
  - `changePercent = mid.minus(prevClose).dividedBy(prevClose).toFixed(4)`
  - Keep existing error-wrapping via `wrapError(err, 'getStockQuotes')`.
- Update `mapQuoteToStockQuote` (stream-event mapper) to set `prevClose: ''` so the type contract is satisfied; the IPC layer translates this to `null`.

**Refactor — cleanup to consider:**

- Extract a helper `mapAlpacaSnapshotToStockQuote(raw)` so the loop body stays small.
- Verify no fixture-only types leak into production code.
- Confirm the local `AlpacaStockSnapshot` raw type stays at module scope and isn't exported.

**Acceptance criteria covered:**

- "Position rows show daily change amount and direction" (this area provides the data).
- "Position rows show live underlying price during market hours" (the price field).

---

### 2. Zod schemas for IPC payloads

**Files to create or modify:**

- `src/main/schemas.ts` — add `GetStockQuotesPayloadSchema` and `SetStockQuoteTickersPayloadSchema`.

**Red — tests to write (in `src/main/schemas.test.ts` — new file or extend existing):**

- `GetStockQuotesPayloadSchema accepts a non-empty ticker array` — `parse({ tickers: ['AAPL', 'MSFT'] })` does not throw.
- `GetStockQuotesPayloadSchema accepts an empty ticker array` — `parse({ tickers: [] })` does not throw.
- `GetStockQuotesPayloadSchema rejects a string for tickers` — `safeParse({ tickers: 'AAPL' })` returns `success: false` with issue path `tickers`.
- `GetStockQuotesPayloadSchema rejects empty-string ticker entry` — `safeParse({ tickers: [''] })` returns `success: false`.
- `GetStockQuotesPayloadSchema rejects ticker longer than 10 chars` — `safeParse({ tickers: ['ABCDEFGHIJK'] })` returns `success: false`.
- `GetStockQuotesPayloadSchema rejects array longer than 50` — passing `Array(51).fill('A')` returns `success: false`.
- Same five cases for `SetStockQuoteTickersPayloadSchema` (it has the same shape).

**Green — implementation:**

- Add to `src/main/schemas.ts`:

  ```ts
  export const GetStockQuotesPayloadSchema = z.object({
    tickers: z.array(z.string().min(1).max(10)).max(50)
  })
  export type GetStockQuotesPayload = z.infer<typeof GetStockQuotesPayloadSchema>

  export const SetStockQuoteTickersPayloadSchema = GetStockQuotesPayloadSchema
  export type SetStockQuoteTickersPayload = z.infer<typeof SetStockQuoteTickersPayloadSchema>
  ```

  (They're structurally identical; alias is safe and documents intent.)

**Refactor — cleanup to consider:**

- Verify both schemas are exported and imported by `src/main/ipc/market-data.ts` only.
- Confirm no duplication between the two schema definitions — alias is fine.

**Acceptance criteria covered:**

- Defensive layer for all ACs (input validation precedes any provider call).

---

### 3. IPC handlers — `market-data:stock-quotes`, `:set-stock-quote-tickers`, `:market-status`

**Files to create or modify:**

- `src/main/ipc/market-data.ts` — new file: `registerMarketDataHandlers(provider, getWindow)`.
- `src/main/ipc/market-data.test.ts` — new file.

**Red — tests to write (in `src/main/ipc/market-data.test.ts`, mocking the provider):**

- `registers all three channels` — assert `ipcMain.handle` called for `market-data:stock-quotes`, `market-data:set-stock-quote-tickers`, `market-data:market-status`.
- `market-data:stock-quotes returns ok:true with quotes record on success` — provider mock returns `Map` with two entries each having `prevClose`; handler returns `{ ok: true, quotes: { AAPL: {…, prevClose: '181.00'}, MSFT: {…, prevClose: '420.00'} } }`.
- `market-data:stock-quotes returns ok:true with empty quotes when tickers is empty` — provider not called.
- `market-data:stock-quotes returns ok:false with code auth_failed when provider throws MarketDataError(auth_failed)` — assert error envelope `{ field: '__root__', code: 'auth_failed', message: ... }`.
- `market-data:stock-quotes returns ok:false with code network_error when provider throws MarketDataError(network_error)` — same shape.
- `market-data:stock-quotes returns ok:false with code internal_error on unexpected throw` — provider throws plain `Error`; logger.error called.
- `market-data:stock-quotes returns ok:false on Zod validation error` — invalid payload `{ tickers: 'AAPL' }`; result has `errors` with `field: 'tickers'`.
- `market-data:set-stock-quote-tickers calls provider.connect on first invocation` — connect mock called once.
- `market-data:set-stock-quote-tickers does not call provider.connect on second invocation` — connect mock still called only once.
- `market-data:set-stock-quote-tickers subscribes to provider.stream and forwards ticks via webContents.send` — push a synthetic `StreamEvent` through a fake `Subject`; assert `webContents.send('market-data:stock-quote', { ticker, quote })` called with `quote.prevClose === null`.
- `market-data:set-stock-quote-tickers tears down previous subscription before subscribing again` — invoke handler twice with different tickers; assert previous subscription's unsubscribe ran before second subscribe.
- `market-data:set-stock-quote-tickers with empty tickers tears down without subscribing` — handler returns `{ ok: true, subscribedTickers: [] }`; provider.stream not called.
- `market-data:set-stock-quote-tickers forwards stream errors via webContents.send` — emit error from the fake Subject; assert `webContents.send('market-data:stream-error', { feed: 'stockQuotes', code, message, reconnectable: true })`.
- `market-data:market-status returns ok:true with status` — provider returns `{ isOpen: true, session: 'regular', nextOpen: ..., nextClose: ... }`; handler returns `{ ok: true, status: {...} }`.
- `market-data:market-status returns ok:false on MarketDataError` — same envelope pattern.

**Green — implementation:**

- Create `src/main/ipc/market-data.ts` exporting `registerMarketDataHandlers(provider: MarketDataProvider, getWindow: () => BrowserWindow | null)`.
- Reuse the existing `handleIpcCall(label, fn)` pattern (copied from `src/main/ipc/positions.ts`); convert `MarketDataError` → field-error envelope using its `code`.
- Module-scoped state inside the closure: `let connected = false`, `let activeStreamSub: Subscription | null = null`.
- Handler `market-data:stock-quotes`:
  1. `parsePayload` with `GetStockQuotesPayloadSchema`.
  2. If `tickers.length === 0`, return `{ ok: true, quotes: {} }`.
  3. `const map = await provider.getStockQuotes(tickers)`.
  4. Convert `Map` to `Record`, copying every field including `prevClose`.
  5. Return `{ ok: true, quotes }`.
- Handler `market-data:set-stock-quote-tickers`:
  1. Parse payload.
  2. `activeStreamSub?.unsubscribe()`; `activeStreamSub = null`.
  3. If `tickers.length === 0`, return `{ ok: true, subscribedTickers: [] }`.
  4. If `!connected`, `await provider.connect(); connected = true`.
  5. `const obs = provider.stream('stockQuotes', tickers)`.
  6. `activeStreamSub = obs.subscribe({ next: (event) => getWindow()?.webContents.send('market-data:stock-quote', { ticker: event.symbol, quote: { ...flattenStockQuote(event.data), prevClose: null } }), error: (err) => getWindow()?.webContents.send('market-data:stream-error', { feed: 'stockQuotes', code: err.code ?? 'unknown', message: err.message ?? '', reconnectable: err.reconnectable ?? true }) })`.
  7. Return `{ ok: true, subscribedTickers: tickers }`.
- Handler `market-data:market-status`:
  1. `const status = await provider.getMarketStatus()`.
  2. Return `{ ok: true, status }`.
- Helper `flattenStockQuote(q: StockQuote): IpcStockQuote` — picks fields, never includes `change`/`changePercent` (renderer derives those).

**Refactor — cleanup to consider:**

- Move the IPC error envelope helper into a shared module if it diverges from `positions.ts` (otherwise import from there).
- Confirm no DB or filesystem references in this file (it's purely a provider façade).
- Check that `flattenStockQuote` is reused by both handlers for consistency.

**Acceptance criteria covered:**

- Foundational handlers for every AC. Specific AC bindings happen in later areas.

---

### 4. Wire the provider singleton in `main/index.ts`

**Files to create or modify:**

- `src/main/index.ts` — instantiate `createMarketDataProvider`; register handlers; disconnect on quit.

**Red — tests to write:**

- No new tests at this level — `main/index.ts` is a wiring file. Coverage comes via the IPC handler tests above and the E2E tests.

**Green — implementation:**

- Import `createMarketDataProvider` and `registerMarketDataHandlers`.
- After `initDb()`, build the provider:

  ```ts
  const provider = createMarketDataProvider({
    provider: 'alpaca',
    keyId: process.env.ALPACA_KEY_ID ?? '',
    secretKey: process.env.ALPACA_SECRET_KEY ?? '',
    paper: process.env.ALPACA_PAPER !== 'false',
    dataFeed: process.env.ALPACA_DATA_FEED,
    optionFeed: process.env.ALPACA_OPTION_FEED
  })
  ```

- Track the main window in a module-level `let mainWindow: BrowserWindow | null = null` and assign it in `createWindow`.
- `registerMarketDataHandlers(provider, () => mainWindow)`.
- `app.on('before-quit', () => { void provider.disconnect() })`.

**Refactor — cleanup to consider:**

- If `process.env` reads are duplicated with `alpaca.ts`, leave both in place — `alpaca.ts` is already deprecated per US-31.

**Acceptance criteria covered:**

- Foundational wiring. Specific ACs verified in the renderer areas.

---

### 5. Preload bridge — invoke + event listeners

**Files to create or modify:**

- `src/preload/index.ts` — add `getStockQuotes`, `setStockQuoteTickers`, `getMarketStatus`, `onStockQuote`, `onStreamError`.
- `src/preload/index.d.ts` — add the IPC-flat types and extend `window.api`.

**Red — tests to write:**

- No tests for the preload itself (it's a thin bridge). Type correctness is enforced by `pnpm typecheck`; runtime correctness is exercised by the renderer adapter tests in Area 6 and the E2E tests in the final area.

**Green — implementation:**

- In `index.d.ts`, add the types from `data-model.md`: `IpcStockQuote`, `IpcMarketStatus`, `IpcGetStockQuotesPayload`, `IpcGetStockQuotesResult`, `IpcSetStockQuoteTickersPayload`, `IpcSetStockQuoteTickersResult`, `IpcGetMarketStatusResult`, `IpcStockQuoteEvent`, `IpcStreamErrorEvent`. Extend `Window['api']` with:
  - `getStockQuotes: (payload: IpcGetStockQuotesPayload) => Promise<IpcGetStockQuotesResult>`
  - `setStockQuoteTickers: (payload: IpcSetStockQuoteTickersPayload) => Promise<IpcSetStockQuoteTickersResult>`
  - `getMarketStatus: () => Promise<IpcGetMarketStatusResult>`
  - `onStockQuote: (cb: (e: IpcStockQuoteEvent) => void) => () => void`
  - `onStreamError: (cb: (e: IpcStreamErrorEvent) => void) => () => void`
- In `index.ts`, add the corresponding methods to `api`:
  - `getStockQuotes`, `setStockQuoteTickers`, `getMarketStatus` use the existing `invoke(...)`.
  - `onStockQuote` and `onStreamError` register `ipcRenderer.on(channel, listener)` and return an unsubscribe function that calls `ipcRenderer.removeListener`.

**Refactor — cleanup to consider:**

- Verify `index.d.ts` stays alphabetized within `Window['api']` (or matches surrounding order) for readability.

**Acceptance criteria covered:**

- Foundational. Concrete AC bindings happen in Area 7+.

---

### 6. Renderer adapter — `api/market-data.ts`

**Files to create or modify:**

- `src/renderer/src/api/market-data.ts` — new file: `getStockQuotes`, `getMarketStatus`, types re-exports.
- `src/renderer/src/api/market-data.test.ts` — new file.

**Red — tests to write (in `src/renderer/src/api/market-data.test.ts` with `window.api` mocked):**

- `getStockQuotes returns the quotes record on success` — mock `window.api.getStockQuotes` to resolve with `{ ok: true, quotes: { AAPL: {...} } }`; assert returned object equals `{ AAPL: {...} }`.
- `getStockQuotes throws ApiError(502) on ok:false` — mock to resolve with `{ ok: false, errors: [{ field: '__root__', code: 'auth_failed', message: '...' }] }`; assert thrown object has `status: 502` and includes the errors in `body.detail`.
- `getMarketStatus returns the status on success` — mock to resolve with `{ ok: true, status: {...} }`.
- `getMarketStatus throws ApiError(502) on ok:false`.

**Green — implementation:**

- File exports types: `StockQuote`, `StockQuotesByTicker`, `MarketStatus` (re-exports of the IPC-flat types from preload, with renderer-side names).
- `getStockQuotes(tickers: string[])`: calls `window.api.getStockQuotes({ tickers })`; on `!ok` throw `apiError(502, { detail: result.errors })`; else return `result.quotes`.
- `getMarketStatus()`: calls `window.api.getMarketStatus()`; on `!ok` throw `apiError(502, ...)`; else return `result.status`.
- Reuse the `apiError` helper pattern from `src/renderer/src/api/positions.ts` (extract to `src/renderer/src/api/error.ts` if not already shared, otherwise inline).

**Refactor — cleanup to consider:**

- If `apiError` is duplicated across `positions.ts` and `market-data.ts`, extract a shared `error.ts` module. Otherwise leave inline.
- Confirm renderer never imports from `src/main/`.

**Acceptance criteria covered:**

- Foundational. Concrete AC bindings happen in Area 7+.

---

### 7. Hook — `useMarketStatus`

**Files to create or modify:**

- `src/renderer/src/hooks/useMarketStatus.ts` — new file.
- `src/renderer/src/hooks/useMarketStatus.test.ts` — new file.
- `src/renderer/src/hooks/marketDataQueryKeys.ts` — new file holding the shared keys.

**Red — tests to write (in `useMarketStatus.test.ts`, using `QueryClient` and a mocked `window.api`):**

- `returns the market status from a successful query` — mock `window.api.getMarketStatus` to resolve with a regular-session status; render hook in `QueryClientProvider`; assert `result.current.data?.session === 'regular'`.
- `surfaces error state when window.api fails` — mock to reject; assert `result.current.isError === true`.
- `query key is ['market-data', 'market-status']` — verify by inspecting `queryClient.getQueryCache()`.

**Green — implementation:**

- `marketDataQueryKeys.ts`:

  ```ts
  export const marketDataQueryKeys = {
    stockQuotes: (tickers: string[]) =>
      ['market-data', 'stock-quotes', tickers.slice().sort().join(',')] as const,
    marketStatus: ['market-data', 'market-status'] as const
  }
  ```

- `useMarketStatus.ts`:

  ```ts
  export function useMarketStatus(): UseQueryResult<MarketStatus, ApiError> {
    return useQuery({
      queryKey: marketDataQueryKeys.marketStatus,
      queryFn: getMarketStatus,
      refetchInterval: 60_000,
      staleTime: 30_000,
      refetchOnWindowFocus: true
    })
  }
  ```

**Refactor — cleanup to consider:**

- Verify the `refetchInterval` constant is the only timing parameter not pulled from a shared location.

**Acceptance criteria covered:**

- Foundational. Specific AC bindings (`LIVE`/`EXT`/`CLOSED`/`DELAYED`) happen in the page area below.

---

### 8. Hook — `useStockQuotes` with stream bridge

**Files to create or modify:**

- `src/renderer/src/hooks/useStockQuotes.ts` — new file.
- `src/renderer/src/hooks/useStockQuotes.test.ts` — new file.

**Red — tests to write (in `useStockQuotes.test.ts`, with mocked `window.api` and a fresh `QueryClient` per test):**

- `disabled when tickers is empty` — assert `query.fetchStatus === 'idle'`; `window.api.getStockQuotes` not called.
- `fetches REST seed on mount when tickers provided` — mock to resolve with `{ ok: true, quotes: { AAPL: { price: '182.45', prevClose: '181.00', ... } } }`; assert `result.current.data?.AAPL.price === '182.45'`.
- `merges incoming tick into cache, preserving prevClose` — capture the `onStockQuote` callback registered by the hook; invoke it with `{ ticker: 'AAPL', quote: { price: '182.50', prevClose: null, ... } }`; assert `result.current.data?.AAPL.price === '182.50'` and `prevClose === '181.00'`.
- `dataUpdatedAt advances on stream tick` — capture initial `dataUpdatedAt`; fire a tick; assert new `dataUpdatedAt > initial`.
- `calls setStockQuoteTickers on mount with sorted tickers` — assert `window.api.setStockQuoteTickers` called with `{ tickers: ['AAPL', 'MSFT'] }` even if input was `['MSFT', 'AAPL']`.
- `calls setStockQuoteTickers([]) on unmount` — unmount the hook; assert call.
- `re-subscribes when tickers change` — re-render with new `['AAPL']`; assert second `setStockQuoteTickers` call with `{ tickers: ['AAPL'] }`.
- `surfaces stream error via streamError state` — fire `onStreamError` with `{ feed: 'stockQuotes', code: 'stream_disconnected', ... }`; assert `result.current.streamError !== null`.
- `tick for a ticker not in cache adds the entry with prevClose: null` — fire tick for `NVDA` (not in seed); assert cache now has `NVDA` with `prevClose: null`.

**Green — implementation:**

- `useStockQuotes(tickers: string[])` returns `{ ...UseQueryResult, streamError: IpcStreamErrorEvent | null }`.
- Memoize `sortedTickers = useMemo(() => tickers.slice().sort(), [tickers])` and `queryKey = marketDataQueryKeys.stockQuotes(sortedTickers)`.
- `useQuery({ queryKey, queryFn: () => getStockQuotes(sortedTickers), enabled: sortedTickers.length > 0, staleTime: Infinity, refetchOnWindowFocus: true })`.
- `useState<IpcStreamErrorEvent | null>(null)` for `streamError`.
- `useEffect(...)` keyed on `[queryClient, sortedTickers.join(',')]`:
  - If empty, `void window.api.setStockQuoteTickers({ tickers: [] })`; return.
  - `void window.api.setStockQuoteTickers({ tickers: sortedTickers })`.
  - `const offTick = window.api.onStockQuote(...)` — uses `queryClient.setQueryData(queryKey, prev => mergeTick(prev, event))`.
  - `const offErr = window.api.onStreamError((event) => setStreamError(event))`.
  - Cleanup: `offTick(); offErr(); void window.api.setStockQuoteTickers({ tickers: [] })`.
- `mergeTick(prev, event)` helper: spreads `prev`, overwrites `[event.ticker]` with `{ ...event.quote, prevClose: event.quote.prevClose ?? prev?.[event.ticker]?.prevClose ?? null }`.
- Return value: `{ ...query, streamError }`.

**Refactor — cleanup to consider:**

- Extract `mergeTick` to a top-level pure function for testability.
- Verify the effect cleanup also resets `streamError` so a successful re-subscribe clears the stale flag.

**Acceptance criteria covered:**

- "Price updates on polling interval without full page reload" (cache merge in place, no remount).
- Foundational for all data-driven ACs.

---

### 9. Component — `MarketStatusPill`

**Files to create or modify:**

- `src/renderer/src/components/MarketStatusPill.tsx` — new file.
- `src/renderer/src/components/MarketStatusPill.test.tsx` — new file.
- `src/renderer/src/index.css` — add `@keyframes wb-pulse` from the mockup so the live-dot pulse animation works.

**Red — tests to write:**

- `renders LIVE label and green dot for state="LIVE"` — assert presence of `LIVE` text and a `data-testid="market-status-dot"` element with the correct color class/style.
- `renders EXT label and amber dot for state="EXT"`.
- `renders CLOSED label and gray dot for state="CLOSED"`.
- `renders DELAYED label and amber dot (no pulse) for state="DELAYED"`.
- `applies pulse animation only when state is LIVE` — assert the dot has `animation: wb-pulse ...` style/class only in LIVE state.

**Green — implementation:**

- `type MarketStatusPillProps = { state: MarketStatusDisplay }`.
- Component is a single `<span>` containing the dot + label, mirroring the mockup's `MarketStatusPill` JSX (lines 130–159 of `mockups/us-32-live-underlying-price.mdx`):
  - Pill colors: green `#3fb950` for `LIVE`, amber `#e6a817` for `EXT`/`DELAYED`, gray `#6e7681` for `CLOSED`.
  - Dot is a 6×6 round span with `boxShadow` + `animation: wb-pulse 1.8s ease-in-out infinite` only when `state === 'LIVE'`.
  - Label is one of `LIVE`, `EXT`, `CLOSED`, `DELAYED`.
- Use existing wb design tokens (`var(--wb-green)` etc.) from `index.css` rather than hard-coded hex where the project provides them, but match mockup hex when no token exists.
- Add `@keyframes wb-pulse` to `index.css`.

**Refactor — cleanup to consider:**

- If a similar pulse animation already exists, reuse it.
- Confirm the component is a pure function with no internal state.

**Acceptance criteria covered:**

- Visual contract for: "green LIVE dot indicator", "gray CLOSED indicator", "amber EXT indicator", "market status dot changes to amber" (DELAYED).

---

### 10. Component — `PriceCell`

**Files to create or modify:**

- `src/renderer/src/components/PriceCell.tsx` — new file.
- `src/renderer/src/components/PriceCell.test.tsx` — new file.

**Red — tests to write:**

- `renders price and positive change in green when up` — props `{ price: '182.45', prevClose: '181.00' }`; assert `$182.45` text, `+$1.45` text in green class/style.
- `renders price and negative change in red when down` — props `{ price: '418.30', prevClose: '420.00' }`; assert `-$1.70` text in red class/style.
- `renders dash and tooltip when quote is undefined` — render with `quote: undefined`; assert `—` is shown and the parent `<td>` has `title="Price unavailable"`.
- `renders dash and tooltip when prevClose is null and price is null` — defensive case.
- `renders price without change line when prevClose is null but price is set (post-stream-tick before re-seed)` — assert price visible, no change row.

**Green — implementation:**

- `type PriceCellProps = { quote: StockQuote | undefined }`.
- Match the mockup's `PriceCell` markup (lines 161–201): use a `<td>` with mono font, two stacked rows — price (top, larger weight, primary color) and signed change (bottom, green/red, smaller).
- Format helper: signed change as `+$1.45` or `-$1.70` (sign-prefixed; mockup uses `+$1.45`, but `fmtMoney` returns `-$1.70` for negative — for positive, prefix `+` manually).
- Derivation:
  - If `quote === undefined`: render dash + `unavailable` sub-label, set `title="Price unavailable"` on the `<td>` and `cursor: 'help'`.
  - Else: render `fmtMoney(quote.price)`. If `quote.prevClose != null`, compute `change = quote.price − quote.prevClose` and `up = change >= 0`; render `(up ? '+' : '') + fmtMoney(change)` colored green/red.

**Refactor — cleanup to consider:**

- Extract a `formatSignedMoney(value)` helper if reused elsewhere.
- Verify TableCell primitive can be reused for surrounding padding/borders.

**Acceptance criteria covered:**

- "shows '$182.45'" — price rendering.
- "shows '+$1.45' in green text" / "shows '-$1.70' in red text" — change rendering with colors.
- "TSLA price column shows '—'" + tooltip — unavailable state.

---

### 11. Component — `StaleDataBanner`

**Files to create or modify:**

- `src/renderer/src/components/StaleDataBanner.tsx` — new file.
- `src/renderer/src/components/StaleDataBanner.test.tsx` — new file.

**Red — tests to write:**

- `renders nothing when not stale` — props `{ stale: false, minutesAgo: 0 }`; assert nothing rendered.
- `renders banner with minutesAgo when stale` — props `{ stale: true, minutesAgo: 6 }`; assert banner text contains `Prices may be delayed — last updated 6m ago`.
- `applies amber styling when stale` — assert amber color class/style on the banner element.

**Green — implementation:**

- `type StaleDataBannerProps = { stale: boolean; minutesAgo: number }`.
- If not stale, return `null`.
- Else render the amber banner from the mockup (lines 309–326): `<div>⚠ Prices may be delayed — last updated {minutesAgo}m ago</div>` with amber background `#e6a81712`, amber border `#e6a81730`, amber text `#e6a817`, mono font.

**Refactor — cleanup to consider:**

- Confirm the banner is fully presentational (no time math inside).

**Acceptance criteria covered:**

- "a subtle banner appears: 'Prices may be delayed — last updated 6m ago'" — banner copy.

---

### 12. Modify `PositionRow` — add Price column

**Files to create or modify:**

- `src/renderer/src/components/PositionCard.tsx` — add a `quote?: StockQuote` prop and a new `<PriceCell>` between Phase and Strike columns.
- `src/renderer/src/components/PositionCard.test.tsx` — new test cases (file exists; extend).

**Red — tests to write:**

- `renders PriceCell in the third column when quote is provided`.
- `renders PriceCell with quote=undefined when quote prop is missing`.
- `column order is Ticker, Phase, Price, Strike, Expiration, DTE, Premium, Cost Basis` — assert by inspecting `<td>` order.

**Green — implementation:**

- Update `Props`: `{ item, index, isClosed, quote?: StockQuote }`.
- Insert `<PriceCell quote={quote} />` between the Phase `<TableCell>` and Strike `<TableCell>`.

**Refactor — cleanup to consider:**

- Confirm row-click handler still applies — `PriceCell` should not stopPropagation on its own clicks unless needed (e.g., if tooltip needs distinct focus, consider `onClick={(e) => e.stopPropagation()}` only when truly necessary).

**Acceptance criteria covered:**

- "each row displays the current stock price in a 'Price' column".

---

### 13. Modify `PositionsListPage` — wire data and pill, render banner

**Files to create or modify:**

- `src/renderer/src/pages/PositionsListPage.tsx` — derive tickers, call `useStockQuotes`, `useMarketStatus`; pass quote to each `PositionRow`; show `MarketStatusPill` in the page header next to "+ New Wheel"; render `StaleDataBanner` above the active table; update `TABLE_COLUMNS` to include `Price`; switch the table-header style to render the price header (plus optional inline pill if the design supports it).
- `src/renderer/src/pages/PositionsListPage.test.tsx` — add test cases.

**Red — tests to write:**

- `shows MarketStatusPill with state LIVE during regular session` — `useMarketStatus` mock returns `session: 'regular'`; quotes mock returns prices >0; assert pill text `LIVE`.
- `shows MarketStatusPill with state EXT during pre session` — assert `EXT`.
- `shows MarketStatusPill with state EXT during post session` — assert `EXT`.
- `shows MarketStatusPill with state CLOSED when session is closed` — assert `CLOSED`.
- `shows MarketStatusPill with state DELAYED when last update >5 min ago` — mock query with `dataUpdatedAt = Date.now() - 360_000`; assert pill `DELAYED`.
- `shows MarketStatusPill with state DELAYED when streamError is set` — even during regular session, if `streamError != null`, pill is `DELAYED`.
- `renders StaleDataBanner with correct minutesAgo when stale` — same fixture as DELAYED; banner shows `last updated 6m ago`.
- `does not render StaleDataBanner when not stale` — fresh `dataUpdatedAt`; banner absent.
- `passes quote to each PositionRow` — render with positions for AAPL/MSFT and quotes mock returning their entries; assert each row receives matching quote.
- `passes undefined quote when ticker missing from quotes` — render with TSLA position but quotes mock returns only AAPL; assert TSLA's row has `quote=undefined`.
- `derives ticker list from active positions only` — closed positions have ticker BBB; quotes hook called with `['AAA']` not `['AAA', 'BBB']`.
- `Price column header renders between Phase and Strike` — assert `<th>` order.

**Green — implementation:**

- Update `TABLE_COLUMNS` to `['Ticker', 'Phase', 'Price', 'Strike', 'Expiration', 'DTE', 'Premium', 'Cost Basis']`.
- Inside the page component:
  - `const tickers = useMemo(() => Array.from(new Set(activePositions.map((p) => p.ticker))).sort(), [activePositions])`.
  - `const quotesQuery = useStockQuotes(tickers)`.
  - `const statusQuery = useMarketStatus()`.
  - `const stale = quotesQuery.dataUpdatedAt > 0 && (Date.now() - quotesQuery.dataUpdatedAt > STALE_THRESHOLD_MS)`.
  - `const minutesAgo = Math.floor((Date.now() - quotesQuery.dataUpdatedAt) / 60_000)`.
  - `const display = deriveMarketStatusDisplay(statusQuery.data?.session, stale, quotesQuery.streamError)` — pure helper.
- Update the page header right cluster to include `<MarketStatusPill state={display} />` before the `+ New Wheel` link.
- Render `<StaleDataBanner stale={stale || quotesQuery.streamError !== null} minutesAgo={minutesAgo} />` between the page header and section header.
- Update `PositionTable` to accept a `quotes` prop and pass `quotes[item.ticker]` into each `PositionRow`.
- New helper `deriveMarketStatusDisplay(session, stale, streamError): MarketStatusDisplay` — returns `'DELAYED'` if `streamError || stale`, then maps `session`.
- Use the `STALE_THRESHOLD_MS = 5 * 60 * 1000` constant from `data-model.md`.

**Refactor — cleanup to consider:**

- Extract `deriveMarketStatusDisplay` to its own file (`src/renderer/src/lib/market-status.ts`) so it's testable in isolation.
- Verify the page still renders the loading state correctly (no crash when quotes haven't arrived yet).
- Closed-section column count must still match the new 8-column header (the same columns apply to closed rows; closed rows just receive `quote={undefined}` and show `—`).

**Acceptance criteria covered:**

- Wires all UI ACs together. Per-AC e2e coverage is in the next area.

---

### 14. E2e Tests

**Files to create or modify:**

- `e2e/live-underlying-price.spec.ts` — new file.

The spec stubs `window.api.getStockQuotes`, `window.api.setStockQuoteTickers`, `window.api.onStockQuote`, `window.api.onStreamError`, and `window.api.getMarketStatus` from inside the Playwright page (via `page.evaluate(() => { window.api.<...> = ... })`) so the test does not depend on real Alpaca credentials or live broker behavior.

**Red — tests to write (each Red bullet is one e2e test case; test name mirrors the AC language):**

- `displays live underlying price with green LIVE dot during regular session` — Background: open AAPL/MSFT/TSLA active positions. Stub: `getMarketStatus → { session: 'regular', isOpen: true, ... }`; `getStockQuotes → { AAPL: { price: '182.45', prevClose: '181.00', ... }, MSFT: {...}, TSLA: {...} }`. Navigate to positions list. Assert each row's price text (`$182.45`, etc.) appears, and the page header contains a pill with text `LIVE` (`data-testid="market-status-pill"`).

- `updates a row's price when a stream tick arrives, without page reload or spinner` — same Background + stubs. After initial render captures `data-testid="position-card-AAPL-price"` text `$182.45`, dispatch the captured `onStockQuote` listener with `{ ticker: 'AAPL', quote: { price: '183.10', prevClose: null, ... } }`. Assert text becomes `$183.10` and no `data-testid="loading"` element appeared during the transition.

- `shows daily change amount and direction (green for up, red for down)` — same Background + stubs but with AAPL up (prevClose `181.00`, price `182.45`) and MSFT down (prevClose `420.00`, price `418.30`). Assert AAPL shows `+$1.45` with green color (test by class or computed style), MSFT shows `-$1.70` with red color.

- `shows last closing price with gray CLOSED indicator when market is closed` — Stub `getMarketStatus → { session: 'closed', isOpen: false, ... }`; `getStockQuotes` still returns prices. Assert the row shows `$182.00` and the pill text is `CLOSED`.

- `shows extended hours price with amber EXT indicator during pre/post market` — Stub `getMarketStatus → { session: 'post', isOpen: false, ... }`; AAPL price `183.50`. Assert AAPL row shows `$183.50` and the pill text is `EXT`.

- `shows dash with tooltip when price data is unavailable for a ticker` — Stub `getStockQuotes → { AAPL: {...}, MSFT: {...} }` (TSLA absent). Assert the TSLA row's price cell shows `—` and the cell has `title="Price unavailable"`. Assert AAPL/MSFT rows still display normally.

- `shows stale data warning banner and amber DELAYED indicator when no update has arrived for 5 minutes` — Stub `getStockQuotes` to resolve immediately with stub data, then immediately advance the test clock (or directly call `queryClient.setQueryData` via `page.evaluate` to simulate an old `dataUpdatedAt` 6 minutes ago). Assert the banner with text `Prices may be delayed — last updated 6m ago` is visible and the pill text is `DELAYED`.

**Green — implementation:**

- Build `e2e/live-underlying-price.spec.ts` following the project's existing pattern (see `e2e/csp-flow.spec.ts`):
  - Spin up Electron with a temp DB.
  - Use `page.addInitScript` (preferable to per-test stubs) or `page.evaluate` after first window to attach the stubbed `window.api.*` methods. Keep references to the registered `onStockQuote` / `onStreamError` callbacks in window-scope so the test can invoke them later.
  - Add `data-testid` attributes to the price cell, market status pill, and stale banner during Areas 9–13 (PriceCell, MarketStatusPill, StaleDataBanner) so e2e selectors are stable.
  - Use the project's existing helpers (`localDate`, `selectDate`) where applicable to seed positions before each scenario.

**Refactor — cleanup to consider:**

- Extract a `setupMarketDataStubs(page, fixtures)` helper if the stub-attachment block is repeated in many tests (likely yes — every spec uses it).
- Verify `data-testid` attributes don't leak into production snapshot tests in a way that destabilizes them.

**Acceptance criteria covered:**

- Each e2e test case maps 1-to-1 with one Gherkin scenario from the user story:
  - "Position rows show live underlying price during market hours" → `displays live underlying price with green LIVE dot during regular session`
  - "Price updates on polling interval without full page reload" → `updates a row's price when a stream tick arrives, without page reload or spinner`
  - "Price shows daily change amount and direction" → `shows daily change amount and direction (green for up, red for down)`
  - "Market closed — show last closing price with indicator" → `shows last closing price with gray CLOSED indicator when market is closed`
  - "Extended hours — show pre/post market price" → `shows extended hours price with amber EXT indicator during pre/post market`
  - "Price data unavailable — show dash with tooltip" → `shows dash with tooltip when price data is unavailable for a ticker`
  - "Stale data warning when last update exceeds 5 minutes" → `shows stale data warning banner and amber DELAYED indicator when no update has arrived for 5 minutes`

---

## AC Audit (every story AC mapped to one e2e test case)

| AC from `US-32-live-underlying-price.md`                     | E2E test case in `live-underlying-price.spec.ts`                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Position rows show live underlying price during market hours | `displays live underlying price with green LIVE dot during regular session`                            |
| Price updates on polling interval without full page reload   | `updates a row's price when a stream tick arrives, without page reload or spinner`                     |
| Price shows daily change amount and direction                | `shows daily change amount and direction (green for up, red for down)`                                 |
| Market closed — show last closing price with indicator       | `shows last closing price with gray CLOSED indicator when market is closed`                            |
| Extended hours — show pre/post market price                  | `shows extended hours price with amber EXT indicator during pre/post market`                           |
| Price data unavailable — show dash with tooltip              | `shows dash with tooltip when price data is unavailable for a ticker`                                  |
| Stale data warning when last update exceeds 5 minutes        | `shows stale data warning banner and amber DELAYED indicator when no update has arrived for 5 minutes` |

All 7 AC scenarios are covered by exactly one e2e test case each.
