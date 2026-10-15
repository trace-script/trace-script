import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import vueDevTools from 'vite-plugin-vue-devtools'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    vueDevTools(),
  ],
  server: {
    port: 4317,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    // workspace 内部源码包（exports 指向 src/index.ts，含 .vue），交给
    // plugin-vue 按源码编译，避免被 esbuild 预构建缓存成旧版本。
    exclude: ['@trace-script/vue-components'],
  },
})
