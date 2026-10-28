import type { TraceEventEnvelope } from '@trace-script/metadata'
import type { CallRecord } from './types'
import { isArray, isObject, isString, isUndefined } from '@trace-script/shared'
import { conflict, emptyCall } from './call'
import { callTiming, compareEvents } from './metrics'

type ModelResponse = Extract<TraceEventEnvelope, { type: 'model.response' }>

export function addToolDeclaration(tools: Map<string, CallRecord>, traceId: string, model: CallRecord, response: ModelResponse, item: object): void {
  if (!('type' in item) || (item.type !== 'function_call' && item.type !== 'custom_tool_call'))
    return
  if (!('call_id' in item) || !isString(item.call_id) || !item.call_id) {
    model.issues.push('Unassociated tool declaration: call_id missing (see complete Response)')
    return
  }
  const existing = tools.get(item.call_id)
  if (existing) {
    conflict(existing, 'Tool identifier reused: multiple declarations')
    if (!existing.events.includes(response))
      existing.events.push(response)
    return
  }
  const tool = emptyCall(traceId, 'tool', item.call_id)
  tool.name = 'name' in item && isString(item.name) && item.name ? item.name : 'Tool call'
  const argumentsValue = item.type === 'custom_tool_call'
    ? ('input' in item ? item.input : undefined)
    : ('arguments' in item ? item.arguments : undefined)
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

function applyToolResult(tools: Map<string, CallRecord>, traceId: string, event: Extract<TraceEventEnvelope, { type: 'tool.result' }>): void {
  let tool = tools.get(event.payload.callId)
  if (!tool) {
    tool = emptyCall(traceId, 'tool', event.payload.callId)
    tool.issues.push('Input missing: tool declaration not recorded')
    tools.set(event.payload.callId, tool)
  }
  tool.events.push(event)
  if (!isUndefined(tool.output)) {
    conflict(tool, 'Multiple tool results: association conflict')
    return
  }
  tool.output = event.payload.output
  tool.status = event.payload.status ?? (isUndefined(tool.declaration) ? 'unknown' : 'success')
  if (event.payload.message)
    tool.errors.push(event.payload.message)
  tool.timing = callTiming(tool.timing.start, event.timestamp)
}

function collectToolDeclarations(traceId: string, models: readonly CallRecord[]): Map<string, CallRecord> {
  const tools = new Map<string, CallRecord>()
  const modelResponses = models.flatMap((model) => {
    const response = model.events.find(event => event.type === 'model.response')
    return response?.type === 'model.response' ? [{ model, response }] : []
  }).sort((a, b) => compareEvents(a.response, b.response))
  for (const { model, response } of modelResponses) {
    if (!isArray(response.payload.output))
      continue
    for (const item of response.payload.output) {
      if (!isObject(item) || isArray(item))
        continue
      addToolDeclaration(tools, traceId, model, response, item)
    }
  }
  return tools
}

export function collectToolCalls(traceId: string, events: readonly TraceEventEnvelope[], models: readonly CallRecord[]): CallRecord[] {
  const tools = collectToolDeclarations(traceId, models)
  for (const event of events) {
    if (event.type !== 'tool.result')
      continue
    applyToolResult(tools, traceId, event)
  }
  return [...tools.values()]
}
