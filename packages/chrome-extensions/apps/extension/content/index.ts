import type { TraceBridgeMessage } from '@trace-script/metadata'
import { safeParseBridgeMessage } from '@trace-script/core'
import { TRACE_CHANNEL } from '@trace-script/metadata'

if (window === window.top && !('traceScriptCollector' in globalThis)) {
  Object.defineProperty(globalThis, 'traceScriptCollector', { value: true, configurable: true })

  let port: chrome.runtime.Port | false = false

  let stopped = false

  let retries = 0

  let retryTimer: ReturnType<typeof setTimeout> | false = false

  let ackTimer: ReturnType<typeof setTimeout> | false = false
  let inFlight = false
  function clearAck(): void {
    if (ackTimer !== false)
      clearTimeout(ackTimer)
    ackTimer = false
  }

  let dropped = 0

  let rejected = 0

  const queue: TraceBridgeMessage[] = []

  function pump(): void {
    if (!port)
      return

    if (dropped || rejected) {
      port.postMessage({ kind: 'collector-diagnostic', dropped, rejected, message: 'Content bridge rejected invalid input or exceeded its 10-batch buffer' })

      dropped = 0

      rejected = 0
    }

    if (inFlight || !queue.length)
      return

    try {
      port.postMessage(queue[0])

      inFlight = true
      clearAck()
      ackTimer = setTimeout(() => {
        if (port)
          port.disconnect()
      }, 10_000)
    }
    catch {
      inFlight = false
    }
  }

  function stop(): void {
    stopped = true
    clearAck()

    if (retryTimer !== false)
      clearTimeout(retryTimer)

    window.removeEventListener('message', onMessage)

    window.removeEventListener('pagehide', stop)

    queue.length = 0

    if (port)
      port.disconnect()

    Reflect.deleteProperty(globalThis, 'traceScriptCollector')
  }

  function connect(): void {
    if (stopped)
      return

    try {
      const connected = chrome.runtime.connect({ name: 'trace-content' })

      port = connected

      connected.onMessage.addListener((raw: unknown) => {
        if (raw && typeof raw === 'object' && 'kind' in raw) {
          if (raw.kind === 'stop') {
            stop()

            return
          }

          if (raw.kind === 'ack') {
            clearAck()
            retries = 0

            queue.shift()

            inFlight = false

            pump()

            return
          }
        }

        const parsed = safeParseBridgeMessage(raw)

        if (parsed.success && parsed.data.kind === 'handshake' && parsed.data.data.phase === 'response') {
          clearAck()
          window.postMessage(parsed.data, window.location.origin)

          queue.shift()

          inFlight = false

          retries = 0

          pump()
        }
      })

      connected.onDisconnect.addListener(() => {
        clearAck()
        port = false

        inFlight = false

        if (!stopped && retries < 8)
          retryTimer = setTimeout(connect, Math.min(10_000, 200 * 2 ** retries++))
      })

      pump()
    }
    catch {
      if (!stopped && retries < 8)
        retryTimer = setTimeout(connect, Math.min(10_000, 200 * 2 ** retries++))
    }
  }

  function onMessage(event: MessageEvent): void {
    if (event.source !== window || event.origin !== window.location.origin || event.data?.channel !== TRACE_CHANNEL)
      return

    if (event.data?.kind === 'handshake' && event.data.data?.phase === 'response')
      return

    const parsed = safeParseBridgeMessage(event.data)

    if (!parsed.success) {
      rejected++

      pump()

      return
    }

    if (queue.length >= 10) {
      dropped += parsed.data.kind === 'trace-batch' ? parsed.data.data.length : parsed.data.kind === 'trace-event' ? 1 : 0

      pump()

      return
    }

    queue.push(parsed.data)

    pump()
  }

  window.addEventListener('message', onMessage)

  window.addEventListener('pagehide', stop)

  connect()
}
