import { cp, readFile, writeFile } from 'node:fs/promises'
import { defineConfig } from 'tsdown'
import Vue from 'unplugin-vue/rolldown'

export default defineConfig({
  define: { 'process.env.NODE_ENV': '"production"', '__VUE_OPTIONS_API__': 'true', '__VUE_PROD_DEVTOOLS__': 'false', '__VUE_PROD_HYDRATION_MISMATCH_DETAILS__': 'false' },
  entry: { app: 'src/main.ts' },
  platform: 'browser',
  target: 'chrome120',
  dts: false,
  clean: true,
  plugins: [Vue({ isProduction: true })],
  deps: { alwaysBundle: [/^@trace-script\//, 'vue', 'zod'] },
  hooks: { 'build:done': async () => {
    await cp('public', 'dist', { recursive: true })

    await writeFile('dist/index.html', (await readFile('index.html', 'utf8')).replace('./src/main.ts', './app.js'))
  } },
})
