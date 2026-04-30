# US-32 — Display live underlying price on position list — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off

---

## Layer 1 — Foundation (no dependencies)

> All five areas can be started immediately and run in parallel.

### Area 1 — Adapter: real `change` and new `prevClose` field

- [x] **[Red]** Write failing tests — `src/main/integrations/alpaca-market-data.test.ts`
  - Test cases:
    - `getStockQuotes returns prevClose from prev_daily_bar.c` — mock `getStocksSnapshots` raw response; assert `StockQuote.prevClose === '181.00'`
    - `getStockQuotes computes change as (mid − prevClose)` — assert `change === '1.45'`
    - `getStockQuotes computes changePercent as (change / prevClose)` — assert `changePercent === '0.0080'`
    - `getStockQuotes returns negative change when price below prevClose` — mid `418.30`, prevClose `420.00`; assert `change === '-1.70'`, `changePercent === '-0.0040'`
    - `getStockQuotes omits unknown tickers from result` — mock returns only AAPL for `['AAPL', 'ZZZZZ']`; assert result has AAPL, not ZZZZZ, no throw
    - `getStockQuotes throws MarketDataError(auth_failed) on 401`
    - `getStockQuotes throws MarketDataError(network_error) on ECONNREFUSED`
  - Run `pnpm test src/main/integrations/alpaca-market-data.test.ts` — all new tests must fail

- [x] **[Green]** Implement — `src/main/integrations/market-data-provider.ts` + `src/main/integrations/alpaca-market-data.ts` _(depends on: Area 1 Red ✓)_
  - Add `prevClose: string` to `StockQuote` type in `market-data-provider.ts`
  - Replace `getStockQuotes(tickers)` body: call `client.getStocksSnapshots({ symbols: tickers.join(',') })`, cast to local `AlpacaStockSnapshot` type with `latest_quote` + `prev_daily_bar`
  - Compute per-entry: `bid = Decimal(latest_quote.bp).toFixed(2)`, `ask = Decimal(latest_quote.ap).toFixed(2)`, `mid = (bid+ask)/2`, `prevClose = Decimal(prev_daily_bar.c).toFixed(2)`, `change = mid − prevClose`, `changePercent = (change / prevClose).toFixed(4)`
  - Keep existing `wrapError(err, 'getStockQuotes')` error-wrapping
  - Update `mapQuoteToStockQuote` (stream mapper) to set `prevClose: ''` to satisfy the type
  - Run `pnpm test src/main/integrations/alpaca-market-data.test.ts` — all tests must pass

