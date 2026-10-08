/// <reference types="chrome" />
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium, expect, test } from '@playwright/test'

test('authorized collection, isolation, details, recovery and export/import', async ({ browserName }, info) => {
  expect(browserName).toBe('chromium')

  const directory = await mkdtemp(join(tmpdir(), 'trace-browser-'))

  const extension = resolve('packages/chrome-extensions/dist')

  const context = await chromium.launchPersistentContext(directory, { channel: 'chromium', headless: true, viewport: { width: 1440, height: 900 }, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] })

  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')

    const extensionId = new URL(worker.url()).host

    const app = await context.newPage()

    app.on('pageerror', error => console.error('Playground:', error.message))

    await app.goto('http://127.0.0.1:4317')

    await expect(app.getByRole('button', { name: 'Publish example Session' })).toBeVisible()

    const tabId = await worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({})

      return tabs.find(tab => tab.url?.includes('127.0.0.1:4317'))?.id ?? -1
    })

    expect(tabId).toBeGreaterThanOrEqual(0)

    const panel = await context.newPage()

    const errors: string[] = []

    panel.on('pageerror', (error) => {
      errors.push(error.message)
      console.error('Panel:', error.message)
    })
    panel.on('console', (message) => {
      if (message.type() === 'error')
        console.error('Panel console:', message.text())
    })

    await panel.goto(`chrome-extension://${extensionId}/panel/index.html?tabId=${tabId}`)

    await expect(panel.getByText('Connected', { exact: true })).toBeVisible()

    await panel.getByRole('button', { name: 'Allow this site' }).click()

    await expect(panel.getByRole('button', { name: 'Allow this site' })).toBeHidden()

    await app.getByRole('button', { name: 'Publish example Session' }).click()

    await expect(panel.locator('tbody tr')).not.toHaveCount(0)

    await panel.getByRole('button', { name: 'Errors only' }).click()

    await expect(panel.locator('tbody tr')).toHaveCount(1)

    await panel.locator('tbody tr').first().click()

    await panel.getByRole('tab', { name: 'Payload', exact: true }).click()

    await expect(panel.getByText('[REDACTED]')).toBeVisible()

    expect(await panel.locator('.detail-body img').count()).toBe(0)

    await panel.getByRole('button', { name: 'Close event details' }).click()

    await panel.getByRole('button', { name: 'Reset', exact: true }).click()

    await panel.reload()

    await expect(panel.locator('tbody tr')).not.toHaveCount(0)

    await panel.screenshot({ path: info.outputPath('workbench-dark.png'), fullPage: true })

    await panel.getByRole('button', { name: '↓ Export', exact: true }).click()

    const downloadPromise = panel.waitForEvent('download')

    await panel.getByRole('button', { name: 'Download JSON' }).click()

    const download = await downloadPromise

    const file = info.outputPath('session.json')

    await download.saveAs(file)

    const text = await readFile(file, 'utf8')

    expect(text).not.toContain('example-secret')

    panel.on('dialog', dialog => dialog.accept())

    await panel.getByRole('button', { name: 'Clear Session' }).click()

    await panel.getByRole('button', { name: 'Delete permanently' }).click()

    await expect(panel.locator('tbody tr')).toHaveCount(0)

    await panel.locator('input[type=file]').setInputFiles(file)

    await expect(panel.locator('#session-select')).toContainText('[Imported]')

    await expect(panel.locator('tbody tr')).not.toHaveCount(0)

    const secondApp = await context.newPage()

    await secondApp.goto('http://127.0.0.1:4317')

    const otherId = await worker.evaluate(async original => (await chrome.tabs.query({})).find(tab => tab.url?.includes('127.0.0.1:4317') && tab.id !== original)?.id ?? -1, tabId)

    const otherPanel = await context.newPage()

    await otherPanel.goto(`chrome-extension://${extensionId}/panel/index.html?tabId=${otherId}`)

    await app.getByRole('button', { name: 'Publish example Session' }).click()

    await expect(panel.locator('#session-select option')).toHaveCount(2)

    await expect(otherPanel.locator('#session-select option')).toHaveCount(1)

    expect(errors).toEqual([])
  }
  finally {
    await context.close()
  }
})
