import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['index.ts'],
  platform: 'browser',
  target: 'chrome120',
  format: 'esm',
  dts: false,
  clean: true,
  copy: ['index.html', 'style.css'],
})
