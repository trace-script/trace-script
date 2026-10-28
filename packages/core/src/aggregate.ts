import type { TraceEventEnvelope } from '@trace-script/metadata'
import { isArray, isNumber, isObject, isString, isUndefined } from '@trace-script/shared'

export type CallStatus = 'running' | 'waiting' | 'success' | 'failed' | 'cancelled' | 'incomplete' | 'interrupted' | 'unknown'
export type TraceStatus = 'running' | 'success' | 'failed' | 'cancelled' | 'conflict'

export interface Tokens {
  input?: number
  output?: number
  total?: number
}

export interface TokenAmount {
  value?: number
  complete: boolean
}

export interface UsageSummary {
  input: TokenAmount
  output: TokenAmount
  total: TokenAmount
}

export interface Timing {
  start?: string
  end?: string
  duration?: number
  anomalous: boolean
}

export interface CallRecord {
  id: string
  traceId: string
  kind: 'model' | 'tool'
  callId: string
  name: string
  model: string
  agent: string
  status: CallStatus
  input?: string
  output?: string
  declaration?: string
  parentId?: string
  errors: string[]
  issues: string[]
  events: TraceEventEnvelope[]
  conflicts: TraceEventEnvelope[]
  tokens: Tokens
  usage?: string
  usageEventId?: string
  timing: Timing
  associationConflict: boolean
}

export interface TraceSummary {
  id: string
  traceId: string
  kind: 'trace'
  status: TraceStatus
  calls: CallRecord[]
  events: TraceEventEnvelope[]
  conflicts: TraceEventEnvelope[]
  errors: string[]
  issues: string[]
  timing: Timing
  tokens: UsageSummary
}

export type TraceRecord = CallRecord | TraceSummary

export function recordId(traceId: string, kind: 'trace' | 'model' | 'tool', key = ''): string {
  return JSON.stringify([traceId, kind, key])
}

export function compareEvents(a: TraceEventEnvelope, b: TraceEventEnvelope): number {
  return a.sequence - b.sequence || Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.eventId.localeCompare(b.eventId)
}

function eventContent(event: TraceEventEnvelope): string {
  // Object key order is not part of JSON event identity.
  return JSON.stringify(event, (_, value) => {
    if (isObject(value) && !isArray(value))
      return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0))
    return value
  })
}

export function callTiming(start?: string, end?: string): Timing {
  if (!start || !end)
    return { start, end, anomalous: false }
  const duration = Date.parse(end) - Date.parse(start)
  if (!isNumber(duration) || duration < 0)
    return { start, end, anomalous: true }
  return { start, end, duration, anomalous: false }
}

function validToken(value: number): boolean {
  return Number.isInteger(value) && value >= 0
}

function responseTokens(event: Extract<TraceEventEnvelope, { type: 'model.response' }>): Tokens {
  const usage = event.payload.usage
  if (!isObject(usage) || isArray(usage))
    return {}
  const input = 'input_tokens' in usage ? usage.input_tokens : usage.prompt_tokens
  const output = 'output_tokens' in usage ? usage.output_tokens : usage.completion_tokens
  const result: Tokens = {}
  if (isNumber(input) && validToken(input))
    result.input = input
  if (isNumber(output) && validToken(output))
    result.output = output
  if (isNumber(usage.total_tokens) && validToken(usage.total_tokens))
    result.total = usage.total_tokens
  else if (!('total_tokens' in usage) && !isUndefined(result.input) && !isUndefined(result.output) && validToken(result.input + result.output))
    result.total = result.input + result.output
  return result
}

export function sumUsage(calls: readonly CallRecord[]): UsageSummary {
  const models = calls.filter(call => call.kind === 'model')
  function sum(key: keyof Tokens): TokenAmount {
    const values = models.flatMap((call) => {
      const value = call.tokens[key]
      return isUndefined(value) ? [] : [value]
    })
    const value = values.reduce((total, value) => total + value, 0)
    if (!values.length || !validToken(value))
      return { complete: false }
    return { value, complete: models.length > 0 && values.length === models.length }
  }
  return { input: sum('input'), output: sum('output'), total: sum('total') }
}

