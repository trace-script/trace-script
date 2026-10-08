import type { JsonValue } from '@trace-script/metadata'
import type { PanelCommand } from '../../../extension/types/messages'
import { sitePattern } from '../../../extension/background/permissions'
import { replySchema } from '../../../extension/types/messages'

export interface PanelConnection {
  connect: () => void
  request: (command: PanelCommand) => Promise<JsonValue>
  grant: (origin: string) => Promise<void>
  revoke: (pattern: string) => Promise<void>
  theme: () => 'dark' | 'light'
  dispose: () => void
}

export function createPanelConnection(onChange: () => void, onStatus: (status: string) => void): PanelConnection {
  let port: chrome.runtime.Port | false = false

  let stopped = false

  let retries = 0

  let timer: ReturnType<typeof setTimeout> | false = false

  const pending = new Map<string, { resolve: (value: JsonValue) => void, reject: (error: Error) => void, timeout: ReturnType<typeof setTimeout> }>()

  const tabId = typeof chrome !== 'undefined' && chrome.devtools?.inspectedWindow ? chrome.devtools.inspectedWindow.tabId : Number(new URLSearchParams(location.search).get('tabId') ?? -1)

  function request(command: PanelCommand): Promise<JsonValue> {
    if (!port)
      return Promise.reject(new Error('Extension is disconnected. Open this panel inside Chrome DevTools.'))

    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID()

      const timeout = setTimeout(() => {
        pending.delete(id)

        reject(new Error('Request timed out; reconnect and retry'))
      }, command.command === 'import' ? 120_000 : 30_000)

      pending.set(id, { resolve, reject, timeout })

      try {
        if (port)
          port.postMessage({ ...command, id })
      }
      catch {
        pending.delete(id)

        clearTimeout(timeout)

        reject(new Error('Connection closed'))
      }
    })
  }

  function connect(): void {
    if (stopped)
      return

    if (typeof chrome === 'undefined' || !chrome.runtime?.id || tabId < 0) {
      onStatus('Open in Chrome DevTools')

      return
    }

    onStatus('Connecting')

    port = chrome.runtime.connect({ name: 'trace-panel' })

    port.onMessage.addListener((raw: unknown) => {
      const parsed = replySchema.safeParse(raw)

      if (!parsed.success)
        return

      const message = parsed.data

      if (message.kind === 'changed') {
        onChange()

        return
      }

      const item = pending.get(message.id)

      if (!item)
        return

      clearTimeout(item.timeout)

      pending.delete(message.id)

      if (message.ok)
        item.resolve(message.data)
      else item.reject(new Error(message.error))
    })

    port.onDisconnect.addListener(() => {
      port = false

      for (const item of pending.values()) {
        clearTimeout(item.timeout)

        item.reject(new Error('Connection interrupted'))
      }

      pending.clear()

      onStatus('Reconnecting')

      if (!stopped)
        timer = setTimeout(connect, Math.min(10_000, 300 * 2 ** Math.min(retries++, 5)))
    })

    void request({ command: 'connect', tabId }).then(() => {
      retries = 0

      onStatus('Connected')

      onChange()
    }).catch(error => onStatus(error.message))
  }

  async function grant(origin: string): Promise<void> {
    const pattern = sitePattern(origin)

    const granted = await chrome.permissions.request({ origins: [pattern] })

    if (!granted)
      throw new Error('Site access was not granted')

    await request({ command: 'refresh-permissions' })

    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] })

    onChange()
  }

  async function revoke(pattern: string): Promise<void> {
    await chrome.permissions.remove({ origins: [pattern] })

    onChange()
  }

  function theme(): 'dark' | 'light' {
    return typeof chrome !== 'undefined' && chrome.devtools?.panels?.themeName === 'dark' ? 'dark' : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }

  return { connect, request, grant, revoke, theme, dispose() {
    stopped = true

    if (timer !== false)
      clearTimeout(timer)

    if (port)
      port.disconnect()
  } }
}
