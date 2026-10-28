import type { TraceBridgeMessage } from '@trace-script/metadata'
import type { TraceHandle } from '@/index'
import { isUndefined } from '@trace-script/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTraceSdk } from '@/index'

function requestId(trace: TraceHandle, request: object): string {
  const result = trace.recordRequest(request)
  expect(result.success).toBeTruthy()
  if (!result.success)
    throw new Error(result.reason)
  return result.requestId
}
function captureMessages() {
  const postMessage = vi.fn<(message: TraceBridgeMessage, origin: string) => void>()
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
    const create = vi.fn<(request: object) => Promise<typeof firstResponse | typeof secondResponse>>().mockResolvedValueOnce(firstResponse).mockResolvedValueOnce(secondResponse)
    const firstId = requestId(trace, firstRequest)
    const response1 = await create(firstRequest)
    expect(trace.recordResponse(firstId, response1)).toEqual({ success: true })
    const call = response1.output.find(item => 'call_id' in item)
    if (!call || !('call_id' in call))
      throw new Error('Expected tool declaration')
    const output = JSON.stringify({ condition: 'sunny' })
    expect(trace.recordToolResult({ callId: call.call_id, output })).toEqual({ success: true })
    const secondRequest = { model: 'gpt-4.1', input: [...firstRequest.input, ...response1.output, { type: 'function_call_output', call_id: call.call_id, output }], tools: firstRequest.tools }
    const secondId = requestId(trace, secondRequest)
    const response2 = await create(secondRequest)
    expect(trace.recordResponse(secondId, response2)).toEqual({ success: true })
    expect(trace.end()).toEqual({ success: true })
    const messages = postMessage.mock.calls.map(([message]) => message)
    expect(messages.map(message => message.data.type)).toEqual(['trace.start', 'model.request', 'model.response', 'tool.result', 'model.request', 'model.response', 'trace.end'])
    expect(messages.map(message => message.data.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(messages.every(message => message.data.traceId === trace.traceId)).toBeTruthy()
    expect(new Set(messages.map(message => message.data.eventId)).size).toBe(7)
    expect(fixture(messages, 1).data).toMatchObject({ requestId: firstId })
    expect(fixture(messages, 2).data).toMatchObject({ requestId: firstId })
    expect(fixture(messages, 4).data).toMatchObject({ requestId: secondId })
    expect(fixture(messages, 5).data).toMatchObject({ requestId: secondId })
    expect(firstId).not.toBe(secondId)
    expect(fixture(messages, 1).data).toMatchObject({ payload: fixture(fixture(create.mock.calls, 0), 0) })
    expect(fixture(messages, 2).data).toMatchObject({ payload: firstResponse })
    expect(fixture(messages, 3).data).toMatchObject({ payload: { callId: call.call_id, output } })
    expect(fixture(messages, 5).data).toMatchObject({ payload: secondResponse })
    expect(postMessage.mock.calls.every(([, origin]) => origin === 'https://agent.example')).toBeTruthy()
  })

  it('snapshots input at record time and supports a no-tool flow', () => {
    const postMessage = captureMessages()
    const trace = createTraceSdk().startTrace()
    const request = { model: 'gpt-4.1', input: [{ role: 'user', content: 'Hi' }] }
    const id = requestId(trace, request)
    fixture(request.input, 0).content = 'Changed'
    trace.recordResponse(id, { id: 'resp_1', output: [], usage: null })
    trace.end()
    trace.end()
    expect(trace.recordResponse(id, { id: 'late' })).toEqual({ success: false, reason: 'TRACE_ENDED' })
    expect(postMessage.mock.calls.map(([message]) => message.data.type)).toEqual(['trace.start', 'model.request', 'model.response', 'trace.end'])
    expect(fixture(postMessage.mock.calls, 1)[0].data).toMatchObject({ payload: { input: [{ content: 'Hi' }] } })
  })

  it.each(['model', 'tool'])('records a single terminal error after %s failure', (stage) => {
    const postMessage = captureMessages()
    const trace = createTraceSdk().startTrace()
    const id = requestId(trace, { model: 'gpt-4.1', input: [] })
    if (stage === 'tool')
      trace.recordResponse(id, { id: 'resp_1', output: [{ type: 'function_call', call_id: 'call_1' }] })
    expect(trace.fail(new Error(`${stage} failed`))).toEqual({ success: true })
    expect(trace.fail(new Error('again'))).toEqual({ success: true })
    expect(trace.end()).toEqual({ success: true })
    const events = postMessage.mock.calls.map(([message]) => message.data)
    expect(events.at(-1)).toMatchObject({ type: 'trace.error', payload: { message: `${stage} failed` } })
    expect(events.filter(event => event.type === 'trace.error' || event.type === 'trace.end')).toHaveLength(1)
  })

  it('propagates explicit failure attribution and cancellation', () => {
    const postMessage = captureMessages()
    const trace = createTraceSdk().startTrace()
    const id = requestId(trace, { model: 'gpt-4.1', input: [] })
    trace.fail('model failed', { requestId: id })
    expect(fixture(postMessage.mock.calls, postMessage.mock.calls.length - 1)[0].data).toMatchObject({ payload: { message: 'model failed', requestId: id } })
    const cancelled = createTraceSdk().startTrace()
    cancelled.end('cancelled')
    expect(fixture(postMessage.mock.calls, postMessage.mock.calls.length - 1)[0].data).toMatchObject({ type: 'trace.end', status: 'cancelled' })
  })

  it('records explicit tool failures and preserves empty output', () => {
    const postMessage = captureMessages()
    const trace = createTraceSdk().startTrace()
    trace.recordToolResult({ callId: 'tool-1', output: '', status: 'failed', message: 'timeout' })
    expect(fixture(postMessage.mock.calls, postMessage.mock.calls.length - 1)[0].data).toMatchObject({ payload: { callId: 'tool-1', output: '', status: 'failed', message: 'timeout' } })
  })

  it('keeps the request ID available when delivery fails so a later response is observable', () => {
    const postMessage = captureMessages()
    const trace = createTraceSdk().startTrace()
    postMessage.mockImplementationOnce(() => {
      throw new Error('temporary delivery failure')
    })
    const recorded = trace.recordRequest({ model: 'gpt-4.1', input: [] })
    expect(recorded.success).toBeFalsy()
    expect(recorded.requestId.length).toBeGreaterThan(0)
    expect(trace.recordResponse(recorded.requestId, { status: 'completed', output: [] })).toEqual({ success: true })
    expect(fixture(postMessage.mock.calls, postMessage.mock.calls.length - 1)[0].data).toMatchObject({ type: 'model.response', requestId: recorded.requestId, sequence: 2 })
  })

  it('reports invalid payloads without consuming a sequence', () => {
    const postMessage = captureMessages()
    const trace = createTraceSdk().startTrace()
    const circular = { self: {} }
    circular.self = circular
    expect(trace.recordResponse('request-1', circular).success).toBeFalsy()
    expect(trace.recordToolResult({ callId: '', output: 'x' }).success).toBeFalsy()
    expect(trace.recordResponse('request-1', { id: 'resp_1', output: [] })).toEqual({ success: true })
    expect(postMessage.mock.calls.map(([message]) => message.data.sequence)).toEqual([1, 2])
  })

  it('records large JSON responses without a size gate', () => {
    const postMessage = captureMessages()
    const trace = createTraceSdk().startTrace()
    const response = { output: 'x'.repeat(1024 * 1024 + 1) }
    expect(trace.recordResponse('request-1', response)).toEqual({ success: true })
    expect(fixture(postMessage.mock.calls, 1)[0].data).toMatchObject({ payload: response })
  })

  it('does not throw when the page has no receiver or postMessage fails', () => {
    const postMessage = captureMessages()
    const trace = createTraceSdk().startTrace()
    const id = requestId(trace, { model: 'gpt-4.1', input: [] })
    expect(postMessage).toHaveBeenCalledTimes(2)
    postMessage.mockImplementation(() => {
      throw new Error('delivery failed')
    })
    expect(trace.recordResponse(id, { id: 'resp_1' })).toEqual({ success: false, reason: 'DELIVERY_FAILED' })
  })
})

function fixture<T>(items: readonly T[] = [], index = 0): T {
  const value = items[index]
  if (isUndefined(value))
    throw new Error(`Expected fixture item ${index}`)
  return value
}
