import type { TraceEventEnvelope, TraceEventType } from '@trace-script/metadata'
import { isUndefined } from '@trace-script/shared'
import { describe, expect, it } from 'vitest'
import { collectModelCalls, isModelEvent, isTraceTerminal, traceTerminalStatus } from '@/aggregate/association'
import { conflict, emptyCall } from '@/aggregate/call'
import { attachTraceErrors, createTraceSummary, finalizeCalls } from '@/aggregate/lifecycle'
import { modelMetadata, responseStatus } from '@/aggregate/metadata'
import { callTiming, compareEvents, recordId, responseTokens, sumUsage, validToken } from '@/aggregate/metrics'
import { modelCall } from '@/aggregate/model'
import { addToolDeclaration, collectToolCalls } from '@/aggregate/tool'
import { aggregateTrace } from '@/aggregate/trace'
import { aggregateEvents, parseTraceEvent } from '@/index'

function event(sequence: number, type: TraceEventType, payload: object = {}, options: {
  requestId?: string
  traceId?: string
  ms?: number
  id?: string
  status?: 'cancelled'
} = {}): TraceEventEnvelope {
  const traceId = options.traceId ?? 'trace-1'
  return parseTraceEvent({
    eventId: options.id ?? `${traceId}-${sequence}`,
    traceId,
    sequence,
    timestamp: new Date(Date.UTC(2026, 0, 1) + (options.ms ?? sequence * 100)).toISOString(),
    type,
    ...(type === 'trace.start' || type === 'trace.end' ? {} : { payload }),
    ...(options.requestId ? { requestId: options.requestId } : {}),
    ...(options.status ? { status: options.status } : {}),
  })
}

function request(sequence: number, requestId = 'request-1', options: {
  traceId?: string
  ms?: number
} = {}) {
  return event(sequence, 'model.request', {
    model: 'gpt-4.1',
    agent: 'planner',
    input: 'Weather?',
  }, { ...options, requestId })
}

function response(
  sequence: number,
  requestId = 'request-1',
  payload: object = { status: 'completed', output: [], usage: { input_tokens: 2, output_tokens: 3 } },
  options: {
    traceId?: string
    ms?: number
  } = {},
) {
  return event(sequence, 'model.response', payload, { ...options, requestId })
}

const toolCall = { type: 'function_call', call_id: 'tool-1', name: 'get_weather', arguments: '{"city":"Beijing"}' }

