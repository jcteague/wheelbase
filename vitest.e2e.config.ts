import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'e2e',
    environment: 'node',
    include: ['e2e/**/*.spec.ts'],
    testTimeout: 60_000,
    hookTimeout: 30_000
  }
})
