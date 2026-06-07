import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'e2e',
    environment: 'node',
    include: ['e2e/**/*.spec.ts'],
    setupFiles: ['e2e/setup.ts'],
    testTimeout: 120_000,
    hookTimeout: 30_000,
    fileParallelism: false,
    bail: 1,
    reporters: ['verbose']
  }
})
