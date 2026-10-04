import { readFile, writeFile } from 'node:fs/promises'
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['index.ts'],
  platform: 'browser',
  target: 'chrome120',
  format: 'esm',
  outExtensions: () => ({ js: '.js' }),
  deps: { alwaysBundle: [/^@trace-script\//, /^zod(?:\/|$)/] },
  dts: false,
  clean: true,
  copy: ['index.html', 'style.css'],
  hooks: {
    'build:done': async () => {
      const source = await readFile(new URL('./index.html', import.meta.url), 'utf8')
      await writeFile(new URL('./dist/index.html', import.meta.url), source.replace('src="./index.ts"', 'src="./index.js"'))
    },
  },
})
