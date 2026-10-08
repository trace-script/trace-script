import { defineConfig } from 'tsdown'
import { assembleExtension } from './scripts/build'

const mode = process.env.TRACE_SCRIPT_BUILD_MODE === 'development' ? 'development' : 'production'
export default defineConfig({
  entry: { background: 'apps/extension/background/index.ts', devtools: 'apps/extension/devtools/index.ts' },
  format: 'esm',
  outDir: '.build/extension',
  platform: 'browser',
  target: 'chrome120',
  dts: false,
  clean: true,
  deps: { alwaysBundle: [/^@trace-script\//, 'zod'] },
  outExtensions: () => ({ js: '.js' }),
  hooks: { 'build:done': () => assembleExtension(mode) },
})
