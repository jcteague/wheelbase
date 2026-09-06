import { ipcMain } from 'electron'
import type { PollingScheduler } from '../services/polling-scheduler'
import { IVR_COLLECT_JOB_NAME } from '../services/ivr-collector'
import { CollectIvrNowBatchSchema } from '../schemas'
import { handleIpcCall } from './utils'

export function registerIvrIpc({ scheduler }: { scheduler: PollingScheduler }): void {
  ipcMain.handle('ivr:collect-now', () =>
    handleIpcCall('ivr_collect_now_error', async () => {
      const result = await scheduler.runNow(IVR_COLLECT_JOB_NAME)
      // When the job handler throws, the scheduler swallows the error (already
      // logged) and resolves `undefined`. Surface that as a run-level failure
      // rather than letting the Zod parse report a confusing type error.
      if (result === undefined) {
        throw new Error('IVR collection failed before producing a batch summary')
      }
      const batch = CollectIvrNowBatchSchema.parse(result)
      return { batch }
    })
  )
}
