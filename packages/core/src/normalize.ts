import type { JsonValue, TraceEventEnvelope } from '@trace-script/metadata'

export interface NormalizedTraceEvents {
  events: TraceEventEnvelope[]
  duplicateCount: number
  conflictingEventIds: string[]
  orphanEventIds: string[]
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function sameJsonValue(left: JsonValue, right: JsonValue): boolean {
  if (left === right)
    return true
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null)
    return false
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length)
      return false
    return left.every((value, index) => {
      const other = right[index]
      return other !== undefined && sameJsonValue(value, other)
    })
  }
  const keys = Object.keys(left)
  if (keys.length !== Object.keys(right).length)
    return false
  return keys.every((key) => {
    const value = left[key]
    const other = right[key]
    return Object.hasOwn(right, key) && value !== undefined && other !== undefined && sameJsonValue(value, other)
  })
}

export function compareTraceEvents(left: TraceEventEnvelope, right: TraceEventEnvelope): number {
  return compareText(left.sessionId, right.sessionId)
    || compareText(left.traceId, right.traceId)
    || left.sequence - right.sequence
    || Date.parse(left.timestamp) - Date.parse(right.timestamp)
    || compareText(left.eventId, right.eventId)
}

export function sortTraceEvents(events: readonly TraceEventEnvelope[]): TraceEventEnvelope[] {
  return [...events].sort(compareTraceEvents)
}

export function normalizeTraceEvents(events: readonly TraceEventEnvelope[]): NormalizedTraceEvents {
  const unique = new Map<string, TraceEventEnvelope>()
  const conflicts = new Set<string>()
  let duplicateCount = 0

  for (const event of events) {
    const existing = unique.get(event.eventId)
    if (existing) {
      duplicateCount++
      if (!sameJsonValue(existing, event))
        conflicts.add(event.eventId)
    }
    else {
      unique.set(event.eventId, event)
    }
  }

  const normalized = sortTraceEvents([...unique.values()])
  const orphans = new Set<string>()
  const checked = new Set<string>()
  for (const event of normalized) {
    const path: string[] = []
    const positions = new Map<string, number>()
    let current = event
    while (!checked.has(current.eventId)) {
      const cycleStart = positions.get(current.eventId)
      if (cycleStart !== undefined) {
        for (const eventId of path.slice(cycleStart))
          orphans.add(eventId)
        break
      }
      positions.set(current.eventId, path.length)
      path.push(current.eventId)
      if (!current.parentId)
        break
      const parent = unique.get(current.parentId)
      if (!parent || parent.sessionId !== current.sessionId || parent.traceId !== current.traceId || parent.eventId === current.eventId) {
        orphans.add(current.eventId)
        break
      }
      current = parent
    }
    for (const eventId of path)
      checked.add(eventId)
  }
  const orphanEventIds = normalized.filter(event => orphans.has(event.eventId)).map(event => event.eventId)

  return { events: normalized, duplicateCount, conflictingEventIds: [...conflicts], orphanEventIds }
}
