// @vitest-environment happy-dom
import type { JsonValue, TraceBridgeMessage, TraceEventEnvelope } from '@trace-script/metadata'
import type { SdkValueResult, TraceSdk, TraceSdkOptions } from '../../packages/sdk'
import { safeParseBridgeMessage } from '@trace-script/core'
import { DEFAULT_PROTOCOL_LIMITS, PROTOCOL_VERSION, TRACE_CHANNEL } from '@trace-script/metadata'
import { utf8ByteLength } from '@trace-script/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTraceSdk } from '../../packages/sdk'

const instances: TraceSdk[] = []
let messages: TraceBridgeMessage[] = []

function sdk(options: TraceSdkOptions = {}): TraceSdk {
  const instance = createTraceSdk(options)
  instances.push(instance)
  return instance
}

function value<T>(result: SdkValueResult<T>): T {
  expect(result.ok).toBe(true)
  if (!result.ok)
    throw new Error(result.issue.message)
  return result.value
}

function event(sequence = 1, overrides: Partial<TraceEventEnvelope> = {}): TraceEventEnvelope {
  return {
    version: PROTOCOL_VERSION,
    eventId: `event-${sequence}`,
    traceId: 'external-trace',
    sessionId: 'external-session',
    sequence,
    timestamp: new Date().toISOString(),
    type: 'log',
    name: 'External event',
    ...overrides,
  }
}

function events(): TraceEventEnvelope[] {
  return messages.flatMap(message => message.kind === 'trace-batch' ? message.data : [])
}

function payloadAtEventDepth(depth: number): JsonValue {
  let payload: JsonValue = 'leaf'
  for (let index = 1; index < depth; index++)
    payload = { child: payload }
  return payload
}

function handshake(): Extract<TraceBridgeMessage, { kind: 'handshake' }> {
  const request = messages.find(message => message.kind === 'handshake')
  if (!request || request.kind !== 'handshake')
    throw new Error('Expected a published handshake request')
  return request
}

function respond(requestId: string, changes: Partial<MessageEventInit> = {}): void {
  window.dispatchEvent(new MessageEvent('message', {
    data: {
      channel: TRACE_CHANNEL,
      version: PROTOCOL_VERSION,
      kind: 'handshake',
      data: { requestId, phase: 'response', available: true },
    },
    source: window,
    origin: window.location.origin,
    ...changes,
  }))
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-04T00:00:00.000Z'))
  messages = []
  vi.spyOn(window, 'postMessage').mockImplementation((message) => {
    const parsed = safeParseBridgeMessage(message)
    if (!parsed.success)
      throw new Error('SDK published an invalid bridge message')
    messages.push(parsed.data)
  })
})

