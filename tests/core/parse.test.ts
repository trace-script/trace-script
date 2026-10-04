import type { JsonValue } from '@trace-script/metadata'
import {
  migrateTraceEvent,
  parseBridgeMessage,
  parseTraceEvent,
  ProtocolValidationError,
  safeParseBridgeMessage,
  safeParseTraceEvent,
  validateJsonValue,
} from '@trace-script/core'
import { PROTOCOL_VERSION, TRACE_CHANNEL } from '@trace-script/metadata'
import { describe, expect, it } from 'vitest'
import { baseEvent, invalidFieldEvent, oversizedEvent, unsupportedVersionEvent } from '../../fixtures/protocol'

function nestedJson(depth: number): JsonValue {
  let value: JsonValue = 'leaf'
  for (let level = 0; level < depth; level++)
    value = { child: value }
  return value
}

describe('jSON boundary validation', () => {
  it('accepts nested JSON and repeated references without confusing them with cycles', () => {
    const shared = { answer: 42 }
    expect(validateJsonValue({ first: shared, second: shared, nil: null })).toEqual({ success: true, data: { first: { answer: 42 }, second: { answer: 42 }, nil: null } })
  })

  it('rejects cycles with their field path', () => {
    const cyclic = { self: {} }
    cyclic.self = cyclic
    expect(validateJsonValue(cyclic)).toEqual({ success: false, issues: [{ code: 'CYCLIC_VALUE', path: ['self'], message: 'Circular references are not JSON values' }] })
  })

  it.each([NaN, Infinity, -Infinity, 1n, Symbol('value'), () => 1, new Date(), new Map(), new Set()])('rejects non-JSON value %s', (value) => {
    const parsed = validateJsonValue({ payload: value })
    expect(parsed.success).toBe(false)
    if (!parsed.success)
      expect(parsed.issues[0]).toMatchObject({ code: 'NON_JSON_VALUE', path: ['payload'] })
  })

  it('rejects sparse arrays, extra array fields, accessors and non-enumerable fields', () => {
    expect(validateJsonValue(Array.from({ length: 1 }).map(() => 1).concat(Array.from({ length: 1 }))).success).toBe(false)
    expect(validateJsonValue(Object.assign([1], { extra: 2 })).success).toBe(false)
    expect(validateJsonValue(Object.defineProperty([1], 'hidden', { value: 2 })).success).toBe(false)
    expect(validateJsonValue(Object.defineProperty([1], '0', { value: 1, enumerable: false })).success).toBe(false)
    let invoked = false
    const accessor = Object.defineProperty({}, 'value', {
      enumerable: true,
      get() {
        invoked = true
        throw new Error('Do not invoke')
      },
    })
    expect(validateJsonValue(accessor).success).toBe(false)
    expect(invoked).toBe(false)
    expect(validateJsonValue(Object.defineProperty({}, 'hidden', { value: 1 })).success).toBe(false)
    expect(validateJsonValue({ [Symbol('key')]: 'secret' }).success).toBe(false)
  })

  it('rejects failed inspection and proxies without invoking their property reads', () => {
    const inspectionFailure = new Proxy({}, {
      ownKeys() {
        throw new Error('Inspection failed')
      },
    })
    expect(validateJsonValue(inspectionFailure)).toMatchObject({ success: false, issues: [{ code: 'NON_JSON_VALUE' }] })
    let accessed = false
    const parsingFailure = new Proxy({ value: 1 }, {
      get() {
        accessed = true
        throw new Error('Parsing failed')
      },
    })
    expect(validateJsonValue(parsingFailure)).toMatchObject({ success: false, issues: [{ code: 'NON_JSON_VALUE' }] })
    expect(accessed).toBe(false)
    const changingValues = new Proxy({ value: 1 }, {
      get() {
        return nestedJson(100)
      },
    })
    expect(validateJsonValue(changingValues, 2)).toMatchObject({ success: false, issues: [{ code: 'NON_JSON_VALUE' }] })
  })

  it('enforces finite depth and valid protection settings', () => {
    expect(validateJsonValue({ a: { b: 1 } }, 2).success).toBe(true)
    const parsed = validateJsonValue({ a: { b: 1 } }, 1)
    expect(parsed.success).toBe(false)
    if (!parsed.success)
      expect(parsed.issues[0]).toMatchObject({ code: 'DEPTH_EXCEEDED', path: ['a', 'b'] })
    expect(validateJsonValue({}, Infinity).success).toBe(false)
    expect(safeParseTraceEvent(baseEvent, { maxEventBytes: Infinity }).success).toBe(false)
  })

  it('bounds standalone JSON inspection including the transport allowance', () => {
    expect(validateJsonValue(nestedJson(258), 258).success).toBe(true)
    expect(validateJsonValue(nestedJson(259), 258)).toMatchObject({ success: false, issues: [{ code: 'DEPTH_EXCEEDED' }] })
    expect(validateJsonValue({}, 259)).toMatchObject({ success: false, issues: [{ code: 'INVALID_LIMITS' }] })
    expect(safeParseTraceEvent(baseEvent, { maxDepth: 257 })).toMatchObject({ success: false, issues: [{ code: 'INVALID_LIMITS' }] })
  })
})

