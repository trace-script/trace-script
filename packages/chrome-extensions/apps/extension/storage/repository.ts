import type { TraceRepository } from '@trace-script/core'

import type { EventFilter, EventPage, EventRow, ExportDocument, SessionSummary, StoredEvent, TraceSummary } from '@trace-script/metadata'
import { aggregateMessages, aggregateSpans, normalizeTraceEvents, parseTraceEvent, queryRows, toEventRow } from '@trace-script/core'
import { exportDocumentSchema, sessionSchema, storedEventSchema, traceSummarySchema } from '@trace-script/metadata'

export interface LocalTraceRepository extends TraceRepository {
  getSession: (key: string) => Promise<SessionSummary>
  importSession: (text: string) => Promise<string>
  runRetentionPolicy: (days: number, maxSessions: number, maxBytes: number) => Promise<void>
  clearByOrigin: (origin: string) => Promise<void>
  clearAll: () => Promise<void>
  allSessions: () => Promise<SessionSummary[]>
  locateEvent: (sessionKey: string, eventId: string, filter: EventFilter) => Promise<number>
  messageContent: (sessionKey: string, eventId: string) => Promise<{ content: string, incomplete: boolean, contentMismatch: boolean } | false>
  presentation: (sessionKey: string, eventId: string) => Promise<EventRow>
  relatedEvents: (sessionKey: string, eventId: string) => Promise<EventRow[]>
}

