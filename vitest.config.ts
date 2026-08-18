import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src')
    }
  },
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.d.ts',
        'src/preload/**',
        'src/main/index.ts',
        'src/renderer/src/main.tsx',
        'src/renderer/src/test-setup.ts',
        // Shared fixture builders. They import `vi`, so they are test infrastructure
        // rather than production code — measured only incidentally, by whichever
        // suites happen to use which builders. `test-setup.ts` above is the same
        // category; this generalises it to the `*test-utils.ts` modules.
        'src/**/*test-utils.ts'
      ]
    },
    projects: [
      {
        test: {
          name: 'main',
          environment: 'node',
          include: ['src/main/**/*.test.ts']
        }
      },
      {
        plugins: [react()],
        resolve: {
          alias: {
            '@': resolve(__dirname, 'src/renderer/src')
          }
        },
        test: {
          name: 'renderer',
          environment: 'jsdom',
          globals: true,
          // jsdom + userEvent sheet tests can exceed the 5s default when all
          // test files run in parallel under machine load
          testTimeout: 15000,
          include: [
            'src/renderer/**/*.test.tsx',
            'src/renderer/**/*.test.ts',
            'src/renderer/**/*.spec.tsx',
            'src/renderer/**/*.spec.ts'
          ],
          setupFiles: ['src/renderer/src/test-setup.ts']
        }
      }
    ]
  }
})
