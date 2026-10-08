import type { StoredEvent } from '@trace-script/metadata'
import { eventFilterSchema } from '@trace-script/metadata'
import { describe, expect, it } from 'vitest'
import { createRepository, openDatabase } from '../apps/extension/storage/repository'
import 'fake-indexeddb/auto'

function event(index: number, tabId = 1): StoredEvent {
  const sessionKey = `tab-${tabId}`

  return { key: JSON.stringify([sessionKey, `event-${index}`]), sessionKey, tabId, frameId: 0, receivedAt: new Date().toISOString(), extensionVersion: '0.1.0', event: { version: '1.0', eventId: `event-${index}`, sessionId: 'session', traceId: 'trace', sequence: index + 1, timestamp: '2026-10-04T00:00:00.000Z', type: 'log', name: `Event ${index}`, payload: { content: 'sample' } } }
}

describe('indexedDB repository', () => {
  it('persists, isolates tabs, deduplicates, paginates and deletes associated data', async () => {
    const name = crypto.randomUUID()

    const db = await openDatabase(name)

    const repo = createRepository(db)

    const events = Array.from({ length: 205 }, (_, i) => event(i))

    expect(await repo.appendEvents(events, 'https://example.com')).toEqual({ accepted: 205, duplicates: 0, conflicts: 0 })

    expect(await repo.appendEvents(events, 'https://example.com')).toEqual({ accepted: 0, duplicates: 205, conflicts: 0 })

    await repo.appendEvents([event(0, 2)], 'https://example.com')

    expect((await repo.listSessions(1))).toHaveLength(1)

    expect((await repo.listSessions(2))[0]?.eventCount).toBe(1)

    const first = await repo.listEvents('tab-1', eventFilterSchema.parse({}), 0)

    const second = await repo.listEvents('tab-1', eventFilterSchema.parse({}), first.nextCursor)

    expect(first.rows).toHaveLength(200)

    expect(second.rows).toHaveLength(5)

    expect(first.rows[0]).not.toHaveProperty('payload')

    db.close()

    const reopened = await openDatabase(name)

    const restored = createRepository(reopened)

    expect((await restored.getEvent('tab-1', 'event-204')).event.payload).toEqual({ content: 'sample' })

    await restored.deleteSession('tab-1')

    expect(await restored.listTraces('tab-1')).toEqual([])

    expect((await restored.listEvents('tab-1', eventFilterSchema.parse({}), 0)).total).toBe(0)

    reopened.close()
  })

  it('round trips imports into independent sessions and rejects corrupt files before writing', async () => {
    const db = await openDatabase(crypto.randomUUID())

    const repo = createRepository(db)

    await repo.appendEvents([event(0), event(1)], 'https://example.com')

    const document = await repo.exportSession('tab-1')

    const key = await repo.importSession(JSON.stringify(document))

    expect((await repo.getSession(key)).source).toBe('imported')

    expect((await repo.listEvents(key, eventFilterSchema.parse({}), 0)).total).toBe(2)

    await expect(repo.importSession(JSON.stringify({ ...document, formatVersion: '2' }))).rejects.toThrow()

    await expect(repo.importSession(JSON.stringify({ ...document, events: [...document.events, document.events[0]] }))).rejects.toThrow('duplicate')

    expect(await repo.allSessions()).toHaveLength(2)

    await repo.runRetentionPolicy(7, 1, 100_000_000)

    expect(await repo.allSessions()).toHaveLength(1)

    db.close()
  })
})
