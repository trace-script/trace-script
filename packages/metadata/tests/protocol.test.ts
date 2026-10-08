import { describe, expect, it } from 'vitest'
import { TRACE_CHANNEL, TRACE_EVENT_TYPES, traceBridgeMessageSchema, traceEventEnvelopeSchema } from '@/index'

const common = {
  eventId: 'event-1',
  traceId: 'trace-1',
  sequence: 1,
  timestamp: '2026-01-01T00:00:00.000Z',
}

describe('minimal trace protocol', () => {
  it('accepts the six event shapes', () => {
    const events = [
      { ...common, type: 'trace.start' },
      { ...common, type: 'model.request', payload: { model: 'gpt-4.1', input: [] } },
      { ...common, type: 'model.response', payload: { id: 'resp_1', output: [], usage: null } },
      { ...common, type: 'tool.result', payload: { callId: 'call_1', output: '{"weather":"sunny"}' } },
      { ...common, type: 'trace.end' },
      { ...common, type: 'trace.error', payload: { message: 'Failed' } },
    ]
    expect(events.map(event => traceEventEnvelopeSchema.safeParse(event).success)).toEqual(Array.from({ length: 6 }).fill(true))
    expect(TRACE_EVENT_TYPES).toHaveLength(6)
  })

  it('rejects removed fields and malformed payloads', () => {
    expect(traceEventEnvelopeSchema.safeParse({ ...common, type: 'trace.start', version: '1.0' }).success).toBeFalsy()
    expect(traceEventEnvelopeSchema.safeParse({ ...common, type: 'model.response', payload: { output: [undefined] } }).success).toBeFalsy()
    expect(traceEventEnvelopeSchema.safeParse({ ...common, type: 'tool.result', payload: { callId: '', output: 'x' } }).success).toBeFalsy()
    expect(traceEventEnvelopeSchema.safeParse({ ...common, type: 'trace.end', payload: {} }).success).toBeFalsy()
  })

  it('accepts only the single-event bridge', () => {
    const event = { ...common, type: 'trace.start' }
    expect(traceBridgeMessageSchema.safeParse({ channel: TRACE_CHANNEL, kind: 'trace-event', data: event }).success).toBeTruthy()
    expect(traceBridgeMessageSchema.safeParse({ channel: TRACE_CHANNEL, kind: 'trace-batch', data: [event] }).success).toBeFalsy()
    expect(traceBridgeMessageSchema.safeParse({ channel: 'other', kind: 'trace-event', data: event }).success).toBeFalsy()
  })
})
