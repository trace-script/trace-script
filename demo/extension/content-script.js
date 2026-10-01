/* global chrome */
(() => {
  const protocol = globalThis.AgentTraceProtocol

  function notify(message) {
    // This script runs in Chrome's isolated world. The page cannot use runtime directly.
    try {
      chrome.runtime.sendMessage(message, (response) => {
        const error = chrome.runtime.lastError
        if (error || !response?.ok)
          console.warn('[Agent Trace Demo] 接收失败：', error?.message || response?.error)
      })
    }
    catch (error) {
      console.warn('[Agent Trace Demo] 请刷新页面后重试：', error.message)
    }
  }

  // document_start runs again on each full page load, including refreshes.
  notify({ type: 'PAGE_LOADED' })

  window.addEventListener('message', (message) => {
    if (message.source !== window || message.origin !== window.location.origin)
      return

    if (!protocol.isEnvelope(message.data))
      return

    notify({ type: 'TRACE_DATA', envelope: message.data })
  })
})()
