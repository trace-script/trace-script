import { PROTOCOL_VERSION, TRACE_CHANNEL } from '@trace-script/metadata'
import { describe, expect, it } from 'vitest'
import {
  migrateTraceEvent,
  parseBridgeMessage,
  parseTraceEvent,
  ProtocolValidationError,
  safeParseBridgeMessage,
  safeParseTraceEvent,
} from '@/index'
import { baseEvent, invalidFieldEvent, oversizedEvent, unsupportedVersionEvent } from './fixtures/protocol'

describe('event parsing and version migration', () => {
  it('parses a valid event and canonicalizes a UTC timestamp', () => {
    expect(parseTraceEvent({ ...baseEvent, timestamp: '2026-10-04T00:00:00Z' })).toEqual(baseEvent)
    expect(migrateTraceEvent(baseEvent)).toEqual(baseEvent)
  })

  it('reports stable version and field issues', () => {
    expect(safeParseTraceEvent(unsupportedVersionEvent)).toEqual({ success: false, issues: [{ code: 'UNSUPPORTED_VERSION', path: ['version'], message: 'Unsupported protocol version: 0.9' }] })
    const parsed = safeParseTraceEvent(invalidFieldEvent)
    expect(parsed.success).toBeFalsy()
    if (!parsed.success)
      expect(parsed.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'INVALID_FIELD', path: ['sequence'] }), expect.objectContaining({ code: 'INVALID_FIELD', path: ['status'] })]))
    expect(() => migrateTraceEvent(unsupportedVersionEvent)).toThrow(ProtocolValidationError)
  })

  it('throws an error carrying the same issues as safe parsing', () => {
    const parsed = safeParseTraceEvent({ ...baseEvent, eventId: '' })
    expect(parsed.success).toBeFalsy()
    try {
      parseTraceEvent({ ...baseEvent, eventId: '' })
      expect.fail('Expected a protocol validation error')
    }
    catch (error) {
      expect(error).toBeInstanceOf(ProtocolValidationError)
      if (error instanceof ProtocolValidationError && !parsed.success)
        expect(error.issues).toEqual(parsed.issues)
    }
  })

  it('measures UTF-8 bytes rather than character count and accepts the exact limit', () => {
    const event = { ...baseEvent, payload: '你好' }
    const bytes = new TextEncoder().encode(JSON.stringify(event)).byteLength
    expect(safeParseTraceEvent(event, { maxEventBytes: bytes }).success).toBeTruthy()
    const parsed = safeParseTraceEvent(event, { maxEventBytes: bytes - 1 })
    expect(parsed.success).toBeFalsy()
    if (!parsed.success)
      expect(parsed.issues[0]?.code).toBe('EVENT_TOO_LARGE')
    expect(safeParseTraceEvent(oversizedEvent).success).toBeFalsy()
  })

  it('retains arbitrary JSON fields and rejects data that serialization would lose', () => {
    expect(parseTraceEvent({ ...baseEvent, extra: { value: null } }).extra).toEqual({ value: null })
    expect(safeParseTraceEvent({ ...baseEvent, payload: () => 'hidden' }).success).toBeFalsy()
    expect(safeParseTraceEvent('not an event').success).toBeFalsy()
  })
})

describe('bridge parsing', () => {
  const common = { channel: TRACE_CHANNEL, version: PROTOCOL_VERSION }

  it('parses single and batch events with canonicalized timestamps', () => {
    expect(parseBridgeMessage({ ...common, kind: 'trace-event', data: baseEvent })).toEqual({ ...common, kind: 'trace-event', data: baseEvent })
    expect(parseBridgeMessage({ ...common, kind: 'trace-batch', data: [{ ...baseEvent, timestamp: '2026-10-04T00:00:00Z' }] })).toEqual({ ...common, kind: 'trace-batch', data: [baseEvent] })
  })

  it('parses handshake and flush messages without trace data', () => {
    expect(safeParseBridgeMessage({ ...common, kind: 'handshake', data: { requestId: 'r', phase: 'request' } }).success).toBeTruthy()
    expect(safeParseBridgeMessage({ ...common, kind: 'flush', data: {} }).success).toBeTruthy()
  })

  it('includes the batch index in event validation errors', () => {
    const parsed = safeParseBridgeMessage({ ...common, kind: 'trace-batch', data: [baseEvent, unsupportedVersionEvent] })
    expect(parsed.success).toBeFalsy()
    if (!parsed.success)
      expect(parsed.issues[0]).toMatchObject({ code: 'UNSUPPORTED_VERSION', path: ['data', 1, 'version'] })
  })

  it('enforces both event and batch size/count limits', () => {
    const batch = { ...common, kind: 'trace-batch', data: [baseEvent, baseEvent] }
    const count = safeParseBridgeMessage(batch, { maxBatchEvents: 1 })
    expect(count.success).toBeFalsy()
    if (!count.success)
      expect(count.issues[0]?.code).toBe('BATCH_LIMIT_EXCEEDED')
    const size = safeParseBridgeMessage(batch, { maxBatchBytes: 10 })
    expect(size.success).toBeFalsy()
    if (!size.success)
      expect(size.issues[0]?.code).toBe('BATCH_TOO_LARGE')
    const largeEvent = safeParseBridgeMessage({ ...common, kind: 'trace-event', data: oversizedEvent })
    expect(largeEvent.success).toBeFalsy()
    if (!largeEvent.success)
      expect(largeEvent.issues[0]).toMatchObject({ code: 'EVENT_TOO_LARGE', path: ['data'] })
  })

  it('rejects unrelated, empty and invalid bridge envelopes', () => {
    expect(safeParseBridgeMessage(null).success).toBeFalsy()
    expect(safeParseBridgeMessage({ ...common, channel: 'other', kind: 'flush', data: {} }).success).toBeFalsy()
    expect(safeParseBridgeMessage({ ...common, kind: 'trace-batch', data: [] }).success).toBeFalsy()
    expect(safeParseBridgeMessage({ ...common, kind: 'handshake', data: { requestId: 'r' } }).success).toBeFalsy()
    expect(() => parseBridgeMessage({ ...common, version: '2.0', kind: 'flush', data: {} })).toThrow(ProtocolValidationError)
  })
})
