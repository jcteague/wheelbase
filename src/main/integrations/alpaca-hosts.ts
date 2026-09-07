// Alpaca's trading API is split by environment: paper keys only authenticate against the
// paper host. Shared by the settings connection test and the market-data provider's
// open-interest lookup so the two can never drift apart.
export const ALPACA_TRADING_BASE_URLS: Record<'paper' | 'live', string> = {
  paper: 'https://paper-api.alpaca.markets',
  live: 'https://api.alpaca.markets'
}
