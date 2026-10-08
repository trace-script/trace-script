import type { JsonValue, TraceActor, TraceBridgeMessage, TraceEventEnvelope, TraceEventType, TraceMetrics, TraceModel, TraceStatus } from '@trace-script/metadata'
import { DEFAULT_REDACT_FIELDS, redactEvent, safeParseTraceEvent } from '@trace-script/core'
import { PROTOCOL_VERSION, TRACE_CHANNEL } from '@trace-script/metadata'
import { utf8ByteLength } from '@trace-script/shared'

export interface TraceClient {
  configure: (options: ClientOptions) => void
  emit: (event: TraceEventEnvelope) => boolean
  flush: () => void
  startSession: (name?: string) => string
  endSession: (sessionId: string) => void
  startTrace: (sessionId: string, name?: string) => TraceHandle
  isCollectorAvailable: (timeoutMs?: number) => Promise<boolean>
  getStats: () => { sent: number, rejected: number, dropped: number, buffered: number }
  dispose: () => void
}

export interface ClientOptions {
  enabled?: boolean
  batchSize?: number
  flushIntervalMs?: number
  maxBufferEvents?: number
  redactFields?: string[]
  beforeSend?: (event: TraceEventEnvelope) => TraceEventEnvelope
  transport?: (message: TraceBridgeMessage) => void
  onDiagnostic?: (message: string) => void
}
export interface EventInput {
  type: TraceEventType
  name: string
  parentId?: string
  status?: TraceStatus
  payload?: JsonValue
  attributes?: Record<string, JsonValue>
  agent?: TraceActor
  model?: TraceModel
  metrics?: TraceMetrics
  durationMs?: number
  error?: { message: string, code?: string, stack?: string }
}
export interface TraceHandle {
  traceId: string
  sessionId: string
  emit: (input: EventInput) => string
  startSpan: (name: string, payload?: JsonValue) => SpanHandle
  end: () => void
}
export interface SpanHandle { eventId: string, end: (payload?: JsonValue) => void, fail: (message: string) => void }

function bounded(value: number, fallback: number, maximum: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.min(maximum, Math.floor(value))) : fallback
}

