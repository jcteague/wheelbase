# IPC Contracts: Market-Data and Broker Channels

After the split, IPC channels follow the provider boundary. Renderer code never knows the vendor — it talks to a channel.

---

## Market-Data Namespace (`market-data:*`) → Massive

### `market-data:stock-quotes`

```typescript
const RequestSchema = z.object({
  tickers: z.array(z.string().min(1)).min(1).max(50)
})

type Response = { ok: true; quotes: Record<string, StockQuote> } | { ok: false; errors: string[] }
```

### `market-data:option-snapshot`

```typescript
const RequestSchema = z.object({
  underlying: z.string().min(1),
  contract: z.string().regex(/^[A-Z]{1,6}\d{6}[CP]\d{8}$/) // OCC symbol
})

type Response = { ok: true; snapshot: OptionSnapshot } | { ok: false; errors: string[] }
```

### `market-data:option-chain`

```typescript
const RequestSchema = z.object({
  underlying: z.string().min(1),
  expirationFrom: z.string().date().optional(),
  expirationTo: z.string().date().optional(),
  type: z.enum(['put', 'call']).optional(),
  strikeFrom: z.string().optional(),
  strikeTo: z.string().optional(),
  limit: z.number().int().min(1).max(250).optional(),
  cursor: z.string().optional()
})

type Response =
  | { ok: true; snapshots: OptionSnapshot[]; nextCursor: string | null }
  | { ok: false; errors: string[] }
```

---

## Broker Namespace (`broker:*`) → Alpaca

### `broker:account`

```typescript
// no request payload
type Response =
  | { ok: true; account: AccountInfo }
  | { ok: false; errors: string[]; code: BrokerErrorCode }
```

### `broker:activities`

```typescript
const RequestSchema = z.object({
  type: z.string().min(1),
  since: z.string().datetime().optional()
})

type Response =
  | { ok: true; activities: BrokerActivity[] }
  | { ok: false; errors: string[]; code: BrokerErrorCode }
```

### `broker:market-status`

```typescript
// no request payload
type Response =
  | { ok: true; status: MarketStatus }
  | { ok: false; errors: string[]; code: BrokerErrorCode }
```

---

## Channels Removed

The old combined namespace had broker concerns under `market-data:*`:

- `market-data:activities` → moved to `broker:activities`
- `market-data:account` → moved to `broker:account`
- `market-data:market-status` → moved to `broker:market-status`

Update all renderer call sites to the new channels.

---

## Preload (`src/preload/index.ts`)

```typescript
contextBridge.exposeInMainWorld('api', {
  marketData: {
    stockQuotes: (tickers: string[]) => ipcRenderer.invoke('market-data:stock-quotes', { tickers }),
    optionSnapshot: (req: OptionSnapshotRequest) =>
      ipcRenderer.invoke('market-data:option-snapshot', req),
    optionChain: (req: OptionChainRequest) => ipcRenderer.invoke('market-data:option-chain', req)
  },
  broker: {
    account: () => ipcRenderer.invoke('broker:account'),
    activities: (req: ActivityFilter) => ipcRenderer.invoke('broker:activities', req),
    marketStatus: () => ipcRenderer.invoke('broker:market-status')
  }
})
```

TanStack Query keys follow the same boundary: `['market', 'quotes', tickers]`, `['broker', 'account']`, etc. US-37's scoped invalidation matches on the first key element.
