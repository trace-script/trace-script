import { eventFilterSchema, jsonValueSchema } from '@trace-script/metadata'
import { z } from 'zod'

export const settingsSchema = z.object({
  recording: z.boolean().default(true),
  theme: z.enum(['system', 'dark', 'light']).default('system'),
  retentionDays: z.number().int().min(1).max(365).default(7),
  maxSessions: z.number().int().min(1).max(1000).default(100),
  maxStorageMb: z.number().int().min(10).max(1000).default(100),
  redactFields: z.array(z.string().min(1).max(100)).max(100).default([]),
  filter: eventFilterSchema.default(() => eventFilterSchema.parse({})),
  columnWidths: z.record(z.string(), z.number().min(70).max(600)).default({}),
  detailWidth: z.number().min(260).max(900).default(420),
  columns: z.array(z.string()).default(['type', 'status', 'agent', 'model', 'tokens', 'duration', 'start', 'timeline']),
})
export type PanelSettings = z.infer<typeof settingsSchema>
export const requestSchema = z.discriminatedUnion('command', [
  z.object({ id: z.string(), command: z.literal('connect'), tabId: z.number().int().nonnegative() }),
  z.object({ id: z.string(), command: z.literal('snapshot') }),
  z.object({ id: z.string(), command: z.literal('query'), sessionKey: z.string(), filter: eventFilterSchema, cursor: z.number().int().min(0) }),
  z.object({ id: z.string(), command: z.literal('locate'), sessionKey: z.string(), eventId: z.string(), filter: eventFilterSchema }),
  z.object({ id: z.string(), command: z.literal('detail'), sessionKey: z.string(), eventId: z.string() }),
  z.object({ id: z.string(), command: z.literal('export'), sessionKey: z.string(), traceId: z.string() }),
  z.object({ id: z.string(), command: z.literal('import'), text: z.string().max(50 * 1024 * 1024) }),
  z.object({ id: z.string(), command: z.literal('delete'), sessionKey: z.string() }),
  z.object({ id: z.string(), command: z.literal('clear-origin'), origin: z.string() }),
  z.object({ id: z.string(), command: z.literal('clear-all') }),
  z.object({ id: z.string(), command: z.literal('settings'), settings: settingsSchema }),
  z.object({ id: z.string(), command: z.literal('refresh-permissions') }),
])
export type PanelRequest = z.infer<typeof requestSchema>
export type PanelCommand = PanelRequest extends infer T ? T extends PanelRequest ? Omit<T, 'id'> : never : never
export const replySchema = z.union([
  z.object({ kind: z.literal('reply'), id: z.string(), ok: z.literal(true), data: jsonValueSchema }),
  z.object({ kind: z.literal('reply'), id: z.string(), ok: z.literal(false), error: z.string() }),
  z.object({ kind: z.literal('changed') }),
])
export const collectorSchema = z.object({ accepted: z.number(), rejected: z.number(), dropped: z.number(), duplicates: z.number(), paused: z.number(), lastError: z.string(), connected: z.boolean() })
export const defaultCollector = (): z.infer<typeof collectorSchema> => collectorSchema.parse({ accepted: 0, rejected: 0, dropped: 0, duplicates: 0, paused: 0, lastError: '', connected: false })

export const diagnosticSchema = z.object({ kind: z.literal('collector-diagnostic'), dropped: z.number().int().nonnegative(), rejected: z.number().int().nonnegative(), message: z.string().max(500) })