afterEach(() => {
  for (const instance of instances)
    instance.dispose()
  instances.length = 0
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('createTraceSdk and configure', () => {
  it('creates isolated publishers and safely flushes an empty queue', () => {
    const first = sdk()
    const second = sdk()
    expect(first.flush()).toEqual({ ok: true, value: 0 })
    value(first.emit(event()))
    expect(first.getStats().queued).toBe(1)
    expect(second.getStats().queued).toBe(0)
    expect(messages).toEqual([])
  })

  it('works without a browser and never uses extension globals', async () => {
    vi.stubGlobal('window', undefined)
    const instance = sdk()
    expect(instance.startSession()).toMatchObject({ ok: false, issue: { code: 'no-window' } })
    expect(instance.emit(event())).toMatchObject({ ok: false, issue: { code: 'no-window' } })
    expect(instance.flush()).toMatchObject({ ok: false, issue: { code: 'no-window' } })
    expect(await instance.isCollectorAvailable()).toBe(false)
    expect(instance.dispose()).toEqual({ ok: true })
  })

  it('applies batching changes after flushing pending events', () => {
    const instance = sdk()
    value(instance.emit(event()))
    expect(instance.configure({ batchSize: 1, flushIntervalMs: 10 })).toEqual({ ok: true })
    expect(events()).toHaveLength(1)
    value(instance.emit(event(2)))
    expect(events()).toHaveLength(2)
    vi.advanceTimersByTime(100)
    expect(messages).toHaveLength(2)
  })

  it('drops pending events on disable and allows publishing after re-enable', () => {
    const instance = sdk()
    value(instance.emit(event()))
    expect(instance.configure({ enabled: false })).toEqual({ ok: true })
    expect(instance.emit(event(2))).toMatchObject({ ok: false, issue: { code: 'disabled' } })
    vi.advanceTimersByTime(100)
    expect(messages).toEqual([])
    expect(instance.getStats()).toMatchObject({ dropped: 1, queued: 0 })
    expect(instance.configure({ enabled: true })).toEqual({ ok: true })
    value(instance.emit(event(2)))
    value(instance.flush())
    expect(events()[0]?.sequence).toBe(2)
  })

  it.each([
    { batchSize: 0 },
    { batchSize: 101 },
    { batchSize: 1.5 },
    { flushIntervalMs: 0 },
    { flushIntervalMs: 60_001 },
    { maxEventBytes: DEFAULT_PROTOCOL_LIMITS.maxEventBytes + 1 },
    { maxBatchBytes: 0 },
    { maxBatchBytes: DEFAULT_PROTOCOL_LIMITS.maxBatchBytes + 1 },
    { handshakeTimeoutMs: 60_001 },
  ])('rejects invalid options without changing the active configuration: %j', (options) => {
    const instance = sdk({ batchSize: 1 })
    expect(instance.configure(options)).toMatchObject({ ok: false, issue: { code: 'invalid-options' } })
    value(instance.emit(event()))
    expect(events()).toHaveLength(1)
    expect(instance.getStats().configurationErrors).toBe(1)
  })

  it('makes invalid initial configuration observable and keeps safe defaults', () => {
    const instance = sdk({ batchSize: 0 })
    expect(instance.getStats().configurationErrors).toBe(1)
    value(instance.emit(event()))
    expect(messages).toEqual([])
    vi.advanceTimersByTime(50)
    expect(events()).toHaveLength(1)
  })

  it('returns copies of statistics', () => {
    const instance = sdk()
    const stats = instance.getStats()
    stats.emitted = 999
    expect(instance.getStats().emitted).toBe(0)
  })
})

describe('emit and flush', () => {
  it('posts valid events to the exact page origin at the default count threshold', () => {
    const instance = sdk()
    for (let sequence = 1; sequence <= 19; sequence++)
      value(instance.emit(event(sequence)))
    expect(messages).toEqual([])
    value(instance.emit(event(20)))
    expect(messages).toHaveLength(1)
    expect(events().map(item => item.sequence)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1))
    expect(window.postMessage).toHaveBeenCalledWith(messages[0], window.location.origin)
    expect(instance.getStats()).toMatchObject({ emitted: 20, sent: 20, batches: 1, queued: 0, dropped: 0 })
  })

  it('flushes at 50 ms from the first queued event without extending the window', () => {
    const instance = sdk()
    value(instance.emit(event()))
    vi.advanceTimersByTime(49)
    value(instance.emit(event(2)))
    expect(messages).toEqual([])
    vi.advanceTimersByTime(1)
    expect(events()).toHaveLength(2)
    vi.advanceTimersByTime(100)
    expect(messages).toHaveLength(1)
  })

  it('flushes immediately and cancels the scheduled timer', () => {
    const instance = sdk()
    value(instance.emit(event()))
    expect(instance.flush()).toEqual({ ok: true, value: 1 })
    vi.advanceTimersByTime(100)
    expect(messages).toHaveLength(1)
    expect(instance.flush()).toEqual({ ok: true, value: 0 })
  })

  it('splits batches using serialized UTF-8 bytes including the bridge envelope', () => {
    const first = event(1, { payload: '中文🙂'.repeat(40) })
    const second = event(2, { payload: '中文🙂'.repeat(40) })
    const maxBatchBytes = utf8ByteLength(JSON.stringify({ channel: TRACE_CHANNEL, version: PROTOCOL_VERSION, kind: 'trace-batch', data: [first] })) + 5
    const instance = sdk({ maxBatchBytes })
    value(instance.emit(first))
    value(instance.emit(second))
    expect(messages).toHaveLength(1)
    expect(events()).toHaveLength(1)
    value(instance.flush())
    expect(messages).toHaveLength(2)
    expect(messages.every(message => utf8ByteLength(JSON.stringify(message)) <= maxBatchBytes)).toBe(true)
  })

  it('counts the incoming event as dropped when sending the preceding batch fails', () => {
    const first = event(1, { payload: 'x'.repeat(500) })
    const second = event(2, { payload: 'x'.repeat(500) })
    const maxBatchBytes = utf8ByteLength(JSON.stringify({ channel: TRACE_CHANNEL, version: PROTOCOL_VERSION, kind: 'trace-batch', data: [first] })) + 5
    const instance = sdk({ maxBatchBytes })
    value(instance.emit(first))
    vi.mocked(window.postMessage).mockImplementation(() => {
      throw new Error('send failure')
    })
    expect(instance.emit(second)).toMatchObject({ ok: false, issue: { code: 'send-failed' } })
    expect(instance.getStats()).toMatchObject({ emitted: 1, queued: 0, dropped: 2, sendErrors: 1 })
    vi.advanceTimersByTime(100)
    expect(window.postMessage).toHaveBeenCalledTimes(1)
  })

  it('accepts legal events larger than 64 KiB with protocol defaults', () => {
    const instance = sdk()
    value(instance.emit(event(1, { payload: 'x'.repeat(100_000) })))
    value(instance.flush())
    expect(events()[0]?.payload).toHaveLength(100_000)
  })

  it('publishes an event at the maximum JSON depth inside its batch wrapper', () => {
    const instance = sdk()
    const payload = payloadAtEventDepth(DEFAULT_PROTOCOL_LIMITS.maxDepth)
    value(instance.emit(event(1, { payload })))
    value(instance.flush())
    expect(events()[0]?.payload).toEqual(payload)
    expect(instance.getStats()).toMatchObject({ sent: 1, dropped: 0 })
  })

  it('rejects an event beyond the maximum JSON depth before queueing it', () => {
    const instance = sdk()
    expect(instance.emit(event(1, { payload: payloadAtEventDepth(DEFAULT_PROTOCOL_LIMITS.maxDepth + 1) })))
      .toMatchObject({ ok: false, issue: { code: 'invalid-event' } })
    expect(instance.getStats()).toMatchObject({ queued: 0, dropped: 1, validationErrors: 1 })
    expect(messages).toEqual([])
  })

  it('rejects oversized events before they enter the queue', () => {
    const instance = sdk({ maxEventBytes: 256 })
    expect(instance.emit(event(1, { payload: 'x'.repeat(500) }))).toMatchObject({ ok: false, issue: { code: 'event-too-large' } })
    expect(instance.getStats()).toMatchObject({ queued: 0, dropped: 1, validationErrors: 1 })
  })

  it('rejects an event that fits its own byte limit but exceeds the batch envelope limit', () => {
    const instance = sdk({ maxBatchBytes: 100 })
    expect(instance.emit(event())).toMatchObject({ ok: false, issue: { code: 'event-too-large' } })
    expect(messages).toEqual([])
  })

  it('rejects invalid fields and duplicate or decreasing per-trace sequences', () => {
    const instance = sdk()
    expect(instance.emit(event(1, { name: '' }))).toMatchObject({ ok: false, issue: { code: 'invalid-event' } })
    value(instance.emit(event(3)))
    expect(instance.emit(event(3))).toMatchObject({ ok: false, issue: { code: 'sequence-conflict' } })
    expect(instance.emit(event(2))).toMatchObject({ ok: false, issue: { code: 'sequence-conflict' } })
    value(instance.emit(event(1, { traceId: 'second-trace' })))
    expect(instance.getStats()).toMatchObject({ emitted: 2, dropped: 3, validationErrors: 3 })
  })

  it('snapshots queued JSON data before callers mutate their payload', () => {
    const instance = sdk()
    const payload = { text: 'original', nested: { value: 1 } }
    const accepted = value(instance.emit(event(1, { payload })))
    payload.text = 'changed'
    payload.nested.value = 2
    accepted.payload = 'changed again'
    value(instance.flush())
    expect(events()[0]?.payload).toEqual({ text: 'original', nested: { value: 1 } })
  })

  it('contains queue copy failures without consuming a sequence or throwing into the host', () => {
    const onError = vi.fn()
    const instance = sdk({ onError })
    const originalClone = globalThis.structuredClone
    const clone = vi.spyOn(globalThis, 'structuredClone')
      // Allow the boundary parsers to finish, then fail the separate queue copy.
      .mockImplementationOnce(originalClone)
      .mockImplementationOnce(originalClone)
      .mockImplementationOnce(() => {
        throw new Error('copy failure')
      })
    expect(instance.emit(event())).toMatchObject({ ok: false, issue: { code: 'invalid-event' } })
    expect(instance.getStats()).toMatchObject({ emitted: 0, queued: 0, dropped: 1, validationErrors: 1 })
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'invalid-event' }))
    clone.mockRestore()
    value(instance.emit(event()))
    value(instance.flush())
    expect(events()).toHaveLength(1)
  })

  it('redacts events before publishing and counts redaction failures', () => {
    const instance = sdk({ redact: input => ({ ...input, payload: '[redacted]' }) })
    value(instance.emit(event(1, { parentId: 'parent-start', payload: 'secret' })))
    value(instance.flush())
    expect(events()[0]?.payload).toBe('[redacted]')
    expect(events()[0]?.parentId).toBe('parent-start')
    instance.configure({ redact: () => {
      throw new Error('redactor failure')
    } })
    expect(instance.emit(event(2))).toMatchObject({ ok: false, issue: { code: 'redaction-failed' } })
    expect(instance.getStats().redactionErrors).toBe(1)
  })

  it('rejects redaction that mutates event identity or produces invalid schema fields', () => {
    const instance = sdk({ redact: input => ({ ...input, name: '' }) })
    expect(instance.emit(event())).toMatchObject({ ok: false, issue: { code: 'redaction-failed' } })
    instance.configure({
      redact(input) {
        input.eventId = 'replaced'
        return input
      },
    })
    expect(instance.emit(event())).toMatchObject({ ok: false, issue: { code: 'redaction-failed' } })
    expect(instance.getStats()).toMatchObject({ redactionErrors: 2, dropped: 2, emitted: 0 })
  })

  it('rejects redaction that replaces, removes, or adds a parent relationship', () => {
    const instance = sdk({ redact: input => ({ ...input, parentId: 'replacement-parent' }) })
    expect(instance.emit(event(1, { parentId: 'original-parent' }))).toMatchObject({ ok: false, issue: { code: 'redaction-failed' } })
    instance.configure({
      redact(input) {
        delete input.parentId
        return input
      },
    })
    expect(instance.emit(event(1, { parentId: 'original-parent' }))).toMatchObject({ ok: false, issue: { code: 'redaction-failed' } })
    instance.configure({ redact: input => ({ ...input, parentId: 'new-parent' }) })
    expect(instance.emit(event())).toMatchObject({ ok: false, issue: { code: 'redaction-failed' } })
    expect(instance.getStats()).toMatchObject({ redactionErrors: 3, dropped: 3, queued: 0 })
  })

  it('returns send failures and prevents error callbacks from throwing into the host', () => {
    const onError = vi.fn(() => {
      throw new Error('diagnostic failure')
    })
    const instance = sdk({ batchSize: 1, onError })
    vi.mocked(window.postMessage).mockImplementation(() => {
      throw new Error('clone failure')
    })
    expect(instance.emit(event())).toMatchObject({ ok: false, issue: { code: 'send-failed' } })
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'send-failed' }))
    expect(instance.getStats()).toMatchObject({ emitted: 1, sent: 0, dropped: 1, sendErrors: 1, queued: 0 })
    expect(instance.flush()).toEqual({ ok: true, value: 0 })
  })

  it('reports asynchronous timer failures with the same counters and diagnostic callback', () => {
    const onError = vi.fn()
    const instance = sdk({ onError })
    value(instance.emit(event()))
    vi.mocked(window.postMessage).mockImplementation(() => {
      throw new Error('send failure')
    })
    expect(() => vi.advanceTimersByTime(50)).not.toThrow()
    expect(instance.getStats()).toMatchObject({ dropped: 1, sendErrors: 1 })
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'send-failed' }))
  })
})

