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

  it('reports the event field that failed validation', () => {
    const result = safeParseTraceEvent({ ...start, sequence: 0 })
    expect(result.success).toBeFalsy()
    if (result.success)
      throw new Error('Expected invalid sequence to be rejected')
    expect(result.issues.map(({ code, path }) => ({ code, path })))
      .toEqual([{ code: 'INVALID_EVENT', path: ['sequence'] }])
  })

  it('preserves nested event paths in bridge validation errors', () => {
    const result = safeParseBridgeMessage({ channel: 'trace-script', kind: 'trace-event', data: { ...start, sequence: 0 } })
    expect(result.success).toBeFalsy()
    if (result.success)
      throw new Error('Expected invalid bridge event to be rejected')
    expect(result.issues.map(({ code, path }) => ({ code, path })))
      .toEqual([{ code: 'INVALID_BRIDGE', path: ['data', 'sequence'] }])
  })

  it('throws the public validation error for invalid event and bridge inputs', () => {
    expect(() => parseTraceEvent({ ...start, eventId: '' })).toThrow(ProtocolValidationError)
    expect(() => parseBridgeMessage({ channel: 'other', kind: 'trace-event', data: start })).toThrow(ProtocolValidationError)
  })

  it('keeps response JSON values, including empty values', () => {
    const response = { ...start, type: 'model.response', payload: { output: [], usage: null, empty: '' } }
    const parsed = parseTraceEvent(response)
    expect(parsed).toMatchObject({ type: 'model.response', payload: response.payload })
  })

  it('rejects unserializable payloads', () => {
    const circular = { self: {} }
    circular.self = circular
    expect(safeParseTraceEvent({ ...start, type: 'model.response', payload: circular }).success).toBeFalsy()
  })
})
