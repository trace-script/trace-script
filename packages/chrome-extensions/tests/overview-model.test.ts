import type { TraceEventEnvelope } from '@trace-script/metadata'
import { aggregateEvents } from '@trace-script/core'
import { describe, expect, it } from 'vitest'
import { previewEvents } from '@/preview'
import { toOverviewItems } from '@/utils/overview-model'

describe('call timeline projection', () => {
  it('keeps source identities, type groups and observed intervals', () => {
    const calls = aggregateEvents(previewEvents).flatMap(trace => trace.calls)
    const items = toOverviewItems(calls)
    expect(items.map(item => item.id)).toEqual(calls.map(call => call.id))
    expect(items.map(item => item.group)).toEqual(['model', 'tool', 'model'])
    expect(items.map(item => item.duration)).toEqual([900, 500, 400])
    expect(items[1]?.durationLabel).toBe('Return interval: 500ms')
  })

  it('preserves waiting and unknown states without inventing zero duration', () => {
    const orphan: TraceEventEnvelope = {
      eventId: 'orphan',
      traceId: 'other',
      sequence: 1,
      timestamp: '2024-01-01T12:00:04.000Z',
      type: 'model.response',
      requestId: 'r',
      payload: { output_text: 'orphan' },
    }
    const sources = previewEvents.slice(0, 3)
    const items = toOverviewItems(aggregateEvents([...sources, orphan]).flatMap(trace => trace.calls))
    expect(items.find(item => item.status === 'waiting')).toMatchObject({
      group: 'tool',
      durationLabel: 'Return interval: —',
    })
    expect(items.find(item => item.status === 'waiting')?.duration).toBeUndefined()
    expect(items.find(item => item.status === 'unknown')).toMatchObject({
      group: 'model',
      durationLabel: 'Duration: —',
      startTime: Date.parse(orphan.timestamp),
    })
    expect(items.find(item => item.status === 'unknown')?.duration).toBeUndefined()
  })
})
