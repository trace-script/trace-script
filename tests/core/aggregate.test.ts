import { aggregateMessages, aggregateSpans } from '@trace-script/core'
import { describe, expect, it } from 'vitest'
import { agentHandoffEvents, baseEvent, conversationEvents, streamingEvents, toolRetryEvents, toolSuccessEvents } from '../../fixtures/protocol'

describe('span aggregation', () => {
  it('pairs a successful tool call despite arrival order and duplicate delivery', () => {
    expect(aggregateSpans([...toolSuccessEvents].reverse().concat(toolSuccessEvents))).toEqual([
      expect.objectContaining({ startEventId: 'tool-start', endEventId: 'tool-result', kind: 'tool', status: 'success', durationMs: 25, incomplete: false, eventIds: ['tool-start', 'tool-result'] }),
    ])
  })

  it('keeps a failed attempt and a successful retry as separate spans', () => {
    const spans = aggregateSpans(toolRetryEvents)
    expect(spans).toHaveLength(2)
    expect(spans[0]).toMatchObject({ status: 'error', durationMs: 10 })
    expect(spans[1]).toMatchObject({ status: 'success', durationMs: 20, parentId: 'tool-attempt-1' })
  })

  it('pairs session, model and agent events using the same relation rule', () => {
    expect(aggregateSpans(conversationEvents)[0]).toMatchObject({ kind: 'session', durationMs: 100 })
    expect(aggregateSpans(streamingEvents)[0]).toMatchObject({ kind: 'model', durationMs: 50 })
    expect(aggregateSpans(agentHandoffEvents)).toHaveLength(2)
    expect(aggregateSpans(agentHandoffEvents).every(span => !span.incomplete)).toBeTruthy()
  })

  it('marks incomplete spans and ignores unrelated terminal events', () => {
    const start = { ...baseEvent, type: 'span.start' as const, status: 'running' as const }
    const mismatched = { ...baseEvent, eventId: 'tool-end', sequence: 2, type: 'tool.result' as const, parentId: baseEvent.eventId }
    const crossTrace = { ...baseEvent, eventId: 'span-end', sequence: 3, type: 'span.end' as const, parentId: baseEvent.eventId, traceId: 'other' }
    expect(aggregateSpans([start, mismatched, crossTrace])[0]).toMatchObject({ status: 'running', incomplete: true, eventIds: ['event-1'] })
    expect(aggregateSpans([mismatched])).toEqual([])
  })

  it('uses explicit duration and diagnoses reversed clocks without negative duration', () => {
    const start = { ...baseEvent, type: 'span.start' as const, timestamp: '2026-10-04T00:00:01.000Z' }
    const end = { ...baseEvent, eventId: 'end', sequence: 2, type: 'span.end' as const, parentId: baseEvent.eventId, status: 'cancelled' as const }
    expect(aggregateSpans([start, end])[0]).toMatchObject({ durationMs: 0, timingConflict: true, status: 'cancelled' })
    expect(aggregateSpans([start, { ...end, durationMs: 7 }])[0]?.durationMs).toBe(7)
  })

  it('preserves the first terminal outcome and all subsequent terminal event IDs', () => {
    const extra = { ...baseEvent, eventId: 'extra-end', sequence: 3, type: 'tool.error' as const, parentId: 'tool-start', status: 'error' as const }
    expect(aggregateSpans([...toolSuccessEvents, extra])[0]).toMatchObject({ status: 'success', endEventId: 'tool-result', eventIds: ['tool-start', 'tool-result', 'extra-end'] })
  })
})

describe('streaming message aggregation', () => {
  it('joins ordered deltas while retaining their original event IDs', () => {
    expect(aggregateMessages([...streamingEvents].reverse())).toEqual([
      expect.objectContaining({ content: 'Hello world.', status: 'success', incomplete: false, contentMismatch: false, eventIds: ['message-start', 'delta-1', 'delta-2', 'message-completed'] }),
    ])
  })

  it('displays streamed text as running before completion', () => {
    const events = streamingEvents.filter(event => event.type !== 'message.assistant.completed')
    expect(aggregateMessages(events)[0]).toMatchObject({ content: 'Hello world.', status: 'running', incomplete: true })
  })

  it('uses completed text as authoritative and reports a stream mismatch', () => {
    const events = streamingEvents.map(event => event.type === 'message.assistant.completed' ? { ...event, payload: { content: 'Corrected text.' } } : event)
    expect(aggregateMessages(events)[0]).toMatchObject({ content: 'Corrected text.', contentMismatch: true })
  })

  it('keeps an explicitly empty completed message instead of restoring streamed text', () => {
    const events = streamingEvents.map(event => event.type === 'message.assistant.completed' ? { ...event, payload: { content: '' } } : event)
    expect(aggregateMessages(events)[0]).toMatchObject({ content: '', contentMismatch: true, incomplete: false })
  })

  it('keeps concurrent messages and traces isolated', () => {
    const other = [
      { ...baseEvent, eventId: 'other-message', type: 'message.assistant.start' as const, sequence: 3 },
      { ...baseEvent, eventId: 'other-delta', type: 'message.assistant.delta' as const, parentId: 'other-message', sequence: 4, payload: { delta: 'Other' } },
      { ...baseEvent, eventId: 'cross-trace-delta', type: 'message.assistant.delta' as const, parentId: 'message-start', traceId: 'other-trace', payload: { delta: 'Forbidden' } },
    ]
    const messages = aggregateMessages([...streamingEvents, ...other])
    expect(messages.map(message => message.content)).toEqual(['Hello world.', 'Other'])
    expect(messages[0]?.eventIds).not.toContain('cross-trace-delta')
  })

  it('falls back to streamed content when completion has no text', () => {
    const events = streamingEvents.map(event => event.type === 'message.assistant.completed' ? { ...event, payload: {} } : event)
    expect(aggregateMessages(events)[0]).toMatchObject({ content: 'Hello world.', contentMismatch: false, incomplete: false })
  })

  it('does not change its inputs', () => {
    const snapshot = JSON.stringify(streamingEvents)
    aggregateMessages(streamingEvents)
    aggregateSpans(streamingEvents)
    expect(JSON.stringify(streamingEvents)).toBe(snapshot)
  })
})