describe('session, trace and span lifecycles', () => {
  it('publishes lifecycle events with per-trace sequences, parents and durations', () => {
    const instance = sdk()
    const session = value(instance.startSession('Conversation'))
    const trace = value(instance.startTrace('Turn'))
    const span = value(instance.startSpan('Tool', { payload: { input: 'query' } }))
    vi.advanceTimersByTime(25)
    expect(span.end({ payload: { output: 'result' } })).toEqual({ ok: true })
    expect(instance.endTrace()).toEqual({ ok: true })
    expect(instance.endSession()).toEqual({ ok: true })
    value(instance.flush())
    expect(events().map(item => item.type)).toEqual(['session.start', 'span.start', 'span.start', 'span.end', 'span.end', 'session.end'])
    const sessionEvents = events().filter(item => item.traceId === session.traceId)
    const traceEvents = events().filter(item => item.traceId === trace.traceId)
    expect(sessionEvents.map(item => item.sequence)).toEqual([1, 2])
    expect(sessionEvents[1]?.parentId).toBe(sessionEvents[0]?.eventId)
    expect(traceEvents.map(item => item.sequence)).toEqual([1, 2, 3, 4])
    expect(traceEvents[1]?.parentId).toBe(trace.spanId)
    expect(traceEvents[2]).toMatchObject({ parentId: span.spanId, durationMs: 25, status: 'success' })
    expect(traceEvents[3]).toMatchObject({ parentId: trace.spanId, durationMs: 25, status: 'success' })
    expect(events().every(item => item.sessionId === session.sessionId)).toBe(true)
  })

  it('rejects lifecycle transitions that have no required active context', () => {
    const instance = sdk()
    expect(instance.startTrace('Turn')).toMatchObject({ ok: false, issue: { code: 'no-session' } })
    expect(instance.startSpan('Tool')).toMatchObject({ ok: false, issue: { code: 'no-trace' } })
    expect(instance.endTrace()).toEqual({ ok: true })
    expect(instance.endSession()).toEqual({ ok: true })
    value(instance.startSession())
    expect(instance.startSession()).toMatchObject({ ok: false, issue: { code: 'session-active' } })
    value(instance.startTrace('Turn'))
    expect(instance.startTrace('Turn')).toMatchObject({ ok: false, issue: { code: 'trace-active' } })
  })

  it('does not create lifecycle state when a start event fails validation', () => {
    const instance = sdk()
    expect(instance.startSession('')).toMatchObject({ ok: false, issue: { code: 'invalid-event' } })
    value(instance.startSession())
    expect(instance.startTrace('')).toMatchObject({ ok: false, issue: { code: 'invalid-event' } })
    value(instance.startTrace('Turn'))
    expect(instance.startSpan('')).toMatchObject({ ok: false, issue: { code: 'invalid-event' } })
    value(instance.startSpan('Tool'))
  })

  it('closes root traces when sessions end and permits a later new session', () => {
    const instance = sdk()
    const original = value(instance.startSession())
    value(instance.startTrace('Turn'))
    expect(instance.endSession({ status: 'cancelled' })).toEqual({ ok: true })
    expect(instance.endSession()).toEqual({ ok: true })
    expect(instance.endTrace()).toEqual({ ok: true })
    const next = value(instance.startSession())
    expect(next.sessionId).not.toBe(original.sessionId)
    value(instance.flush())
    expect(events().map(item => item.type)).toEqual(['session.start', 'span.start', 'span.end', 'session.end', 'session.start'])
    expect(events()[2]?.status).toBe('cancelled')
  })

  it('keeps span completion idempotent and publishes structured failures', () => {
    const instance = sdk()
    value(instance.startSession())
    value(instance.startTrace('Turn'))
    const span = value(instance.startSpan('Tool'))
    const error = { name: 'ToolError', message: 'Failed', code: 'TIMEOUT' }
    expect(span.fail(error)).toEqual({ ok: true })
    expect(span.fail(error)).toEqual({ ok: true })
    expect(span.end()).toEqual({ ok: true })
    expect(instance.endTrace({ error })).toEqual({ ok: true })
    value(instance.flush())
    const failures = events().filter(item => item.type === 'span.error')
    expect(failures).toHaveLength(2)
    expect(failures[0]).toMatchObject({ parentId: span.spanId, status: 'error', error })
  })

  it('supports nested span parents and preserves captured trace context', () => {
    const instance = sdk()
    value(instance.startSession())
    const original = value(instance.startTrace('First turn'))
    const parent = value(instance.startSpan('Parent'))
    const child = value(instance.startSpan('Child', { parentId: parent.spanId }))
    instance.endTrace()
    value(instance.startTrace('Next turn'))
    expect(child.end()).toEqual({ ok: true })
    expect(parent.end()).toEqual({ ok: true })
    value(instance.flush())
    const childStart = events().find(item => item.eventId === child.spanId)
    const childEnd = events().find(item => item.parentId === child.spanId)
    expect(childStart).toMatchObject({ parentId: parent.spanId, traceId: original.traceId })
    expect(childEnd).toMatchObject({ traceId: original.traceId })
  })

  it('shares sequence accounting with complete events emitted into the active trace', () => {
    const instance = sdk()
    const session = value(instance.startSession())
    const trace = value(instance.startTrace('Turn'))
    value(instance.emit(event(5, { traceId: trace.traceId, sessionId: session.sessionId })))
    value(instance.startSpan('Tool'))
    value(instance.flush())
    expect(events().filter(item => item.traceId === trace.traceId).map(item => item.sequence)).toEqual([1, 5, 6])
  })

  it('allows a failed completion to retry after the SDK is re-enabled', () => {
    const instance = sdk()
    value(instance.startSession())
    value(instance.startTrace('Turn'))
    const span = value(instance.startSpan('Tool'))
    instance.configure({ enabled: false })
    expect(span.end()).toMatchObject({ ok: false, issue: { code: 'disabled' } })
    instance.configure({ enabled: true })
    expect(span.end()).toEqual({ ok: true })
    value(instance.flush())
    expect(events().filter(item => item.parentId === span.spanId)).toHaveLength(1)
  })
})

