import { ipcMain } from 'electron'
import type { PollingScheduler } from '../services/polling-scheduler'
import { IVR_COLLECT_JOB_NAME } from '../services/ivr-collector'
import { CollectIvrNowBatchSchema } from '../schemas'
import { handleIpcCall } from './utils'

export function registerIvrIpc({ scheduler }: { scheduler: PollingScheduler }): void {
  ipcMain.handle('ivr:collect-now', () =>
    handleIpcCall('ivr_collect_now_error', async () => {
      // Validate the scheduler's result: when the job handler throws, the scheduler
      // swallows the error and resolves `undefined`, so parsing guards against a
      // silent { ok: true, batch: undefined } reaching the renderer.
      const batch = CollectIvrNowBatchSchema.parse(await scheduler.runNow(IVR_COLLECT_JOB_NAME))
      return { batch }
    })
  )
}
