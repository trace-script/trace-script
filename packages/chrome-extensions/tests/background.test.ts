import type { TraceBridgeMessage, TraceEventEnvelope } from '@trace-script/metadata'
import { aggregateEvents } from '@trace-script/core'
import { traceEventEnvelopeSchema } from '@trace-script/metadata'
import { createTraceSdk } from '@trace-script/sdk'
import { isNumber } from '@trace-script/shared'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface FakePort {
  name: string
  sender?: { tab?: { id?: number } }
  postMessage: (message: object) => void
  onMessage: { addListener: (listener: (message: object) => void) => void }
  onDisconnect: { addListener: (listener: () => void) => void }
}

let connect: (port: chrome.runtime.Port) => void = () => {}

function createPort(name: string, tabId?: number): { port: chrome.runtime.Port, send: (message: object) => void, received: object[], disconnect: () => void } {
  let listener: (message: object) => void = () => {}
  let disconnect = () => {}
  const received: object[] = []
  const fake: FakePort = {
    name,
    sender: isNumber(tabId) ? { tab: { id: tabId } } : undefined,
    postMessage: message => received.push(message),
    onMessage: { addListener: next => listener = next },
    onDisconnect: { addListener: next => disconnect = next },
  }
  const port = fake as chrome.runtime.Port
  connect(port)
  return { port, send: message => listener(message), received, disconnect: () => disconnect() }
}

beforeEach(async () => {
  vi.resetModules()
  vi.stubGlobal('indexedDB', new IDBFactory())
  let browserSession = ''
  vi.stubGlobal('chrome', {
    storage: { session: {
      get: async () => ({ traceBrowserSessionId: browserSession }),
      set: async (value: { traceBrowserSessionId: string }) => { browserSession = value.traceBrowserSessionId },
    } },
    runtime: {
      onConnect: { addListener: (listener: (port: chrome.runtime.Port) => void) => connect = listener },
    },
  })
  await import('../src/entry/background')
})

const startEvent = {
  eventId: 'event-1',
  traceId: 'trace-1',
  sequence: 1,
  timestamp: '2026-01-01T00:00:00.000Z',
  type: 'trace.start',
} satisfies TraceEventEnvelope

