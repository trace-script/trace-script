import type { TraceEventEnvelope } from '@trace-script/metadata'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appendTraceEvent, appendTraceEvents, clearTraceEvents, hasTraceHistory, readTraceEvents } from '@/storage/trace-events'

const event = {
  eventId: 'start-1',
  traceId: 'trace-1',
  sequence: 1,
  timestamp: '2026-01-01T00:00:00.000Z',
  type: 'trace.start',
} satisfies TraceEventEnvelope

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('trace event persistence', () => {
  it('keeps an explicitly cleared history initialized without deleting other histories', async () => {
    expect(await hasTraceHistory('preview')).toBeFalsy()
    await appendTraceEvents('preview', [event])
    await appendTraceEvent('browser-1:7', event)
    await clearTraceEvents('preview')
    expect(await hasTraceHistory('preview')).toBeTruthy()
    expect(await readTraceEvents({ tabKey: 'preview' })).toEqual([])
    expect(await readTraceEvents({ tabKey: 'browser-1:7' })).toEqual([event])
  })

  it('upgrades the original event database without deleting recorded events', async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('trace-script', 1)
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore('events', { autoIncrement: true })
        store.createIndex('tabKey', 'tabKey')
        store.createIndex('traceId', 'event.traceId')
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('events', 'readwrite')
      transaction.objectStore('events').add({ tabKey: 'browser-1:7', event })
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error)
    })
    database.close()
    expect(await readTraceEvents({ tabKey: 'browser-1:7' })).toEqual([event])
    await appendTraceEvents('preview', [])
    expect(await hasTraceHistory('preview')).toBeTruthy()
  })

  it('retains arrival order and isolates tabs and browser sessions', async () => {
    const end = { ...event, eventId: 'end-1', sequence: 2, type: 'trace.end' } satisfies TraceEventEnvelope
    await appendTraceEvent('browser-1:7', end)
    await appendTraceEvent('browser-1:7', event)
    await appendTraceEvent('browser-1:8', { ...event, traceId: 'trace-2' })
    await appendTraceEvent('browser-2:7', { ...event, traceId: 'trace-3' })
    expect(await readTraceEvents({ tabKey: 'browser-1:7' })).toEqual([end, event])
    expect(await readTraceEvents({ tabKey: 'browser-2:7' })).toEqual([{ ...event, traceId: 'trace-3' }])
  })

  it('retrieves a trace across module restarts without mixing other traces', async () => {
    await appendTraceEvent('browser-1:7', event)
    await appendTraceEvent('browser-1:7', { ...event, eventId: 'start-2', traceId: 'trace-2' })
    vi.resetModules()
    const restarted = await import('../src/storage/trace-events')
    expect(await restarted.readTraceEvents({ traceId: 'trace-1' })).toEqual([event])
    expect(await restarted.readTraceEvents({ traceId: 'missing' })).toEqual([])
  })

  it('rejects database open failures instead of reporting successful writes', async () => {
    vi.spyOn(indexedDB, 'open').mockImplementationOnce(() => {
      throw new DOMException('Storage unavailable', 'SecurityError')
    })
    await expect(appendTraceEvent('browser-1:7', event)).rejects.toThrow('Storage unavailable')
    expect(await readTraceEvents({ tabKey: 'browser-1:7' })).toEqual([])
    await appendTraceEvent('browser-1:7', event)
    expect(await readTraceEvents({ tabKey: 'browser-1:7' })).toEqual([event])
  })
})
