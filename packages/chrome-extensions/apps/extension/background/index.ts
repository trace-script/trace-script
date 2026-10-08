import type { JsonValue, SessionSummary, StoredEvent } from '@trace-script/metadata'
import type { PanelSettings } from '../types/messages'
import { DEFAULT_REDACT_FIELDS, inspectJson, redactEvent, safeParseBridgeMessage } from '@trace-script/core'
import { createRepository, openDatabase } from '../storage/repository'
import { collectorSchema, defaultCollector, diagnosticSchema, requestSchema, settingsSchema } from '../types/messages'
import { sitePattern, syncPermissions } from './permissions'

const repository = openDatabase().then(async (db) => {
  const repo = createRepository(db)

  for (const session of await repo.allSessions()) {
    if (session.source === 'importing')
      await repo.deleteSession(session.key)
  }

  return repo
})
const panels = new Map<chrome.runtime.Port, number>()
const contents = new Map<chrome.runtime.Port, number>()
const counters = new Map<number, ReturnType<typeof defaultCollector>>()
let chain = Promise.resolve()
let queued = 0
let lastRetention = 0
let notification: ReturnType<typeof setTimeout> | false = false
const ready = Promise.all([
  chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
  chrome.storage.session.get('collectors').then((value) => {
    if (value.collectors && typeof value.collectors === 'object') {
      for (const [key, raw] of Object.entries(value.collectors)) {
        const parsed = collectorSchema.safeParse(raw)

        if (parsed.success)
          counters.set(Number(key), { ...parsed.data, connected: false })
      }
    }
  }),
])
function send(port: chrome.runtime.Port, message: object): void {
  try {
    port.postMessage(message)
  }
  catch { /* The next connection requests a fresh snapshot. */ }
}
function changed(): void {
  if (notification !== false)
    return

  notification = setTimeout(() => {
    notification = false

    for (const port of panels.keys()) send(port, { kind: 'changed' })

    void chrome.storage.session.set({ collectors: Object.fromEntries(counters) })
  }, 100)
}
async function settings(): Promise<PanelSettings> {
  return settingsSchema.parse((await chrome.storage.local.get('settings')).settings ?? {})
}
function counts(tabId: number): ReturnType<typeof defaultCollector> {
  if (!counters.has(tabId))
    counters.set(tabId, defaultCollector())

  return counters.get(tabId) ?? defaultCollector()
}
async function snapshot(tabId: number): Promise<JsonValue> {
  const repo = await repository

  const tab = await chrome.tabs.get(tabId)

  const url = tab.url ?? ''

  let origin = ''

  let allowed = false

  try {
    origin = new URL(url).origin

    allowed = await chrome.permissions.contains({ origins: [sitePattern(url)] })
  }
  catch { /* Restricted page. */ }

  const permissions = await chrome.permissions.getAll()

  const usage = await navigator.storage.estimate()

  return { sessions: await repo.listSessions(tabId), settings: await settings(), collector: counts(tabId), origin, allowed, supported: /^https?:/.test(url), sites: permissions.origins ?? [], usage: usage.usage ?? 0, quota: usage.quota ?? 0 }
}
async function assertSession(sessionKey: string, tabId: number): Promise<SessionSummary> {
  const session = await (await repository).getSession(sessionKey)

  if (session.source === 'importing')
    throw new Error('Import has not completed')

  if (session.source !== 'imported' && session.tabId !== tabId)
    throw new Error('Session belongs to another tab')

  return session
}
async function handlePanel(port: chrome.runtime.Port, input: unknown): Promise<void> {
  const parsed = requestSchema.safeParse(input)

  if (!parsed.success) {
    send(port, { kind: 'reply', id: '', ok: false, error: 'Invalid panel request' })

    return
  }

  const request = parsed.data

  try {
    await ready

    if (request.command === 'connect') {
      await chrome.tabs.get(request.tabId)

      panels.set(port, request.tabId)
    }

    const tabId = panels.get(port)

    if (tabId === undefined)
      throw new Error('Panel must connect first')

    const repo = await repository

    let data: JsonValue = {}

    if ('sessionKey' in request)
      await assertSession(request.sessionKey, tabId)

    switch (request.command) {
      case 'connect': case 'snapshot': data = await snapshot(tabId)
        break
      case 'query': data = inspectJson({ page: await repo.listEvents(request.sessionKey, request.filter, request.cursor), traces: await repo.listTraces(request.sessionKey) })
        break
      case 'locate': data = { cursor: await repo.locateEvent(request.sessionKey, request.eventId, request.filter) }
        break
      case 'detail': {
        const stored = await repo.getEvent(request.sessionKey, request.eventId)

        data = { stored, related: await repo.relatedEvents(request.sessionKey, request.eventId), message: await repo.messageContent(request.sessionKey, request.eventId), presentation: await repo.presentation(request.sessionKey, request.eventId) }

        break
      }
      case 'export': {
        const document = await repo.exportSession(request.sessionKey, request.traceId)

        const config = await settings()

        data = { ...document, events: document.events.map(event => redactEvent(event, [...DEFAULT_REDACT_FIELDS, ...config.redactFields])) }
        if (new TextEncoder().encode(JSON.stringify(data)).byteLength > 50 * 1024 * 1024)
          throw new Error('Export exceeds 50 MiB; select one Trace')

        break
      }
      case 'import': data = { sessionKey: await repo.importSession(request.text) }
        changed()
        break
      case 'delete': await repo.deleteSession(request.sessionKey)
        changed()
        break
      case 'clear-origin': await repo.clearByOrigin(request.origin)
        changed()
        break
      case 'clear-all': await repo.clearAll()
        changed()
        break
      case 'settings': await chrome.storage.local.set({ settings: request.settings })
        await repo.runRetentionPolicy(request.settings.retentionDays, request.settings.maxSessions, request.settings.maxStorageMb * 1024 * 1024)
        changed()
        break
      case 'refresh-permissions': await syncPermissions()
        data = await snapshot(tabId)
        break
    }

    send(port, { kind: 'reply', id: request.id, ok: true, data })
  }
  catch (error) {
    send(port, { kind: 'reply', id: request.id, ok: false, error: error instanceof Error ? error.message : 'Request failed' })
  }
}
async function ingest(port: chrome.runtime.Port, raw: unknown): Promise<void> {
  const tabId = port.sender?.tab?.id

  if (tabId === undefined || port.sender?.frameId !== 0)
    return

  await ready

  const counter = counts(tabId)

  try {
    const url = port.sender?.url ?? ''

    if (!await chrome.permissions.contains({ origins: [sitePattern(url)] })) {
      port.disconnect()

      return
    }

    const diagnostic = diagnosticSchema.safeParse(raw)

    if (diagnostic.success) {
      counter.dropped += diagnostic.data.dropped

      counter.rejected += diagnostic.data.rejected

      counter.lastError = diagnostic.data.message

      changed()

      return
    }

    const message = safeParseBridgeMessage(raw)

    if (!message.success) {
      counter.rejected++

      counter.lastError = message.issues.map(issue => issue.message).join('; ')

      send(port, { kind: 'ack', accepted: 0, rejected: 1 })

      changed()

      return
    }

    counter.connected = true

    if (message.data.kind === 'handshake') {
      send(port, { ...message.data, data: { requestId: message.data.data.requestId, phase: 'response', available: true } })

      changed()

      return
    }

    const events = message.data.kind === 'trace-batch' ? message.data.data : message.data.kind === 'trace-event' ? [message.data.data] : []

    const config = await settings()

    if (!config.recording) {
      counter.paused += events.length

      send(port, { kind: 'ack', accepted: 0, rejected: 0 })

      changed()

      return
    }

    const origin = new URL(url).origin

    const stored: StoredEvent[] = events.map((event) => {
      const sessionKey = JSON.stringify([tabId, origin, event.sessionId])

      return { key: JSON.stringify([sessionKey, event.eventId]), sessionKey, tabId, frameId: 0, receivedAt: new Date().toISOString(), extensionVersion: chrome.runtime.getManifest().version, event: redactEvent(event, [...DEFAULT_REDACT_FIELDS, ...config.redactFields]) }
    })

    const repo = await repository
    const result = await repo.appendEvents(stored, origin)
    if (result.conflicts)
      counter.lastError = `${result.conflicts} duplicate IDs contained conflicting data; first values retained`
    if (Date.now() - lastRetention > 60_000) {
      lastRetention = Date.now()
      await repo.runRetentionPolicy(config.retentionDays, config.maxSessions, config.maxStorageMb * 1024 * 1024)
    }

    counter.accepted += result.accepted

    counter.duplicates += result.duplicates

    send(port, { kind: 'ack', ...result, rejected: 0 })

    changed()
  }
  catch (error) {
    counter.lastError = error instanceof Error ? error.message : 'Storage failed'

    counter.rejected++

    send(port, { kind: 'ack', accepted: 0, rejected: 1, error: counter.lastError })

    changed()
  }
}
chrome.runtime.onConnect.addListener((port) => {
  if (port.sender?.id !== chrome.runtime.id) {
    port.disconnect()

    return
  }

  if (port.name === 'trace-panel' && port.sender.url?.startsWith(chrome.runtime.getURL('panel/'))) {
    port.onMessage.addListener((raw: unknown) => {
      void handlePanel(port, raw)
    })

    port.onDisconnect.addListener(() => panels.delete(port))

    return
  }

  const tabId = port.sender.tab?.id

  if (port.name !== 'trace-content' || tabId === undefined || port.sender.frameId !== 0) {
    port.disconnect()

    return
  }

  contents.set(port, tabId)

  port.onMessage.addListener((raw: unknown) => {
    if (queued >= 50) {
      const parsed = safeParseBridgeMessage(raw)

      const dropped = parsed.success ? parsed.data.kind === 'trace-batch' ? parsed.data.data.length : parsed.data.kind === 'trace-event' ? 1 : 0 : 0

      counts(tabId).dropped += dropped

      counts(tabId).lastError = 'Collector busy; batch dropped'

      send(port, { kind: 'ack', accepted: 0, rejected: 0, dropped })

      changed()

      return
    }

    queued++

    chain = chain.catch(() => {}).then(() => ingest(port, raw)).finally(() => {
      queued--
    })
  })

  port.onDisconnect.addListener(() => {
    contents.delete(port)

    counts(tabId).connected = [...contents.values()].includes(tabId)

    changed()
  })
})
chrome.tabs.onUpdated.addListener((_tabId, info) => {
  if (info.url || info.status === 'complete')
    changed()
})
chrome.permissions.onRemoved.addListener(() => {
  for (const port of contents.keys()) {
    const url = port.sender?.url ?? ''

    void chrome.permissions.contains({ origins: [sitePattern(url)] }).then((allowed) => {
      if (!allowed) {
        send(port, { kind: 'stop' })

        port.disconnect()
      }
    })
  }

  void syncPermissions().then(changed)
})
chrome.permissions.onAdded.addListener(() => {
  void syncPermissions().then(changed)
})
chrome.runtime.onInstalled.addListener(() => {
  void syncPermissions()

  void chrome.alarms.create('retention', { periodInMinutes: 60 })
})
chrome.runtime.onStartup.addListener(() => {
  void syncPermissions()
})
chrome.alarms.onAlarm.addListener(() => {
  void settings().then(async config => (await repository).runRetentionPolicy(config.retentionDays, config.maxSessions, config.maxStorageMb * 1024 * 1024)).catch(error => console.error('Retention failed', error))
})
