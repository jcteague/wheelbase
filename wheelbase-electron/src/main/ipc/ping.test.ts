import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn()
  }
}))

describe('registerPingHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers an ipcMain handler on the ping channel', async () => {
    const { ipcMain } = await import('electron')
    const { registerPingHandler } = await import('./ping')

    registerPingHandler()

    expect(ipcMain.handle).toHaveBeenCalledWith('ping', expect.any(Function))
  })

  it('handler returns pong', async () => {
    const { ipcMain } = await import('electron')
    const { registerPingHandler } = await import('./ping')

    registerPingHandler()

    const handler = vi.mocked(ipcMain.handle).mock.calls[0][1] as () => string
    expect(handler()).toBe('pong')
  })
})
