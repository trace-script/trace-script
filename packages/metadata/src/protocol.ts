import { z } from 'zod'

export const PROTOCOL_VERSION = '1.0'
export const TRACE_CHANNEL = 'trace-script'

export const TRACE_EVENT_TYPES = [
  'session.start',
  'session.end',
  'message.user',
  'message.assistant.start',
  'message.assistant.delta',
  'message.assistant.completed',
  'model.request',
  'model.response',
  'model.error',
  'tool.start',
  'tool.result',
  'tool.error',
  'agent.start',
  'agent.handoff',
  'agent.end',
  'span.start',
  'span.end',
  'span.error',
  'log',
  'error',
] as const

export const TRACE_STATUSES = ['pending', 'running', 'success', 'error', 'cancelled'] as const
export const traceStatusSchema = z.enum(TRACE_STATUSES)

export const jsonValueSchema = z.json()
export type JsonValue = z.infer<typeof jsonValueSchema>

const identifierSchema = z.string().min(1).max(200).refine(value => value.trim().length > 0, 'Expected a nonblank identifier')
const nameSchema = z.string().min(1).max(200).refine(value => value.trim().length > 0, 'Expected a nonblank name')
const nonnegativeNumberSchema = z.number().finite().nonnegative()

export const traceActorSchema = z.object({
  id: identifierSchema.optional(),
  name: nameSchema,
  role: z.string().optional(),
}).catchall(jsonValueSchema)

export const traceModelSchema = z.object({
  name: nameSchema,
  provider: z.string().optional(),
}).catchall(jsonValueSchema)

export const traceErrorSchema = z.object({
  message: z.string(),
  name: z.string().optional(),
  code: z.string().optional(),
  stack: z.string().optional(),
}).catchall(jsonValueSchema)

export const traceMetricsSchema = z.object({
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
  costUsd: nonnegativeNumberSchema.optional(),
  latencyMs: nonnegativeNumberSchema.optional(),
}).catchall(jsonValueSchema)

export const traceEventEnvelopeSchema = z.object({
  version: z.literal(PROTOCOL_VERSION),
  eventId: identifierSchema,
  traceId: identifierSchema,
  sessionId: identifierSchema,
  parentId: identifierSchema.optional(),
  sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  timestamp: z.iso.datetime({ offset: false }),
  type: z.enum(TRACE_EVENT_TYPES),
  name: nameSchema,
  status: traceStatusSchema.optional(),
  durationMs: nonnegativeNumberSchema.optional(),
  agent: traceActorSchema.optional(),
  model: traceModelSchema.optional(),
  attributes: z.record(z.string(), jsonValueSchema).optional(),
  payload: jsonValueSchema.optional(),
  error: traceErrorSchema.optional(),
  metrics: traceMetricsSchema.optional(),
}).catchall(jsonValueSchema)

const bridgeShape = {
  channel: z.literal(TRACE_CHANNEL),
  version: z.literal(PROTOCOL_VERSION),
}

export const traceBridgeMessageSchema = z.discriminatedUnion('kind', [
  z.object({ ...bridgeShape, kind: z.literal('trace-event'), data: traceEventEnvelopeSchema }),
  z.object({ ...bridgeShape, kind: z.literal('trace-batch'), data: z.array(traceEventEnvelopeSchema).min(1).max(100) }),
  z.object({
    ...bridgeShape,
    kind: z.literal('handshake'),
    data: z.object({
      requestId: identifierSchema,
      phase: z.enum(['request', 'response']),
      available: z.boolean().optional(),
    }),
  }),
  z.object({ ...bridgeShape, kind: z.literal('flush'), data: z.strictObject({}) }),
])

export const protocolLimitsSchema = z.object({
  maxEventBytes: z.number().int().positive().max(64 * 1024 * 1024),
  maxBatchBytes: z.number().int().positive().max(128 * 1024 * 1024),
  maxBatchEvents: z.number().int().positive().max(100),
})

export type ProtocolLimits = z.infer<typeof protocolLimitsSchema>

export const DEFAULT_PROTOCOL_LIMITS: ProtocolLimits = {
  maxEventBytes: 1024 * 1024,
  maxBatchBytes: 2 * 1024 * 1024,
  maxBatchEvents: 100,
}

export const protocolIssueSchema = z.object({
  code: z.enum([
    'INVALID_SHAPE',
    'UNSUPPORTED_VERSION',
    'INVALID_FIELD',
    'NON_JSON_VALUE',
    'EVENT_TOO_LARGE',
    'BATCH_TOO_LARGE',
    'BATCH_LIMIT_EXCEEDED',
    'INVALID_LIMITS',
  ]),
  path: z.array(z.union([z.string(), z.number().int().nonnegative()])),
  message: z.string(),
})

export type TraceActor = z.infer<typeof traceActorSchema>
export type TraceModel = z.infer<typeof traceModelSchema>
export type TraceError = z.infer<typeof traceErrorSchema>
export type TraceMetrics = z.infer<typeof traceMetricsSchema>
export type TraceEventEnvelope = z.infer<typeof traceEventEnvelopeSchema>
export type TraceBridgeMessage = z.infer<typeof traceBridgeMessageSchema>
export type TraceEventType = TraceEventEnvelope['type']
export type TraceStatus = z.infer<typeof traceStatusSchema>
export type TraceEventStatus = TraceStatus
export type ProtocolIssue = z.infer<typeof protocolIssueSchema>
