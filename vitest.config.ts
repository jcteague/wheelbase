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
