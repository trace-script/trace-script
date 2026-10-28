import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@/scripts': fileURLToPath(new URL('./scripts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [vue()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'chrome-extensions-node',
          include: ['tests/**/*.test.ts'],
          exclude: ['tests/**/*.browser.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'chrome-extensions-dom',
          include: ['tests/**/*.browser.test.ts'],
          environment: 'happy-dom',
        },
      },
    ],
  },
})
