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
        'src/renderer/src/test-setup.ts'
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
          include: ['src/renderer/**/*.test.tsx', 'src/renderer/**/*.test.ts'],
          setupFiles: ['src/renderer/src/test-setup.ts']
        }
      }
    ]
  }
})