- [x] **[Refactor]** `/refactor` — `src/main/integrations/alpaca-market-data.ts` _(depends on: Area 1 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider extracting `mapAlpacaSnapshotToStockQuote(raw)` helper; confirm `AlpacaStockSnapshot` type is module-scoped and not exported
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 2 — Zod schemas for IPC payloads

- [x] **[Red]** Write failing tests — `src/main/schemas.test.ts` (new file or extend existing)
  - Test cases for `GetStockQuotesPayloadSchema`:
    - `accepts a non-empty ticker array` — `parse({ tickers: ['AAPL', 'MSFT'] })` does not throw
    - `accepts an empty ticker array` — `parse({ tickers: [] })` does not throw
    - `rejects a string for tickers` — `safeParse({ tickers: 'AAPL' })` → `success: false`, path `tickers`
    - `rejects empty-string ticker entry` — `safeParse({ tickers: [''] })` → `success: false`
    - `rejects ticker longer than 10 chars` — `safeParse({ tickers: ['ABCDEFGHIJK'] })` → `success: false`
    - `rejects array longer than 50` — `safeParse({ tickers: Array(51).fill('A') })` → `success: false`
  - Same six cases for `SetStockQuoteTickersPayloadSchema`
  - Run `pnpm test src/main/schemas.test.ts` — all new tests must fail

- [x] **[Green]** Implement — `src/main/schemas.ts` _(depends on: Area 2 Red ✓)_
  - Add:

    ```ts
    export const GetStockQuotesPayloadSchema = z.object({
      tickers: z.array(z.string().min(1).max(10)).max(50)
    })
    export type GetStockQuotesPayload = z.infer<typeof GetStockQuotesPayloadSchema>

    export const SetStockQuoteTickersPayloadSchema = GetStockQuotesPayloadSchema
    export type SetStockQuoteTickersPayload = z.infer<typeof SetStockQuoteTickersPayloadSchema>
    ```

  - Run `pnpm test src/main/schemas.test.ts` — all tests must pass

- [x] **[Refactor]** `/refactor` — `src/main/schemas.ts` _(depends on: Area 2 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Confirm no duplication; alias is the correct pattern here
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 9 — Component: `MarketStatusPill`

- [x] **[Red]** Write failing tests — `src/renderer/src/components/MarketStatusPill.test.tsx` (new file)
  - Test cases:
    - `renders LIVE label and green dot for state="LIVE"` — assert `LIVE` text + `data-testid="market-status-dot"` with green styling
    - `renders EXT label and amber dot for state="EXT"`
    - `renders CLOSED label and gray dot for state="CLOSED"`
    - `renders DELAYED label and amber dot (no pulse) for state="DELAYED"`
    - `applies pulse animation only when state is LIVE` — dot has `animation: wb-pulse` class/style only in LIVE state
  - Run `pnpm test src/renderer/src/components/MarketStatusPill.test.tsx` — all new tests must fail

- [x] **[Green]** Implement — `src/renderer/src/components/MarketStatusPill.tsx` + `src/renderer/src/index.css` _(depends on: Area 9 Red ✓)_
  - `type MarketStatusPillProps = { state: MarketStatusDisplay }` where `MarketStatusDisplay = 'LIVE' | 'EXT' | 'CLOSED' | 'DELAYED'`
  - Add `data-testid="market-status-pill"` on outer span, `data-testid="market-status-dot"` on inner dot span
  - Colors (from mockup): green `#3fb950` (LIVE), amber `#e6a817` (EXT/DELAYED), gray `#6e7681` (CLOSED)
  - Dot: 6×6 round span, `boxShadow` + `animation: wb-pulse 1.8s ease-in-out infinite` only when `state === 'LIVE'`
  - Add `@keyframes wb-pulse` to `src/renderer/src/index.css`
  - Run `pnpm test src/renderer/src/components/MarketStatusPill.test.tsx` — all tests must pass

- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/MarketStatusPill.tsx` _(depends on: Area 9 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Confirm component is a pure function with no internal state; reuse any existing wb pulse keyframe if present
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 10 — Component: `PriceCell`

- [x] **[Red]** Write failing tests — `src/renderer/src/components/PriceCell.test.tsx` (new file)
  - Test cases:
    - `renders price and positive change in green when up` — props `{ price: '182.45', prevClose: '181.00' }`; assert `$182.45` + `+$1.45` in green
    - `renders price and negative change in red when down` — `{ price: '418.30', prevClose: '420.00' }`; assert `-$1.70` in red
    - `renders dash and tooltip when quote is undefined` — assert `—` text + `title="Price unavailable"` on the cell
    - `renders dash and tooltip when prevClose is null and price is null` — defensive case
    - `renders price without change line when prevClose is null but price is set` — price visible, no change row
  - Run `pnpm test src/renderer/src/components/PriceCell.test.tsx` — all new tests must fail

- [x] **[Green]** Implement — `src/renderer/src/components/PriceCell.tsx` _(depends on: Area 10 Red ✓)_
  - `type PriceCellProps = { quote: StockQuote | undefined }`
  - If `quote === undefined`: render `<td title="Price unavailable" style={{ cursor: 'help' }}>—</td>` with unavailable sub-label
  - Else: render `<td>` with two stacked rows — price (mono, primary color) + signed change (green/red)
  - Signed change format: `(change >= 0 ? '+' : '') + fmtMoney(change)` where `change = price − prevClose`
  - Only render change row when `quote.prevClose != null`
  - Match `PriceCell` markup from `mockups/us-32-live-underlying-price.mdx` lines 161–201
  - Run `pnpm test src/renderer/src/components/PriceCell.test.tsx` — all tests must pass

- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/PriceCell.tsx` _(depends on: Area 10 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider extracting `formatSignedMoney(value)` helper if reused elsewhere
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 11 — Component: `StaleDataBanner`

- [x] **[Red]** Write failing tests — `src/renderer/src/components/StaleDataBanner.test.tsx` (new file)
  - Test cases:
    - `renders nothing when not stale` — props `{ stale: false, minutesAgo: 0 }`; assert nothing rendered
    - `renders banner with minutesAgo when stale` — props `{ stale: true, minutesAgo: 6 }`; assert text `Prices may be delayed — last updated 6m ago`
    - `applies amber styling when stale` — assert amber color on the banner element
  - Run `pnpm test src/renderer/src/components/StaleDataBanner.test.tsx` — all new tests must fail

- [x] **[Green]** Implement — `src/renderer/src/components/StaleDataBanner.tsx` _(depends on: Area 11 Red ✓)_
  - `type StaleDataBannerProps = { stale: boolean; minutesAgo: number }`
  - If not stale, return `null`
  - Else render amber banner from mockup (lines 309–326): `<div>⚠ Prices may be delayed — last updated {minutesAgo}m ago</div>`
  - Styling: background `#e6a81712`, border `#e6a81730`, text `#e6a817`, mono font
  - Add `data-testid="stale-data-banner"` for e2e selectors
  - Run `pnpm test src/renderer/src/components/StaleDataBanner.test.tsx` — all tests must pass

- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/StaleDataBanner.tsx` _(depends on: Area 11 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Confirm fully presentational — no time math inside
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — IPC + Row (depends on Layer 1)

> Area 3 requires Areas 1+2 Green. Area 12 requires Area 10 Green. Both can run in parallel.

### Area 3 — IPC handlers

**Requires:** Area 1 Green ✓, Area 2 Green ✓

- [x] **[Red]** Write failing tests — `src/main/ipc/market-data.test.ts` (new file) _(depends on: Areas 1+2 Green ✓)_
  - Test cases (provider mocked):
    - `registers all three channels` — assert `ipcMain.handle` called for `market-data:stock-quotes`, `market-data:set-stock-quote-tickers`, `market-data:market-status`
    - `market-data:stock-quotes returns ok:true with quotes record on success` — provider mock returns Map with prevClose; result has `{ ok: true, quotes: { AAPL: { ..., prevClose: '181.00' }, MSFT: {...} } }`
    - `market-data:stock-quotes returns ok:true with empty quotes when tickers is empty` — provider not called
    - `market-data:stock-quotes returns ok:false with code auth_failed when provider throws MarketDataError(auth_failed)`
    - `market-data:stock-quotes returns ok:false with code network_error when provider throws MarketDataError(network_error)`
    - `market-data:stock-quotes returns ok:false with code internal_error on unexpected throw` — logger.error called
    - `market-data:stock-quotes returns ok:false on Zod validation error` — `{ tickers: 'AAPL' }` → errors with `field: 'tickers'`
    - `market-data:set-stock-quote-tickers calls provider.connect on first invocation`
    - `market-data:set-stock-quote-tickers does not call provider.connect on second invocation`
    - `market-data:set-stock-quote-tickers subscribes to provider.stream and forwards ticks via webContents.send` — synthetic Subject; assert `webContents.send('market-data:stock-quote', ...)` with `quote.prevClose === null`
    - `market-data:set-stock-quote-tickers tears down previous subscription before subscribing again`
    - `market-data:set-stock-quote-tickers with empty tickers tears down without subscribing` — returns `{ ok: true, subscribedTickers: [] }`; provider.stream not called
    - `market-data:set-stock-quote-tickers forwards stream errors via webContents.send` — error from Subject → `webContents.send('market-data:stream-error', { feed: 'stockQuotes', ... })`
    - `market-data:market-status returns ok:true with status`
    - `market-data:market-status returns ok:false on MarketDataError`
  - Run `pnpm test src/main/ipc/market-data.test.ts` — all new tests must fail

- [x] **[Green]** Implement — `src/main/ipc/market-data.ts` (new file) _(depends on: Area 3 Red ✓)_
  - Export `registerMarketDataHandlers(provider: MarketDataProvider, getWindow: () => BrowserWindow | null)`
  - Module-scoped state in closure: `let connected = false`, `let activeStreamSub: Subscription | null = null`
  - Handler `market-data:stock-quotes`: parse → empty shortcut → `provider.getStockQuotes(tickers)` → convert Map to Record (copy all fields including `prevClose`) → return `{ ok: true, quotes }`
  - Handler `market-data:set-stock-quote-tickers`: parse → `activeStreamSub?.unsubscribe()` → empty shortcut → connect if `!connected` → `provider.stream('stockQuotes', tickers).subscribe(next/error)` → next: `webContents.send('market-data:stock-quote', { ticker, quote: { ...flattenStockQuote(event.data), prevClose: null } })` → error: `webContents.send('market-data:stream-error', ...)` → return `{ ok: true, subscribedTickers: tickers }`
  - Handler `market-data:market-status`: `provider.getMarketStatus()` → return `{ ok: true, status }`
  - Reuse `handleIpcCall` pattern from `src/main/ipc/positions.ts`; convert `MarketDataError.code` to field-error envelope
  - Run `pnpm test src/main/ipc/market-data.test.ts` — all tests must pass

- [x] **[Refactor]** `/refactor` — `src/main/ipc/market-data.ts` _(depends on: Area 3 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Move IPC error envelope helper to shared module if it diverges from `positions.ts`; confirm `flattenStockQuote` used by both handlers; no DB/filesystem references
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 12 — Modify `PositionCard` — add Price column

**Requires:** Area 10 Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/components/PositionCard.test.tsx` (extend existing) _(depends on: Area 10 Green ✓)_
  - Test cases:
    - `renders PriceCell in the third column when quote is provided`
    - `renders PriceCell with quote=undefined when quote prop is missing`
    - `column order is Ticker, Phase, Price, Strike, Expiration, DTE, Premium, Cost Basis` — assert `<td>` order
  - Run `pnpm test src/renderer/src/components/PositionCard.test.tsx` — all new tests must fail

- [x] **[Green]** Implement — `src/renderer/src/components/PositionCard.tsx` _(depends on: Area 12 Red ✓)_
  - Add `quote?: StockQuote` to the Props type
  - Insert `<PriceCell quote={quote} />` between the Phase `<TableCell>` and Strike `<TableCell>`
  - Run `pnpm test src/renderer/src/components/PositionCard.test.tsx` — all tests must pass

- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/PositionCard.tsx` _(depends on: Area 12 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Confirm row-click handler still applies; `PriceCell` should not stopPropagation unless explicitly needed for tooltip focus
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — Wiring + Bridge (depends on Area 3 Green)

> Areas 4 and 5 can run in parallel once Area 3 Green is done.

### Area 4 — Wire provider singleton in `main/index.ts`

**Requires:** Area 3 Green ✓

- [x] **[Green]** Implement — `src/main/index.ts` _(depends on: Area 3 Green ✓)_
  - Import `createMarketDataProvider` from `src/main/integrations/market-data-factory.ts` and `registerMarketDataHandlers` from `src/main/ipc/market-data.ts`
  - After `initDb()`, build provider:
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
  - Track main window: `let mainWindow: BrowserWindow | null = null`; assign in `createWindow`
  - Call `registerMarketDataHandlers(provider, () => mainWindow)`
  - Add `app.on('before-quit', () => { void provider.disconnect() })`
  - Run `pnpm typecheck` — no errors

- [x] **[Refactor]** `/refactor` — `src/main/index.ts` _(depends on: Area 4 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 5 — Preload bridge

**Requires:** Area 3 Green ✓

- [x] **[Green]** Implement — `src/preload/index.ts` + `src/preload/index.d.ts` _(depends on: Area 3 Green ✓)_
  - In `index.d.ts`, add IPC-flat types: `IpcStockQuote`, `IpcMarketStatus`, `IpcGetStockQuotesPayload`, `IpcGetStockQuotesResult`, `IpcSetStockQuoteTickersPayload`, `IpcSetStockQuoteTickersResult`, `IpcGetMarketStatusResult`, `IpcStockQuoteEvent`, `IpcStreamErrorEvent` (shapes from `plans/us-32/data-model.md`)
  - Extend `Window['api']` with:
    - `getStockQuotes: (payload: IpcGetStockQuotesPayload) => Promise<IpcGetStockQuotesResult>`
    - `setStockQuoteTickers: (payload: IpcSetStockQuoteTickersPayload) => Promise<IpcSetStockQuoteTickersResult>`
    - `getMarketStatus: () => Promise<IpcGetMarketStatusResult>`
    - `onStockQuote: (cb: (e: IpcStockQuoteEvent) => void) => () => void`
    - `onStreamError: (cb: (e: IpcStreamErrorEvent) => void) => () => void`
  - In `index.ts`, add matching `api` methods: `getStockQuotes`, `setStockQuoteTickers`, `getMarketStatus` use `invoke(...)`; `onStockQuote` and `onStreamError` register `ipcRenderer.on(channel, listener)` and return `() => ipcRenderer.removeListener(channel, listener)`
  - Run `pnpm typecheck` — no errors

- [x] **[Refactor]** `/refactor` — `src/preload/index.ts` + `src/preload/index.d.ts` _(depends on: Area 5 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Verify `index.d.ts` ordering matches surrounding convention
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — Renderer adapter (depends on Area 5 Green)

### Area 6 — Renderer adapter `api/market-data.ts`

**Requires:** Area 5 Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/api/market-data.test.ts` (new file) _(depends on: Area 5 Green ✓)_
  - Test cases (`window.api` mocked):
    - `getStockQuotes returns the quotes record on success` — mock `window.api.getStockQuotes` → `{ ok: true, quotes: { AAPL: {...} } }`; assert returned object equals `{ AAPL: {...} }`
    - `getStockQuotes throws ApiError(502) on ok:false` — mock → `{ ok: false, errors: [{ field: '__root__', code: 'auth_failed', ... }] }`; assert thrown has `status: 502` + errors in `body.detail`
    - `getMarketStatus returns the status on success`
    - `getMarketStatus throws ApiError(502) on ok:false`
  - Run `pnpm test src/renderer/src/api/market-data.test.ts` — all new tests must fail

- [x] **[Green]** Implement — `src/renderer/src/api/market-data.ts` (new file) _(depends on: Area 6 Red ✓)_
  - Export types: `StockQuote`, `StockQuotesByTicker`, `MarketStatus` (re-exports of the preload IPC-flat types)
  - `getStockQuotes(tickers: string[])`: calls `window.api.getStockQuotes({ tickers })`; `!ok` → throw `apiError(502, { detail: result.errors })`; else return `result.quotes`
  - `getMarketStatus()`: calls `window.api.getMarketStatus()`; `!ok` → throw `apiError(502, ...)`; else return `result.status`
  - Reuse or extract the `apiError` helper from `src/renderer/src/api/positions.ts`
  - Run `pnpm test src/renderer/src/api/market-data.test.ts` — all tests must pass

- [x] **[Refactor]** `/refactor` — `src/renderer/src/api/market-data.ts` _(depends on: Area 6 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - If `apiError` is duplicated across `positions.ts` and `market-data.ts`, extract a shared `src/renderer/src/api/error.ts`; confirm renderer never imports from `src/main/`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 5 — Hooks (depends on Area 6 Green)

> Areas 7 and 8 can run in parallel once Area 6 Green is done.

### Area 7 — Hook: `useMarketStatus`

**Requires:** Area 6 Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/hooks/useMarketStatus.test.ts` (new file) _(depends on: Area 6 Green ✓)_
  - Test cases (`QueryClient` + mocked `window.api`):
    - `returns the market status from a successful query` — mock `window.api.getMarketStatus` → regular-session status; assert `result.current.data?.session === 'regular'`
    - `surfaces error state when window.api fails` — mock to reject; assert `result.current.isError === true`
    - `query key is ['market-data', 'market-status']` — verify via `queryClient.getQueryCache()`
  - Run `pnpm test src/renderer/src/hooks/useMarketStatus.test.ts` — all new tests must fail

- [x] **[Green]** Implement — `src/renderer/src/hooks/marketDataQueryKeys.ts` + `src/renderer/src/hooks/useMarketStatus.ts` _(depends on: Area 7 Red ✓)_
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
  - Run `pnpm test src/renderer/src/hooks/useMarketStatus.test.ts` — all tests must pass

- [x] **[Refactor]** `/refactor` — `src/renderer/src/hooks/useMarketStatus.ts` + `marketDataQueryKeys.ts` _(depends on: Area 7 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 8 — Hook: `useStockQuotes` with stream bridge

**Requires:** Area 6 Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/hooks/useStockQuotes.test.ts` (new file) _(depends on: Area 6 Green ✓)_
  - Test cases (mocked `window.api`, fresh `QueryClient` per test):
    - `disabled when tickers is empty` — `query.fetchStatus === 'idle'`; `window.api.getStockQuotes` not called
    - `fetches REST seed on mount when tickers provided` — mock → `{ ok: true, quotes: { AAPL: { price: '182.45', prevClose: '181.00', ... } } }`; assert `result.current.data?.AAPL.price === '182.45'`
    - `merges incoming tick into cache, preserving prevClose` — capture `onStockQuote` cb; invoke with `{ ticker: 'AAPL', quote: { price: '182.50', prevClose: null, ... } }`; assert price `'182.50'` + prevClose `'181.00'` still present
    - `dataUpdatedAt advances on stream tick` — capture initial; fire tick; assert new > initial
    - `calls setStockQuoteTickers on mount with sorted tickers` — input `['MSFT', 'AAPL']`; assert called with `{ tickers: ['AAPL', 'MSFT'] }`
    - `calls setStockQuoteTickers([]) on unmount`
    - `re-subscribes when tickers change` — re-render with `['AAPL']`; assert second `setStockQuoteTickers` call
    - `surfaces stream error via streamError state` — fire `onStreamError` with `{ feed: 'stockQuotes', code: 'stream_disconnected', ... }`; assert `result.current.streamError !== null`
    - `tick for a ticker not in cache adds the entry with prevClose: null` — fire tick for NVDA; assert cache has `NVDA` with `prevClose: null`
  - Run `pnpm test src/renderer/src/hooks/useStockQuotes.test.ts` — all new tests must fail

- [x] **[Green]** Implement — `src/renderer/src/hooks/useStockQuotes.ts` (new file) _(depends on: Area 8 Red ✓)_
  - Signature: `useStockQuotes(tickers: string[]): UseQueryResult<StockQuotesByTicker> & { streamError: IpcStreamErrorEvent | null }`
  - `sortedTickers = useMemo(() => tickers.slice().sort(), [tickers])`
  - `queryKey = marketDataQueryKeys.stockQuotes(sortedTickers)`
  - `useQuery({ queryKey, queryFn: () => getStockQuotes(sortedTickers), enabled: sortedTickers.length > 0, staleTime: Infinity, refetchOnWindowFocus: true })`
  - `const [streamError, setStreamError] = useState<IpcStreamErrorEvent | null>(null)`
  - `useEffect` keyed on `[queryClient, sortedTickers.join(',')]`:
    - If empty: `void window.api.setStockQuoteTickers({ tickers: [] })`; return
    - `void window.api.setStockQuoteTickers({ tickers: sortedTickers })`
    - `const offTick = window.api.onStockQuote((event) => queryClient.setQueryData(queryKey, (prev) => mergeTick(prev, event)))`
    - `const offErr = window.api.onStreamError((event) => setStreamError(event))`
    - Cleanup: `offTick(); offErr(); void window.api.setStockQuoteTickers({ tickers: [] }); setStreamError(null)`
  - Pure helper `mergeTick(prev, event)`: spreads `prev`, overwrites `[event.ticker]` with `{ ...event.quote, prevClose: event.quote.prevClose ?? prev?.[event.ticker]?.prevClose ?? null }`
  - Run `pnpm test src/renderer/src/hooks/useStockQuotes.test.ts` — all tests must pass

- [x] **[Refactor]** `/refactor` — `src/renderer/src/hooks/useStockQuotes.ts` _(depends on: Area 8 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Extract `mergeTick` to a top-level pure function; confirm effect cleanup resets `streamError`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 6 — Page assembly (depends on Areas 7, 8, 9, 11, 12 Green)

### Area 13 — Modify `PositionsListPage`

**Requires:** Areas 7 Green ✓, 8 Green ✓, 9 Green ✓, 11 Green ✓, 12 Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/pages/PositionsListPage.test.tsx` (extend existing) _(depends on: Areas 7+8+9+11+12 Green ✓)_
  - Test cases:
    - `shows MarketStatusPill with state LIVE during regular session`
    - `shows MarketStatusPill with state EXT during pre session`
    - `shows MarketStatusPill with state EXT during post session`
    - `shows MarketStatusPill with state CLOSED when session is closed`
    - `shows MarketStatusPill with state DELAYED when last update >5 min ago` — mock `dataUpdatedAt = Date.now() - 360_000`
    - `shows MarketStatusPill with state DELAYED when streamError is set` — streamError non-null overrides regular session
    - `renders StaleDataBanner with correct minutesAgo when stale`
    - `does not render StaleDataBanner when not stale`
    - `passes quote to each PositionRow` — AAPL/MSFT positions + quotes; each row receives matching quote
    - `passes undefined quote when ticker missing from quotes` — TSLA position + only AAPL in quotes; TSLA row gets `quote=undefined`
    - `derives ticker list from active positions only` — closed position ticker absent from `setStockQuoteTickers` call
    - `Price column header renders between Phase and Strike`
  - Run `pnpm test src/renderer/src/pages/PositionsListPage.test.tsx` — all new tests must fail

- [x] **[Green]** Implement — `src/renderer/src/pages/PositionsListPage.tsx` _(depends on: Area 13 Red ✓)_
  - Update `TABLE_COLUMNS` to `['Ticker', 'Phase', 'Price', 'Strike', 'Expiration', 'DTE', 'Premium', 'Cost Basis']`
  - `const tickers = useMemo(() => Array.from(new Set(activePositions.map((p) => p.ticker))).sort(), [activePositions])`
  - `const quotesQuery = useStockQuotes(tickers)`
  - `const statusQuery = useMarketStatus()`
  - `const STALE_THRESHOLD_MS = 5 * 60 * 1000`
  - `const stale = quotesQuery.dataUpdatedAt > 0 && (Date.now() - quotesQuery.dataUpdatedAt > STALE_THRESHOLD_MS)`
  - `const minutesAgo = Math.floor((Date.now() - quotesQuery.dataUpdatedAt) / 60_000)`
  - `const display = deriveMarketStatusDisplay(statusQuery.data?.session, stale, quotesQuery.streamError)`
  - Add `<MarketStatusPill state={display} />` to page header right cluster (before `+ New Wheel`)
  - Render `<StaleDataBanner stale={stale || quotesQuery.streamError !== null} minutesAgo={minutesAgo} />` between page header and section header
  - Pass `quotes={quotesQuery.data ?? {}}` to `PositionTable`; each row receives `quotes[item.ticker]`
  - New pure helper `deriveMarketStatusDisplay(session, stale, streamError): MarketStatusDisplay` — returns `'DELAYED'` if `streamError || stale`, else maps `session` (`'regular'→'LIVE'`, `'pre'|'post'→'EXT'`, `'closed'→'CLOSED'`)
  - Run `pnpm test src/renderer/src/pages/PositionsListPage.test.tsx` — all tests must pass

- [x] **[Refactor]** `/refactor` — `src/renderer/src/pages/PositionsListPage.tsx` _(depends on: Area 13 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Extract `deriveMarketStatusDisplay` to `src/renderer/src/lib/market-status.ts` for isolated testability; verify loading states don't crash; confirm closed-section column count matches 8-column header
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 7 — E2E Tests (depends on all Green tasks)

**Requires:** All Green tasks from Layers 1–6 ✓

### Area 14 — E2E Tests

- [x] **[Red]** Write failing e2e tests — `e2e/live-underlying-price.spec.ts` (new file) _(depends on: all Green tasks ✓)_
  - One `it()` per AC:
    - AC-1: `displays live underlying price with green LIVE dot during regular session` — stub `getMarketStatus → { session: 'regular', isOpen: true }`; `getStockQuotes → { AAPL: { price: '182.45', prevClose: '181.00', ... }, MSFT, TSLA }`; navigate to positions; assert `$182.45` in each row + pill text `LIVE`
    - AC-2: `updates a row's price when a stream tick arrives, without page reload or spinner` — after initial render, dispatch captured `onStockQuote` cb with `{ ticker: 'AAPL', quote: { price: '183.10', prevClose: null } }`; assert price becomes `$183.10` + no loading indicator
    - AC-3: `shows daily change amount and direction (green for up, red for down)` — AAPL up `+$1.45` green, MSFT down `-$1.70` red
    - AC-4: `shows last closing price with gray CLOSED indicator when market is closed` — `getMarketStatus → { session: 'closed', isOpen: false }`; assert pill `CLOSED`
    - AC-5: `shows extended hours price with amber EXT indicator during pre/post market` — `getMarketStatus → { session: 'post', isOpen: false }`; assert pill `EXT`
    - AC-6: `shows dash with tooltip when price data is unavailable for a ticker` — TSLA absent from `getStockQuotes` response; assert TSLA row shows `—` + `title="Price unavailable"`; AAPL/MSFT normal
    - AC-7: `shows stale data warning banner and amber DELAYED indicator when no update has arrived for 5 minutes` — simulate old `dataUpdatedAt` via `page.evaluate`; assert `data-testid="stale-data-banner"` visible with `last updated 6m ago` + pill `DELAYED`
  - Stubs attached via `page.addInitScript` or `page.evaluate`; keep references to `onStockQuote`/`onStreamError` cb handles in window scope for later invocation
  - Run `pnpm test:e2e e2e/live-underlying-price.spec.ts` — all new tests must fail

- [x] **[Green]** Make e2e tests pass _(depends on: Area 14 Red ✓)_
  - Add any missing `data-testid` attributes to `PriceCell` (`data-testid="position-card-{ticker}-price"`), `MarketStatusPill` (`data-testid="market-status-pill"`), `StaleDataBanner` (`data-testid="stale-data-banner"`) during this pass if not already added in earlier areas
  - Run `pnpm test:e2e e2e/live-underlying-price.spec.ts` — all tests must pass

- [x] **[Refactor]** `/refactor` e2e tests _(depends on: Area 14 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Extract `setupMarketDataStubs(page, fixtures)` helper if stub-attachment block is repeated across tests
  - Run `pnpm test:e2e && pnpm test && pnpm lint && pnpm typecheck`

---

## Completion Checklist

- [ ] All Red tasks complete (tests written and failing for right reason)
- [ ] All Green tasks complete (all tests passing)
- [ ] All Refactor tasks complete (lint + typecheck clean)
- [ ] E2E tests cover every AC (7 of 7)
- [ ] `pnpm test && pnpm lint && pnpm typecheck` — all clean
- [ ] `pnpm test:e2e` — all e2e tests pass
