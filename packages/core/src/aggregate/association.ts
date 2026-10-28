import type { TraceEventEnvelope } from '@trace-script/metadata'
import type { CallRecord, TraceStatus } from './types'
import { modelCall } from './model'

type ModelEvent = Extract<TraceEventEnvelope, { type: 'model.request' | 'model.response' }>
type TraceTerminal = Extract<TraceEventEnvelope, { type: 'trace.end' | 'trace.error' }>

export function isModelEvent(event: TraceEventEnvelope): event is ModelEvent {
  return event.type === 'model.request' || event.type === 'model.response'
}

export function isTraceTerminal(event: TraceEventEnvelope): event is TraceTerminal {
  return event.type === 'trace.end' || event.type === 'trace.error'
}

export function traceTerminalStatus(event: TraceTerminal): TraceStatus {
  return event.type === 'trace.error' ? 'failed' : event.status === 'cancelled' ? 'cancelled' : 'success'
}

export function collectModelCalls(traceId: string, events: readonly TraceEventEnvelope[]): CallRecord[] {
  const calls: CallRecord[] = []
  const identified = new Map<string, ModelEvent[]>()
  const legacyPending: Extract<TraceEventEnvelope, { type: 'model.request' }>[] = []
  const ambiguousRequests = new Set<string>()
  for (const event of events) {
    if (!isModelEvent(event))
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
  return calls
}
