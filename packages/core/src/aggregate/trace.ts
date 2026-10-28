import type { TraceEventEnvelope } from '@trace-script/metadata'
import type { TraceSummary } from './types'
import { collectModelCalls } from './association'
import { attachTraceErrors, createTraceSummary, finalizeCalls } from './lifecycle'
import { compareEvents, sumUsage } from './metrics'
import { collectToolCalls } from './tool'

export function aggregateTrace(traceId: string, events: TraceEventEnvelope[], conflicts: TraceEventEnvelope[]): TraceSummary {
  const models = collectModelCalls(traceId, events)
  const calls = [...models, ...collectToolCalls(traceId, events, models)]
  const trace = createTraceSummary(traceId, events, conflicts, calls)
  attachTraceErrors(trace)
  finalizeCalls(trace)
  // Keep the final trace-level diagnostics after call finalization.
  if (conflicts.length)
    trace.issues.push('Conflicting event content (see Raw Events); first received values retained')
  if (trace.timing.anomalous)
    trace.issues.push('Time anomaly: Trace completion precedes start')
  trace.calls.sort((a, b) => compareEvents(a.events[0]!, b.events[0]!) || a.id.localeCompare(b.id))
  trace.tokens = sumUsage(trace.calls)
  return trace
}
