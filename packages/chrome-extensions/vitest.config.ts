import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@/scripts': fileURLToPath(new URL('./scripts', import.meta.url)),
      '@': fileURLToPath(new URL('./apps', import.meta.url)),
    },
  },
  plugins: [vue()],
})
