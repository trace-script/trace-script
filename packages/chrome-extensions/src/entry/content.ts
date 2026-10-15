// Chrome executes manifest content scripts as classic scripts. Keep this entry
// import-free; the worker performs the complete protocol validation.
const PAGE_MESSAGE_FIELD = {
  CHANNEL: 'trace-script',
  KIND: 'trace-event',
  INGEST_EVENT: 'INGEST_EVENT',
  CONTENT_PORT: 'trace-content',
} as const

type ContentPortState
  = | { status: 'connected', port: chrome.runtime.Port }
    | { status: 'disconnected' }

let portState: ContentPortState = { status: 'disconnected' }

// 建立到 service worker 的长连接。扩展被 reload 后旧上下文会失效并抛出
// “Extension context invalidated”，用 try/catch 兜底，避免产生未捕获异常。
function connect(): void {
  try {
    const port = chrome.runtime.connect({ name: PAGE_MESSAGE_FIELD.CONTENT_PORT })
    portState = { status: 'connected', port }
    port.onDisconnect.addListener(() => {
      portState = { status: 'disconnected' }
    })
  }
  catch {
    portState = { status: 'disconnected' }
  }
}

function forward(event: MessageEvent): void {
  if (event.source !== window || event.origin !== window.location.origin)
    return
  const data = event.data
  if (typeof data !== 'object' || data === null)
    return
  if (!('channel' in data) || data.channel !== PAGE_MESSAGE_FIELD.CHANNEL)
    return
  if (!('kind' in data) || data.kind !== PAGE_MESSAGE_FIELD.KIND || !('data' in data))
    return
  if (portState.status === 'disconnected')
    connect()
  if (portState.status === 'disconnected')
    return
  try {
    portState.port.postMessage({ type: PAGE_MESSAGE_FIELD.INGEST_EVENT, event: data.data })
    if (chrome.runtime.lastError) {
      // 页面进入 back/forward cache 后端口被关闭，显式消费 lastError 以去掉 “Unchecked” 告警。
      portState = { status: 'disconnected' }
    }
  }
  catch {
    // 扩展 reload 后旧上下文失效；丢弃本次事件，等待刷新页面重新注入内容脚本。
    portState = { status: 'disconnected' }
  }
}

connect()
window.addEventListener('message', forward)
window.addEventListener('pagehide', () => {
  window.removeEventListener('message', forward)
  if (portState.status === 'connected')
    portState.port.disconnect()
  portState = { status: 'disconnected' }
}, { once: true })
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    // 页面从 back/forward cache 恢复，旧通道已关闭，重新连接。
    connect()
  }
})
