import type { JsonValue, TraceEventEnvelope, TraceStatus } from '@/index'
import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  DEFAULT_PROTOCOL_LIMITS,
  jsonValueSchema,
  PROTOCOL_VERSION,
  protocolIssueSchema,
  protocolLimitsSchema,
  TRACE_CHANNEL,
  TRACE_EVENT_TYPES,
  TRACE_STATUSES,
  traceActorSchema,
  traceBridgeMessageSchema,
  traceErrorSchema,
  traceEventEnvelopeSchema,
  traceMetricsSchema,
  traceModelSchema,
} from '@/index'
import { baseEvent, protocolScenarios } from './fixtures/protocol'

describe('protocol metadata', () => {
  it.each(TRACE_EVENT_TYPES)('accepts the %s event type', (type) => {
    expect(traceEventEnvelopeSchema.safeParse({ ...baseEvent, type }).success).toBeTruthy()
  })

  it.each(TRACE_STATUSES)('accepts the %s status', (status) => {
    expect(traceEventEnvelopeSchema.safeParse({ ...baseEvent, status }).success).toBeTruthy()
  })

  it('uses JSON Schema output as the public data type', () => {
    expectTypeOf<JsonValue>().toEqualTypeOf<typeof jsonValueSchema._output>()
    expectTypeOf<TraceEventEnvelope>().toEqualTypeOf<typeof traceEventEnvelopeSchema._output>()
    expectTypeOf<TraceStatus>().toEqualTypeOf<'pending' | 'running' | 'success' | 'error' | 'cancelled'>()
    expect(jsonValueSchema.parse({ nested: [true, 42, null] })).toEqual({ nested: [true, 42, null] })
  })

  it('validates all reusable scenarios', () => {
    for (const scenario of Object.values(protocolScenarios)) {
      for (const event of scenario)
        expect(traceEventEnvelopeSchema.safeParse(event).success).toBeTruthy()
    }
  })

  it('retains additional JSON event, actor, model and metric fields', () => {
    const event = { ...baseEvent, extra: { nested: ['extension'] }, agent: { name: 'Agent', team: 'A' }, model: { name: 'Model', revision: 1 }, metrics: { inputTokens: 1, custom: 2 } }
    expect(traceEventEnvelopeSchema.parse(event)).toEqual(event)
  })

  it.each([
    { eventId: '' },
    { sessionId: ' ' },
    { traceId: 1 },
    { type: 'tool.unknown' },
    { sequence: 0 },
    { sequence: 1.5 },
    { sequence: Number.MAX_SAFE_INTEGER + 1 },
    { status: 'finished' },
    { durationMs: -1 },
    { timestamp: '2026-02-30T00:00:00.000Z' },
    { timestamp: '2026-10-04T08:00:00+08:00' },
    { version: '0.9' },
  ])('rejects invalid structural fields %j', (fields) => {
    expect(traceEventEnvelopeSchema.safeParse({ ...baseEvent, ...fields }).success).toBeFalsy()
  })

  it('rejects missing identifiers', () => {
    const { eventId, ...event } = baseEvent
    expect(eventId).toBe('event-1')
    expect(traceEventEnvelopeSchema.safeParse(event).success).toBeFalsy()
  })

  it('validates the actor, model, error and metrics schemas', () => {
    expect(traceActorSchema.safeParse({ name: 'Agent', id: 'a' }).success).toBeTruthy()
    expect(traceActorSchema.safeParse({ id: 'a' }).success).toBeFalsy()
    expect(traceModelSchema.safeParse({ name: 'Model', provider: 'Provider' }).success).toBeTruthy()
    expect(traceModelSchema.safeParse({ name: '' }).success).toBeFalsy()
    expect(traceErrorSchema.safeParse({ message: 'Failure', code: 'TIMEOUT' }).success).toBeTruthy()
    expect(traceErrorSchema.safeParse({ message: 3 }).success).toBeFalsy()
    expect(traceMetricsSchema.safeParse({ inputTokens: -1 }).success).toBeFalsy()
    expect(traceMetricsSchema.safeParse({ costUsd: Infinity }).success).toBeFalsy()
  })

  it('defines all bridge variants with exact protocol discriminants', () => {
    const common = { channel: TRACE_CHANNEL, version: PROTOCOL_VERSION }
    expect(traceBridgeMessageSchema.safeParse({ ...common, kind: 'trace-event', data: baseEvent }).success).toBeTruthy()
    expect(traceBridgeMessageSchema.safeParse({ ...common, kind: 'trace-batch', data: [baseEvent] }).success).toBeTruthy()
    expect(traceBridgeMessageSchema.safeParse({ ...common, kind: 'handshake', data: { requestId: 'request-1', phase: 'request' } }).success).toBeTruthy()
    expect(traceBridgeMessageSchema.safeParse({ ...common, kind: 'handshake', data: { requestId: 'request-1', phase: 'response', available: true } }).success).toBeTruthy()
    expect(traceBridgeMessageSchema.safeParse({ ...common, kind: 'flush', data: {} }).success).toBeTruthy()
    expect(traceBridgeMessageSchema.safeParse({ ...common, channel: 'another-channel', kind: 'trace-event', data: baseEvent }).success).toBeFalsy()
    expect(traceBridgeMessageSchema.safeParse({ ...common, kind: 'trace-batch', data: [] }).success).toBeFalsy()
    expect(traceBridgeMessageSchema.safeParse({ ...common, kind: 'flush', data: { command: 'anything' } }).success).toBeFalsy()
  })

  it('defines the documented initial protection limits', () => {
    expect(DEFAULT_PROTOCOL_LIMITS).toEqual({ maxEventBytes: 1024 * 1024, maxBatchBytes: 2 * 1024 * 1024, maxBatchEvents: 100, maxDepth: 64 })
    expect(protocolLimitsSchema.safeParse(DEFAULT_PROTOCOL_LIMITS).success).toBeTruthy()
    expect(protocolLimitsSchema.safeParse({ ...DEFAULT_PROTOCOL_LIMITS, maxBatchEvents: 101 }).success).toBeFalsy()
    expect(protocolLimitsSchema.safeParse({ ...DEFAULT_PROTOCOL_LIMITS, maxDepth: 257 }).success).toBeFalsy()
  })

  it('constrains public issue codes and field paths', () => {
    expect(protocolIssueSchema.safeParse({ code: 'INVALID_FIELD', path: ['data', 0, 'eventId'], message: 'Expected an ID' }).success).toBeTruthy()
    expect(protocolIssueSchema.safeParse({ code: 'ARBITRARY', path: [], message: 'Failure' }).success).toBeFalsy()
    expect(protocolIssueSchema.safeParse({ code: 'INVALID_FIELD', path: [-1], message: 'Failure' }).success).toBeFalsy()
  })
})
