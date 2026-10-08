import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { content: 'apps/extension/content/index.ts' },
  format: 'iife',
  outDir: '.build/content',
  platform: 'browser',
  target: 'chrome120',
  dts: false,
  clean: true,
  deps: { alwaysBundle: [/^@trace-script\//, 'zod'] },
})
