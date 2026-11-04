import type { TraceEventEnvelope } from '@trace-script/metadata'
import { safeParseTraceEvent } from '@trace-script/core'
import { isObject } from '@trace-script/shared'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('trace-script', 2)
    request.onupgradeneeded = (event) => {
      if (event.oldVersion < 1) {
        const store = request.result.createObjectStore('events', { autoIncrement: true })
        store.createIndex('tabKey', 'tabKey')
        store.createIndex('traceId', 'event.traceId')
      }
      if (event.oldVersion < 2)
        request.result.createObjectStore('histories')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Cannot open trace storage'))
  })
}

export async function appendTraceEvent(tabKey: string, event: TraceEventEnvelope): Promise<void> {
  await appendTraceEvents(tabKey, [event])
}

export async function appendTraceEvents(tabKey: string, events: TraceEventEnvelope[]): Promise<void> {
  const database = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(['events', 'histories'], 'readwrite')
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error ?? new Error('Trace write aborted'))
      for (const event of events)
        transaction.objectStore('events').add({ tabKey, event })
      transaction.objectStore('histories').put(true, tabKey)
    })
  }
  finally {
    database.close()
  }
}

// Keep an empty history distinct from a new preview so Clear survives reloads.
export async function hasTraceHistory(tabKey: string): Promise<boolean> {
  const database = await openDatabase()
  try {
    return await new Promise<boolean>((resolve, reject) => {
      const transaction = database.transaction('histories', 'readonly')
      const request = transaction.objectStore('histories').count(tabKey)
      transaction.oncomplete = () => resolve(request.result > 0)
      transaction.onabort = () => reject(transaction.error ?? new Error('History query aborted'))
    })
  }
  finally {
    database.close()
  }
}

export async function clearTraceEvents(tabKey: string): Promise<void> {
  const database = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(['events', 'histories'], 'readwrite')
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error ?? new Error('History clear aborted'))
      transaction.objectStore('histories').put(true, tabKey)
      const request = transaction.objectStore('events').index('tabKey').openCursor(tabKey)
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor)
          return
        cursor.delete()
        cursor.continue()
      }
    })
  }
  finally {
    database.close()
  }
}

export type TraceEventQuery = { tabKey: string } | { traceId: string }

export async function readTraceEvents(query: TraceEventQuery): Promise<TraceEventEnvelope[]> {
  const database = await openDatabase()
  try {
    return await new Promise<TraceEventEnvelope[]>((resolve, reject) => {
      const transaction = database.transaction('events', 'readonly')
      const events: TraceEventEnvelope[] = []
      transaction.oncomplete = () => resolve(events)
      transaction.onabort = () => reject(transaction.error ?? new Error('Trace query aborted'))
      const store = transaction.objectStore('events')
      const request = 'traceId' in query
        ? store.index('traceId').getAll(query.traceId)
        : store.index('tabKey').getAll(query.tabKey)
      request.onsuccess = () => {
        for (const row of request.result) {
          if (!isObject(row) || !('event' in row) || !isObject(row.event))
            continue
          const parsed = safeParseTraceEvent(row.event)
          if (parsed.success)
            events.push(parsed.data)
        }
      }
    })
  }
  finally {
    database.close()
  }
}
