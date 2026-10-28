import type { TraceEventEnvelope } from '@trace-script/metadata'
import { describe, expect, it } from 'vitest'
import { isModelEvent, isTraceTerminal, traceTerminalStatus } from '@/aggregate/association'
import { conflict, emptyCall } from '@/aggregate/call'
import { modelMetadata, responseStatus } from '@/aggregate/metadata'
import { callTiming, compareEvents, recordId, responseTokens, sumUsage, validToken } from '@/aggregate/metrics'
import { modelCall } from '@/aggregate/model'
import { addToolDeclaration } from '@/aggregate/tool'

const request: Extract<TraceEventEnvelope, { type: 'model.request' }> = {
  eventId: 'request',
  traceId: 'trace',
  sequence: 1,
  timestamp: '2026-01-01T00:00:00.000Z',
  type: 'model.request',
  requestId: 'r',
  payload: { model: 'fallback', trace: { model: 'nested' } },
}
const response: Extract<TraceEventEnvelope, { type: 'model.response' }> = {
  eventId: 'response',
  traceId: 'trace',
  sequence: 2,
  timestamp: '2026-01-01T00:00:01.000Z',
  type: 'model.response',
  requestId: 'r',
  payload: { status: 'completed', usage: { input_tokens: 2, output_tokens: 3 } },
}
const end: Extract<TraceEventEnvelope, { type: 'trace.end' }> = {
  eventId: 'end',
  traceId: 'trace',
  sequence: 3,
  timestamp: response.timestamp,
  type: 'trace.end',
}

describe('aggregation units', () => {
  it('encodes collision-free record identities and orders events', () => {
    expect(recordId('a', 'model', 'b')).not.toBe(recordId('a', 'tool', 'b'))
    expect(compareEvents(request, response)).toBeLessThan(0)
    expect(compareEvents(response, { ...response, eventId: 'z' })).toBeLessThan(0)
    expect(compareEvents(response, { ...response, timestamp: '2026-01-01T00:00:02Z' })).toBeLessThan(0)
  })

  it('preserves missing endpoints and rejects inverted or invalid timing', () => {
    expect(callTiming(request.timestamp)).toEqual({ start: request.timestamp, end: undefined, anomalous: false })
    expect(callTiming(request.timestamp, response.timestamp).duration).toBe(1000)
    expect(callTiming(response.timestamp, request.timestamp).anomalous).toBeTruthy()
    expect(callTiming('invalid', response.timestamp).anomalous).toBeTruthy()
  })

  it('validates token counts and derives totals only when absent', () => {
    expect([0, -1, 1.5, Infinity].map(validToken)).toEqual([true, false, false, false])
    expect(responseTokens(response)).toEqual({ input: 2, output: 3, total: 5 })
    expect(responseTokens({ ...response, payload: { usage: { input_tokens: 2, output_tokens: 3, total_tokens: -1 } } })).toEqual({ input: 2, output: 3 })
    expect(sumUsage([]).total).toEqual({ complete: false })
    const model = modelCall('trace', 'r', [request, response])
    expect(sumUsage([model, emptyCall('trace', 'tool', 't')]).total).toEqual({ value: 5, complete: true })
    expect(sumUsage([model, emptyCall('trace', 'model', 'missing')]).total).toEqual({ value: 5, complete: false })
  })

  it('selects nested metadata and gives errors precedence over success', () => {
    expect(modelMetadata(request, 'model')).toBe('nested')
    expect(modelMetadata(request, 'name')).toBe('')
    expect(responseStatus(response)).toBe('success')
    expect(responseStatus({ ...response, payload: { status: 'completed', error: 'failure' } })).toBe('failed')
    expect(responseStatus({ ...response, payload: {} })).toBe('unknown')
  })

  it('initializes independent calls and deduplicates conflict diagnostics', () => {
    const call = emptyCall('trace', 'tool', 't')
    conflict(call, 'duplicate')
    conflict(call, 'duplicate')
    expect(call.issues).toEqual(['duplicate'])
    expect(call.associationConflict).toBeTruthy()
    expect(emptyCall('trace', 'tool', 't').issues).toEqual([])
  })

  it('classifies model and terminal events', () => {
    expect(isModelEvent(request)).toBeTruthy()
    expect(isModelEvent(end)).toBeFalsy()
    expect(isTraceTerminal(end)).toBeTruthy()
    expect(traceTerminalStatus({ ...end, status: 'cancelled' })).toBe('cancelled')
  })

  it('ignores unrelated output items and preserves empty tool arguments', () => {
    const model = emptyCall('trace', 'model', 'r')
    const tools = new Map<string, ReturnType<typeof emptyCall>>()
    addToolDeclaration(tools, 'trace', model, response, { type: 'message', call_id: 'ignored' })
    expect(tools.size).toBe(0)
    expect(model.issues).toEqual([])
    addToolDeclaration(tools, 'trace', model, response, { type: 'function_call', call_id: 't', arguments: '' })
    expect(tools.get('t')?.input).toBe('')
    expect(tools.get('t')?.issues).toEqual([])
  })
})
