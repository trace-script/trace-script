import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { mainfest } from './scripts/create-manifest.ts'

function resolve(name: string): ReturnType<typeof fileURLToPath> {
  return fileURLToPath(new URL(`./src/entry/${name}.ts`, import.meta.url))
}

export default defineConfig(({ mode }) => {
  return {
    root: fileURLToPath(new URL('.', import.meta.url)),
    publicDir: 'public',
    plugins: [
      vue(),
      tailwindcss(),
      mainfest(mode),
    ],
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
    server: {
      port: 4173,
      open: '/index.html',
    },
    build: {
      outDir: mode === 'development' ? 'dist-dev' : 'dist',
      emptyOutDir: true,
      copyPublicDir: true,
      rollupOptions: {
        input: {
          content: resolve('content'),
          background: resolve('background'),
          devtools: resolve('devtools'),
          panel: fileURLToPath(new URL('./panel.html', import.meta.url)),
        },
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },
  }
})
