import type { JsonValue, ProtocolIssue, ProtocolLimits, TraceBridgeMessage, TraceEventEnvelope } from '@trace-script/metadata'
import {
  DEFAULT_PROTOCOL_LIMITS,
  PROTOCOL_VERSION,
  protocolLimitsSchema,
  traceBridgeMessageSchema,
  traceEventEnvelopeSchema,
} from '@trace-script/metadata'
import { utf8ByteLength } from '@trace-script/shared'
import { inspectJson } from './json'

export type ProtocolResult<T> = { success: true, data: T } | { success: false, issues: ProtocolIssue[] }

export class ProtocolValidationError extends Error {
  readonly issues: ProtocolIssue[]

  constructor(issues: ProtocolIssue[]) {
    super(issues.map(issue => `${issue.code}: ${issue.message}`).join('; '))

    this.name = 'ProtocolValidationError'

    this.issues = issues
  }
}

function failure(code: ProtocolIssue['code'], message: string, path: ProtocolIssue['path'] = []): ProtocolResult<never> {
  return { success: false, issues: [{ code, path, message }] }
}

function getLimits(options: Partial<ProtocolLimits>): ProtocolResult<ProtocolLimits> {
  const parsed = protocolLimitsSchema.safeParse({ ...DEFAULT_PROTOCOL_LIMITS, ...options })

  if (!parsed.success)
    return failure('INVALID_LIMITS', 'Protocol limits must be finite positive integers within the supported bounds')

  return { success: true, data: parsed.data }
}

function versionIssue(value: JsonValue, path: ProtocolIssue['path'] = []): ProtocolIssue[] {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)
    && typeof value.version === 'string' && value.version !== PROTOCOL_VERSION) {
    return [{ code: 'UNSUPPORTED_VERSION', path: [...path, 'version'], message: `Unsupported protocol version: ${value.version}` }]
  }

  return []
}

export function safeParseTraceEvent(input: unknown, options: Partial<ProtocolLimits> = {}): ProtocolResult<TraceEventEnvelope> {
  const limits = getLimits(options)

  if (!limits.success)
    return limits

  let data: JsonValue

  try {
    data = inspectJson(input, 66)
  }
  catch (error) {
    return failure('NON_JSON_VALUE', error instanceof Error ? error.message : 'Invalid JSON input')
  }

  const json = { data }

  const issues = versionIssue(json.data)

  if (issues.length > 0)
    return { success: false, issues }

  if (utf8ByteLength(JSON.stringify(json.data)) > limits.data.maxEventBytes)
    return failure('EVENT_TOO_LARGE', `Event exceeds ${limits.data.maxEventBytes} UTF-8 bytes`)

  const parsed = traceEventEnvelopeSchema.safeParse(json.data)

  if (!parsed.success) {
    return {
      success: false,
      issues: parsed.error.issues.map(issue => ({
        code: issue.path.length === 0 ? 'INVALID_SHAPE' : 'INVALID_FIELD',
        path: issue.path.filter(segment => typeof segment === 'string' || typeof segment === 'number'),
        message: issue.message,
      })),
    }
  }

  return { success: true, data: { ...parsed.data, timestamp: new Date(parsed.data.timestamp).toISOString() } }
}

export function parseTraceEvent(input: unknown, options: Partial<ProtocolLimits> = {}): TraceEventEnvelope {
  const parsed = safeParseTraceEvent(input, options)

  if (!parsed.success)
    throw new ProtocolValidationError(parsed.issues)

  return parsed.data
}

export function safeParseBridgeMessage(input: unknown, options: Partial<ProtocolLimits> = {}): ProtocolResult<TraceBridgeMessage> {
  const limits = getLimits(options)

  if (!limits.success)
    return limits

  let data: JsonValue

  try {
    data = inspectJson(input, 68)
  }
  catch (error) {
    return failure('NON_JSON_VALUE', error instanceof Error ? error.message : 'Invalid JSON input')
  }

  const json = { data }

  const issues = versionIssue(json.data)

  if (issues.length > 0)
    return { success: false, issues }

  if (typeof json.data !== 'object' || json.data === null || Array.isArray(json.data))
    return failure('INVALID_SHAPE', 'Expected a bridge message object')

  if (json.data.kind === 'trace-batch' && Array.isArray(json.data.data)
    && json.data.data.length > limits.data.maxBatchEvents) {
    return failure('BATCH_LIMIT_EXCEEDED', `Batch exceeds ${limits.data.maxBatchEvents} events`, ['data'])
  }

  if (utf8ByteLength(JSON.stringify(json.data)) > limits.data.maxBatchBytes)
    return failure('BATCH_TOO_LARGE', `Bridge message exceeds ${limits.data.maxBatchBytes} UTF-8 bytes`)

  const rawEvents = json.data.kind === 'trace-event'
    ? [json.data.data]
    : json.data.kind === 'trace-batch' && Array.isArray(json.data.data)
      ? json.data.data
      : []

  for (const [index, rawEvent] of rawEvents.entries()) {
    const event = safeParseTraceEvent(rawEvent, limits.data)

    if (!event.success) {
      const prefix = json.data.kind === 'trace-batch' ? ['data', index] : ['data']

      return { success: false, issues: event.issues.map(issue => ({ ...issue, path: [...prefix, ...issue.path] })) }
    }
  }

  const parsed = traceBridgeMessageSchema.safeParse(json.data)

  if (!parsed.success) {
    return {
      success: false,
      issues: parsed.error.issues.map(issue => ({
        code: issue.path.length === 0 ? 'INVALID_SHAPE' : 'INVALID_FIELD',
        path: issue.path.filter(segment => typeof segment === 'string' || typeof segment === 'number'),
        message: issue.message,
      })),
    }
  }

  if (parsed.data.kind === 'trace-event')
    return { success: true, data: { ...parsed.data, data: { ...parsed.data.data, timestamp: new Date(parsed.data.data.timestamp).toISOString() } } }

  if (parsed.data.kind === 'trace-batch')
    return { success: true, data: { ...parsed.data, data: parsed.data.data.map(event => ({ ...event, timestamp: new Date(event.timestamp).toISOString() })) } }

  return { success: true, data: parsed.data }
}

export function parseBridgeMessage(input: unknown, options: Partial<ProtocolLimits> = {}): TraceBridgeMessage {
  const parsed = safeParseBridgeMessage(input, options)

  if (!parsed.success)
    throw new ProtocolValidationError(parsed.issues)

  return parsed.data
}

export function migrateTraceEvent(input: unknown): TraceEventEnvelope {
  return parseTraceEvent(input)
}