describe('collector handshake and disposal', () => {
  it('detects a valid same-window same-origin collector response', async () => {
    const instance = sdk()
    const available = instance.isCollectorAvailable()
    const request = handshake()
    expect(request.data.phase).toBe('request')
    respond(request.data.requestId)
    expect(await available).toBe(true)
  })

  it('ignores wrong source, origin, request IDs and unrelated messages', async () => {
    const instance = sdk()
    const available = instance.isCollectorAvailable(50)
    const request = handshake()
    respond('another-request')
    respond(request.data.requestId, { origin: 'https://untrusted.example' })
    respond(request.data.requestId, { source: null })
    respond(request.data.requestId, { data: { channel: 'another-channel' } })
    vi.advanceTimersByTime(49)
    respond(request.data.requestId)
    expect(await available).toBe(true)
  })

  it('returns false within the bounded timeout when no extension is present', async () => {
    const instance = sdk()
    const available = instance.isCollectorAvailable()
    vi.advanceTimersByTime(200)
    expect(await available).toBe(false)
    expect(instance.getStats().handshakeErrors).toBe(0)
    value(instance.emit(event()))
    value(instance.flush())
    expect(events()).toHaveLength(1)
  })

  it('supports a collector explicitly reporting unavailable', async () => {
    const instance = sdk()
    const available = instance.isCollectorAvailable()
    const request = handshake()
    respond(request.data.requestId, { data: { ...request, data: { requestId: request.data.requestId, phase: 'response', available: false } } })
    expect(await available).toBe(false)
  })

  it('rejects invalid timeout and catches handshake send failures', async () => {
    const onError = vi.fn()
    const instance = sdk({ onError })
    expect(await instance.isCollectorAvailable(0)).toBe(false)
    vi.mocked(window.postMessage).mockImplementation(() => {
      throw new Error('send failure')
    })
    expect(await instance.isCollectorAvailable()).toBe(false)
    expect(instance.getStats()).toMatchObject({ configurationErrors: 1, handshakeErrors: 1 })
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'handshake-failed' }))
  })

  it('completes pending handshakes when disabled or disposed', async () => {
    const first = sdk()
    const firstCheck = first.isCollectorAvailable()
    first.configure({ enabled: false })
    expect(await firstCheck).toBe(false)
    const second = sdk()
    const secondCheck = second.isCollectorAvailable()
    second.dispose()
    expect(await secondCheck).toBe(false)
  })

  it('flushes on pagehide and beforeunload as best-effort delivery', () => {
    const instance = sdk()
    value(instance.emit(event()))
    window.dispatchEvent(new Event('pagehide'))
    value(instance.emit(event(2)))
    window.dispatchEvent(new Event('beforeunload'))
    expect(events()).toHaveLength(2)
    expect(instance.getStats().queued).toBe(0)
  })

  it('disposes once, flushes buffered events, removes listeners and blocks future publishing', async () => {
    const instance = sdk()
    value(instance.startSession())
    expect(instance.dispose()).toEqual({ ok: true })
    expect(instance.dispose()).toEqual({ ok: true })
    expect(events()).toHaveLength(1)
    expect(instance.startSession()).toMatchObject({ ok: false, issue: { code: 'disposed' } })
    expect(instance.startTrace('Turn')).toMatchObject({ ok: false, issue: { code: 'disposed' } })
    expect(instance.startSpan('Tool')).toMatchObject({ ok: false, issue: { code: 'disposed' } })
    expect(instance.configure({ enabled: true })).toMatchObject({ ok: false, issue: { code: 'disposed' } })
    expect(instance.emit(event())).toMatchObject({ ok: false, issue: { code: 'disposed' } })
    expect(await instance.isCollectorAvailable()).toBe(false)
    window.dispatchEvent(new Event('pagehide'))
    vi.advanceTimersByTime(100)
    expect(events()).toHaveLength(1)
  })

  it('disposes even when its final flush fails', () => {
    const instance = sdk()
    value(instance.emit(event()))
    vi.mocked(window.postMessage).mockImplementation(() => {
      throw new Error('send failure')
    })
    expect(instance.dispose()).toMatchObject({ ok: false, issue: { code: 'send-failed' } })
    expect(instance.emit(event(2))).toMatchObject({ ok: false, issue: { code: 'disposed' } })
    expect(instance.getStats()).toMatchObject({ dropped: 1, queued: 0 })
  })
})