describe('event parsing and version migration', () => {
  it('parses a valid event and canonicalizes a UTC timestamp', () => {
    expect(parseTraceEvent({ ...baseEvent, timestamp: '2026-10-04T00:00:00Z' })).toEqual(baseEvent)
    expect(migrateTraceEvent(baseEvent)).toEqual(baseEvent)
  })

  it('reports stable version and field issues', () => {
    expect(safeParseTraceEvent(unsupportedVersionEvent)).toEqual({ success: false, issues: [{ code: 'UNSUPPORTED_VERSION', path: ['version'], message: 'Unsupported protocol version: 0.9' }] })
    const parsed = safeParseTraceEvent(invalidFieldEvent)
    expect(parsed.success).toBe(false)
    if (!parsed.success)
      expect(parsed.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'INVALID_FIELD', path: ['sequence'] }), expect.objectContaining({ code: 'INVALID_FIELD', path: ['status'] })]))
    expect(() => migrateTraceEvent(unsupportedVersionEvent)).toThrow(ProtocolValidationError)
  })

  it('throws an error carrying the same issues as safe parsing', () => {
    const parsed = safeParseTraceEvent({ ...baseEvent, eventId: '' })
    expect(parsed.success).toBe(false)
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
    expect(safeParseTraceEvent(event, { maxEventBytes: bytes }).success).toBe(true)
    const parsed = safeParseTraceEvent(event, { maxEventBytes: bytes - 1 })
    expect(parsed.success).toBe(false)
    if (!parsed.success)
      expect(parsed.issues[0]?.code).toBe('EVENT_TOO_LARGE')
    expect(safeParseTraceEvent(oversizedEvent).success).toBe(false)
  })

  it('retains arbitrary JSON fields and rejects data that serialization would lose', () => {
    expect(parseTraceEvent({ ...baseEvent, extra: { value: null } }).extra).toEqual({ value: null })
    expect(safeParseTraceEvent({ ...baseEvent, payload: () => 'hidden' }).success).toBe(false)
    expect(safeParseTraceEvent('not an event').success).toBe(false)
  })
})

describe('bridge parsing', () => {
  const common = { channel: TRACE_CHANNEL, version: PROTOCOL_VERSION }

  it('parses single and batch events with canonicalized timestamps', () => {
    expect(parseBridgeMessage({ ...common, kind: 'trace-event', data: baseEvent })).toEqual({ ...common, kind: 'trace-event', data: baseEvent })
    expect(parseBridgeMessage({ ...common, kind: 'trace-batch', data: [{ ...baseEvent, timestamp: '2026-10-04T00:00:00Z' }] })).toEqual({ ...common, kind: 'trace-batch', data: [baseEvent] })
  })

  it('parses handshake and flush messages without trace data', () => {
    expect(safeParseBridgeMessage({ ...common, kind: 'handshake', data: { requestId: 'r', phase: 'request' } }).success).toBe(true)
    expect(safeParseBridgeMessage({ ...common, kind: 'flush', data: {} }).success).toBe(true)
  })

  it('includes the batch index in event validation errors', () => {
    const parsed = safeParseBridgeMessage({ ...common, kind: 'trace-batch', data: [baseEvent, unsupportedVersionEvent] })
    expect(parsed.success).toBe(false)
    if (!parsed.success)
      expect(parsed.issues[0]).toMatchObject({ code: 'UNSUPPORTED_VERSION', path: ['data', 1, 'version'] })
  })

  it.each([64, 256])('treats depth %i relative to the event in both bridge variants', (maxDepth) => {
    const event = { ...baseEvent, payload: nestedJson(maxDepth - 1) }
    const options = { maxDepth }
    expect(safeParseTraceEvent(event, options).success).toBe(true)
    expect(safeParseBridgeMessage({ ...common, kind: 'trace-event', data: event }, options).success).toBe(true)
    expect(safeParseBridgeMessage({ ...common, kind: 'trace-batch', data: [event] }, options).success).toBe(true)
    const tooDeep = { ...event, payload: nestedJson(maxDepth) }
    expect(safeParseTraceEvent(tooDeep, options)).toMatchObject({ success: false, issues: [{ code: 'DEPTH_EXCEEDED' }] })
    expect(safeParseBridgeMessage({ ...common, kind: 'trace-event', data: tooDeep }, options)).toMatchObject({ success: false, issues: [{ code: 'DEPTH_EXCEEDED' }] })
    expect(safeParseBridgeMessage({ ...common, kind: 'trace-batch', data: [tooDeep] }, options)).toMatchObject({ success: false, issues: [{ code: 'DEPTH_EXCEEDED' }] })
  })

  it('enforces both event and batch size/count limits', () => {
    const batch = { ...common, kind: 'trace-batch', data: [baseEvent, baseEvent] }
    const count = safeParseBridgeMessage(batch, { maxBatchEvents: 1 })
    expect(count.success).toBe(false)
    if (!count.success)
      expect(count.issues[0]?.code).toBe('BATCH_LIMIT_EXCEEDED')
    const size = safeParseBridgeMessage(batch, { maxBatchBytes: 10 })
    expect(size.success).toBe(false)
    if (!size.success)
      expect(size.issues[0]?.code).toBe('BATCH_TOO_LARGE')
    const largeEvent = safeParseBridgeMessage({ ...common, kind: 'trace-event', data: oversizedEvent })
    expect(largeEvent.success).toBe(false)
    if (!largeEvent.success)
      expect(largeEvent.issues[0]).toMatchObject({ code: 'EVENT_TOO_LARGE', path: ['data'] })
  })

  it('rejects unrelated, empty and invalid bridge envelopes', () => {
    expect(safeParseBridgeMessage(null).success).toBe(false)
    expect(safeParseBridgeMessage({ ...common, channel: 'other', kind: 'flush', data: {} }).success).toBe(false)
    expect(safeParseBridgeMessage({ ...common, kind: 'trace-batch', data: [] }).success).toBe(false)
    expect(safeParseBridgeMessage({ ...common, kind: 'handshake', data: { requestId: 'r' } }).success).toBe(false)
    expect(() => parseBridgeMessage({ ...common, version: '2.0', kind: 'flush', data: {} })).toThrow(ProtocolValidationError)
  })
})
