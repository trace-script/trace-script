import type { EventFilter, EventRow, TraceEventEnvelope } from '@trace-script/metadata'

export function toEventRow(event: TraceEventEnvelope): EventRow {
  const { version, eventId, traceId, sessionId, parentId, sequence, timestamp, type, name, status, durationMs, agent, model, metrics } = event

  return { version, eventId, traceId, sessionId, sequence, timestamp, type, name, ...(parentId ? { parentId } : {}), ...(status ? { status } : {}), ...(durationMs !== undefined ? { durationMs } : {}), ...(agent ? { agent: { name: agent.name, ...(agent.id ? { id: agent.id } : {}) } } : {}), ...(model ? { model: { name: model.name, ...(model.provider ? { provider: model.provider } : {}) } } : {}), ...(metrics ? { metrics: { ...(metrics.inputTokens !== undefined ? { inputTokens: metrics.inputTokens } : {}), ...(metrics.outputTokens !== undefined ? { outputTokens: metrics.outputTokens } : {}), ...(metrics.totalTokens !== undefined ? { totalTokens: metrics.totalTokens } : {}) } } : {}) }
}
export function matchesFilter(event: EventRow, filter: EventFilter): boolean {
  return (!filter.text || [event.name, event.eventId, event.traceId, event.agent?.name, event.model?.name].join(' ').toLowerCase().includes(filter.text.toLowerCase()))
    && (!filter.type || event.type === filter.type)
    && (!filter.status || (event.status ?? (event.type.endsWith('error') ? 'error' : '')) === filter.status)
    && (!filter.agent || event.agent?.name === filter.agent)
    && (!filter.model || event.model?.name === filter.model)
    && (!filter.traceId || event.traceId === filter.traceId)
    && (!filter.from || event.timestamp >= filter.from)
    && (!filter.to || event.timestamp <= filter.to)
}
export function queryRows(rows: EventRow[], filter: EventFilter): EventRow[] {
  return rows.filter(event => matchesFilter(event, filter)).sort((a, b) => {
    const left = a[filter.sort] ?? ''

    const right = b[filter.sort] ?? ''

    const compared = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right))

    return (compared || a.timestamp.localeCompare(b.timestamp) || a.eventId.localeCompare(b.eventId)) * (filter.descending ? -1 : 1)
  })
}
export function eventTiming(event: EventRow, start: number, end: number): { offset: number, width: number, duration: number } {
  const duration = Math.max(0, event.durationMs ?? 0)

  const range = Math.max(1, end - start)

  return { offset: Math.max(0, Math.min(100, (Date.parse(event.timestamp) - start) / range * 100)), width: Math.min(100, duration / range * 100), duration }
}
