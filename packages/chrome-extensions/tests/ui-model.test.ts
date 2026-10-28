import type { TracePanelFilter } from '@/types/trace-panel'
import { aggregateEvents } from '@trace-script/core'
import { describe, expect, it } from 'vitest'
import { previewEvents } from '@/preview'
import { amountText, matchesCall, matchesTrace, timingText, tokenText } from '@/utils/ui-model'

const filter: TracePanelFilter = { query: '', type: 'all', status: 'all', agent: 'all', onlyErrors: false }
const trace = aggregateEvents(previewEvents)[0]!

describe('aggregated UI model', () => {
  it.each([
    { name: 'tool type', changes: { type: 'tool' }, ids: ['call-weather'] },
    { name: 'model type', changes: { type: 'model' }, ids: ['request-1', 'request-2'] },
    { name: 'successful status', changes: { status: 'success' }, ids: ['request-1', 'call-weather', 'request-2'] },
    { name: 'absent failed status', changes: { status: 'failed' }, ids: [] },
    { name: 'known agent', changes: { agent: 'planner' }, ids: ['request-1', 'call-weather', 'request-2'] },
    { name: 'unknown agent', changes: { agent: 'other' }, ids: [] },
    { name: 'case-insensitive name', changes: { query: 'GET_WEATHER' }, ids: ['call-weather'] },
    { name: 'call ID', changes: { query: 'call-weather' }, ids: ['call-weather'] },
    { name: 'source event ID', changes: { query: 'preview-tool' }, ids: ['call-weather'] },
    { name: 'trace ID', changes: { query: 'preview-trace' }, ids: ['request-1', 'call-weather', 'request-2'] },
    { name: 'unmatched query', changes: { query: 'not-found' }, ids: [] },
    { name: 'conflicting type and query', changes: { type: 'model', query: 'get_weather' }, ids: [] },
    { name: 'healthy calls with errors-only enabled', changes: { onlyErrors: true }, ids: [] },
  ] satisfies { name: string, changes: Partial<TracePanelFilter>, ids: string[] }[])('filters by $name', ({ changes, ids }) => {
    const matching = trace.calls.filter(call => matchesCall(call, { ...filter, ...changes }))
    expect(matching.map(call => call.callId)).toEqual(ids)
  })

  it('includes successful calls in a failed trace only when trace context is supplied', () => {
    const events = previewEvents.filter(event => event.type !== 'trace.end')
    const failed = aggregateEvents([...events, {
      eventId: 'error',
      traceId: 'preview-trace',
      sequence: 7,
      timestamp: '2024-01-01T12:00:02.100Z',
      type: 'trace.error',
      payload: { message: 'late failure' },
    }])[0]!
    expect(failed.status).toBe('failed')
    expect(failed.errors).toContain('late failure')
    expect(failed.calls.filter(call => matchesCall(call, { ...filter, onlyErrors: true }))).toHaveLength(0)
    expect(failed.calls.map(call => call.status)).toEqual(['success', 'success', 'success'])
    expect(failed.calls.filter(call => matchesCall(call, { ...filter, onlyErrors: true }, failed)).map(call => call.callId))
      .toEqual(['request-1', 'call-weather', 'request-2'])
  })

  it.each([
    { name: 'error text', changes: { query: 'DISCONNECTED' }, matches: true },
    { name: 'trace ID', changes: { query: 'trace-only' }, matches: true },
    { name: 'source event ID', changes: { query: 'error-source' }, matches: true },
    { name: 'failed status', changes: { status: 'failed' }, matches: true },
    { name: 'errors-only', changes: { onlyErrors: true }, matches: true },
    { name: 'model type restriction', changes: { type: 'model' }, matches: false },
    { name: 'agent restriction', changes: { agent: 'planner' }, matches: false },
    { name: 'different status', changes: { status: 'success' }, matches: false },
    { name: 'unmatched query', changes: { query: 'not-found' }, matches: false },
  ] satisfies { name: string, changes: Partial<TracePanelFilter>, matches: boolean }[])('filters a call-less failed trace by $name', ({ changes, matches }) => {
    const failed = aggregateEvents([{
      eventId: 'error-source',
      traceId: 'trace-only',
      sequence: 1,
      timestamp: '2026-01-01T00:00:00.000Z',
      type: 'trace.error',
      payload: { message: 'disconnected' },
    }])[0]!
    expect(failed.calls).toEqual([])
    expect(matchesTrace(failed, { ...filter, ...changes })).toBe(matches)
  })

  it('keeps unknown, zero, partial usage and missing or anomalous timing distinct', () => {
    expect(tokenText()).toBe('—')
    expect(tokenText(0)).toBe('0')
    expect(amountText({ value: 0, complete: false })).toBe('0 (known; incomplete)')
    expect(amountText({ complete: false })).toBe('—')
    expect(timingText({ anomalous: false })).toBe('—')
    expect(timingText({ duration: 0, anomalous: false })).toBe('0ms')
    expect(timingText({ anomalous: true })).toBe('Time anomaly')
  })

  it('finds association conflicts without relabelling successful calls', () => {
    const response = previewEvents.find(event => event.type === 'model.response')!
    const conflict = aggregateEvents([...previewEvents, { ...response, timestamp: '2024-01-01T12:00:09.000Z' }])[0]!
    const matching = conflict.calls.filter(call => matchesCall(call, { ...filter, status: 'conflict' }, conflict))
    expect(matching.length).toBeGreaterThan(0)
    expect(matching.every(call => call.associationConflict)).toBeTruthy()
    expect(matching.every(call => call.status === 'success')).toBeTruthy()
  })
})
