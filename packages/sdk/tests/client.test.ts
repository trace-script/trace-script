import type { TraceBridgeMessage, TraceEventEnvelope } from '@trace-script/metadata'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTraceClient, observeOpenAIResponse } from '../src/index'

afterEach(() => vi.useRealTimers())

function collected(messages: TraceBridgeMessage[]): TraceEventEnvelope[] {
  return messages.flatMap(message => message.kind === 'trace-batch' ? message.data : message.kind === 'trace-event' ? [message.data] : [])
}

describe('sDK publication', () => {
  it('batches, redacts and assigns monotonically increasing trace sequences', () => {
    const messages: TraceBridgeMessage[] = []

    const client = createTraceClient({ transport: message => messages.push(message), batchSize: 3 })

    const session = client.startSession('Example')

    const trace = client.startTrace(session)

    trace.emit({ type: 'log', name: 'Private', payload: { authorization: 'secret', nested: { api_key: 'key', visible: 1 } } })

    trace.startSpan('Tool').fail('Offline')

    trace.end()

    client.endSession(session)

    client.dispose()

    const events = collected(messages)

    expect(events.find(event => event.name === 'Private')?.payload).toEqual({ authorization: '[REDACTED]', nested: { api_key: '[REDACTED]', visible: 1 } })

    const sequence = events.filter(event => event.traceId === trace.traceId).map(event => event.sequence)

    expect(sequence).toEqual([...sequence].sort((a, b) => a - b))

    expect(new Set(sequence).size).toBe(sequence.length)

    expect(messages.every(message => message.kind === 'trace-batch' && message.data.length <= 3)).toBeTruthy()
  })

  it('flushes on the configured time and does not throw when disabled or transport fails', () => {
    vi.useFakeTimers()

    const transport = vi.fn()

    const client = createTraceClient({ transport, flushIntervalMs: 20 })

    client.startSession()

    expect(transport).not.toHaveBeenCalled()

    vi.advanceTimersByTime(20)

    expect(transport).toHaveBeenCalled()

    client.configure({ enabled: false })

    client.startSession()

    client.flush()

    const sent = client.getStats().sent

    client.configure({ enabled: true, transport: () => {
      throw new Error('unavailable')
    } })

    client.startSession()

    expect(() => client.flush()).not.toThrow()

    expect(client.getStats().dropped).toBeGreaterThan(0)

    expect(client.getStats().sent).toBe(sent)

    client.dispose()
  })

  it('maps Responses items and streams without duplicating completed messages', () => {
    const messages: TraceBridgeMessage[] = []

    const client = createTraceClient({ transport: message => messages.push(message) })

    const trace = client.startTrace('session')

    const observer = observeOpenAIResponse(trace, { model: 'example-model', input: 'Hello', stream: true })

    const item = { id: 'msg_1', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Hello' }] }

    observer.stream({ type: 'response.output_item.added', sequence_number: 1, item })

    observer.stream({ type: 'response.output_text.delta', sequence_number: 2, item_id: 'msg_1', delta: 'Hello' })

    observer.stream({ type: 'response.output_text.delta', sequence_number: 2, item_id: 'msg_1', delta: 'Hello' })

    observer.stream({ type: 'response.output_item.done', sequence_number: 3, item })

    observer.response({ id: 'resp_1', status: 'completed', output: [item], usage: { input_tokens: 5, output_tokens: 2, total_tokens: 7 } })

    client.dispose()

    const events = collected(messages)

    expect(events.filter(event => event.type === 'message.assistant.delta')).toHaveLength(1)

    expect(events.filter(event => event.type === 'message.assistant.completed')).toHaveLength(1)

    expect(events.find(event => event.type === 'model.response')?.metrics?.totalTokens).toBe(7)
  })
})
