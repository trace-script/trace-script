import { describe, expect, it } from 'vitest'
import { TRACE_CHANNEL, traceBridgeMessageSchema, traceEventEnvelopeSchema } from '@/index'

const common = {
  eventId: 'event-1',
  traceId: 'trace-1',
  sequence: 1,
  timestamp: '2026-01-01T00:00:00.000Z',
}

describe('trace protocol', () => {
  it.each([
    { name: 'trace start', event: { ...common, type: 'trace.start' } },
    { name: 'legacy model request', event: { ...common, type: 'model.request', payload: { model: 'gpt-4.1', input: [] } } },
    { name: 'identified model request', event: { ...common, type: 'model.request', requestId: 'r', payload: {} } },
    { name: 'legacy model response', event: { ...common, type: 'model.response', payload: { id: 'resp_1', output: [], usage: null } } },
    { name: 'identified model response', event: { ...common, type: 'model.response', requestId: 'r', payload: {} } },
    { name: 'tool result with empty output', event: { ...common, type: 'tool.result', payload: { callId: 'c', output: '' } } },
    { name: 'failed tool result', event: { ...common, type: 'tool.result', payload: { callId: 'c', output: '', status: 'failed', message: 'timeout' } } },
    { name: 'trace end', event: { ...common, type: 'trace.end' } },
    { name: 'cancelled trace end', event: { ...common, type: 'trace.end', status: 'cancelled' } },
    { name: 'untargeted error', event: { ...common, type: 'trace.error', payload: { message: 'failed' } } },
    { name: 'model error', event: { ...common, type: 'trace.error', payload: { requestId: 'r', message: 'failed' } } },
    { name: 'tool error', event: { ...common, type: 'trace.error', payload: { callId: 'c', message: 'failed' } } },
  ])('accepts $name without altering its data', ({ event }) => {
    expect(traceEventEnvelopeSchema.safeParse(event)).toEqual({ success: true, data: event })
  })

  it.each([
    { name: 'ambiguous error target', event: { ...common, type: 'trace.error', payload: { requestId: 'r', callId: 'c', message: 'failed' } } },
    { name: 'empty request ID', event: { ...common, type: 'model.request', requestId: '', payload: {} } },
    { name: 'removed envelope field', event: { ...common, type: 'trace.start', version: '1.0' } },
    { name: 'non-JSON payload value', event: { ...common, type: 'model.response', payload: { output: [undefined] } } },
    { name: 'empty tool ID', event: { ...common, type: 'tool.result', payload: { callId: '', output: 'x' } } },
    { name: 'unsupported tool status', event: { ...common, type: 'tool.result', payload: { callId: 'c', output: '', status: 'running' } } },
    { name: 'unexpected terminal payload', event: { ...common, type: 'trace.end', payload: {} } },
  ])('rejects $name', ({ event }) => {
    expect(traceEventEnvelopeSchema.safeParse(event).success).toBeFalsy()
  })

  describe('single-event bridge', () => {
    const event = { ...common, type: 'trace.start' }
    const bridge = { channel: TRACE_CHANNEL, kind: 'trace-event', data: event }

    it('accepts a valid event on the trace channel', () => {
      expect(traceBridgeMessageSchema.safeParse(bridge)).toEqual({ success: true, data: bridge })
    })

    it.each([
      { name: 'batch bridge', message: { ...bridge, kind: 'trace-batch', data: [event] } },
      { name: 'another channel', message: { ...bridge, channel: 'other' } },
      { name: 'invalid event', message: { ...bridge, data: { ...event, sequence: 0 } } },
    ])('rejects $name', ({ message }) => {
      expect(traceBridgeMessageSchema.safeParse(message).success).toBeFalsy()
    })
  })
})
