/* global chrome, importScripts */
importScripts('protocol.js')

const protocol = globalThis.AgentTraceProtocol
const subscribers = new Map()

function post(port, message) {
  try {
    port.postMessage(message)
  }
  catch {
    subscribers.delete(port)
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!['TRACE_DATA', 'PAGE_LOADED'].includes(message?.type))
    return false

  if (!Number.isInteger(sender.tab?.id) || sender.frameId !== 0
    || (message.type === 'TRACE_DATA' && !protocol.isEnvelope(message.envelope))) {
    sendResponse({ ok: false, error: 'Invalid trace message' })
    return false
  }

  let origin
  try {
    const url = new URL(sender.url)
    if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname))
      throw new Error('Unsupported sender')
    origin = url.origin
  }
  catch {
    sendResponse({ ok: false, error: 'Unsupported sender' })
    return false
  }

  const tabId = sender.tab.id
  if (message.type === 'PAGE_LOADED') {
    for (const [port, inspectedTabId] of subscribers) {
      if (inspectedTabId === tabId)
        post(port, { type: 'PAGE_RESET' })
    }
    sendResponse({ ok: true })
    return false
  }

  const kind = protocol.getKind(message.envelope)
  const data = message.envelope[kind]
  const record = {
    kind,
    recordId: `${kind}:${kind === 'event' ? data.eventId : data.sessionId}`,
    [kind]: data,
    tabId,
    frameId: sender.frameId,
    origin,
    url: sender.url,
    receivedAt: Date.now(),
  }

  // Forward only to currently open panels. There is no data cache or replay.
  for (const [port, inspectedTabId] of subscribers) {
    if (inspectedTabId === tabId)
      post(port, { type: 'TRACE_DATA', record })
  }
  sendResponse({ ok: true })
  return false
})

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'agent-trace-panel')
    return

  port.onDisconnect.addListener(() => {
    subscribers.delete(port)
  })
  port.onMessage.addListener((message) => {
    if (message?.type !== 'SUBSCRIBE' || !Number.isInteger(message.tabId) || message.tabId < 0)
      return

    subscribers.set(port, message.tabId)
    post(port, { type: 'READY' })
  })
})