describe('aggregateEvents', () => {
  describe('input and event identity', () => {
    it('keeps frozen input immutable and retains explicit model and tool cancellation', () => {
      const sources = [request(1), response(2, 'request-1', { status: 'cancelled', output: [toolCall] }), event(3, 'tool.result', { callId: 'tool-1', output: '', status: 'cancelled' })]
      const before = JSON.stringify(sources)
      for (const source of sources)
        Object.freeze(source)
      Object.freeze(sources)
      const traces = aggregateEvents(sources)
      expect(aggregateEvents(sources)).toEqual(traces)
      expect(JSON.stringify(sources)).toBe(before)
      expect(fixture(traces).calls.map(call => call.status)).toEqual(['cancelled', 'cancelled'])
    })

    it('deduplicates identical events including objects with reordered keys', () => {
      const input = [request(1), response(2)]
      const reply = fixture(input, 1)
      if (reply.type !== 'model.response')
        throw new Error('Expected response')
      const reordered = { ...reply, payload: { usage: { output_tokens: 3, input_tokens: 2 }, output: [], status: 'completed' } }
      expect(aggregateEvents([...input, ...input, reordered])).toEqual(aggregateEvents(input))
    })
  })

  describe('model and tool association', () => {
    it('shows four events as one Trace and one model call, retaining both payloads', () => {
      const input = [event(1, 'trace.start'), request(2), response(3), event(4, 'trace.end')]
      const trace = singleTrace(input)
      expect(trace.calls).toHaveLength(1)
      expect(trace.events).toEqual(input)
      expect(fixture(trace.calls, 0).events).toEqual(input.slice(1, 3))
      expect(JSON.parse(fixture(trace.calls, 0).input!)).toEqual({ model: 'gpt-4.1', agent: 'planner', input: 'Weather?' })
      expect(JSON.parse(fixture(trace.calls, 0).output!)).toMatchObject({ status: 'completed', output: [] })
      expect(fixture(trace.calls, 0).timing.duration).toBe(100)
      expect(trace.timing.duration).toBe(300)
    })

    it('shows seven events as two model calls and one tool, without repeating history', () => {
      const input = [
        event(1, 'trace.start'),
        request(2),
        response(3, 'request-1', { output: [toolCall], usage: { input_tokens: 12, output_tokens: 8 } }),
        event(4, 'tool.result', { callId: 'tool-1', output: '' }),
        event(5, 'model.request', { input: [toolCall, { type: 'function_call_output', call_id: 'tool-1', output: '' }] }, { requestId: 'request-2' }),
        response(6, 'request-2'),
        event(7, 'trace.end'),
      ]
      const trace = singleTrace(input)
      expect(trace.calls.map(call => call.kind)).toEqual(['model', 'tool', 'model'])
      const tool = fixture(trace.calls, 1)
      expect(tool.name).toBe('get_weather')
      expect(tool.input).toBe(toolCall.arguments)
      expect(tool.output).toBe('')
      expect(tool.status).toBe('success')
      expect(tool.parentId).toBe(fixture(trace.calls, 0).id)
      expect(tool.timing.duration).toBe(100)
      expect(tool.tokens).toEqual({})
      expect(trace.tokens.total).toEqual({ value: 25, complete: true })
    })

    it('pairs concurrent reverse responses by requestId, independently of arrival order', () => {
      const input = [request(1, 'a'), request(2, 'b'), response(3, 'b', { output_text: 'B' }), response(4, 'a', { output_text: 'A' })]
      const result = aggregateEvents(input)
      expect(aggregateEvents([...input].reverse())).toEqual(result)
      expect(fixture(result, 0).calls.map(call => [call.callId, JSON.parse(call.output!).output_text])).toEqual([['a', 'A'], ['b', 'B']])
    })

    it('pairs only the unique unlabelled request and never mixes explicit identifiers', () => {
      const legacy = singleTrace([event(1, 'model.request', {}), event(2, 'model.response', {})])
      expect(legacy.calls).toHaveLength(1)
      const mixed = singleTrace([request(1), event(2, 'model.response', {})])
      expect(mixed.calls).toHaveLength(2)
      expect(fixture(mixed.calls, 0).output).toBeUndefined()
      const mismatched = singleTrace([request(1, 'a'), response(2, 'b')])
      expect(mismatched.calls).toHaveLength(2)
    })

    it('does not guess after ambiguous legacy responses, even if another request arrives', () => {
      const trace = singleTrace([
        event(1, 'model.request'),
        event(2, 'model.request'),
        event(3, 'model.response'),
        event(4, 'model.request'),
        event(5, 'model.response'),
      ])
      expect(trace.calls).toHaveLength(5)
      expect(trace.calls.every(call => !(call.input && call.output))).toBeTruthy()
      expect(trace.calls.filter(call => call.issues.some(issue => issue.includes('Ambiguous')))).toHaveLength(5)
    })

    it('isolates identical model and tool identifiers across Traces', () => {
      const input = [request(1), response(2, 'request-1', { output: [toolCall] }), event(3, 'tool.result', { callId: 'tool-1', output: 'A' })]
      const traces = aggregateEvents([...input, ...input.map(source => ({ ...source, traceId: 'trace-2', eventId: `other-${source.eventId}` }))])
      expect(traces).toHaveLength(2)
      expect(traces.every(trace => trace.calls.length === 2)).toBeTruthy()
      expect(fixture(fixture(traces, 0).calls, 0).id).not.toBe(fixture(fixture(traces, 1).calls, 0).id)
      expect(fixture(fixture(traces, 0).calls, 1).id).not.toBe(fixture(fixture(traces, 1).calls, 1).id)
    })

    it('fills output-first identified model and tool records with stable IDs', () => {
      const reply = response(2, 'request-1', { output: [toolCall] })
      const result = event(3, 'tool.result', { callId: 'tool-1', output: 'result' })
      const before = singleTrace([result, reply])
      const after = singleTrace([result, reply, request(1)])
      expect(after.calls.map(call => call.id)).toEqual(before.calls.map(call => call.id))
      expect(fixture(before.calls, 0).input).toBeUndefined()
      expect(fixture(after.calls, 0).input).toBeDefined()
      expect(fixture(before.calls, 1).output).toBe('result')
      const toolOnly = singleTrace([result])
      expect(fixture(toolOnly.calls, 0).id).toBe(fixture(after.calls, 1).id)
    })

    it('reports reused request IDs and multiple final responses without overwriting output', () => {
      const trace = singleTrace([request(1), request(2), response(3), response(4)])
      expect(trace.calls).toHaveLength(1)
      expect(fixture(trace.calls, 0).events).toHaveLength(4)
      expect(fixture(trace.calls, 0).issues).toContain('Request identifier reused: multiple requests')
      expect(fixture(trace.calls, 0).issues).toContain('Multiple final responses: association conflict')
      expect(fixture(trace.calls, 0).tokens).toEqual({})
      expect(fixture(trace.calls, 0).timing.duration).toBeUndefined()
    })

    it('retains reused tool declarations and duplicate results as conflicts', () => {
      const trace = singleTrace([request(1), response(2, 'request-1', { output: [toolCall, toolCall] }), event(3, 'tool.result', { callId: 'tool-1', output: 'first' }), event(4, 'tool.result', { callId: 'tool-1', output: 'second' })])
      const tool = fixture(trace.calls, 1)
      expect(tool.output).toBe('first')
      expect(tool.associationConflict).toBeTruthy()
      expect(tool.events).toHaveLength(3)
      expect(tool.declaration).toBeDefined()
    })

    it('keeps orphan outputs, marks state unknown unless explicitly reported, and lacks timing', () => {
      const trace = singleTrace([response(1, 'a', { output_text: 'orphan' }), event(2, 'tool.result', { callId: 'tool-1', output: '' }), response(3, 'b', { status: 'completed' })])
      expect(trace.calls.map(call => call.status)).toEqual(['unknown', 'unknown', 'success'])
      expect(trace.calls.every(call => isUndefined(call.input) && isUndefined(call.timing.duration))).toBeTruthy()
      expect(fixture(trace.calls, 1).output).toBe('')
    })

    it('preserves unassociated declarations in the full response rather than inventing tool records', () => {
      const trace = singleTrace([request(1), response(2, 'request-1', { output: [{ type: 'function_call', name: 'tool' }] })])
      expect(trace.calls).toHaveLength(1)
      expect(fixture(trace.calls, 0).issues.join(' ')).toContain('call_id missing')
      expect(JSON.parse(fixture(trace.calls, 0).output!).output).toHaveLength(1)
    })

    it('keeps custom tool input and a first declaration selected by response order', () => {
      const custom = { type: 'custom_tool_call', call_id: 'custom', name: 'grammar', input: 'literal input' }
      const trace = singleTrace([
        request(1, 'a'),
        request(2, 'b'),
        response(3, 'b', { output: [toolCall, custom] }),
        response(4, 'a', { output: [{ ...toolCall, name: 'duplicate' }] }),
      ])
      const tool = trace.calls.find(call => call.callId === 'tool-1')!
      const parent = trace.calls.find(call => call.callId === 'b')!
      expect(tool.parentId).toBe(parent.id)
      expect(tool.name).toBe('get_weather')
      expect(tool.associationConflict).toBeTruthy()
      expect(trace.calls.find(call => call.callId === 'custom')?.input).toBe('literal input')
    })
  })

  describe('usage accounting', () => {
    it.each([-1, 1.5, '5'])('keeps an invalid reported total unknown instead of deriving it: %s', (total_tokens) => {
      const trace = singleTrace([request(1), response(2, 'request-1', { usage: { input_tokens: 2, output_tokens: 3, total_tokens } })])
      expect(fixture(trace.calls).tokens).toEqual({ input: 2, output: 3 })
      expect(trace.tokens.total).toEqual({ complete: false })
    })

    it('makes independent rows for multiple tools and counts response usage once', () => {
      const trace = singleTrace([
        request(1),
        response(2, 'request-1', { output: [toolCall, { ...toolCall, call_id: 'tool-2', name: 'search' }], usage: { total_tokens: 42 } }),
        event(3, 'tool.result', { callId: 'tool-2', output: 'second' }),
        event(4, 'tool.result', { callId: 'tool-1', output: 'first' }),
      ])
      expect(trace.calls).toHaveLength(3)
      expect(trace.calls.find(call => call.callId === 'tool-2')?.output).toBe('second')
      expect(trace.calls.find(call => call.callId === 'tool-1')?.output).toBe('first')
      expect(trace.tokens.total).toEqual({ value: 42, complete: true })
    })

    it('retains the first conflicting event plus inspectable alternate content and excludes usage', () => {
      const reply = response(2)
      const alternate = response(2, 'request-1', { usage: { total_tokens: 999 }, output_text: 'conflict' })
      const trace = singleTrace([request(1), reply, alternate])
      expect(fixture(trace.calls, 0).output).toBe(JSON.stringify('payload' in reply ? reply.payload : {}, null, 2))
      expect(fixture(trace.calls, 0).conflicts).toEqual([alternate])
      expect(fixture(trace.calls, 0).associationConflict).toBeTruthy()
      expect(trace.tokens.total).toEqual({ complete: false })
    })

    it('keeps failed attempts and retries separate and includes reported failed usage', () => {
      const trace = singleTrace([request(1, 'attempt-1'), response(2, 'attempt-1', { status: 'failed', error: { message: 'quota' }, usage: { total_tokens: 2 } }), request(3, 'attempt-2'), response(4, 'attempt-2')])
      expect(trace.calls.map(call => call.status)).toEqual(['failed', 'success'])
      expect(trace.tokens.total).toEqual({ value: 7, complete: true })
    })

    it('keeps a streaming request in one record and applies only final usage', () => {
      const input = request(1)
      const pending = singleTrace([input])
      const completed = singleTrace([input, response(2)])
      expect(pending.calls).toHaveLength(1)
      expect(fixture(pending.calls, 0).status).toBe('running')
      expect(fixture(pending.calls, 0).timing.duration).toBeUndefined()
      expect(completed.calls).toHaveLength(1)
      expect(fixture(completed.calls, 0).id).toBe(fixture(pending.calls, 0).id)
      expect(completed.tokens.total.value).toBe(5)
    })

    it.each([
      [{ input_tokens: 0, output_tokens: 0, total_tokens: 0 }, { input: 0, output: 0, total: 0 }],
      [{ prompt_tokens: 2, completion_tokens: 3 }, { input: 2, output: 3, total: 5 }],
      [{ input_tokens: 2, output_tokens: 3, prompt_tokens: 100, completion_tokens: 100, total_tokens: 8 }, { input: 2, output: 3, total: 8 }],
      [{ input_tokens: -1, output_tokens: 1.5, prompt_tokens: 9, completion_tokens: 9 }, {}],
      [{ input_tokens: '2', output_tokens: 3, total_tokens: -1 }, { output: 3 }],
      [{ input_tokens: 2 }, { input: 2 }],
    ])('validates usage and prioritizes fields without duplicate accounting: %j', (usage, expected) => {
      const trace = singleTrace([request(1), response(2, 'request-1', { usage })])
      expect(fixture(trace.calls, 0).tokens).toEqual(expected)
    })

    it('ignores nonfinite usage and request estimates', () => {
      const reply: TraceEventEnvelope = {
        eventId: 'reply',
        traceId: 'trace-1',
        sequence: 2,
        timestamp: '2026-01-01T00:00:01.000Z',
        type: 'model.response',
        requestId: 'request-1',
        payload: { usage: { input_tokens: Number.NaN, output_tokens: Number.POSITIVE_INFINITY, total_tokens: Number.NEGATIVE_INFINITY } },
      }
      const trace = singleTrace([event(1, 'model.request', { usage: { total_tokens: 999 } }, { requestId: 'request-1' }), reply])
      expect(fixture(trace.calls, 0).tokens).toEqual({})
      expect(trace.tokens.total).toEqual({ complete: false })
    })

    it('marks partial usage incomplete separately for each metric and all unknown as unknown', () => {
      const trace = singleTrace([request(1, 'a'), response(2, 'a'), request(3, 'b'), response(4, 'b', { usage: { input_tokens: 0 } })])
      expect(trace.tokens.input).toEqual({ value: 2, complete: true })
      expect(trace.tokens.output).toEqual({ value: 3, complete: false })
      expect(trace.tokens.total).toEqual({ value: 5, complete: false })
      expect(fixture(aggregateEvents([request(1)]), 0).tokens.total).toEqual({ complete: false })
    })
  })

  describe('lifecycle and errors', () => {
    it('locates model and tool failures, preserving other successful calls', () => {
      const trace = singleTrace([
        request(1, 'a'),
        response(2, 'a', { output: [toolCall] }),
        request(3, 'b'),
        event(4, 'tool.result', { callId: 'tool-1', output: '', status: 'failed', message: 'tool timeout' }),
        event(5, 'trace.error', { requestId: 'b', message: 'model failed' }),
      ])
      expect(trace.status).toBe('failed')
      expect(trace.calls.map(call => call.status)).toEqual(['success', 'failed', 'failed'])
      expect(trace.calls.find(call => call.callId === 'b')?.errors).toContain('model failed')
    })

    it('marks unresolved calls interrupted on an unlocated Trace error', () => {
      const trace = singleTrace([request(1, 'a'), response(2, 'a'), request(3, 'b'), event(4, 'trace.error', { message: 'disconnected' })])
      expect(trace.calls.map(call => call.status)).toEqual(['success', 'interrupted'])
      expect(fixture(trace.calls, 1).errors).toEqual([])
      expect(fixture(trace.calls, 1).timing.duration).toBeUndefined()
    })

    it('shows missing output after a normal terminal without inventing success or duration', () => {
      const trace = singleTrace([request(1), event(2, 'trace.end')])
      expect(fixture(trace.calls, 0).status).toBe('incomplete')
      expect(fixture(trace.calls, 0).output).toBeUndefined()
      expect(fixture(trace.calls, 0).timing.duration).toBeUndefined()
    })

    it('preserves contradictory lifecycle events and marks the Trace conflict', () => {
      const input = [event(1, 'trace.start'), request(2), response(3), event(4, 'trace.end'), event(5, 'trace.error', { message: 'late failure' })]
      const trace = singleTrace(input)
      expect(trace.status).toBe('conflict')
      expect(trace.events).toEqual(input)
      expect(fixture(trace.calls, 0).status).toBe('success')
      expect(trace.timing.duration).toBeUndefined()
      expect(trace.issues).toContain('Conflicting Trace terminal events')
    })

    it('does not infer cancellation from waits, only from explicit information', () => {
      expect(fixture(fixture(aggregateEvents([request(1)]), 0).calls, 0).status).toBe('running')
      const cancelled = singleTrace([request(1), event(2, 'trace.end', {}, { status: 'cancelled' })])
      expect(cancelled.status).toBe('cancelled')
      expect(fixture(cancelled.calls, 0).status).toBe('cancelled')
    })

    it('does not confuse a legacy source event ID with a located error requestId', () => {
      const trace = singleTrace([event(1, 'model.request', {}, { id: 'legacy-id' }), event(2, 'trace.error', { message: 'failure', requestId: 'legacy-id' })])
      expect(fixture(trace.calls, 0).status).toBe('interrupted')
      expect(fixture(trace.calls, 0).errors).toEqual([])
      expect(trace.issues).toContain('Error target not found: legacy-id')
    })

    it('reports multiple endings and same-ID terminal contradictions without guessing a duration', () => {
      const ending = event(2, 'trace.end')
      const repeated = singleTrace([event(1, 'trace.start'), ending, event(3, 'trace.end')])
      expect(repeated.status).toBe('conflict')
      expect(repeated.timing.duration).toBeUndefined()
      const alternate = event(2, 'trace.error', { message: 'failure' })
      const contradiction = singleTrace([event(1, 'trace.start'), ending, alternate])
      expect(contradiction.status).toBe('conflict')
      expect(contradiction.conflicts).toEqual([alternate])
      expect(contradiction.timing.duration).toBeUndefined()
    })
  })

  describe('timing and ordering', () => {
    it('uses a 1.2 second Trace interval instead of adding two concurrent 1 second calls', () => {
      const trace = singleTrace([event(1, 'trace.start', {}, { ms: 0 }), request(2, 'a', { ms: 100 }), request(3, 'b', { ms: 100 }), response(4, 'b', { usage: { total_tokens: 1 } }, { ms: 1100 }), response(5, 'a', { usage: { total_tokens: 1 } }, { ms: 1100 }), event(6, 'trace.end', {}, { ms: 1200 })])
      expect(trace.calls.map(call => call.timing.duration)).toEqual([1000, 1000])
      expect(trace.timing.duration).toBe(1200)
    })

    it('flags inverted timestamps while preserving endpoints and never reporting negative duration', () => {
      const trace = singleTrace([event(1, 'trace.start', {}, { ms: 500 }), request(2, 'a', { ms: 400 }), response(3, 'a', {}, { ms: 300 }), event(4, 'trace.end', {}, { ms: 200 })])
      expect(trace.timing.anomalous).toBeTruthy()
      expect(fixture(trace.calls, 0).timing.anomalous).toBeTruthy()
      expect(fixture(trace.calls, 0).timing.start).toBe(new Date(Date.UTC(2026, 0, 1) + 400).toISOString())
      expect(fixture(trace.calls, 0).timing.duration).toBeUndefined()
      expect(trace.timing.duration).toBeUndefined()
    })

    it('uses deterministic event-ID sorting for ties and separates legacy and explicit identities', () => {
      const legacy = event(1, 'model.request', {}, { id: 'same' })
      const explicit = request(2, 'same')
      const a = event(3, 'model.response', { output_text: 'A' }, { requestId: 'same', id: 'a' })
      const b = event(3, 'model.response', { output_text: 'B' }, { requestId: 'same', id: 'b' })
      const trace = singleTrace([legacy, explicit, b, a])
      expect(new Set(trace.calls.map(call => call.id)).size).toBe(2)
      expect(JSON.parse(fixture(trace.calls, 1).output!).output_text).toBe('A')
    })

    it('sorts timestamps chronologically even when fractional-second precision differs', () => {
      const early = { ...response(2, 'request-1', { output_text: 'early' }), eventId: 'early', timestamp: '2026-01-01T00:00:00.1Z' }
      const late = { ...response(2, 'request-1', { output_text: 'late' }), eventId: 'late', timestamp: '2026-01-01T00:00:00.11Z' }
      const trace = singleTrace([request(1), late, early])
      expect(JSON.parse(fixture(trace.calls, 0).output!).output_text).toBe('early')
    })
  })
})

