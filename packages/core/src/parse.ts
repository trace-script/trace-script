import type { TraceBridgeMessage, TraceEventEnvelope } from '@trace-script/metadata'
import type { z } from 'zod'
import { traceBridgeMessageSchema, traceEventEnvelopeSchema } from '@trace-script/metadata'

export interface ProtocolIssue {
  code: 'INVALID_EVENT' | 'INVALID_BRIDGE'
  path: Array<string | number>
  message: string
}

export type ProtocolResult<T> = { success: true, data: T } | { success: false, issues: ProtocolIssue[] }

export class ProtocolValidationError extends Error {
  readonly issues: ProtocolIssue[]

  constructor(issues: ProtocolIssue[]) {
    super(issues.map(issue => issue.message).join('; '))
    this.name = 'ProtocolValidationError'
    this.issues = issues
  }
}

function failure(code: ProtocolIssue['code'], message: string): ProtocolResult<never> {
  return { success: false, issues: [{ code, path: [], message }] }
}

function schemaFailure(error: z.ZodError, code: ProtocolIssue['code']): ProtocolResult<never> {
  return {
    success: false,
    issues: error.issues.map(issue => ({
      code,
      path: issue.path.filter(segment => typeof segment === 'string' || typeof segment === 'number'),
      message: issue.message,
    })),
  }
}

export function safeParseTraceEvent(input: object): ProtocolResult<TraceEventEnvelope> {
  try {
    const parsed = traceEventEnvelopeSchema.safeParse(input)
    if (!parsed.success)
      return schemaFailure(parsed.error, 'INVALID_EVENT')
    const serialized = JSON.stringify(parsed.data)
    return { success: true, data: traceEventEnvelopeSchema.parse(JSON.parse(serialized)) }
  }
  catch {
    return failure('INVALID_EVENT', 'Event could not be serialized')
  }
}

export function parseTraceEvent(input: object): TraceEventEnvelope {
  const result = safeParseTraceEvent(input)
  if (!result.success)
    throw new ProtocolValidationError(result.issues)
  return result.data
}

export function safeParseBridgeMessage(input: object): ProtocolResult<TraceBridgeMessage> {
  try {
    const parsed = traceBridgeMessageSchema.safeParse(input)
    if (!parsed.success)
      return schemaFailure(parsed.error, 'INVALID_BRIDGE')
    const event = safeParseTraceEvent(parsed.data.data)
    if (!event.success)
      return { success: false, issues: event.issues.map(issue => ({ ...issue, path: ['data', ...issue.path] })) }
    const message = { channel: parsed.data.channel, kind: parsed.data.kind, data: event.data }
    return { success: true, data: message }
  }
  catch {
    return failure('INVALID_BRIDGE', 'Bridge message could not be serialized')
  }
}

export function parseBridgeMessage(input: object): TraceBridgeMessage {
  const result = safeParseBridgeMessage(input)
  if (!result.success)
    throw new ProtocolValidationError(result.issues)
  return result.data
}
