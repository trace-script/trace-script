import type { TraceEventEnvelope } from '@trace-script/metadata'
import type { CallRecord } from './types'
import { isArray, isObject } from '@trace-script/shared'
import { conflict, emptyCall } from './call'
import { modelMetadata, responseStatus } from './metadata'
import { callTiming, recordId, responseTokens } from './metrics'

function applyModelRequest(call: CallRecord, request: Extract<TraceEventEnvelope, { type: 'model.request' }>): void {
  call.input = JSON.stringify(request.payload, null, 2)
  call.model = modelMetadata(request, 'model') || '—'
  call.agent = modelMetadata(request, 'agent') || '—'
  call.name = modelMetadata(request, 'name') || (call.model === '—' ? 'Model call' : call.model)
}

function applyModelResponse(call: CallRecord, response: Extract<TraceEventEnvelope, { type: 'model.response' }>, hasRequest: boolean): void {
  call.output = JSON.stringify(response.payload, null, 2)
  call.model = call.model === '—' ? modelMetadata(response, 'model') || '—' : call.model
  call.agent = call.agent === '—' ? modelMetadata(response, 'agent') || '—' : call.agent
  if (!hasRequest)
    call.name = modelMetadata(response, 'name') || (call.model === '—' ? 'Model call' : call.model)
  call.status = responseStatus(response)
  if (call.status === 'unknown' && hasRequest)
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

export function modelCall(traceId: string, key: string, sources: TraceEventEnvelope[], identity: 'request' | 'event' = 'event'): CallRecord {
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
  if (request)
    applyModelRequest(call, request)
  if (response)
    applyModelResponse(call, response, Boolean(request))
  if (!request)
    call.issues.push('Input missing')
  call.timing = callTiming(request?.timestamp, response?.timestamp)
  return call
}
