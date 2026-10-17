import { defineConfig } from 'vitest/config'

// Mutation testing (Stryker) runs the pure-engine suites only. Core tests have no
// DB or renderer dependencies, so this config skips the jsdom project and the
// better-sqlite3 ABI question entirely.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/main/core/**/*.test.ts'],
    setupFiles: ['src/main/core/test-fixtures/mutation-setup.ts']
  }
})