function fixture<T>(items: readonly T[], index = 0): T {
  const value = items[index]
  if (isUndefined(value))
    throw new Error(`Expected fixture item ${index}`)
  return value
}

function singleTrace(events: TraceEventEnvelope[]) {
  const traces = aggregateEvents(events)
  expect(traces).toHaveLength(1)
  return fixture(traces)
}

describe('aggregate helpers', () => {
  const requestEvent = event(1, 'model.request', { model: 'fallback', trace: { model: 'nested' } }, { requestId: 'r', ms: 0 })
  const responseEvent = response(2, 'r', { status: 'completed', usage: { input_tokens: 2, output_tokens: 3 } }, { ms: 1000 })
  const endEvent = event(3, 'trace.end')

  if (requestEvent.type !== 'model.request'
    || responseEvent.type !== 'model.response'
    || endEvent.type !== 'trace.end') {
    throw new Error('Expected model request, response and trace end fixtures')
  }

  describe('metrics', () => {
    describe('recordId', () => {
      it('separates kinds and delimiter-containing identifiers', () => {
        expect(recordId('a', 'model', 'b')).not.toBe(recordId('a', 'tool', 'b'))
        expect(recordId('a,b', 'model', 'c')).not.toBe(recordId('a', 'model', 'b,c'))
        expect(recordId('a', 'trace')).toBe(recordId('a', 'trace', ''))
      })
    })

    describe('compareEvents', () => {
      it('orders by sequence, then timestamp, then event ID', () => {
        expect(compareEvents(requestEvent, responseEvent)).toBeLessThan(0)
        expect(compareEvents(responseEvent, { ...responseEvent, timestamp: '2026-01-01T00:00:02Z' })).toBeLessThan(0)
        expect(compareEvents(responseEvent, { ...responseEvent, eventId: 'z' })).toBeLessThan(0)
        expect(compareEvents(responseEvent, responseEvent)).toBe(0)
      })
    })

    describe('callTiming', () => {
      it('preserves missing endpoints and rejects invalid or inverted intervals', () => {
        expect(callTiming(requestEvent.timestamp)).toEqual({ start: requestEvent.timestamp, end: undefined, anomalous: false })
        expect(callTiming(requestEvent.timestamp, responseEvent.timestamp).duration).toBe(1000)
        expect(callTiming(responseEvent.timestamp, requestEvent.timestamp).anomalous).toBeTruthy()
        expect(callTiming('invalid', responseEvent.timestamp).anomalous).toBeTruthy()
      })
    })

    describe('validToken', () => {
      it.each([[0, true], [2, true], [-1, false], [1.5, false], [Infinity, false], [Number.NaN, false]])('validates %s as %s', (value, expected) => {
        expect(validToken(value)).toBe(expected)
      })
    })

    describe('responseTokens', () => {
      it('derives an absent total but preserves an invalid reported total', () => {
        expect(responseTokens(responseEvent)).toEqual({ input: 2, output: 3, total: 5 })
        expect(responseTokens({ ...responseEvent, payload: { usage: { input_tokens: 2, output_tokens: 3, total_tokens: -1 } } }))
          .toEqual({ input: 2, output: 3 })
      })

      it('ignores non-object usage and rejects an overflowing derived total', () => {
        expect(responseTokens({ ...responseEvent, payload: { usage: [] } })).toEqual({})
        expect(responseTokens({ ...responseEvent, payload: { usage: { input_tokens: Number.MAX_VALUE, output_tokens: Number.MAX_VALUE } } }))
          .toEqual({ input: Number.MAX_VALUE, output: Number.MAX_VALUE })
      })
    })

    describe('sumUsage', () => {
      it('counts only models and reports completeness per metric', () => {
        const model = emptyCall('trace', 'model', 'r')
        model.tokens = { input: 2, total: 5 }
        const tool = emptyCall('trace', 'tool', 't')
        tool.tokens = { total: 100 }
        expect(sumUsage([model, tool])).toEqual({
          input: { value: 2, complete: true },
          output: { complete: false },
          total: { value: 5, complete: true },
        })
        expect(sumUsage([model, emptyCall('trace', 'model', 'missing')]).total)
          .toEqual({ value: 5, complete: false })
        expect(sumUsage([]).total).toEqual({ complete: false })
      })
    })
  })

  describe('metadata', () => {
    describe('modelMetadata', () => {
      it('prefers nested metadata, falls back to payload fields and rejects non-strings', () => {
        expect(modelMetadata(requestEvent, 'model')).toBe('nested')
        expect(modelMetadata({ ...requestEvent, payload: { model: 'fallback', trace: [] } }, 'model')).toBe('fallback')
        expect(modelMetadata({ ...requestEvent, payload: { model: 42 } }, 'model')).toBe('')
        expect(modelMetadata(requestEvent, 'name')).toBe('')
      })
    })

    describe('responseStatus', () => {
      it.each([
        ['completed', 'success'],
        ['success', 'success'],
        ['failed', 'failed'],
        ['cancelled', 'cancelled'],
        ['incomplete', 'incomplete'],
        ['other', 'unknown'],
      ])('maps %s to %s', (status, expected) => {
        expect(responseStatus({ ...responseEvent, payload: { status } })).toBe(expected)
      })

      it('gives an error precedence over a completed status', () => {
        expect(responseStatus({ ...responseEvent, payload: { status: 'completed', error: 'failure' } })).toBe('failed')
      })
    })
  })

  describe('call', () => {
    describe('emptyCall', () => {
      it('initializes kind-specific statuses and independent mutable fields', () => {
        const model = emptyCall('trace', 'model', 'r')
        const tool = emptyCall('trace', 'tool', 't')
        model.issues.push('model only')
        expect(model.status).toBe('running')
        expect(tool.status).toBe('waiting')
        expect(tool.issues).toEqual([])
        expect(tool.tokens).toEqual({})
      })
    })

    describe('conflict', () => {
      it('marks association conflicts and deduplicates repeated diagnostics', () => {
        const call = emptyCall('trace', 'tool', 't')
        conflict(call, 'duplicate')
        conflict(call, 'duplicate')
        conflict(call, 'another')
        expect(call.associationConflict).toBeTruthy()
        expect(call.issues).toEqual(['duplicate', 'another'])
      })
    })
  })

  describe('association', () => {
    describe('isModelEvent', () => {
      it('accepts requests and responses and rejects trace events', () => {
        expect(isModelEvent(requestEvent)).toBeTruthy()
        expect(isModelEvent(responseEvent)).toBeTruthy()
        expect(isModelEvent(endEvent)).toBeFalsy()
      })
    })

    describe('isTraceTerminal', () => {
      it('accepts terminal events and rejects trace starts', () => {
        expect(isTraceTerminal(endEvent)).toBeTruthy()
        expect(isTraceTerminal(event(4, 'trace.error', { message: 'failure' }))).toBeTruthy()
        expect(isTraceTerminal(event(1, 'trace.start'))).toBeFalsy()
      })
    })

    describe('traceTerminalStatus', () => {
      it('maps normal completion, cancellation and failure', () => {
        expect(traceTerminalStatus(endEvent)).toBe('success')
        expect(traceTerminalStatus({ ...endEvent, status: 'cancelled' })).toBe('cancelled')
        expect(traceTerminalStatus({ ...endEvent, type: 'trace.error', payload: { message: 'failure' } })).toBe('failed')
      })
    })

    describe('collectModelCalls', () => {
      it('groups explicit IDs and ignores unrelated events', () => {
        const calls = collectModelCalls('trace', [requestEvent, responseEvent, endEvent])
        expect(calls).toHaveLength(1)
        expect(fixture(calls).events).toEqual([requestEvent, responseEvent])
        expect(fixture(calls).callId).toBe('r')
      })

      it('leaves ambiguous legacy responses unpaired', () => {
        const calls = collectModelCalls('trace', [event(1, 'model.request'), event(2, 'model.request'), event(3, 'model.response')])
        expect(calls).toHaveLength(3)
        expect(calls.every(call => call.issues.some(issue => issue.includes('Ambiguous')))).toBeTruthy()
      })
    })
  })

  describe('model', () => {
    describe('modelCall', () => {
      it('builds payload, metadata, usage and timing from paired sources', () => {
        const call = modelCall('trace', 'r', [requestEvent, responseEvent], 'request')
        expect(call).toMatchObject({
          callId: 'r',
          model: 'nested',
          status: 'success',
          tokens: { input: 2, output: 3, total: 5 },
          timing: { duration: 1000 },
        })
        expect(call.input).toBe(JSON.stringify(requestEvent.payload, null, 2))
        expect(call.output).toBe(JSON.stringify(responseEvent.payload, null, 2))
      })

      it('preserves request metadata while filling only missing response metadata', () => {
        const input = event(1, 'model.request', { model: 'request-model', name: 'Request name' })
        const output = response(2, 'r', { model: 'response-model', agent: 'responder', name: 'Response name' })
        const call = modelCall('trace', 'r', [input, output])
        expect(call).toMatchObject({ model: 'request-model', agent: 'responder', name: 'Request name', status: 'success' })
      })

      it('names an orphan response from its own metadata without assuming success', () => {
        const output = response(2, 'r', { model: 'response-model', agent: 'responder', name: 'Response name' })
        const call = modelCall('trace', 'r', [output])
        expect(call).toMatchObject({ model: 'response-model', agent: 'responder', name: 'Response name', status: 'unknown' })
        expect(call.input).toBeUndefined()
        expect(call.issues).toContain('Input missing')
      })

      it.each([
        { name: 'no error', payload: { status: 'completed' }, status: 'success', errors: [] },
        {
          name: 'an error despite completed status',
          payload: { status: 'completed', error: { message: 'failed' } },
          status: 'failed',
          errors: ['{\n  "message": "failed"\n}'],
        },
      ])('retains response error details for $name', ({ payload, status, errors }) => {
        const call = modelCall('trace', 'r', [requestEvent, response(2, 'r', payload)])
        expect(call.status).toBe(status)
        expect(call.errors).toEqual(errors)
      })

      it('keeps valid response usage together with its source event', () => {
        const call = modelCall('trace', 'r', [requestEvent, responseEvent])
        expect(call.usage).toBe('{\n  "input_tokens": 2,\n  "output_tokens": 3\n}')
        expect(call.usageEventId).toBe(responseEvent.eventId)
        expect(call.tokens).toEqual({ input: 2, output: 3, total: 5 })
      })

      it.each([
        { name: 'array', payload: { usage: [10, 20] } },
        { name: 'string', payload: { usage: '10' } },
        { name: 'absent usage', payload: {} },
      ])('does not attach $name as response usage', ({ payload }) => {
        const call = modelCall('trace', 'r', [requestEvent, response(2, 'r', payload)])
        expect(call.tokens).toEqual({})
        expect(call.usage).toBeUndefined()
        expect(call.usageEventId).toBeUndefined()
      })

      it('retains the first response and diagnoses multiple final responses', () => {
        const call = modelCall('trace', 'r', [requestEvent, responseEvent, { ...responseEvent, eventId: 'second' }])
        expect(call.associationConflict).toBeTruthy()
        expect(call.issues).toContain('Multiple final responses: association conflict')
        expect(call.output).toBe(JSON.stringify(responseEvent.payload, null, 2))
      })
    })
  })

  describe('tool', () => {
    describe('addToolDeclaration', () => {
      it('ignores unrelated output and preserves empty tool arguments', () => {
        const model = emptyCall('trace', 'model', 'r')
        const tools = new Map<string, ReturnType<typeof emptyCall>>()
        addToolDeclaration(tools, 'trace', model, responseEvent, { type: 'message', call_id: 'ignored' })
        expect(tools.size).toBe(0)
        addToolDeclaration(tools, 'trace', model, responseEvent, { type: 'function_call', call_id: 't', arguments: '' })
        expect(tools.get('t')?.input).toBe('')
        expect(tools.get('t')?.issues).toEqual([])
        expect(tools.get('t')?.parentId).toBe(model.id)
      })

      it('diagnoses missing identifiers and reused declarations', () => {
        const model = emptyCall('trace', 'model', 'r')
        const tools = new Map<string, ReturnType<typeof emptyCall>>()
        addToolDeclaration(tools, 'trace', model, responseEvent, { type: 'function_call' })
        expect(model.issues.join()).toContain('call_id missing')
        addToolDeclaration(tools, 'trace', model, responseEvent, toolCall)
        addToolDeclaration(tools, 'trace', model, responseEvent, toolCall)
        expect(tools.get('tool-1')?.associationConflict).toBeTruthy()
        expect(tools.get('tool-1')?.events).toEqual([responseEvent])
      })
    })

    describe('collectToolCalls', () => {
      it('pairs a declared tool with its result', () => {
        const model = emptyCall('trace', 'model', 'r')
        model.events = [{ ...responseEvent, payload: { output: [toolCall] } }]
        const result = event(3, 'tool.result', { callId: 'tool-1', output: 'first' })
        const calls = collectToolCalls('trace', [result], [model])
        expect(calls).toHaveLength(1)
        expect(fixture(calls)).toMatchObject({
          output: 'first',
          status: 'success',
          associationConflict: false,
          parentId: model.id,
        })
      })

      it('preserves an empty first result and ignores later status, error and timing', () => {
        const first = event(3, 'tool.result', { callId: 'tool-1', output: '', status: 'cancelled', message: 'cancelled' })
        const second = event(4, 'tool.result', { callId: 'tool-1', output: 'late', status: 'failed', message: 'late error' })
        const call = fixture(collectToolCalls('trace', [first, second], []))
        expect(call).toMatchObject({ output: '', status: 'cancelled', errors: ['cancelled'], associationConflict: true })
        expect(call.events).toEqual([first, second])
        expect(call.timing.end).toBe(first.timestamp)
      })

      it('selects declarations by response order rather than model array order', () => {
        const first = modelCall('trace', 'first', [response(2, 'first', { output: [toolCall] })])
        const second = modelCall('trace', 'second', [response(3, 'second', { output: [{ ...toolCall, arguments: 'late' }] })])
        const call = fixture(collectToolCalls('trace', [], [second, first]))
        expect(call.input).toBe(toolCall.arguments)
        expect(call.parentId).toBe(first.id)
        expect(call.associationConflict).toBeTruthy()
        expect(call.events).toEqual([...first.events, ...second.events])
      })

      it('retains orphan results without inventing success', () => {
        const calls = collectToolCalls('trace', [event(3, 'tool.result', { callId: 'orphan', output: '' })], [])
        expect(fixture(calls)).toMatchObject({
          callId: 'orphan',
          output: '',
          status: 'unknown',
        })
      })
    })
  })

  describe('lifecycle', () => {
    describe('createTraceSummary', () => {
      it('rejects timing derived from multiple starts', () => {
        const starts = [event(1, 'trace.start'), event(2, 'trace.start')]
        const trace = createTraceSummary('trace', [...starts, endEvent], [], [])
        expect(trace.status).toBe('success')
        expect(trace.issues).toContain('Multiple Trace start events')
        expect(trace.timing.duration).toBeUndefined()
      })

      it('preserves conflicting terminal content', () => {
        const alternate = { ...endEvent, type: 'trace.error' as const, payload: { message: 'failure' } }
        const trace = createTraceSummary('trace', [endEvent], [alternate], [])
        expect(trace.status).toBe('conflict')
        expect(trace.conflicts).toEqual([alternate])
        expect(trace.issues).toContain('Conflicting Trace terminal content')
      })
    })

    describe('attachTraceErrors', () => {
      it('attaches a located failure without replacing an existing completion time', () => {
        const call = emptyCall('trace', 'model', 'r')
        call.events = [requestEvent]
        call.timing = callTiming(requestEvent.timestamp, responseEvent.timestamp)
        const error = event(4, 'trace.error', { requestId: 'r', message: 'failure' })
        const trace = createTraceSummary('trace', [error], [], [call])
        attachTraceErrors(trace)
        expect(call.errors).toEqual(['failure'])
        expect(call.status).toBe('failed')
        expect(call.events).toContain(error)
        expect(call.timing.end).toBe(responseEvent.timestamp)
      })

      it.each([
        { name: 'model request', target: { requestId: 'shared-id' }, modelErrors: ['failure'], toolErrors: [], issues: [] },
        { name: 'tool call', target: { callId: 'shared-id' }, modelErrors: [], toolErrors: ['failure'], issues: [] },
        { name: 'missing request', target: { requestId: 'missing' }, modelErrors: [], toolErrors: [], issues: ['Error target not found: missing'] },
        { name: 'missing tool', target: { callId: 'missing' }, modelErrors: [], toolErrors: [], issues: ['Error target not found: missing'] },
        { name: 'trace only', target: {}, modelErrors: [], toolErrors: [], issues: [] },
      ])('attaches errors addressed to $name without crossing call kinds', ({ target, modelErrors, toolErrors, issues }) => {
        const model = modelCall('trace', 'shared-id', [request(1, 'shared-id')], 'request')
        const tool = emptyCall('trace', 'tool', 'shared-id')
        const error = event(2, 'trace.error', { ...target, message: 'failure' })
        const trace = createTraceSummary('trace', [event(1, 'trace.start'), error], [], [model, tool])
        attachTraceErrors(trace)
        expect(model.errors).toEqual(modelErrors)
        expect(tool.errors).toEqual(toolErrors)
        expect(trace.errors).toEqual(['failure'])
        expect(trace.issues).toEqual(issues)
        expect(model.events.includes(error)).toBe(modelErrors.length > 0)
        expect(tool.events.includes(error)).toBe(toolErrors.length > 0)
      })
    })

    describe('finalizeCalls', () => {
      it('propagates parent conflicts and clears unreliable usage and duration', () => {
        const parent = emptyCall('trace', 'model', 'r')
        parent.associationConflict = true
        const tool = emptyCall('trace', 'tool', 't')
        tool.parentId = parent.id
        tool.tokens = { total: 10 }
        tool.timing = callTiming(requestEvent.timestamp, responseEvent.timestamp)
        const trace = createTraceSummary('trace', [], [], [parent, tool])
        finalizeCalls(trace)
        expect(tool.associationConflict).toBeTruthy()
        expect(tool.tokens).toEqual({})
        expect(tool.timing.duration).toBeUndefined()
        expect(tool.timing.end).toBe(responseEvent.timestamp)
      })

      it('keeps completed and explicitly failed calls unchanged when the trace fails', () => {
        const completed = emptyCall('trace', 'tool', 'completed')
        completed.output = ''
        completed.status = 'success'
        const failed = emptyCall('trace', 'model', 'failed')
        failed.status = 'failed'
        const pending = emptyCall('trace', 'model', 'pending')
        const trace = createTraceSummary('trace', [event(4, 'trace.error', { message: 'trace failed' })], [], [completed, failed, pending])
        finalizeCalls(trace)
        expect(completed.status).toBe('success')
        expect(failed.status).toBe('failed')
        expect(completed.issues).toEqual([])
        expect(failed.issues).toEqual([])
        expect(pending.status).toBe('interrupted')
        expect(pending.issues).toContain('Interrupted; specific cause not located')
      })

      it.each([
        { name: 'no terminal', events: [event(1, 'trace.start')], status: 'running', issues: [] },
        { name: 'normal completion', events: [endEvent], status: 'incomplete', issues: ['Output missing after Trace ended'] },
        { name: 'explicit cancellation', events: [event(3, 'trace.end', {}, { status: 'cancelled' })], status: 'cancelled', issues: [] },
        {
          name: 'trace failure',
          events: [event(3, 'trace.error', { message: 'disconnected' })],
          status: 'interrupted',
          issues: ['Interrupted; specific cause not located'],
        },
      ])('finalizes a pending call after $name', ({ events, status, issues }) => {
        const call = emptyCall('trace', 'model', 'r')
        const trace = createTraceSummary('trace', events, [], [call])
        finalizeCalls(trace)
        expect(call.status).toBe(status)
        expect(call.issues).toEqual(issues)
        expect(call.output).toBeUndefined()
        expect(call.timing.end).toBeUndefined()
      })
    })
  })

  describe('trace', () => {
    describe('aggregateTrace', () => {
      it('sorts calls and computes usage after invalidating conflicting associations', () => {
        const alternate = { ...responseEvent, payload: { usage: { total_tokens: 999 } } }
        const trace = aggregateTrace('trace', [requestEvent, responseEvent], [alternate])
        expect(trace.calls).toHaveLength(1)
        expect(fixture(trace.calls).associationConflict).toBeTruthy()
        expect(trace.tokens.total).toEqual({ complete: false })
        expect(trace.issues).toContain('Conflicting event content (see Raw Events); first received values retained')
      })
    })
  })
})
