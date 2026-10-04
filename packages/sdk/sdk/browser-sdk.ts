import type { TraceBridgeMessage, TraceError, TraceEventEnvelope, TraceEventType } from '@trace-script/metadata'
import type {
  CompletionOptions,
  SdkIssue,
  SdkIssueCode,
  SdkResult,
  SdkStats,
  SdkValueResult,
  SpanHandle,
  SpanOptions,
  TraceSdk,
  TraceSdkOptions,
} from './types'
import { safeParseBridgeMessage, safeParseTraceEvent } from '@trace-script/core'
import { DEFAULT_PROTOCOL_LIMITS, PROTOCOL_VERSION, TRACE_CHANNEL } from '@trace-script/metadata'
import { utf8ByteLength } from '@trace-script/shared'

interface ActiveSession {
  sessionId: string
  traceId: string
  name: string
  startedAt: number
}

interface ActiveTrace extends ActiveSession {
  spanId: string
}

type SessionState = { active: false } | { active: true, value: ActiveSession & { startEventId: string } }
type TraceState = { active: false } | { active: true, value: ActiveTrace }
type TimerState = { active: false } | { active: true, id: ReturnType<typeof setTimeout> }
type BrowserEnvironment = { available: false } | { available: true, window: Window }

interface Handshake {
  finish: (available: boolean) => void
}

const defaults = {
  enabled: true,
  batchSize: 20,
  flushIntervalMs: 50,
  maxEventBytes: DEFAULT_PROTOCOL_LIMITS.maxEventBytes,
  maxBatchBytes: DEFAULT_PROTOCOL_LIMITS.maxBatchBytes,
  handshakeTimeoutMs: 200,
  debug: false,
}

