import type { JsonValue, ResponseRequest } from '@trace-script/metadata'
import type { TraceHandle } from './client'
import { inspectJson } from '@trace-script/core'
import { responseItemSchema, responseRequestSchema, responseUsageSchema } from '@trace-script/metadata'

export interface ResponseObserver {
  item: (raw: JsonValue, done?: boolean) => void
  response: (raw: JsonValue) => void
  stream: (raw: JsonValue) => void
  fail: (message: string) => void
}

const traceCalls = new WeakMap<TraceHandle, Map<string, string>>()

/** One adapter per Responses API request. No network requests or API keys are needed. */
export function observeOpenAIResponse(trace: TraceHandle, request: ResponseRequest): ResponseObserver {
  let input: ResponseRequest
  try {
    input = responseRequestSchema.parse(inspectJson(request))
  }
  catch {
    trace.emit({ type: 'error', name: 'Invalid OpenAI observation', error: { message: 'Request is not a supported JSON Responses request' } })
    return { item() {}, response() {}, stream() {}, fail() {} }
  }

  const started = performance.now()

  const model = { name: input.model, provider: 'openai' }

  const requestId = trace.emit({ type: 'model.request', name: input.model, model, payload: input, status: 'running' })

  const items = new Map<string, string>()

  const completed = new Set<string>()

  const calls = traceCalls.get(trace) ?? new Map<string, string>()
  traceCalls.set(trace, calls)

  const sequences = new Set<number>()

  let ended = false

  function item(raw: JsonValue, done = true): void {
    if (ended)
      return
    const parsed = responseItemSchema.safeParse(inspectJson(raw))

    if (!parsed.success) {
      trace.emit({ type: 'log', name: 'OpenAI item', parentId: requestId, model, payload: raw })

      return
    }

    const value = parsed.data

    const key = value.id ?? ('call_id' in value && typeof value.call_id === 'string' ? value.call_id : crypto.randomUUID())

    if (done && completed.has(key))
      return

    if (value.type === 'function_call_output') {
      trace.emit({ type: 'tool.result', name: value.call_id, parentId: calls.get(value.call_id) ?? requestId, model, payload: value, status: 'success' })
    }
    else if (value.type === 'function_call') {
      if (!items.has(key)) {
        const id = trace.emit({ type: 'tool.start', name: value.name, parentId: requestId, model, payload: value, status: 'running' })

        items.set(key, id)

        calls.set(value.call_id, id)
      }

      if (done)
        trace.emit({ type: 'log', name: `${value.name} arguments`, parentId: items.get(key) ?? requestId, payload: value })
    }
    else if (value.role !== 'assistant') {
      trace.emit({ type: value.role === 'user' ? 'message.user' : 'log', name: value.role, parentId: requestId, payload: value })
    }
    else {
      if (!items.has(key))
        items.set(key, trace.emit({ type: 'message.assistant.start', name: 'Assistant', parentId: requestId, model, payload: value, status: 'running' }))

      if (done) {
        const content = typeof value.content === 'string' ? value.content : value.content.map(part => part.type === 'output_text' || part.type === 'input_text' ? part.text : part.type === 'refusal' ? part.refusal : '').join('')

        trace.emit({ type: 'message.assistant.completed', name: 'Assistant', parentId: items.get(key) ?? requestId, model, payload: { ...value, content, items: value.content }, status: 'success' })
      }
    }

    if (done)
      completed.add(key)
  }

  function response(raw: JsonValue): void {
    const value = inspectJson(raw)

    if (!value || typeof value !== 'object' || Array.isArray(value) || ended)
      return

    if (Array.isArray(value.output)) {
      for (const output of value.output) item(output)
    }

    const usage = responseUsageSchema.safeParse(value.usage)

    const status = value.status === 'failed' ? 'error' : value.status === 'cancelled' ? 'cancelled' : value.status === 'incomplete' ? 'pending' : 'success'

    trace.emit({ type: status === 'error' ? 'model.error' : 'model.response', name: input.model, parentId: requestId, model, status, durationMs: performance.now() - started, payload: value, ...(usage.success ? { metrics: { inputTokens: usage.data.input_tokens, outputTokens: usage.data.output_tokens, totalTokens: usage.data.total_tokens } } : {}) })

    ended = true
  }

  function stream(raw: JsonValue): void {
    const event = inspectJson(raw)

    if (!event || typeof event !== 'object' || Array.isArray(event) || ended)
      return

    if (typeof event.sequence_number === 'number') {
      if (sequences.has(event.sequence_number))
        return

      sequences.add(event.sequence_number)
    }

    if (event.type === 'response.completed' || event.type === 'response.failed' || event.type === 'response.incomplete') {
      if (event.response)
        response(event.response)

      return
    }

    if ((event.type === 'response.output_item.added' || event.type === 'response.output_item.done') && event.item) {
      item(event.item, event.type.endsWith('.done'))

      return
    }

    if (event.type === 'response.output_text.delta' && typeof event.delta === 'string' && typeof event.item_id === 'string') {
      if (!items.has(event.item_id))
        items.set(event.item_id, trace.emit({ type: 'message.assistant.start', name: 'Assistant', parentId: requestId, model, status: 'running' }))

      trace.emit({ type: 'message.assistant.delta', name: 'Text delta', parentId: items.get(event.item_id) ?? requestId, model, payload: { ...event, delta: event.delta } })

      return
    }

    trace.emit({ type: event.type === 'error' ? 'error' : 'log', name: typeof event.type === 'string' ? event.type : 'OpenAI event', parentId: typeof event.item_id === 'string' ? items.get(event.item_id) ?? requestId : requestId, model, payload: event })
  }

  function protect(operation: () => void): void {
    try {
      operation()
    }
    catch {
      trace.emit({ type: 'error', name: 'Invalid OpenAI observation', parentId: requestId, error: { message: 'Observation rejected; the application request is unaffected' } })
    }
  }
  if (typeof input.input === 'string') {
    trace.emit({ type: 'message.user', name: 'User', parentId: requestId, payload: { type: 'message', role: 'user', content: input.input } })
  }
  else if (Array.isArray(input.input)) {
    for (const value of input.input)
      protect(() => item({ ...value, type: value.type ?? 'message' }))
  }
  return { item: (raw, done) => protect(() => item(raw, done)), response: raw => protect(() => response(raw)), stream: raw => protect(() => stream(raw)), fail(message: string) {
    if (ended)
      return

    ended = true

    trace.emit({ type: 'model.error', name: input.model, parentId: requestId, model, status: 'error', durationMs: performance.now() - started, error: { message } })
  } }
}
