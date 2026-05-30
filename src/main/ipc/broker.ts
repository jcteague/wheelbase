import { ipcMain } from 'electron'
import type { BrokerProvider } from '../integrations/broker-provider'
import { GetBrokerActivitiesPayloadSchema } from '../schemas'
import { handleIpcCall } from './utils'

export function registerBrokerHandlers(provider: BrokerProvider): void {
  ipcMain.handle('broker:account', () =>
    handleIpcCall('broker_account_unhandled_error', async () => {
      const account = await provider.getAccountInfo()
      return { account }
    })
  )

  ipcMain.handle('broker:activities', (_, payload: unknown) =>
    handleIpcCall('broker_activities_unhandled_error', async () => {
      const filter = GetBrokerActivitiesPayloadSchema.parse(payload)
      const activities = await provider.getActivities(filter)
      return { activities }
    })
  )

  ipcMain.handle('broker:market-status', () =>
    handleIpcCall('broker_market_status_unhandled_error', async () => {
      const status = await provider.getMarketStatus()
      return { status }
    })
  )
}
