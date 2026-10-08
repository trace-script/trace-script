import { z } from 'zod'
import { traceEventEnvelopeSchema, traceStatusSchema } from './protocol'

export const sessionSchema = z.object({
  key: z.string(),
  sessionId: z.string(),
  tabId: z.number().int(),
  origin: z.string(),
  source: z.enum(['live', 'imported', 'importing']),
  name: z.string(),
  startedAt: z.string(),
  endedAt: z.string().optional(),
  lastReceivedAt: z.string(),
  eventCount: z.number().int(),
  traceCount: z.number().int(),
  bytes: z.number(),
  status: traceStatusSchema,
})
export const storedEventSchema = z.object({
  key: z.string(),
  sessionKey: z.string(),
  tabId: z.number().int(),
  frameId: z.number().int(),
  receivedAt: z.string(),
  extensionVersion: z.string(),
  event: traceEventEnvelopeSchema,
})
export const traceSummarySchema = z.object({
  key: z.string(),
  sessionKey: z.string(),
  traceId: z.string(),
  name: z.string(),
  startedAt: z.string(),
  endedAt: z.string(),
  eventCount: z.number().int(),
  status: traceStatusSchema,
})
export const exportDocumentSchema = z.object({
  formatVersion: z.literal('1.0'),
  exportedAt: z.iso.datetime(),
  session: sessionSchema,
  traces: z.array(traceSummarySchema),
  events: z.array(traceEventEnvelopeSchema).max(50_000),
})
export const eventFilterSchema = z.object({
  text: z.string().max(500).default(''),
  type: z.string().default(''),
  status: z.string().default(''),
  agent: z.string().default(''),
  model: z.string().default(''),
  traceId: z.string().default(''),
  from: z.string().default(''),
  to: z.string().default(''),
  sort: z.enum(['sequence', 'name', 'type', 'status', 'durationMs', 'timestamp']).default('sequence'),
  descending: z.boolean().default(false),
})
export type SessionSummary = z.infer<typeof sessionSchema>
export type StoredEvent = z.infer<typeof storedEventSchema>
export type TraceSummary = z.infer<typeof traceSummarySchema>
export type ExportDocument = z.infer<typeof exportDocumentSchema>
export type EventFilter = z.infer<typeof eventFilterSchema>
export type EventRow = Pick<z.infer<typeof traceEventEnvelopeSchema>, 'version' | 'eventId' | 'traceId' | 'sessionId' | 'parentId' | 'sequence' | 'timestamp' | 'type' | 'name' | 'status' | 'durationMs' | 'agent' | 'model' | 'metrics'>
export interface EventPage { rows: EventRow[], total: number, nextCursor: number }
