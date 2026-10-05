import type { JsonValue, TraceEventEnvelope, TraceEventType, TraceStatus } from '@trace-script/metadata'
import { normalizeTraceEvents } from '@/normalize'

export type TraceSpanKind = 'session' | 'model' | 'tool' | 'agent' | 'span'

export interface TraceSpan {
  spanId: string
  startEventId: string
  sessionId: string
  traceId: string
  name: string
  kind: TraceSpanKind
  status: TraceStatus
  startedAt: string
  eventIds: string[]
  incomplete: boolean
  timingConflict: boolean
  parentId?: string
  endEventId?: string
  endedAt?: string
  durationMs?: number
}

export interface TraceMessage {
  messageId: string
  startEventId: string
  sessionId: string
  traceId: string
  content: string
  status: TraceStatus
  eventIds: string[]
  incomplete: boolean
  contentMismatch: boolean
  completedEventId?: string
}

const spanStartKinds: Partial<Record<TraceEventType, TraceSpanKind>> = {
  'session.start': 'session',
  'model.request': 'model',
  'tool.start': 'tool',
  'agent.start': 'agent',
  'span.start': 'span',
}

const terminalKinds: Partial<Record<TraceEventType, TraceSpanKind>> = {
  'session.end': 'session',
  'model.response': 'model',
  'model.error': 'model',
  'tool.result': 'tool',
  'tool.error': 'tool',
  'agent.end': 'agent',
  'span.end': 'span',
  'span.error': 'span',
}

function terminalStatus(event: TraceEventEnvelope): TraceStatus {
  if (event.type.endsWith('.error') || event.status === 'error')
    return 'error'
  if (event.status === 'cancelled')
    return 'cancelled'
  return 'success'
}

export function aggregateSpans(events: readonly TraceEventEnvelope[]): TraceSpan[] {
  const normalized = normalizeTraceEvents(events).events
  const spans = new Map<string, TraceSpan>()
  for (const event of normalized) {
    const kind = spanStartKinds[event.type]
    if (!kind)
      continue
    spans.set(event.eventId, {
      spanId: event.eventId,
      startEventId: event.eventId,
      sessionId: event.sessionId,
      traceId: event.traceId,
      name: event.name,
      kind,
      status: event.status ?? 'running',
      startedAt: event.timestamp,
      eventIds: [event.eventId],
      incomplete: true,
      timingConflict: false,
      ...(event.parentId ? { parentId: event.parentId } : {}),
    })
  }

  for (const event of normalized) {
    const kind = terminalKinds[event.type]
    if (!kind || !event.parentId)
      continue
    const span = spans.get(event.parentId)
    if (!span || span.kind !== kind || span.sessionId !== event.sessionId || span.traceId !== event.traceId)
      continue
    span.eventIds.push(event.eventId)
    if (!span.incomplete)
      continue
    const elapsed = Date.parse(event.timestamp) - Date.parse(span.startedAt)
    span.status = terminalStatus(event)
    span.endEventId = event.eventId
    span.endedAt = event.timestamp
    span.durationMs = event.durationMs ?? Math.max(0, elapsed)
    span.timingConflict = elapsed < 0
    span.incomplete = false
  }

  return [...spans.values()]
}

function payloadText(payload: JsonValue, key: 'content' | 'delta'): string {
  if (typeof payload === 'object' && payload !== null && !Array.isArray(payload) && typeof payload[key] === 'string')
    return payload[key]
  return ''
}

export function aggregateMessages(events: readonly TraceEventEnvelope[]): TraceMessage[] {
  const normalized = normalizeTraceEvents(events).events
  const messages = new Map<string, TraceMessage>()
  const deltas = new Map<string, string>()

  for (const event of normalized) {
    if (event.type !== 'message.assistant.start')
      continue
    messages.set(event.eventId, {
      messageId: event.eventId,
      startEventId: event.eventId,
      sessionId: event.sessionId,
      traceId: event.traceId,
      content: '',
      status: event.status ?? 'running',
      eventIds: [event.eventId],
      incomplete: true,
      contentMismatch: false,
    })
    deltas.set(event.eventId, '')
  }

  for (const event of normalized) {
    if ((event.type !== 'message.assistant.delta' && event.type !== 'message.assistant.completed') || !event.parentId)
      continue
    const message = messages.get(event.parentId)
    if (!message || message.sessionId !== event.sessionId || message.traceId !== event.traceId)
      continue
    message.eventIds.push(event.eventId)
    const payload = event.payload ?? ''
    if (event.type === 'message.assistant.delta') {
      const content = (deltas.get(message.messageId) ?? '') + payloadText(payload, 'delta')
      deltas.set(message.messageId, content)
      if (message.incomplete)
        message.content = content
    }
    else if (message.incomplete) {
      if (typeof payload === 'object' && payload !== null && !Array.isArray(payload) && typeof payload.content === 'string')
        message.content = payload.content
      else
        message.content = deltas.get(message.messageId) ?? ''
      message.status = terminalStatus(event)
      message.completedEventId = event.eventId
      message.incomplete = false
    }
  }

  for (const message of messages.values()) {
    const delta = deltas.get(message.messageId) ?? ''
    message.contentMismatch = !message.incomplete && delta.length > 0 && delta !== message.content
  }
  return [...messages.values()]
}
