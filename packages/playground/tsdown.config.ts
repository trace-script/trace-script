import { defineConfig } from 'tsdown'

export default defineConfig({
  platform: 'browser',
  target: 'chrome120',
  copy: ['index.html', 'style.css'],
})
