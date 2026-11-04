import type { TraceEventEnvelope } from '@trace-script/metadata'
import type { WorkerToPanelMessage } from '@/messages'
import { safeParseTraceEvent } from '@trace-script/core'
import { isNumber } from '@trace-script/shared'
import { EXTENSION_MESSAGE_TYPE, EXTENSION_PORT_NAME, isContentToWorkerMessage, isPanelToWorkerMessage } from '@/messages'
import { appendTraceEvent, readTraceEvents } from '@/storage/trace-events'

const panelsByTab = new Map<number, Set<chrome.runtime.Port>>()
const tabByPanel = new Map<chrome.runtime.Port, number>()
let pending = Promise.resolve()

// Preserve message order across asynchronous writes, snapshots and subscriptions.
function enqueue(operation: () => Promise<void>): void {
  pending = pending.then(operation).catch((error) => {
    console.error('Trace storage operation failed', error)
  })
}

async function tabKey(tabId: number): Promise<string> {
  const stored = await chrome.storage.session.get('traceBrowserSessionId')
  let browserSessionId = stored.traceBrowserSessionId
  if (typeof browserSessionId !== 'string' || !browserSessionId) {
    browserSessionId = crypto.randomUUID()
    await chrome.storage.session.set({ traceBrowserSessionId: browserSessionId })
  }
  return `${browserSessionId}:${tabId}`
}

function send(port: chrome.runtime.Port, message: WorkerToPanelMessage): void {
  try {
    port.postMessage(message)
  }
  catch {
    // A disconnected panel is removed by onDisconnect.
  }
}

function removePanel(port: chrome.runtime.Port): void {
  const tabId = tabByPanel.get(port)
  if (!isNumber(tabId))
    return
  tabByPanel.delete(port)
  const panels = panelsByTab.get(tabId)
  panels?.delete(port)
  if (panels && panels.size === 0)
    panelsByTab.delete(tabId)
}

async function registerPanel(port: chrome.runtime.Port, tabId: number): Promise<void> {
  removePanel(port)
  const events = await readTraceEvents({ tabKey: await tabKey(tabId) })
  const panels = panelsByTab.get(tabId) ?? new Set<chrome.runtime.Port>()
  panels.add(port)
  panelsByTab.set(tabId, panels)
  tabByPanel.set(port, tabId)
  send(port, { type: EXTENSION_MESSAGE_TYPE.TRACE_QUERY_RESULT, events })
}

async function ingest(tabId: number, event: TraceEventEnvelope): Promise<void> {
  await appendTraceEvent(await tabKey(tabId), event)
  const panels = panelsByTab.get(tabId)
  if (!panels)
    return
  for (const panel of panels)
    send(panel, { type: EXTENSION_MESSAGE_TYPE.TRACE_EVENTS_APPEND, event })
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === EXTENSION_PORT_NAME.CONTENT) {
    port.onMessage.addListener((message: object) => {
      if (!isContentToWorkerMessage(message))
        return
      const tabId = port.sender?.tab?.id
      const parsed = safeParseTraceEvent(message.event)
      if (isNumber(tabId) && parsed.success)
        enqueue(() => ingest(tabId, parsed.data))
    })
    return
  }

  if (port.name !== EXTENSION_PORT_NAME.PANEL)
    return
  port.onMessage.addListener((message: object) => {
    if (!isPanelToWorkerMessage(message))
      return
    if (message.type === EXTENSION_MESSAGE_TYPE.PANEL_CONNECT) {
      enqueue(() => registerPanel(port, message.tabId))
      return
    }
    enqueue(async () => {
      const tabId = tabByPanel.get(port)
      if (isNumber(tabId))
        send(port, { type: EXTENSION_MESSAGE_TYPE.TRACE_QUERY_RESULT, events: await readTraceEvents({ tabKey: await tabKey(tabId) }) })
    })
  })
  port.onDisconnect.addListener(() => enqueue(async () => removePanel(port)))
})
