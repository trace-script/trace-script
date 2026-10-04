import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@trace-script/core': fileURLToPath(new URL('./packages/core/index.ts', import.meta.url)),
      '@trace-script/metadata': fileURLToPath(new URL('./packages/metadata/index.ts', import.meta.url)),
      '@trace-script/sdk': fileURLToPath(new URL('./packages/sdk/index.ts', import.meta.url)),
      '@trace-script/shared': fileURLToPath(new URL('./packages/shared/index.ts', import.meta.url)),
    },
  },
  plugins: [vue()],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
  },
})