describe('background trace transport', () => {
  it('preserves seven real SDK events and derives three calls after worker validation and reconnect', async () => {
    const postMessage = vi.fn<(message: TraceBridgeMessage, origin: string) => void>()
    vi.stubGlobal('window', { location: { origin: 'https://agent.example' }, postMessage })
    const trace = createTraceSdk().startTrace()
    const first = trace.recordRequest({ model: 'test', input: 'weather' })
    trace.recordResponse(first.requestId, { output: [{ type: 'function_call', call_id: 'tool', name: 'weather', arguments: '{}' }], usage: { input_tokens: 24, output_tokens: 12, total_tokens: 36 } })
    trace.recordToolResult({ callId: 'tool', output: '', status: 'success' })
    const second = trace.recordRequest({ input: [{ type: 'function_call_output', call_id: 'tool', output: '' }] })
    trace.recordResponse(second.requestId, { output_text: 'sunny', usage: { input_tokens: 42, output_tokens: 14, total_tokens: 56 } })
    trace.end()
    const panel = createPort('trace-panel')
    panel.send({ type: 'PANEL_CONNECT', tabId: 9 })
    const content = createPort('trace-content', 9)
    for (const [message] of postMessage.mock.calls)
      content.send({ type: 'INGEST_EVENT', event: message.data })
    await vi.waitFor(() => expect(panel.received).toHaveLength(8))
    const reconnect = createPort('trace-panel')
    reconnect.send({ type: 'PANEL_CONNECT', tabId: 9 })
    await vi.waitFor(() => expect(reconnect.received).toHaveLength(1))
    const snapshot = reconnect.received[0]
    if (!snapshot || !('type' in snapshot) || snapshot.type !== 'TRACE_QUERY_RESULT' || !('events' in snapshot))
      throw new Error('Expected validated worker snapshot')
    const events = traceEventEnvelopeSchema.array().parse(snapshot.events)
    expect(events).toEqual(postMessage.mock.calls.map(([message]) => message.data))
    const summary = aggregateEvents(events)[0]
    expect(summary?.calls.map(call => call.kind)).toEqual(['model', 'tool', 'model'])
    expect(summary?.tokens.total).toEqual({ value: 92, complete: true })
  })

  it('keeps tab data isolated and broadcasts validated SDK events', async () => {
    const panelA = createPort('trace-panel')
    panelA.send({ type: 'PANEL_CONNECT', tabId: 1 })
    const panelB = createPort('trace-panel')
    panelB.send({ type: 'PANEL_CONNECT', tabId: 2 })
    const content = createPort('trace-content', 1)

    content.send({ type: 'INGEST_EVENT', event: startEvent })
    content.send({ type: 'INGEST_EVENT', event: { type: 'not-an-sdk-event' } })

    await vi.waitFor(() => expect(panelA.received).toHaveLength(2))
    expect(panelA.received.map(message => 'type' in message ? message.type : '')).toEqual([
      'TRACE_QUERY_RESULT',
      'TRACE_EVENTS_APPEND',
    ])
    expect(panelB.received).toHaveLength(1)
    const append = panelA.received[1]
    expect(append).toMatchObject({ type: 'TRACE_EVENTS_APPEND', event: { eventId: 'event-1' } })
  })

  it('stops broadcasting to disconnected panels while retaining their tab history', async () => {
    const disconnected = createPort('trace-panel')
    const connected = createPort('trace-panel')
    disconnected.send({ type: 'PANEL_CONNECT', tabId: 1 })
    connected.send({ type: 'PANEL_CONNECT', tabId: 1 })
    disconnected.disconnect()
    createPort('trace-content', 1).send({ type: 'INGEST_EVENT', event: startEvent })
    await vi.waitFor(() => expect(connected.received).toHaveLength(2))
    expect(disconnected.received).toEqual([{ type: 'TRACE_QUERY_RESULT', events: [] }])
    expect(connected.received).toEqual([
      { type: 'TRACE_QUERY_RESULT', events: [] },
      { type: 'TRACE_EVENTS_APPEND', event: startEvent },
    ])
    const reconnected = createPort('trace-panel')
    reconnected.send({ type: 'PANEL_CONNECT', tabId: 1 })
    await vi.waitFor(() => expect(reconnected.received).toHaveLength(1))
    expect(reconnected.received).toEqual([{ type: 'TRACE_QUERY_RESULT', events: [startEvent] }])
  })

  it('moves a registered panel to a new tab without keeping the old subscription', async () => {
    const panel = createPort('trace-panel')
    panel.send({ type: 'PANEL_CONNECT', tabId: 1 })
    panel.send({ type: 'PANEL_CONNECT', tabId: 2 })
    createPort('trace-content', 1).send({ type: 'INGEST_EVENT', event: startEvent })
    await vi.waitFor(() => expect(panel.received).toHaveLength(2))
    createPort('trace-content', 2).send({ type: 'INGEST_EVENT', event: startEvent })
    await vi.waitFor(() => expect(panel.received).toHaveLength(3))
    expect(panel.received[2]).toEqual({ type: 'TRACE_EVENTS_APPEND', event: startEvent })
  })

  it.each([
    { name: 'unknown port', nameValue: 'other', tabId: 1 },
    { name: 'missing sender tab', nameValue: 'trace-content' },
  ])('does not ingest from $name', async ({ nameValue, tabId }) => {
    const panel = createPort('trace-panel')
    panel.send({ type: 'TRACE_QUERY' })
    expect(panel.received).toEqual([])
    createPort(nameValue, tabId).send({ type: 'INGEST_EVENT', event: startEvent })
    panel.send({ type: 'PANEL_CONNECT', tabId: 1 })
    await vi.waitFor(() => expect(panel.received).toEqual([{ type: 'TRACE_QUERY_RESULT', events: [] }]))
  })

  it('returns the tab snapshot when a panel reconnects', async () => {
    const content = createPort('trace-content', 7)
    content.send({
      type: 'INGEST_EVENT',
      event: {
        eventId: 'event-2',
        traceId: 'trace-2',
        sequence: 1,
        timestamp: '2026-01-01T00:00:00.000Z',
        type: 'trace.end',
      },
    })
    const panel = createPort('trace-panel')
    panel.send({ type: 'PANEL_CONNECT', tabId: 7 })
    await vi.waitFor(() => expect(panel.received).toHaveLength(1))
    expect(panel.received[0]).toMatchObject({
      type: 'TRACE_QUERY_RESULT',
      events: [{ eventId: 'event-2' }],
    })
  })

  it('restores events recorded without DevTools after the worker restarts', async () => {
    createPort('trace-content', 7).send({ type: 'INGEST_EVENT', event: startEvent })
    const checkpoint = createPort('trace-panel')
    checkpoint.send({ type: 'PANEL_CONNECT', tabId: 7 })
    await vi.waitFor(() => expect(checkpoint.received).toEqual([{ type: 'TRACE_QUERY_RESULT', events: [startEvent] }]))

    vi.resetModules()
    await import('../src/entry/background')
    const panel = createPort('trace-panel')
    panel.send({ type: 'PANEL_CONNECT', tabId: 7 })
    await vi.waitFor(() => expect(panel.received).toEqual([{ type: 'TRACE_QUERY_RESULT', events: [startEvent] }]))

    await chrome.storage.session.set({ traceBrowserSessionId: 'another-browser-session' })
    vi.resetModules()
    await import('../src/entry/background')
    const newSessionPanel = createPort('trace-panel')
    newSessionPanel.send({ type: 'PANEL_CONNECT', tabId: 7 })
    await vi.waitFor(() => expect(newSessionPanel.received).toEqual([{ type: 'TRACE_QUERY_RESULT', events: [] }]))
    const { readTraceEvents } = await import('../src/storage/trace-events')
    expect(await readTraceEvents({ traceId: startEvent.traceId })).toEqual([startEvent])
  })

  it('orders pending writes, panel snapshots and live events without duplication', async () => {
    const content = createPort('trace-content', 1)
    content.send({ type: 'INGEST_EVENT', event: startEvent })
    const panel = createPort('trace-panel')
    panel.send({ type: 'PANEL_CONNECT', tabId: 1 })
    const end = { ...startEvent, eventId: 'end', type: 'trace.end', sequence: 2 }
    content.send({ type: 'INGEST_EVENT', event: end })
    panel.send({ type: 'TRACE_QUERY' })
    await vi.waitFor(() => expect(panel.received).toEqual([
      { type: 'TRACE_QUERY_RESULT', events: [startEvent] },
      { type: 'TRACE_EVENTS_APPEND', event: end },
      { type: 'TRACE_QUERY_RESULT', events: [startEvent, end] },
    ]))
  })

  it('reports storage failure without broadcasting an uncommitted event and processes later events', async () => {
    const panel = createPort('trace-panel')
    panel.send({ type: 'PANEL_CONNECT', tabId: 1 })
    await vi.waitFor(() => expect(panel.received).toHaveLength(1))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(indexedDB, 'open').mockImplementationOnce(() => {
      throw new DOMException('Storage unavailable', 'SecurityError')
    })
    const content = createPort('trace-content', 1)
    content.send({ type: 'INGEST_EVENT', event: startEvent })
    const next = { ...startEvent, eventId: 'next-event' }
    content.send({ type: 'INGEST_EVENT', event: next })
    panel.send({ type: 'TRACE_QUERY' })
    await vi.waitFor(() => expect(panel.received).toEqual([
      { type: 'TRACE_QUERY_RESULT', events: [] },
      { type: 'TRACE_EVENTS_APPEND', event: next },
      { type: 'TRACE_QUERY_RESULT', events: [next] },
    ]))
    expect(error).toHaveBeenCalledWith('Trace storage operation failed', expect.objectContaining({ name: 'SecurityError' }))
    error.mockRestore()
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})
