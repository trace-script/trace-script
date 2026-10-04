import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// Source aliases are only for the development server; packaging uses tsdown.
export default defineConfig({
  resolve: {
    alias: {
      '@trace-script/core': fileURLToPath(new URL('../packages/core/index.ts', import.meta.url)),
      '@trace-script/metadata': fileURLToPath(new URL('../packages/metadata/index.ts', import.meta.url)),
      '@trace-script/sdk': fileURLToPath(new URL('../packages/sdk/index.ts', import.meta.url)),
      '@trace-script/shared': fileURLToPath(new URL('../packages/shared/index.ts', import.meta.url)),
    },
  },
})