export function createTraceClient(initial: ClientOptions = {}): TraceClient {
  let options = { ...initial }

  let queue: TraceEventEnvelope[] = []

  let timer: ReturnType<typeof setTimeout> | false = false

  let disposed = false

  const stats = { sent: 0, rejected: 0, dropped: 0 }

  const sessions = new Map<string, { trace: TraceHandle, eventId: string }>()

  const handshakes = new Map<string, (available: boolean) => void>()

  function diagnose(message: string): void {
    try {
      options.onDiagnostic?.(message)
    }
    catch { /* Diagnostics must not interrupt the host application. */ }
  }

  function publish(message: TraceBridgeMessage): void {
    if (options.transport)
      options.transport(message)
    else if (typeof window !== 'undefined' && window.location.origin !== 'null')
      window.postMessage(message, window.location.origin)
  }

  function flush(): void {
    if (timer !== false)
      clearTimeout(timer)

    timer = false

    if (disposed || options.enabled === false) {
      stats.dropped += queue.length

      queue = []

      return
    }

    while (queue.length) {
      const batch: TraceEventEnvelope[] = []

      let bytes = 128

      const limit = bounded(options.batchSize ?? 50, 50, 100)

      while (queue.length && batch.length < limit) {
        const next = queue[0]

        if (!next)
          break

        const size = utf8ByteLength(JSON.stringify(next)) + 1

        if (bytes + size > 2 * 1024 * 1024)
          break

        batch.push(next)

        queue.shift()

        bytes += size
      }

      if (!batch.length) {
        queue.shift()

        stats.dropped++

        continue
      }

      try {
        publish({ channel: TRACE_CHANNEL, version: PROTOCOL_VERSION, kind: 'trace-batch', data: batch })

        stats.sent += batch.length
      }
      catch {
        stats.dropped += batch.length

        diagnose('Transport failed; events were not delivered')
      }
    }
  }

  function emit(event: TraceEventEnvelope): boolean {
    if (disposed || options.enabled === false)
      return false

    try {
      const parsed = safeParseTraceEvent(event)

      if (!parsed.success) {
        stats.rejected++

        diagnose(parsed.issues.map(issue => issue.message).join('; '))

        return false
      }

      const modified = options.beforeSend ? options.beforeSend(parsed.data) : parsed.data

      const validated = safeParseTraceEvent(modified)
      if (!validated.success)
        throw new Error('beforeSend returned an invalid event')
      const safe = redactEvent(validated.data, [...DEFAULT_REDACT_FIELDS, ...(options.redactFields ?? [])])

      if (queue.length >= bounded(options.maxBufferEvents ?? 500, 500, 1000)) {
        stats.dropped++

        diagnose('SDK buffer full')

        return false
      }

      queue.push(safe)

      if (queue.length >= bounded(options.batchSize ?? 50, 50, 100))
        flush()
      else if (timer === false)
        timer = setTimeout(flush, bounded(options.flushIntervalMs ?? 50, 50, 1000))

      return true
    }
    catch {
      stats.rejected++

      diagnose('Invalid event or beforeSend hook failure')

      return false
    }
  }

  function startTrace(sessionId: string, name = 'Trace'): TraceHandle {
    const traceId = crypto.randomUUID()

    let sequence = 0

    let closed = false

    function record(input: EventInput): string {
      const eventId = crypto.randomUUID()

      if (!closed)
        emit({ ...input, version: PROTOCOL_VERSION, sessionId, traceId, eventId, sequence: ++sequence, timestamp: new Date().toISOString() })

      return eventId
    }

    const startId = record({ type: 'span.start', name, status: 'running' })

    return {
      traceId,
      sessionId,
      emit: record,
      startSpan(spanName, payload) {
        const started = performance.now()

        const eventId = record({ type: 'span.start', name: spanName, status: 'running', parentId: startId, ...(payload !== undefined ? { payload } : {}) })

        let ended = false

        return { eventId, end(output) {
          if (ended)
            return

          ended = true

          record({ type: 'span.end', name: spanName, parentId: eventId, status: 'success', durationMs: performance.now() - started, ...(output !== undefined ? { payload: output } : {}) })
        }, fail(message) {
          if (ended)
            return

          ended = true

          record({ type: 'span.error', name: spanName, parentId: eventId, status: 'error', durationMs: performance.now() - started, error: { message } })
        } }
      },
      end() {
        if (closed)
          return

        record({ type: 'span.end', name, parentId: startId, status: 'success' })

        closed = true

        flush()
      },
    }
  }

  function startSession(name = 'Session'): string {
    const sessionId = crypto.randomUUID()

    const trace = startTrace(sessionId, name)

    const eventId = trace.emit({ type: 'session.start', name, status: 'running' })

    sessions.set(sessionId, { trace, eventId })

    return sessionId
  }

  function endSession(sessionId: string): void {
    const session = sessions.get(sessionId)

    if (!session)
      return

    session.trace.emit({ type: 'session.end', name: 'Session ended', parentId: session.eventId, status: 'success' })

    session.trace.end()

    sessions.delete(sessionId)
  }

  function isCollectorAvailable(timeoutMs = 500): Promise<boolean> {
    if (disposed || options.enabled === false || typeof window === 'undefined')
      return Promise.resolve(false)

    return new Promise((resolve) => {
      const requestId = crypto.randomUUID()

      const timeout = setTimeout(() => {
        handshakes.delete(requestId)

        resolve(false)
      }, Math.max(10, bounded(timeoutMs, 500, 5000)))

      handshakes.set(requestId, (available) => {
        clearTimeout(timeout)

        resolve(available)
      })

      try {
        publish({ channel: TRACE_CHANNEL, version: PROTOCOL_VERSION, kind: 'handshake', data: { requestId, phase: 'request' } })
      }
      catch {
        handshakes.delete(requestId)

        clearTimeout(timeout)

        resolve(false)
      }
    })
  }

  function onMessage(event: MessageEvent): void {
    if (event.source !== window || event.origin !== window.location.origin)
      return

    const data = event.data

    if (data?.channel === TRACE_CHANNEL && data.version === PROTOCOL_VERSION && data.kind === 'handshake' && data.data?.phase === 'response') {
      handshakes.get(data.data.requestId)?.(data.data.available === true)

      handshakes.delete(data.data.requestId)
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flush)

    window.addEventListener('message', onMessage)
  }

  return {
    configure(next: ClientOptions) {
      flush()

      options = { ...options, ...next }
    },
    emit,
    flush,
    startSession,
    endSession,
    startTrace,
    isCollectorAvailable,
    getStats: () => ({ ...stats, buffered: queue.length }),
    dispose() {
      flush()

      disposed = true

      for (const resolve of handshakes.values()) resolve(false)

      handshakes.clear()

      sessions.clear()

      if (typeof window !== 'undefined') {
        window.removeEventListener('pagehide', flush)

        window.removeEventListener('message', onMessage)
      }
    },
  }
}