const STORES = ['sessions', 'traces', 'events', 'rows']
export const databaseName = 'trace-script-v1'
function complete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()

    transaction.onabort = () => reject(transaction.error ?? new Error('Storage transaction aborted'))

    transaction.onerror = () => reject(transaction.error ?? new Error('Storage transaction failed'))
  })
}
export function openDatabase(name = databaseName): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1)

    request.onupgradeneeded = () => {
      const db = request.result

      const sessions = db.createObjectStore('sessions', { keyPath: 'key' })

      sessions.createIndex('tabId', 'tabId')

      sessions.createIndex('origin', 'origin')

      const traces = db.createObjectStore('traces', { keyPath: 'key' })

      traces.createIndex('sessionKey', 'sessionKey')

      for (const name of ['events', 'rows']) {
        const store = db.createObjectStore(name, { keyPath: 'key' })

        store.createIndex('sessionKey', 'sessionKey')
      }
    }

    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close()

      resolve(request.result)
    }

    request.onerror = () => reject(request.error ?? new Error('Cannot open database; existing data has been preserved'))

    request.onblocked = () => reject(new Error('Database upgrade blocked. Close other Trace Script panels and retry.'))
  })
}
export function createRepository(db: IDBDatabase): LocalTraceRepository {
  const rowCache = new Map<string, EventRow[]>()

  async function listSessions(tabId: number): Promise<SessionSummary[]> {
    const tx = db.transaction('sessions')

    const done = complete(tx)

    const request = tx.objectStore('sessions').getAll()

    const sessions: SessionSummary[] = []

    request.onsuccess = () => {
      for (const row of request.result) {
        const parsed = sessionSchema.parse(row)

        if (parsed.source !== 'importing' && (parsed.tabId === tabId || parsed.source === 'imported'))
          sessions.push(parsed)
      }
    }

    await done

    return sessions.sort((a, b) => b.lastReceivedAt.localeCompare(a.lastReceivedAt))
  }

  async function allSessions(): Promise<SessionSummary[]> {
    const tx = db.transaction('sessions')

    const done = complete(tx)

    const request = tx.objectStore('sessions').getAll()

    const rows: SessionSummary[] = []

    request.onsuccess = () => rows.push(...request.result.map(row => sessionSchema.parse(row)))

    await done

    return rows
  }

  async function getSession(key: string): Promise<SessionSummary> {
    const tx = db.transaction('sessions')

    const done = complete(tx)

    const request = tx.objectStore('sessions').get(key)

    await done

    return sessionSchema.parse(request.result)
  }

  async function listTraces(sessionKey: string): Promise<TraceSummary[]> {
    const tx = db.transaction('traces')

    const done = complete(tx)

    const request = tx.objectStore('traces').index('sessionKey').getAll(sessionKey)

    await done

    return request.result.map(row => traceSummarySchema.parse(row))
  }

  async function readEvents(sessionKey: string, lightweight = false): Promise<StoredEvent[]> {
    const tx = db.transaction(lightweight ? 'rows' : 'events')

    const done = complete(tx)

    const request = tx.objectStore(lightweight ? 'rows' : 'events').index('sessionKey').getAll(sessionKey)

    await done

    return request.result.map(row => storedEventSchema.parse(row))
  }

  async function appendEvents(events: StoredEvent[], origin: string, source: 'live' | 'imported' | 'importing' = 'live'): Promise<{ accepted: number, duplicates: number, conflicts: number }> {
    const tx = db.transaction(STORES, 'readwrite')

    const done = complete(tx)

    let accepted = 0

    let duplicates = 0
    let conflicts = 0

    const sessions = new Map<string, SessionSummary>()

    const traces = new Map<string, TraceSummary>()
    // Requests are chained inside callbacks to keep the transaction active in every browser.

    function next(index: number): void {
      const stored = events[index]

      if (!stored)
        return

      const lookup = tx.objectStore('events').get(stored.key)

      lookup.onsuccess = () => {
        if (lookup.result) {
          duplicates++
          const previous = storedEventSchema.parse(lookup.result)
          conflicts += normalizeTraceEvents([previous.event, stored.event]).conflictingEventIds.length

          next(index + 1)

          return
        }

        const sessionRequest = tx.objectStore('sessions').get(stored.sessionKey)

        sessionRequest.onsuccess = () => {
          const event = stored.event

          const existing = sessionSchema.safeParse(sessionRequest.result)

          const session = sessions.get(stored.sessionKey) ?? (existing.success
            ? existing.data
            : {
                key: stored.sessionKey,
                sessionId: event.sessionId,
                tabId: stored.tabId,
                origin,
                source,
                name: event.name,
                startedAt: event.timestamp,
                lastReceivedAt: stored.receivedAt,
                eventCount: 0,
                traceCount: 0,
                bytes: 0,
                status: 'running' as const,
              })

          const traceKey = JSON.stringify([stored.sessionKey, event.traceId])

          const traceRequest = tx.objectStore('traces').get(traceKey)

          traceRequest.onsuccess = () => {
            const oldTrace = traceSummarySchema.safeParse(traceRequest.result)

            const trace: TraceSummary = traces.get(traceKey) ?? (oldTrace.success ? oldTrace.data : { key: traceKey, sessionKey: stored.sessionKey, traceId: event.traceId, name: event.name, startedAt: event.timestamp, endedAt: event.timestamp, eventCount: 0, status: 'running' })

            if (!trace.eventCount)
              session.traceCount++

            trace.eventCount++

            session.eventCount++

            session.bytes += new TextEncoder().encode(JSON.stringify(stored)).byteLength

            session.lastReceivedAt = stored.receivedAt

            if (event.timestamp < session.startedAt)
              session.startedAt = event.timestamp

            if (event.timestamp < trace.startedAt)
              trace.startedAt = event.timestamp

            if (event.timestamp > trace.endedAt)
              trace.endedAt = event.timestamp

            if (event.type === 'span.start' && !event.parentId)
              trace.name = event.name

            if (event.type === 'session.start')
              session.name = event.name

            if (event.type === 'session.end') {
              session.endedAt = event.timestamp

              if (session.status !== 'error')
                session.status = event.status ?? 'success'
            }

            if (event.status === 'error' || event.type.endsWith('error')) {
              session.status = 'error'

              trace.status = 'error'
            }
            else if (trace.status !== 'error' && event.type === 'span.end') {
              trace.status = event.status ?? 'success'
            }

            sessions.set(session.key, session)

            traces.set(trace.key, trace)

            tx.objectStore('sessions').put(session)

            tx.objectStore('traces').put(trace)

            tx.objectStore('events').add(stored)

            tx.objectStore('rows').add({ ...stored, event: { ...toEventRow(event), version: event.version } })

            accepted++

            next(index + 1)
          }
        }
      }
    }

    next(0)

    await done

    for (const event of events)
      rowCache.delete(event.sessionKey)
    return { accepted, duplicates, conflicts }
  }

  async function summaryRows(sessionKey: string): Promise<EventRow[]> {
    const cached = rowCache.get(sessionKey)
    if (cached)
      return cached
    const events = (await readEvents(sessionKey, true)).map(row => row.event)
    const spans = new Map(aggregateSpans(events).map(span => [span.startEventId, span]))
    const rows = events.map((event) => {
      const span = spans.get(event.eventId)
      return { ...toEventRow(event), ...(span ? { status: span.status, ...(span.durationMs !== undefined ? { durationMs: span.durationMs } : {}) } : {}) }
    })
    // Keep only the active Session's projections; payloads never enter this cache.
    rowCache.clear()
    rowCache.set(sessionKey, rows)
    return rows
  }

  async function listEvents(sessionKey: string, filter: EventFilter, cursor: number): Promise<EventPage> {
    const rows = queryRows(await summaryRows(sessionKey), filter)
    const offset = Math.max(0, cursor)
    return { rows: rows.slice(offset, offset + 200), total: rows.length, nextCursor: offset + 200 < rows.length ? offset + 200 : -1 }
  }

  async function locateEvent(sessionKey: string, eventId: string, filter: EventFilter): Promise<number> {
    const index = queryRows(await summaryRows(sessionKey), filter).findIndex(row => row.eventId === eventId)
    return index < 0 ? -1 : Math.floor(index / 200) * 200
  }

  async function presentation(sessionKey: string, eventId: string): Promise<EventRow> {
    const row = (await summaryRows(sessionKey)).find(row => row.eventId === eventId)
    if (!row)
      throw new Error('Event no longer exists')
    return row
  }

  async function messageContent(sessionKey: string, eventId: string): Promise<{ content: string, incomplete: boolean, contentMismatch: boolean } | false> {
    const rows = await summaryRows(sessionKey)
    const selected = rows.find(row => row.eventId === eventId)
    if (!selected?.type.startsWith('message.assistant.'))
      return false
    const startId = selected.type === 'message.assistant.start' ? eventId : selected.parentId
    const ids = rows.filter(row => row.traceId === selected.traceId && (row.eventId === startId || row.parentId === startId)).map(row => row.eventId)
    const tx = db.transaction('events')
    const done = complete(tx)
    const requests = ids.map(id => tx.objectStore('events').get(JSON.stringify([sessionKey, id])))
    await done
    const message = aggregateMessages(requests.map(request => storedEventSchema.parse(request.result).event))[0]
    return message ? { content: message.content, incomplete: message.incomplete, contentMismatch: message.contentMismatch } : false
  }

  async function getEvent(sessionKey: string, eventId: string): Promise<StoredEvent> {
    const tx = db.transaction('events')

    const done = complete(tx)

    const request = tx.objectStore('events').get(JSON.stringify([sessionKey, eventId]))

    await done

    return storedEventSchema.parse(request.result)
  }

  async function deleteSession(sessionKey: string): Promise<void> {
    const tx = db.transaction(STORES, 'readwrite')

    const done = complete(tx)

    rowCache.delete(sessionKey)
    tx.objectStore('sessions').delete(sessionKey)

    for (const name of ['events', 'rows', 'traces']) {
      const request = tx.objectStore(name).index('sessionKey').openKeyCursor(IDBKeyRange.only(sessionKey))

      request.onsuccess = () => {
        const cursor = request.result

        if (cursor) {
          tx.objectStore(name).delete(cursor.primaryKey)

          cursor.continue()
        }
      }
    }

    await done
  }

  async function exportSession(sessionKey: string, traceId = ''): Promise<ExportDocument> {
    const session = await getSession(sessionKey)

    const traces = (await listTraces(sessionKey)).filter(trace => !traceId || trace.traceId === traceId)

    const events = (await readEvents(sessionKey)).map(row => row.event).filter(event => !traceId || event.traceId === traceId)

    if (events.length > 50_000)
      throw new Error('Export exceeds 50,000 events; select one Trace')

    return { formatVersion: '1.0', exportedAt: new Date().toISOString(), session, traces, events }
  }

  async function importSession(text: string): Promise<string> {
    if (new TextEncoder().encode(text).byteLength > 50 * 1024 * 1024)
      throw new Error('Import exceeds 50 MiB')

    const raw = JSON.parse(text)
    // Validate individual events before recursive schemas, bounding attacker-controlled depth.
    if (!raw || !Array.isArray(raw.events) || raw.events.length > 50_000)
      throw new Error('Invalid export document or event count')
    for (const event of raw.events)
      parseTraceEvent(event)
    const document = exportDocumentSchema.parse(raw)

    if (!document.events.length)
      throw new Error('Import contains no events')

    const seen = new Set<string>()

    const events = document.events.map((parsed) => {
      if (parsed.sessionId !== document.session.sessionId || seen.has(parsed.eventId))
        throw new Error('Invalid session membership or duplicate event ID')

      seen.add(parsed.eventId)

      return parsed
    })

    const sessionKey = `imported:${crypto.randomUUID()}`

    const receivedAt = new Date().toISOString()

    try {
      for (let offset = 0; offset < events.length; offset += 100) {
        await appendEvents(events.slice(offset, offset + 100).map(event => ({ key: JSON.stringify([sessionKey, event.eventId]), sessionKey, tabId: -1, frameId: 0, receivedAt, extensionVersion: 'import', event })), document.session.origin, 'importing')
      }
    }
    catch (error) {
      await deleteSession(sessionKey)

      throw error
    }

    const session = await getSession(sessionKey)

    const tx = db.transaction('sessions', 'readwrite')

    const done = complete(tx)

    tx.objectStore('sessions').put({ ...session, source: 'imported', name: document.session.name })

    await done

    return sessionKey
  }

  async function runRetentionPolicy(days: number, maxSessions: number, maxBytes: number): Promise<void> {
    const sessions = (await allSessions()).sort((a, b) => b.lastReceivedAt.localeCompare(a.lastReceivedAt))

    let used = 0

    for (const [index, session] of sessions.entries()) {
      if (session.source === 'importing')
        continue
      if (index >= maxSessions || Date.parse(session.lastReceivedAt) < Date.now() - days * 86400_000 || used + session.bytes > maxBytes)
        await deleteSession(session.key)
      else
        used += session.bytes
    }
  }

  async function clearByOrigin(origin: string): Promise<void> {
    for (const session of await allSessions()) {
      if (session.origin === origin)
        await deleteSession(session.key)
    }
  }

  async function clearAll(): Promise<void> {
    rowCache.clear()
    const tx = db.transaction(STORES, 'readwrite')

    const done = complete(tx)

    for (const store of STORES) tx.objectStore(store).clear()

    await done
  }

  async function relatedEvents(sessionKey: string, eventId: string): Promise<EventRow[]> {
    const all = await summaryRows(sessionKey)

    const event = all.find(item => item.eventId === eventId)

    if (!event)
      return []

    return all.filter(item => item.traceId === event.traceId && (item.parentId === eventId || item.eventId === event.parentId)).map(toEventRow)
  }

  const repository: TraceRepository = { appendEvents, listSessions, listTraces, listEvents, getEvent, deleteSession, exportSession }

  return { ...repository, getSession, importSession, runRetentionPolicy, clearByOrigin, clearAll, allSessions, relatedEvents, locateEvent, messageContent, presentation }
}
