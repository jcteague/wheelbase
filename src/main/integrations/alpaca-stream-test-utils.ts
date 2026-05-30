/**
 * Shared WebSocket simulation helpers for Alpaca streaming tests.
 * TODO: rename to generic streaming test utilities when streaming utilities generalize beyond Alpaca.
 */
import type { Mock } from 'vitest'

type SocketHandler = (...args: unknown[]) => void

export type MockSocket = {
  url: string
  readyState: number
  _handlers: Record<string, SocketHandler[]>
  on: Mock
  send: Mock
  close: Mock
}

export function emitSocketEvent(socket: MockSocket, event: string, ...args: unknown[]): void {
  const handlers = socket._handlers[event] ?? []
  handlers.forEach((handler) => handler(...args))
}

export function simulateAuth(socket: MockSocket): void {
  emitSocketEvent(socket, 'open')
  emitSocketEvent(socket, 'message', JSON.stringify([{ T: 'success', msg: 'connected' }]))
  emitSocketEvent(socket, 'message', JSON.stringify([{ T: 'success', msg: 'authenticated' }]))
}
