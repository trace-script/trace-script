import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTraceSdk } from '@/index'

function captureMessages() {
  const postMessage = vi.fn()
  vi.stubGlobal('window', { location: { origin: 'https://agent.example' }, postMessage })
  return postMessage
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('trace SDK lifecycle', () => {
  it('records the same requests and full responses used by a two-call tool flow', async () => {
    const postMessage = captureMessages()
    const sdk = createTraceSdk()
    const trace = sdk.startTrace()
    const firstRequest = { model: 'gpt-4.1', input: [{ role: 'user', content: 'Weather in Beijing?' }], tools: [{ type: 'function', name: 'get_weather' }] }
    const firstResponse = { id: 'resp_1', output: [{ type: 'function_call', call_id: 'call_1', name: 'get_weather', arguments: '{"city":"Beijing"}' }], usage: { input_tokens: 12, output_tokens: 8 } }
    const secondResponse = { id: 'resp_2', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Sunny.' }] }], usage: null }
    const create = vi.fn().mockResolvedValueOnce(firstResponse).mockResolvedValueOnce(secondResponse)

    expect(trace.recordRequest(firstRequest)).toEqual({ success: true })
    const response1 = await create(firstRequest)
    expect(trace.recordResponse(response1)).toEqual({ success: true })
    const call = response1.output[0]
    const output = JSON.stringify({ condition: 'sunny' })
    expect(trace.recordToolResult({ callId: call.call_id, output })).toEqual({ success: true })
    const secondRequest = { model: 'gpt-4.1', input: [...firstRequest.input, ...response1.output, { type: 'function_call_output', call_id: call.call_id, output }], tools: firstRequest.tools }
    expect(trace.recordRequest(secondRequest)).toEqual({ success: true })
    const response2 = await create(secondRequest)
    expect(trace.recordResponse(response2)).toEqual({ success: true })
    expect(trace.end()).toEqual({ success: true })

    const messages = postMessage.mock.calls.map(([message]) => message)
    expect(messages.map(message => message.data.type)).toEqual(['trace.start', 'model.request', 'model.response', 'tool.result', 'model.request', 'model.response', 'trace.end'])
    expect(messages.map(message => message.data.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(messages.every(message => message.data.traceId === trace.traceId)).toBeTruthy()
    expect(new Set(messages.map(message => message.data.eventId)).size).toBe(7)
    expect(messages[1].data.payload).toEqual(create.mock.calls[0][0])
    expect(messages[2].data.payload).toEqual(firstResponse)
    expect(messages[3].data.payload).toEqual({ callId: call.call_id, output })
    expect(messages[5].data.payload).toEqual(secondResponse)
    expect(postMessage.mock.calls.every(([, origin]) => origin === 'https://agent.example')).toBeTruthy()
  })

  it('snapshots input at record time and supports a no-tool flow', () => {
    const postMessage = captureMessages()
    const trace = createTraceSdk().startTrace()
    const request = { model: 'gpt-4.1', input: [{ role: 'user', content: 'Hi' }] }
    trace.recordRequest(request)
    request.input[0].content = 'Changed'
    trace.recordResponse({ id: 'resp_1', output: [], usage: null })
    trace.end()
    trace.end()
    expect(trace.recordResponse({ id: 'late' })).toEqual({ success: false, reason: 'TRACE_ENDED' })
    expect(postMessage.mock.calls.map(([message]) => message.data.type)).toEqual(['trace.start', 'model.request', 'model.response', 'trace.end'])
    expect(postMessage.mock.calls[1][0].data.payload.input[0].content).toBe('Hi')
  })

  it.each(['model', 'tool'])('records a single terminal error after %s failure', (stage) => {
    const postMessage = captureMessages()
    const trace = createTraceSdk().startTrace()
    trace.recordRequest({ model: 'gpt-4.1', input: [] })
    if (stage === 'tool')
      trace.recordResponse({ id: 'resp_1', output: [{ type: 'function_call', call_id: 'call_1' }] })
    expect(trace.fail(new Error(`${stage} failed`))).toEqual({ success: true })
    expect(trace.fail(new Error('again'))).toEqual({ success: true })
    expect(trace.end()).toEqual({ success: true })
    const events = postMessage.mock.calls.map(([message]) => message.data)
    expect(events.at(-1)).toMatchObject({ type: 'trace.error', payload: { message: `${stage} failed` } })
    expect(events.filter(event => event.type === 'trace.error' || event.type === 'trace.end')).toHaveLength(1)
  })

  it('reports invalid payloads without consuming a sequence', () => {
    const postMessage = captureMessages()
    const trace = createTraceSdk().startTrace()
    const circular = { self: {} }
    circular.self = circular
    expect(trace.recordResponse(circular).success).toBeFalsy()
    expect(trace.recordToolResult({ callId: '', output: 'x' }).success).toBeFalsy()
    expect(trace.recordResponse({ id: 'resp_1', output: [] })).toEqual({ success: true })
    expect(postMessage.mock.calls.map(([message]) => message.data.sequence)).toEqual([1, 2])
  })

  it('records large JSON responses without a size gate', () => {
    const postMessage = captureMessages()
    const trace = createTraceSdk().startTrace()
    const response = { output: 'x'.repeat(1024 * 1024 + 1) }
    expect(trace.recordResponse(response)).toEqual({ success: true })
    expect(postMessage.mock.calls[1][0].data.payload).toEqual(response)
  })

  it('does not throw when the page has no receiver or postMessage fails', () => {
    const postMessage = captureMessages()
    const trace = createTraceSdk().startTrace()
    expect(trace.recordRequest({ model: 'gpt-4.1', input: [] })).toEqual({ success: true })
    expect(postMessage).toHaveBeenCalledTimes(2)
    postMessage.mockImplementation(() => {
      throw new Error('delivery failed')
    })
    expect(trace.recordResponse({ id: 'resp_1' })).toEqual({ success: false, reason: 'DELIVERY_FAILED' })
  })
})
