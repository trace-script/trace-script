import type { EventFilter, EventPage, ExportDocument, SessionSummary, StoredEvent, TraceSummary } from '@trace-script/metadata'

export interface TraceRepository {
  appendEvents: (events: StoredEvent[], origin: string) => Promise<{ accepted: number, duplicates: number, conflicts: number }>
  listSessions: (tabId: number) => Promise<SessionSummary[]>
  listTraces: (sessionKey: string) => Promise<TraceSummary[]>
  listEvents: (sessionKey: string, filter: EventFilter, cursor: number) => Promise<EventPage>
  getEvent: (sessionKey: string, eventId: string) => Promise<StoredEvent>
  deleteSession: (sessionKey: string) => Promise<void>
  exportSession: (sessionKey: string, traceId?: string) => Promise<ExportDocument>
}
