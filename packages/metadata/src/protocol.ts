import { z } from 'zod'

export const TRACE_CHANNEL = 'trace-script'
export const TRACE_EVENT_TYPES = [
  'trace.start',
  'model.request',
  'model.response',
  'tool.result',
  'trace.end',
  'trace.error',
] as const

const identifierSchema = z.string().min(1).max(200)
const eventFields = {
  eventId: identifierSchema,
  traceId: identifierSchema,
  sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  timestamp: z.iso.datetime({ offset: false }),
}

const jsonObjectSchema = z.record(z.string(), z.json())

export const traceEventEnvelopeSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...eventFields, type: z.literal('trace.start') }),
  z.strictObject({ ...eventFields, type: z.literal('model.request'), payload: jsonObjectSchema }),
  z.strictObject({ ...eventFields, type: z.literal('model.response'), payload: jsonObjectSchema }),
  z.strictObject({
    ...eventFields,
    type: z.literal('tool.result'),
    payload: z.strictObject({ callId: identifierSchema, output: z.string() }),
  }),
  z.strictObject({ ...eventFields, type: z.literal('trace.end') }),
  z.strictObject({
    ...eventFields,
    type: z.literal('trace.error'),
    payload: z.strictObject({ message: z.string() }),
  }),
])

export const traceBridgeMessageSchema = z.strictObject({
  channel: z.literal(TRACE_CHANNEL),
  kind: z.literal('trace-event'),
  data: traceEventEnvelopeSchema,
})

export type TraceEventEnvelope = z.infer<typeof traceEventEnvelopeSchema>
export type TraceBridgeMessage = z.infer<typeof traceBridgeMessageSchema>
export type TraceEventType = TraceEventEnvelope['type']
