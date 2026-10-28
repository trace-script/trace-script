import type { CallRecord, Timing, TokenAmount, TraceSummary } from '@trace-script/core'
import type { TracePanelFilter } from '@/types/trace-panel'
import { formatMilliseconds, isUndefined } from '@trace-script/shared'

export const TRACE_FILTER_VALUE = { ALL: 'all' } as const
export const TRACE_STATUS = {
  SUCCESS: 'success',
  RUNNING: 'running',
  WAITING: 'waiting',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  INCOMPLETE: 'incomplete',
  INTERRUPTED: 'interrupted',
  UNKNOWN: 'unknown',
  CONFLICT: 'conflict',
} as const

export function matchesCall(call: CallRecord, filter: TracePanelFilter, trace?: TraceSummary): boolean {
  const searchableText = [
    call.name,
    call.traceId,
    call.callId,
    call.agent,
    call.events.map(event => event.eventId).join(' '),
  ].join(' ').toLowerCase()
  const hasConflict = call.associationConflict || trace?.status === TRACE_STATUS.CONFLICT
  const hasError = call.status === TRACE_STATUS.FAILED || trace?.status === TRACE_STATUS.FAILED || hasConflict

  const matchesQuery = !filter.query || searchableText.includes(filter.query.toLowerCase())
  const matchesType = filter.type === TRACE_FILTER_VALUE.ALL || call.kind === filter.type
  const matchesStatus = filter.status === TRACE_FILTER_VALUE.ALL
    || call.status === filter.status
    || (filter.status === TRACE_STATUS.CONFLICT && hasConflict)
  const matchesAgent = filter.agent === TRACE_FILTER_VALUE.ALL || call.agent === filter.agent
  const matchesErrorFilter = !filter.onlyErrors || hasError

  return matchesQuery && matchesType && matchesStatus && matchesAgent && matchesErrorFilter
}

export function matchesTrace(trace: TraceSummary, filter: TracePanelFilter): boolean {
  const searchableText = [
    trace.traceId,
    trace.errors.join(' '),
    trace.events.map(event => event.eventId).join(' '),
  ].join(' ').toLowerCase()
  const hasError = trace.status === TRACE_STATUS.FAILED || trace.status === TRACE_STATUS.CONFLICT

  const matchesQuery = !filter.query || searchableText.includes(filter.query.toLowerCase())
  const matchesType = filter.type === TRACE_FILTER_VALUE.ALL
  const matchesStatus = filter.status === TRACE_FILTER_VALUE.ALL || trace.status === filter.status
  const matchesAgent = filter.agent === TRACE_FILTER_VALUE.ALL
  const matchesErrorFilter = !filter.onlyErrors || hasError

  return matchesQuery && matchesType && matchesStatus && matchesAgent && matchesErrorFilter
}

export function timingText(timing: Timing, running = false): string {
  if (timing.anomalous)
    return 'Time anomaly'
  if (!isUndefined(timing.duration))
    return formatMilliseconds(timing.duration).replace(' ', '')
  return running && timing.start ? 'Running' : '—'
}

export function tokenText(value?: number): string {
  return isUndefined(value) ? '—' : value.toLocaleString('en-US')
}

export function amountText(amount: TokenAmount): string {
  return `${tokenText(amount.value)}${!isUndefined(amount.value) && !amount.complete ? ' (known; incomplete)' : ''}`
}
