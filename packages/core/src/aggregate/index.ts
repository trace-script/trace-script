import type { TraceEventEnvelope } from '@trace-script/metadata'
import type { TraceSummary } from './types'
import { stableStringify } from '@trace-script/shared'
import { compareEvents } from './metrics'
import { aggregateTrace } from './trace'

export { callTiming, compareEvents, recordId, sumUsage } from './metrics'
export type * from './types'

/** Derive display records from raw events. No independent mutable call ledger. */
export function aggregateEvents(input: readonly TraceEventEnvelope[]): TraceSummary[] {
  const firstById = new Map<string, TraceEventEnvelope>()
  const conflicting: TraceEventEnvelope[] = []
  for (const event of input) {
    const first = firstById.get(event.eventId)
    if (!first)
      firstById.set(event.eventId, event)
    else if (stableStringify(first) !== stableStringify(event) && !conflicting.some(other => stableStringify(other) === stableStringify(event)))
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