function modelMetadata(event: Extract<TraceEventEnvelope, { type: 'model.request' | 'model.response' }>, key: 'name' | 'model' | 'agent'): string {
  const trace = event.payload.trace
  const nested = isObject(trace) && !isArray(trace) ? trace[key] : undefined
  const value = nested ?? event.payload[key]
  return isString(value) ? value : ''
}

function responseStatus(event: Extract<TraceEventEnvelope, { type: 'model.response' }>): CallStatus {
  const status = event.payload.status
  if (status === 'failed' || event.payload.error)
    return 'failed'
  if (status === 'cancelled')
    return 'cancelled'
  if (status === 'completed' || status === 'success')
    return 'success'
  if (status === 'incomplete')
    return 'incomplete'
  return 'unknown'
}

function emptyCall(traceId: string, kind: 'model' | 'tool', key: string): CallRecord {
  return {
    id: recordId(traceId, kind, key),
    traceId,
    kind,
    callId: key,
    name: kind === 'model' ? 'Model call' : 'Tool call',
    model: '—',
    agent: '—',
    status: kind === 'model' ? 'running' : 'waiting',
    errors: [],
    issues: [],
    events: [],
    conflicts: [],
    tokens: {},
    timing: { anomalous: false },
    associationConflict: false,
  }
}

function conflict(call: CallRecord, message: string): void {
  call.associationConflict = true
  if (!call.issues.includes(message))
    call.issues.push(message)
}

function modelCall(traceId: string, key: string, sources: TraceEventEnvelope[], identity: 'request' | 'event' = 'event'): CallRecord {
  const call = emptyCall(traceId, 'model', key)
  call.id = recordId(traceId, 'model', JSON.stringify([identity, key]))
  call.events = sources
  const requests = sources.filter(event => event.type === 'model.request')
  const responses = sources.filter(event => event.type === 'model.response')
  const request = requests[0]
  const response = responses[0]
  if (requests.length > 1)
    conflict(call, 'Request identifier reused: multiple requests')
  if (responses.length > 1)
    conflict(call, 'Multiple final responses: association conflict')
  if (request?.type === 'model.request') {
    call.input = JSON.stringify(request.payload, null, 2)
    call.model = modelMetadata(request, 'model') || '—'
    call.agent = modelMetadata(request, 'agent') || '—'
    call.name = modelMetadata(request, 'name') || call.model.replace(/^—$/, 'Model call')
  }
  if (response?.type === 'model.response') {
    call.output = JSON.stringify(response.payload, null, 2)
    call.model = call.model === '—' ? modelMetadata(response, 'model') || '—' : call.model
    call.agent = call.agent === '—' ? modelMetadata(response, 'agent') || '—' : call.agent
    if (!request)
      call.name = modelMetadata(response, 'name') || (call.model === '—' ? 'Model call' : call.model)
    call.status = responseStatus(response)
    if (call.status === 'unknown' && request)
      call.status = 'success'
    if (response.payload.error)
      call.errors.push(JSON.stringify(response.payload.error, null, 2))
    const usage = response.payload.usage
    if (isObject(usage) && !isArray(usage)) {
      call.usage = JSON.stringify(usage, null, 2)
      call.usageEventId = response.eventId
    }
    call.tokens = responseTokens(response)
  }
  if (!request)
    call.issues.push('Input missing')
  call.timing = callTiming(request?.timestamp, response?.timestamp)
  return call
}

