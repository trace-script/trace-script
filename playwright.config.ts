import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  webServer: { command: 'node scripts/serve-playground.mjs', url: 'http://127.0.0.1:4317', reuseExistingServer: !process.env.CI },
})
