import { describe, expect, it } from 'vitest'
import { isContentToWorkerMessage, isPanelToWorkerMessage } from '@/messages'

describe('extension message guards', () => {
  describe('content messages', () => {
    it('accepts an envelope candidate for complete worker validation', () => {
      expect(isContentToWorkerMessage({ type: 'INGEST_EVENT', event: { type: 'trace.start' } })).toBeTruthy()
    })

    it.each([
      { name: 'missing type', message: {} },
      { name: 'unknown type', message: { type: 'OTHER', event: {} } },
      { name: 'missing event', message: { type: 'INGEST_EVENT' } },
      { name: 'non-object event', message: { type: 'INGEST_EVENT', event: 'event' } },
    ])('rejects $name', ({ message }) => {
      expect(isContentToWorkerMessage(message)).toBeFalsy()
    })
  })

  describe('panel messages', () => {
    it.each([
      { type: 'PANEL_CONNECT', tabId: 7 },
      { type: 'TRACE_QUERY' },
      { type: 'TRACE_QUERY', tabId: 7 },
    ])('accepts %j', (message) => {
      expect(isPanelToWorkerMessage(message)).toBeTruthy()
    })

    it.each([
      { name: 'missing type', message: {} },
      { name: 'unknown type', message: { type: 'OTHER' } },
      { name: 'missing tab ID', message: { type: 'PANEL_CONNECT' } },
      { name: 'string tab ID', message: { type: 'PANEL_CONNECT', tabId: '7' } },
      { name: 'NaN tab ID', message: { type: 'PANEL_CONNECT', tabId: Number.NaN } },
      { name: 'infinite tab ID', message: { type: 'PANEL_CONNECT', tabId: Number.POSITIVE_INFINITY } },
    ])('rejects $name', ({ message }) => {
      expect(isPanelToWorkerMessage(message)).toBeFalsy()
    })
  })
})
