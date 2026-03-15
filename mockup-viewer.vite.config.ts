import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import mdx from '@mdx-js/rollup'

export default defineConfig({
  root: 'mockup-viewer',
  resolve: {
    alias: {
      '@': resolve('src/renderer/src')
    }
  },
  plugins: [{ enforce: 'pre', ...mdx() }, react({ include: /\.(jsx|tsx|mdx)$/ }), tailwindcss()]
})
