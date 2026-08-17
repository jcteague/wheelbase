import fs from 'node:fs'
import path from 'node:path'

const APP_PATH = path.join(__dirname, '../out/main/index.js')

// Every spec spreads process.env into electron.launch's env; the main process
// reads this flag to show windows without activating the app (no focus steal)
process.env.WHEELBASE_E2E = 'true'

if (!fs.existsSync(APP_PATH)) {
  throw new Error(
    [
      `Built Electron entrypoint not found: ${APP_PATH}`,
      'Run `pnpm test:e2e` to build and run the E2E suite, or run `pnpm build` before invoking Vitest directly.'
    ].join('\n')
  )
}