function aggregateTrace(traceId: string, events: TraceEventEnvelope[], conflicts: TraceEventEnvelope[]): TraceSummary {
  const calls: CallRecord[] = []
  const identified = new Map<string, TraceEventEnvelope[]>()
  const legacyPending: TraceEventEnvelope[] = []
  const ambiguousRequests = new Set<string>()
  for (const event of events) {
    if (event.type !== 'model.request' && event.type !== 'model.response')
      continue
    if (event.requestId) {
      const group = identified.get(event.requestId) ?? []
      group.push(event)
      identified.set(event.requestId, group)
    }
    else if (event.type === 'model.request') {
      legacyPending.push(event)
    }
    else if (legacyPending.length === 1) {
      const request = legacyPending.pop()!
      calls.push(modelCall(traceId, request.eventId, [request, event]))
    }
    else {
      const call = modelCall(traceId, event.eventId, [event])
      call.issues.push(legacyPending.length > 1 ? 'Ambiguous legacy response: multiple unpaired requests' : 'No matching request; explicit and legacy identifiers are never mixed')
      if (legacyPending.length > 1) {
        for (const request of legacyPending)
          ambiguousRequests.add(request.eventId)
      }
      calls.push(call)
    }
  }
  for (const [key, sources] of identified)
    calls.push(modelCall(traceId, key, sources, 'request'))
  for (const request of legacyPending) {
    const call = modelCall(traceId, request.eventId, [request])
    if (ambiguousRequests.has(request.eventId))
      call.issues.push('Ambiguous legacy response: multiple unpaired requests')
    calls.push(call)
  }

  const tools = new Map<string, CallRecord>()
  const modelResponses = calls.flatMap((model) => {
    const response = model.events.find(event => event.type === 'model.response')
    return response?.type === 'model.response' ? [{ model, response }] : []
  }).sort((a, b) => compareEvents(a.response, b.response))
  for (const { model, response } of modelResponses) {
    if (!isArray(response.payload.output))
      continue
    for (const item of response.payload.output) {
      if (!isObject(item) || isArray(item) || (item.type !== 'function_call' && item.type !== 'custom_tool_call'))
        continue
      if (!isString(item.call_id) || !item.call_id) {
        model.issues.push('Unassociated tool declaration: call_id missing (see complete Response)')
        continue
      }
      const existing = tools.get(item.call_id)
      if (existing) {
        conflict(existing, 'Tool identifier reused: multiple declarations')
        if (!existing.events.includes(response))
          existing.events.push(response)
        continue
      }
      const tool = emptyCall(traceId, 'tool', item.call_id)
      tool.name = isString(item.name) && item.name ? item.name : 'Tool call'
      const argumentsValue = item.type === 'custom_tool_call' ? item.input : item.arguments
      if (!isUndefined(argumentsValue))
        tool.input = isString(argumentsValue) ? argumentsValue : JSON.stringify(argumentsValue, null, 2)
      else
        tool.issues.push('Arguments missing from tool declaration')
      tool.declaration = JSON.stringify(item, null, 2)
      tool.parentId = model.id
      tool.model = model.model
      tool.agent = model.agent
      tool.events.push(response)
      tool.timing = callTiming(response.timestamp)
      if (model.associationConflict)
        conflict(tool, 'Parent model call has an association conflict')
      tools.set(item.call_id, tool)
    }
  }
  for (const event of events) {
    if (event.type !== 'tool.result')
      continue
    let tool = tools.get(event.payload.callId)
    if (!tool) {
      tool = emptyCall(traceId, 'tool', event.payload.callId)
      tool.issues.push('Input missing: tool declaration not recorded')
      tools.set(event.payload.callId, tool)
    }
    tool.events.push(event)
    if (!isUndefined(tool.output)) {
      conflict(tool, 'Multiple tool results: association conflict')
      continue
    }
    tool.output = event.payload.output
    tool.status = event.payload.status ?? (isUndefined(tool.declaration) ? 'unknown' : 'success')
    if (event.payload.message)
      tool.errors.push(event.payload.message)
    tool.timing = callTiming(tool.timing.start, event.timestamp)
  }
  calls.push(...tools.values())

  const starts = events.filter(event => event.type === 'trace.start')
  const terminals = events.filter(event => event.type === 'trace.end' || event.type === 'trace.error')
  const terminal = terminals[0]
  const status = (event: TraceEventEnvelope): TraceStatus => event.type === 'trace.error' ? 'failed' : event.type === 'trace.end' && event.status === 'cancelled' ? 'cancelled' : 'success'
  const trace: TraceSummary = {
    id: recordId(traceId, 'trace'),
    traceId,
    kind: 'trace',
    calls,
    events,
    conflicts,
    errors: events.flatMap(event => event.type === 'trace.error' ? [event.payload.message] : []),
    issues: [],
    status: terminal ? status(terminal) : 'running',
    timing: callTiming(starts[0]?.timestamp, terminal?.timestamp),
    tokens: { input: { complete: false }, output: { complete: false }, total: { complete: false } },
  }
  if (!starts.length)
    trace.issues.push('Trace start missing')
  if (starts.length > 1) {
    trace.issues.push('Multiple Trace start events')
    trace.timing = { start: starts[0]?.timestamp, end: terminal?.timestamp, anomalous: false }
  }
  if (terminals.some(event => status(event) !== trace.status)) {
    trace.status = 'conflict'
    trace.issues.push('Conflicting Trace terminal events')
    trace.timing = { start: starts[0]?.timestamp, anomalous: false }
  }
  else if (terminals.length > 1) {
    trace.status = 'conflict'
    trace.issues.push('Multiple Trace terminal events: lifecycle conflict')
    trace.timing = { start: starts[0]?.timestamp, anomalous: false }
  }
  if (conflicts.some((event) => {
    const first = events.find(source => source.eventId === event.eventId)
    return event.type === 'trace.end' || event.type === 'trace.error' || first?.type === 'trace.end' || first?.type === 'trace.error'
  })) {
    trace.status = 'conflict'
    trace.issues.push('Conflicting Trace terminal content')
    trace.timing = { start: starts[0]?.timestamp, anomalous: false }
  }
  for (const error of events) {
    if (error.type !== 'trace.error')
      continue
    const target = calls.find(call => error.payload.requestId
      ? call.kind === 'model' && call.events.some(event => (event.type === 'model.request' || event.type === 'model.response') && event.requestId === error.payload.requestId)
      : error.payload.callId ? call.kind === 'tool' && call.callId === error.payload.callId : false)
    if (target) {
      target.errors.push(error.payload.message)
      target.events.push(error)
      target.status = 'failed'
      if (!target.timing.end)
        target.timing = callTiming(target.timing.start, error.timestamp)
    }
    else if (error.payload.requestId || error.payload.callId) {
      trace.issues.push(`Error target not found: ${error.payload.requestId ?? error.payload.callId}`)
    }
  }
  for (const call of calls) {
    call.events.sort(compareEvents)
    call.conflicts = conflicts.filter(event => call.events.some(source => source.eventId === event.eventId))
    if (call.conflicts.length)
      conflict(call, 'Same event ID has conflicting content; first received value retained')
    if (call.kind === 'tool' && calls.find(parent => parent.id === call.parentId)?.associationConflict)
      conflict(call, 'Parent model call has an association conflict')
    if (call.associationConflict) {
      call.tokens = {}
      call.timing = { start: call.timing.start, end: call.timing.end, anomalous: call.timing.anomalous }
    }
    if (isUndefined(call.output) && call.status !== 'failed') {
      if (trace.status === 'failed') {
        call.status = 'interrupted'
        call.issues.push('Interrupted; specific cause not located')
      }
      else if (trace.status === 'cancelled') {
        call.status = 'cancelled'
      }
      else if (terminals.length) {
        call.status = 'incomplete'
        call.issues.push('Output missing after Trace ended')
      }
    }
    if (call.timing.anomalous)
      call.issues.push('Time anomaly: completion precedes start; original timestamps preserved')
  }
  if (conflicts.length)
    trace.issues.push('Conflicting event content (see Raw Events); first received values retained')
  if (trace.timing.anomalous)
    trace.issues.push('Time anomaly: Trace completion precedes start')
  calls.sort((a, b) => compareEvents(a.events[0]!, b.events[0]!) || a.id.localeCompare(b.id))
  trace.tokens = sumUsage(calls)
  return trace
}

/** Derive display records from raw events. No independent mutable call ledger. */
export function aggregateEvents(input: readonly TraceEventEnvelope[]): TraceSummary[] {
  const firstById = new Map<string, TraceEventEnvelope>()
  const conflicting: TraceEventEnvelope[] = []
  for (const event of input) {
    const first = firstById.get(event.eventId)
    if (!first)
      firstById.set(event.eventId, event)
    else if (eventContent(first) !== eventContent(event) && !conflicting.some(other => eventContent(other) === eventContent(event)))
      conflicting.push(event)
  }
  const grouped = new Map<string, TraceEventEnvelope[]>()
  for (const event of firstById.values()) {
    const group = grouped.get(event.traceId) ?? []
    group.push(event)
    grouped.set(event.traceId, group)
  }
  return [...grouped].sort(([a], [b]) => a.localeCompare(b)).map(([traceId, events]) => aggregateTrace(
    traceId,
    [...events].sort(compareEvents),
    conflicting.filter(event => firstById.get(event.eventId)?.traceId === traceId || event.traceId === traceId),
  ))
}
