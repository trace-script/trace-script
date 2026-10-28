import type { TraceBridgeMessage } from '@trace-script/metadata'
import { aggregateEvents } from '@trace-script/core'
import { traceEventEnvelopeSchema } from '@trace-script/metadata'
import { createTraceSdk } from '@trace-script/sdk'
import { isNumber } from '@trace-script/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface FakePort {
  name: string
  sender?: { tab?: { id?: number } }
  postMessage: (message: object) => void
  onMessage: { addListener: (listener: (message: object) => void) => void }
  onDisconnect: { addListener: (listener: () => void) => void }
}

let connect: (port: chrome.runtime.Port) => void = () => {}

function createPort(name: string, tabId?: number): { port: chrome.runtime.Port, send: (message: object) => void, received: object[] } {
  let listener: (message: object) => void = () => {}
  const received: object[] = []
  const fake: FakePort = {
    name,
    sender: isNumber(tabId) ? { tab: { id: tabId } } : undefined,
    postMessage: message => received.push(message),
    onMessage: { addListener: next => listener = next },
    onDisconnect: { addListener: () => {} },
  }
  const port = fake as chrome.runtime.Port
  connect(port)
  return { port, send: message => listener(message), received }
}

beforeEach(async () => {
  vi.resetModules()
  vi.stubGlobal('chrome', {
    runtime: {
      onConnect: { addListener: (listener: (port: chrome.runtime.Port) => void) => connect = listener },
    },
  })
  await import('../src/entry/background')
})

describe('background trace transport', () => {
  it('preserves seven real SDK events and derives three calls after worker validation and reconnect', () => {
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
    expect(panel.received).toHaveLength(8)
    const reconnect = createPort('trace-panel')
    reconnect.send({ type: 'PANEL_CONNECT', tabId: 9 })
    const snapshot = reconnect.received[0]
    if (!snapshot || !('type' in snapshot) || snapshot.type !== 'TRACE_QUERY_RESULT' || !('events' in snapshot))
      throw new Error('Expected validated worker snapshot')
    const events = traceEventEnvelopeSchema.array().parse(snapshot.events)
    expect(events).toEqual(postMessage.mock.calls.map(([message]) => message.data))
    const summary = aggregateEvents(events)[0]
    expect(summary?.calls.map(call => call.kind)).toEqual(['model', 'tool', 'model'])
    expect(summary?.tokens.total).toEqual({ value: 92, complete: true })
  })

  it('keeps tab data isolated and broadcasts validated SDK events', () => {
    const panelA = createPort('trace-panel')
    panelA.send({ type: 'PANEL_CONNECT', tabId: 1 })
    const panelB = createPort('trace-panel')
    panelB.send({ type: 'PANEL_CONNECT', tabId: 2 })
    const content = createPort('trace-content', 1)

    content.send({
      type: 'INGEST_EVENT',
      event: {
        eventId: 'event-1',
        traceId: 'trace-1',
        sequence: 1,
        timestamp: '2026-01-01T00:00:00.000Z',
        type: 'trace.start',
      },
    })
    content.send({ type: 'INGEST_EVENT', event: { type: 'not-an-sdk-event' } })

    expect(panelA.received.map(message => 'type' in message ? message.type : '')).toEqual([
      'TRACE_QUERY_RESULT',
      'TRACE_EVENTS_APPEND',
    ])
    expect(panelB.received).toHaveLength(1)
    const append = panelA.received[1]
    expect(append).toMatchObject({ type: 'TRACE_EVENTS_APPEND', event: { eventId: 'event-1' } })
  })

  it('returns the tab snapshot when a panel reconnects', () => {
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
    expect(panel.received[0]).toMatchObject({
      type: 'TRACE_QUERY_RESULT',
      events: [{ eventId: 'event-2' }],
    })
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})
