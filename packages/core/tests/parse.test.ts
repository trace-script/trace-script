import { describe, expect, it } from 'vitest'
import { parseBridgeMessage, parseTraceEvent, ProtocolValidationError, safeParseBridgeMessage, safeParseTraceEvent } from '@/index'

const start = {
  eventId: 'event-1',
  traceId: 'trace-1',
  sequence: 1,
  timestamp: '2026-01-01T00:00:00.000Z',
  type: 'trace.start',
}

describe('minimal protocol parser', () => {
  it('parses a trace event and bridge without adding fields', () => {
    expect(parseTraceEvent(start)).toEqual(start)
    const message = { channel: 'trace-script', kind: 'trace-event', data: start }
    expect(parseBridgeMessage(message)).toEqual(message)
  })

  it('rejects invalid event and bridge shapes', () => {
    expect(safeParseTraceEvent({ ...start, sequence: 0 }).success).toBeFalsy()
    expect(safeParseBridgeMessage({ channel: 'other', kind: 'trace-event', data: start }).success).toBeFalsy()
    expect(() => parseTraceEvent({ ...start, eventId: '' })).toThrow(ProtocolValidationError)
  })

  it('keeps response JSON values, including empty values', () => {
    const response = { ...start, type: 'model.response', payload: { output: [], usage: null, empty: '' } }
    const parsed = parseTraceEvent(response)
    expect(parsed.type).toBe('model.response')
    if (parsed.type === 'model.response')
      expect(parsed.payload).toEqual(response.payload)
  })

  it('rejects unserializable payloads', () => {
    const circular = { self: {} }
    circular.self = circular
    expect(safeParseTraceEvent({ ...start, type: 'model.response', payload: circular }).success).toBeFalsy()
  })
})
