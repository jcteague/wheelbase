/**
 * Shared WebSocket simulation helpers for AlpacaMarketDataProvider tests.
 * Used by both alpaca-market-data.test.ts and alpaca-market-data.e2e.test.ts.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type MockSocket = {
  url: string
  readyState: number
  _handlers: Record<string, Array<(...args: any[]) => void>>
  on: ReturnType<typeof import('vitest').vi.fn>
  send: ReturnType<typeof import('vitest').vi.fn>
  close: ReturnType<typeof import('vitest').vi.fn>
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function emitSocketEvent(socket: MockSocket, event: string, ...args: unknown[]): void {
  ;(socket._handlers[event] || []).forEach((h) => h(...args))
}

export function simulateAuth(socket: MockSocket): void {
  emitSocketEvent(socket, 'open')
  emitSocketEvent(socket, 'message', JSON.stringify([{ T: 'success', msg: 'connected' }]))
  emitSocketEvent(socket, 'message', JSON.stringify([{ T: 'success', msg: 'authenticated' }]))
}
