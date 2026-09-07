// All @alpacahq/typescript-sdk calls are isolated here.
// Nothing outside this module imports @alpacahq/typescript-sdk.

import { createClient } from '@alpacahq/typescript-sdk'

function makeClient(): ReturnType<typeof createClient> {
  const key = process.env.ALPACA_KEY_ID ?? ''
  const secret = process.env.ALPACA_SECRET_KEY ?? ''
  const paper = process.env.ALPACA_PAPER !== 'false'

  return createClient({ key, secret, paper })
}

// Lazily initialised — avoids crashing at import time if env vars are absent.
let _client: ReturnType<typeof createClient> | null = null

/** @deprecated Legacy raw Alpaca client; market data now uses AlpacaMarketDataProvider and broker uses AlpacaBrokerProvider. */
function client(): ReturnType<typeof createClient> {
  if (!_client) _client = makeClient()
  return _client
}

/** @deprecated Legacy raw Alpaca client; market data now uses AlpacaMarketDataProvider and broker uses AlpacaBrokerProvider. */
export function resetClient(): void {
  _client = null
}

export { client }
