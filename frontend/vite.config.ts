import { defineConfig } from 'vitest/config'
import preact from '@preact/preset-vite'
import path from 'node:path'

const reactAliases = {
  'react': path.resolve(__dirname, 'node_modules/preact/compat'),
  'react-dom/test-utils': path.resolve(__dirname, 'node_modules/preact/test-utils'),
  'react-dom': path.resolve(__dirname, 'node_modules/preact/compat'),
  'react/jsx-runtime': path.resolve(__dirname, 'node_modules/preact/jsx-runtime'),
};

export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      ...reactAliases,
    },
    dedupe: ['preact', 'preact/compat'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true }
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    alias: {
      '@': path.resolve(__dirname, './src'),
      ...reactAliases,
    },
    server: {
      deps: {
        inline: [
          'react-hook-form',
          '@hookform/resolvers',
          '@tanstack/react-query',
          '@preact/signals',
          /@radix-ui\/.*/,
        ],
      },
    },
  },
})
