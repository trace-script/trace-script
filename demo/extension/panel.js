/* global chrome */
const output = document.getElementById('data')
const tabId = chrome.devtools.inspectedWindow.tabId
let records = []
let stopped = false
let connection
let retryTimer

function render() {
  // Render untrusted page data as text, never as HTML.
  output.textContent = records.length
    ? JSON.stringify(records, null, 2)
    : `已连接标签页 ${tabId}，等待数据。请点击测试页面上的按钮。`
}

function clear() {
  records = []
  render()
}

// Clear even when navigating to a page outside the content script's local scope.
chrome.devtools.network.onNavigated.addListener(clear)

function connect() {
  connection = chrome.runtime.connect({ name: 'agent-trace-panel' })
  connection.onMessage.addListener((message) => {
    if (message.type === 'PAGE_RESET') {
      clear()
      return
    }
    else if (message.type === 'TRACE_DATA') {
      if (records.some(item => item.recordId === message.record.recordId))
        return
      records = [...records, message.record].slice(-globalThis.AgentTraceProtocol.maxRecords)
    }
    else if (message.type === 'ERROR') {
      output.textContent = `接收失败：${message.error}`
      return
    }
    else if (message.type !== 'READY') {
      return
    }
    render()
  })
  connection.onDisconnect.addListener(() => {
    const error = chrome.runtime.lastError
    if (stopped)
      return
    output.textContent = `连接已断开，正在重连……${error ? `\n${error.message}` : ''}`
    retryTimer = setTimeout(connect, 1000)
  })
  connection.postMessage({ type: 'SUBSCRIBE', tabId })
}

window.addEventListener('pagehide', () => {
  stopped = true
  clearTimeout(retryTimer)
  chrome.devtools.network.onNavigated.removeListener(clear)
  connection.disconnect()
})

connect()
