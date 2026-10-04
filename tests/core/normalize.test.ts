import { compareTraceEvents, normalizeTraceEvents, sortTraceEvents } from '@trace-script/core'
import { describe, expect, it } from 'vitest'
import { baseEvent, duplicateEvents, outOfOrderEvents, streamingEvents } from '../../fixtures/protocol'

describe('event normalization', () => {
  it('sorts by trace-local sequence before time and event ID without mutating input', () => {
    const original = [...outOfOrderEvents]
    expect(sortTraceEvents(outOfOrderEvents)).toEqual(streamingEvents)
    expect(outOfOrderEvents).toEqual(original)
    expect(compareTraceEvents({ ...baseEvent, sequence: 2, timestamp: '2026-10-04T00:00:00.000Z' }, { ...baseEvent, sequence: 1, timestamp: '2026-10-04T00:00:01.000Z' })).toBeGreaterThan(0)
    const tied = [{ ...baseEvent, eventId: 'b' }, { ...baseEvent, eventId: 'a' }]
    expect(sortTraceEvents(tied).map(event => event.eventId)).toEqual(['a', 'b'])
    expect(compareTraceEvents(baseEvent, { ...baseEvent, timestamp: '2026-10-04T00:00:01.000Z' })).toBeLessThan(0)
  })

  it('groups separate traces before comparing their sequence values', () => {
    const events = [{ ...baseEvent, traceId: 'trace-b', sequence: 1 }, { ...baseEvent, traceId: 'trace-a', sequence: 50 }]
    expect(sortTraceEvents(events).map(event => event.traceId)).toEqual(['trace-a', 'trace-b'])
  })

  it('deduplicates events without inflating the accepted count', () => {
    const result = normalizeTraceEvents(duplicateEvents)
    expect(result.events).toHaveLength(duplicateEvents.length / 2)
    expect(result.duplicateCount).toBe(duplicateEvents.length / 2)
    expect(result.conflictingEventIds).toEqual([])
  })

  it('preserves the first accepted value and records conflicting IDs', () => {
    const result = normalizeTraceEvents([baseEvent, { ...baseEvent, name: 'Changed', sequence: 10 }])
    expect(result.events).toEqual([baseEvent])
    expect(result.duplicateCount).toBe(1)
    expect(result.conflictingEventIds).toEqual([baseEvent.eventId])
  })

  it('compares JSON content independently of object key insertion order', () => {
    const first = { ...baseEvent, payload: { first: 1, nested: [{ a: true, b: null }], last: 'value' } }
    const second = { ...baseEvent, payload: { last: 'value', nested: [{ b: null, a: true }], first: 1 } }
    expect(normalizeTraceEvents([first, second])).toMatchObject({ duplicateCount: 1, conflictingEventIds: [], events: [first] })
    expect(normalizeTraceEvents([first, { ...second, payload: { ...second.payload, nested: [{ b: null, a: false }] } }]).conflictingEventIds).toEqual([baseEvent.eventId])
  })

  it('records missing, cross-trace and self-referencing parents', () => {
    const missing = { ...baseEvent, eventId: 'child', parentId: 'missing' }
    expect(normalizeTraceEvents([missing]).orphanEventIds).toEqual(['child'])
    expect(normalizeTraceEvents([missing, { ...baseEvent, eventId: 'missing' }]).orphanEventIds).toEqual([])
    expect(normalizeTraceEvents([missing, { ...baseEvent, eventId: 'missing', traceId: 'other-trace' }]).orphanEventIds).toEqual(['child'])
    expect(normalizeTraceEvents([{ ...baseEvent, parentId: baseEvent.eventId }]).orphanEventIds).toEqual([baseEvent.eventId])
  })

  it('records every member of a parent cycle without marking an attached child as a cycle member', () => {
    const events = [
      { ...baseEvent, eventId: 'a', parentId: 'b', sequence: 1 },
      { ...baseEvent, eventId: 'b', parentId: 'c', sequence: 2 },
      { ...baseEvent, eventId: 'c', parentId: 'a', sequence: 3 },
      { ...baseEvent, eventId: 'child', parentId: 'b', sequence: 4 },
    ]
    expect(normalizeTraceEvents(events).orphanEventIds).toEqual(['a', 'b', 'c'])
    expect(normalizeTraceEvents([...events].reverse()).orphanEventIds).toEqual(['a', 'b', 'c'])
  })

  it('handles an empty input directly', () => {
    expect(normalizeTraceEvents([])).toEqual({ events: [], duplicateCount: 0, conflictingEventIds: [], orphanEventIds: [] })
  })
})
