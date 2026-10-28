import type { TraceEventEnvelope } from '@trace-script/metadata'
import type { CallRecord, TraceSummary } from './types'
import { isUndefined } from '@trace-script/shared'
import { isModelEvent, isTraceTerminal, traceTerminalStatus } from './association'
import { conflict } from './call'
import { callTiming, compareEvents, recordId } from './metrics'

type TraceTerminal = Extract<TraceEventEnvelope, { type: 'trace.end' | 'trace.error' }>
type TraceStart = Extract<TraceEventEnvelope, { type: 'trace.start' }>

export function createTraceSummary(traceId: string, events: TraceEventEnvelope[], conflicts: TraceEventEnvelope[], calls: CallRecord[]): TraceSummary {
  const starts: TraceStart[] = events.filter((event): event is TraceStart => event.type === 'trace.start')
  const terminals: TraceTerminal[] = events.filter(isTraceTerminal)
  const terminal = terminals[0]
  const trace: TraceSummary = {
    id: recordId(traceId, 'trace'),
    traceId,
    kind: 'trace',
    calls,
    events,
    conflicts,
    errors: events.flatMap(event => event.type === 'trace.error' ? [event.payload.message] : []),
    issues: [],
    status: terminal ? traceTerminalStatus(terminal) : 'running',
    timing: callTiming(starts[0]?.timestamp, terminal?.timestamp),
    tokens: { input: { complete: false }, output: { complete: false }, total: { complete: false } },
  }
  if (!starts.length)
    trace.issues.push('Trace start missing')
  if (starts.length > 1) {
    trace.issues.push('Multiple Trace start events')
    trace.timing = { start: starts[0]?.timestamp, end: terminal?.timestamp, anomalous: false }
  }
  if (terminals.some(event => traceTerminalStatus(event) !== trace.status)) {
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
  return trace
}

export function attachTraceErrors(trace: TraceSummary): void {
  for (const error of trace.events) {
    if (error.type !== 'trace.error')
      continue
    const target = trace.calls.find(call => error.payload.requestId
      ? call.kind === 'model' && call.events.some(event => isModelEvent(event) && event.requestId === error.payload.requestId)
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
}

export function finalizeCalls(trace: TraceSummary): void {
  const terminals = trace.events.filter(isTraceTerminal)
  for (const call of trace.calls) {
    call.events.sort(compareEvents)
    call.conflicts = trace.conflicts.filter(event => call.events.some(source => source.eventId === event.eventId))
    if (call.conflicts.length)
      conflict(call, 'Same event ID has conflicting content; first received value retained')
    if (call.kind === 'tool' && trace.calls.find(parent => parent.id === call.parentId)?.associationConflict)
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
}