/** Creates an isolated publisher; the collector is optional and delivery is best effort. */
export function createTraceSdk(options: TraceSdkOptions = {}): TraceSdk {
  const environment: BrowserEnvironment = typeof window === 'undefined'
    ? { available: false }
    : { available: true, window }
  let configuration: TraceSdkOptions & typeof defaults = { ...defaults }
  let session: SessionState = { active: false }
  let trace: TraceState = { active: false }
  let timer: TimerState = { active: false }
  let disposed = false
  let localId = 0
  let queue: TraceEventEnvelope[] = []
  const sequences = new Map<string, number>()
  const handshakes = new Map<string, Handshake>()
  const stats: SdkStats = {
    emitted: 0,
    sent: 0,
    batches: 0,
    queued: 0,
    dropped: 0,
    configurationErrors: 0,
    validationErrors: 0,
    redactionErrors: 0,
    sendErrors: 0,
    handshakeErrors: 0,
  }

  function issue(code: SdkIssueCode, message: string): { ok: false, issue: SdkIssue } {
    const value: SdkIssue = { code, message }
    if (code === 'invalid-options')
      stats.configurationErrors++
    if (code === 'invalid-event' || code === 'sequence-conflict' || code === 'event-too-large')
      stats.validationErrors++
    if (code === 'redaction-failed')
      stats.redactionErrors++
    if (code === 'send-failed')
      stats.sendErrors++
    if (code === 'handshake-failed')
      stats.handshakeErrors++
    try {
      configuration.onError?.(value)
      if (configuration.debug)
        console.warn('[trace-script/sdk]', value)
    }
    catch {
      // Diagnostic callbacks must not interrupt the host application.
    }
    return { ok: false, issue: value }
  }

  function ready(): SdkResult {
    if (disposed)
      return issue('disposed', 'The SDK has been disposed')
    if (!configuration.enabled)
      return issue('disabled', 'The SDK is disabled')
    if (!environment.available)
      return issue('no-window', 'A browser window is required to publish events')
    return { ok: true }
  }

  function createId(): string {
    localId++
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
        return crypto.randomUUID()
    }
    catch {
      // The fallback also supports restricted or older browser environments.
    }
    return `trace-${Date.now().toString(36)}-${localId.toString(36)}-${Math.random().toString(36).slice(2)}`
  }

  function cancelTimer(): void {
    if (timer.active)
      clearTimeout(timer.id)
    timer = { active: false }
  }

  function batch(events: TraceEventEnvelope[]): TraceBridgeMessage {
    return { channel: TRACE_CHANNEL, version: PROTOCOL_VERSION, kind: 'trace-batch', data: events }
  }

  function flush(): SdkValueResult<number> {
    const state = ready()
    if (!state.ok)
      return state
    cancelTimer()
    if (queue.length === 0)
      return { ok: true, value: 0 }
    const events = queue
    queue = []
    if (!environment.available)
      return issue('no-window', 'A browser window is required to publish events')
    try {
      environment.window.postMessage(batch(events), environment.window.location.origin)
      stats.sent += events.length
      stats.batches++
      return { ok: true, value: events.length }
    }
    catch {
      stats.dropped += events.length
      return issue('send-failed', 'The browser could not publish the event batch')
    }
  }

  function configure(next: TraceSdkOptions): SdkResult {
    if (disposed)
      return issue('disposed', 'The SDK has been disposed')
    const candidate = { ...configuration, ...next }
    const positiveInteger = (value: number): boolean => Number.isSafeInteger(value) && value > 0
    if (typeof candidate.enabled !== 'boolean' || typeof candidate.debug !== 'boolean'
      || !positiveInteger(candidate.batchSize) || candidate.batchSize > DEFAULT_PROTOCOL_LIMITS.maxBatchEvents
      || !positiveInteger(candidate.flushIntervalMs) || candidate.flushIntervalMs > 60_000
      || !positiveInteger(candidate.maxEventBytes) || candidate.maxEventBytes > DEFAULT_PROTOCOL_LIMITS.maxEventBytes
      || !positiveInteger(candidate.maxBatchBytes) || candidate.maxBatchBytes > DEFAULT_PROTOCOL_LIMITS.maxBatchBytes
      || !positiveInteger(candidate.handshakeTimeoutMs) || candidate.handshakeTimeoutMs > 60_000
      || (candidate.redact !== undefined && typeof candidate.redact !== 'function')
      || (candidate.onError !== undefined && typeof candidate.onError !== 'function')) {
      return issue('invalid-options', 'SDK limits must be positive integers within protocol and timer bounds')
    }
    if (queue.length > 0 && candidate.enabled) {
      const result = flush()
      if (!result.ok)
        return result
    }
    configuration = candidate
    cancelTimer()
    if (!configuration.enabled) {
      stats.dropped += queue.length
      queue = []
      for (const pending of handshakes.values())
        pending.finish(false)
    }
    return { ok: true }
  }

  function emit(input: TraceEventEnvelope): SdkValueResult<TraceEventEnvelope> {
    const state = ready()
    if (!state.ok)
      return state
    const parsed = safeParseTraceEvent(input, { maxEventBytes: configuration.maxEventBytes })
    if (!parsed.success) {
      stats.dropped++
      return issue(parsed.issues.some(value => value.code === 'EVENT_TOO_LARGE') ? 'event-too-large' : 'invalid-event', parsed.issues.map(value => value.message).join('; '))
    }
    let event = parsed.data
    try {
      if (configuration.redact) {
        const identity = { eventId: event.eventId, traceId: event.traceId, sessionId: event.sessionId, parentId: event.parentId, sequence: event.sequence, type: event.type }
        const redacted = safeParseTraceEvent(configuration.redact(event), { maxEventBytes: configuration.maxEventBytes })
        if (!redacted.success || redacted.data.eventId !== identity.eventId
          || redacted.data.traceId !== identity.traceId || redacted.data.sessionId !== identity.sessionId
          || redacted.data.parentId !== identity.parentId
          || redacted.data.sequence !== identity.sequence || redacted.data.type !== identity.type) {
          stats.dropped++
          return issue('redaction-failed', 'Redaction must return a valid event with unchanged identity, parent, sequence, and type')
        }
        event = redacted.data
      }
      // Snapshot the JSON data so later caller mutations cannot change queued events.
      const snapshot = safeParseTraceEvent(JSON.parse(JSON.stringify(event)), { maxEventBytes: configuration.maxEventBytes })
      if (!snapshot.success) {
        stats.dropped++
        return issue('invalid-event', 'The event could not be snapshotted safely')
      }
      event = snapshot.data
    }
    catch {
      stats.dropped++
      return issue('redaction-failed', 'The redaction hook failed')
    }
    if (event.sequence <= (sequences.get(event.traceId) ?? 0)) {
      stats.dropped++
      return issue('sequence-conflict', 'Event sequence must increase within its trace')
    }
    if (utf8ByteLength(JSON.stringify(batch([event]))) > configuration.maxBatchBytes) {
      stats.dropped++
      return issue('event-too-large', 'The event and bridge envelope exceed the batch byte limit')
    }
    if (queue.length > 0 && utf8ByteLength(JSON.stringify(batch([...queue, event]))) > configuration.maxBatchBytes) {
      const result = flush()
      if (!result.ok) {
        stats.dropped++
        return result
      }
    }
    try {
      queue.push(structuredClone(event))
    }
    catch {
      stats.dropped++
      return issue('invalid-event', 'The event could not be copied into the queue')
    }
    sequences.set(event.traceId, event.sequence)
    stats.emitted++
    if (queue.length >= configuration.batchSize) {
      const result = flush()
      if (!result.ok)
        return result
    }
    else if (!timer.active) {
      timer = { active: true, id: setTimeout(flush, configuration.flushIntervalMs) }
    }
    return { ok: true, value: event }
  }

  function publish(context: ActiveSession, type: TraceEventType, name: string, details: Partial<TraceEventEnvelope> = {}): SdkValueResult<TraceEventEnvelope> {
    const event: TraceEventEnvelope = {
      ...details,
      version: PROTOCOL_VERSION,
      eventId: createId(),
      sessionId: context.sessionId,
      traceId: context.traceId,
      sequence: (sequences.get(context.traceId) ?? 0) + 1,
      timestamp: new Date().toISOString(),
      type,
      name,
    }
    return emit(event)
  }

  function startSession(name = 'Session', details: SpanOptions = {}): ReturnType<TraceSdk['startSession']> {
    const state = ready()
    if (!state.ok)
      return state
    if (session.active)
      return issue('session-active', 'End the active session before starting another')
    const value: ActiveSession = { sessionId: createId(), traceId: createId(), name, startedAt: Date.now() }
    const result = publish(value, 'session.start', name, { ...details, status: 'running' })
    if (!result.ok)
      return result
    session = { active: true, value: { ...value, startEventId: result.value.eventId } }
    return { ok: true, value: { sessionId: value.sessionId, traceId: value.traceId } }
  }

  function startTrace(name: string, details: SpanOptions = {}): ReturnType<TraceSdk['startTrace']> {
    const state = ready()
    if (!state.ok)
      return state
    if (!session.active)
      return issue('no-session', 'Start a session before starting a trace')
    if (trace.active)
      return issue('trace-active', 'End the active trace before starting another')
    const context: ActiveSession = { sessionId: session.value.sessionId, traceId: createId(), name, startedAt: Date.now() }
    const result = publish(context, 'span.start', name, { ...details, status: 'running' })
    if (!result.ok)
      return result
    const value: ActiveTrace = { ...context, spanId: result.value.eventId }
    trace = { active: true, value }
    return { ok: true, value: { sessionId: value.sessionId, traceId: value.traceId, spanId: value.spanId } }
  }

  function endTrace(details: CompletionOptions = {}): SdkResult {
    if (!trace.active)
      return { ok: true }
    const { value } = trace
    const status = details.status ?? (details.error ? 'error' : 'success')
    const result = publish(value, status === 'error' ? 'span.error' : 'span.end', value.name, {
      ...details,
      status,
      parentId: value.spanId,
      durationMs: Math.max(0, Date.now() - value.startedAt),
    })
    if (!result.ok)
      return result
    trace = { active: false }
    return { ok: true }
  }

  function endSession(details: CompletionOptions = {}): SdkResult {
    if (!session.active)
      return { ok: true }
    const ended = endTrace(details)
    if (!ended.ok)
      return ended
    const { value } = session
    const result = publish(value, 'session.end', value.name, {
      ...details,
      parentId: value.startEventId,
      status: details.status ?? (details.error ? 'error' : 'success'),
      durationMs: Math.max(0, Date.now() - value.startedAt),
    })
    if (!result.ok)
      return result
    session = { active: false }
    return { ok: true }
  }

  function startSpan(name: string, details: SpanOptions = {}): SdkValueResult<SpanHandle> {
    const state = ready()
    if (!state.ok)
      return state
    if (!trace.active)
      return issue('no-trace', 'Start a trace before starting a span')
    const context = trace.value
    const startedAt = Date.now()
    const result = publish(context, 'span.start', name, { ...details, parentId: details.parentId ?? context.spanId, status: 'running' })
    if (!result.ok)
      return result
    const spanId = result.value.eventId
    let ended = false
    function end(completion: CompletionOptions = {}): SdkResult {
      if (ended)
        return { ok: true }
      const status = completion.status ?? (completion.error ? 'error' : 'success')
      const finished = publish(context, status === 'error' ? 'span.error' : 'span.end', name, {
        ...completion,
        status,
        parentId: spanId,
        durationMs: Math.max(0, Date.now() - startedAt),
      })
      if (!finished.ok)
        return finished
      ended = true
      return { ok: true }
    }
    return {
      ok: true,
      value: { spanId, sessionId: context.sessionId, traceId: context.traceId, end, fail: (error: TraceError) => end({ status: 'error', error }) },
    }
  }

  function receiveHandshake(event: MessageEvent): void {
    if (!environment.available || event.source !== environment.window || event.origin !== environment.window.location.origin)
      return
    const parsed = safeParseBridgeMessage(event.data)
    if (parsed.success && parsed.data.kind === 'handshake' && parsed.data.data.phase === 'response')
      handshakes.get(parsed.data.data.requestId)?.finish(parsed.data.data.available === true)
  }

  async function isCollectorAvailable(timeoutMs = configuration.handshakeTimeoutMs): Promise<boolean> {
    const state = ready()
    if (!state.ok)
      return false
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
      issue('invalid-options', 'Handshake timeout must be an integer from 1 to 60000 milliseconds')
      return false
    }
    if (!environment.available)
      return false
    const browserWindow = environment.window
    const requestId = createId()
    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => handshakes.get(requestId)?.finish(false), timeoutMs)
      handshakes.set(requestId, {
        finish(available) {
          clearTimeout(timeout)
          handshakes.delete(requestId)
          resolve(available)
        },
      })
      try {
        const message: TraceBridgeMessage = {
          channel: TRACE_CHANNEL,
          version: PROTOCOL_VERSION,
          kind: 'handshake',
          data: { requestId, phase: 'request' },
        }
        browserWindow.postMessage(message, browserWindow.location.origin)
      }
      catch {
        issue('handshake-failed', 'The browser could not publish the collector handshake')
        handshakes.get(requestId)?.finish(false)
      }
    })
  }

  function dispose(): SdkResult {
    if (disposed)
      return { ok: true }
    const result = queue.length > 0 ? flush() : { ok: true as const }
    cancelTimer()
    for (const pending of handshakes.values())
      pending.finish(false)
    if (environment.available) {
      environment.window.removeEventListener('message', receiveHandshake)
      environment.window.removeEventListener('pagehide', flush)
      environment.window.removeEventListener('beforeunload', flush)
    }
    disposed = true
    sequences.clear()
    return result.ok ? { ok: true } : result
  }

  configure(options)
  if (environment.available) {
    environment.window.addEventListener('message', receiveHandshake)
    environment.window.addEventListener('pagehide', flush)
    environment.window.addEventListener('beforeunload', flush)
  }
  return { configure, startSession, endSession, startTrace, endTrace, emit, startSpan, flush, dispose, isCollectorAvailable, getStats: () => ({ ...stats, queued: queue.length }) }
}
