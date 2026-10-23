// [US-102] Real services and handleIpcCall behind registered IPC handlers.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ipcMain } from 'electron'
import { makeTestDb, isoDate } from '../test-utils'
import { createPmccPosition } from '../services/positions'
import { pmccOpenPayload } from '../services/test-fixtures/pmcc-legs'
import { registerPositionsHandlers } from './positions'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

afterEach(() => vi.clearAllMocks())

describe('PMCC expiration rejection through registered IPC handlers (US-102)', () => {
  it.each([
    {
      channel: 'positions:roll-pmcc-short',
      day: 368,
      code: 'short_not_before_long',
      message: 'Short call must expire before the LEAPS call.'
    },
    {
      channel: 'positions:roll-pmcc-short',
      day: 400,
      code: 'short_not_before_long',
      message: 'Short call must expire before the LEAPS call.'
    },
    {
      channel: 'positions:roll-pmcc-leaps',
      day: 32,
      code: 'long_not_after_short',
      message: 'LEAPS call must expire after the short call.'
    },
    {
      channel: 'positions:roll-pmcc-leaps',
      day: 20,
      code: 'long_not_after_short',
      message: 'LEAPS call must expire after the short call.'
    }
  ])(
    '$channel day $day resolves to the real service field error',
    async ({ channel, day, code, message }) => {
      const db = makeTestDb()
      const { position } = createPmccPosition(db, pmccOpenPayload(isoDate))
      registerPositionsHandlers(db)
      const handler = vi.mocked(ipcMain.handle).mock.calls.find(([name]) => name === channel)?.[1]
      expect(handler).toBeDefined()
      const moneyFields =
        channel === 'positions:roll-pmcc-short'
          ? { costToClosePerContract: 1, newPremiumPerContract: 2 }
          : { proceedsPerContract: 26, replacementDebitPerContract: 23.5 }

      await expect(
        handler!(null as never, {
          positionId: position.id,
          fillDate: isoDate(0),
          newExpiration: isoDate(day),
          ...moneyFields
        })
      ).resolves.toEqual({
        ok: false,
        errors: [{ field: 'newExpiration', code, message }]
      })
      db.close()
    }
  )
})
