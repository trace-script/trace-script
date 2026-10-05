import type { JsonValue, ProtocolIssue, ProtocolLimits, TraceBridgeMessage, TraceEventEnvelope } from '@trace-script/metadata'
import {
  DEFAULT_PROTOCOL_LIMITS,
  jsonValueSchema,
  PROTOCOL_VERSION,
  protocolLimitsSchema,
  traceBridgeMessageSchema,
  traceEventEnvelopeSchema,
} from '@trace-script/metadata'
import { utf8ByteLength } from '@trace-script/shared'

const BRIDGE_DEPTH_ALLOWANCE = 2
const MAX_JSON_INSPECTION_DEPTH = 256 + BRIDGE_DEPTH_ALLOWANCE

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

/** Checks raw JSON before recursive parsing. The 258-level ceiling includes two transport wrapper levels. */
export function validateJsonValue(input: unknown, maxDepth = DEFAULT_PROTOCOL_LIMITS.maxDepth): ProtocolResult<JsonValue> {
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 1 || maxDepth > MAX_JSON_INSPECTION_DEPTH)
    return failure('INVALID_LIMITS', `JSON depth must be an integer from 1 to ${MAX_JSON_INSPECTION_DEPTH}`)

  const rootPath: ProtocolIssue['path'] = []
  const stack = [{ value: input, path: rootPath, depth: 0, exiting: false }]
  const active = new WeakSet<object>()

  while (stack.length > 0) {
    const entry = stack.pop()
    if (!entry)
      break

    const { value, path, depth, exiting } = entry
    if (depth > maxDepth)
      return failure('DEPTH_EXCEEDED', `JSON depth exceeds ${maxDepth}`, path)

    if (value === null || typeof value === 'string' || typeof value === 'boolean')
      continue
    if (typeof value === 'number') {
      if (!Number.isFinite(value))
        return failure('NON_JSON_VALUE', 'JSON numbers must be finite', path)
      continue
    }
    if (typeof value !== 'object')
      return failure('NON_JSON_VALUE', 'Expected a JSON value', path)

    if (exiting) {
      active.delete(value)
      continue
    }
    if (active.has(value))
      return failure('CYCLIC_VALUE', 'Circular references are not JSON values', path)

    try {
      const array = Array.isArray(value)
      const prototype = Object.getPrototypeOf(value)
      if (!array && prototype !== Object.prototype && prototype !== null)
        return failure('NON_JSON_VALUE', 'Only plain objects and arrays are allowed', path)
      if (Object.getOwnPropertySymbols(value).length > 0)
        return failure('NON_JSON_VALUE', 'Symbol properties cannot be serialized to JSON', path)

      active.add(value)
      stack.push({ value, path, depth, exiting: true })
      const descriptors = Object.getOwnPropertyDescriptors(value)
      if (array) {
        const length = descriptors.length?.value
        if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0)
          return failure('NON_JSON_VALUE', 'Expected a valid array length', path)
        for (const [key, descriptor] of Object.entries(descriptors)) {
          if (key !== 'length' && (!/^(?:0|[1-9]\d*)$/.test(key) || Number(key) >= length || !descriptor.enumerable))
            return failure('NON_JSON_VALUE', 'Array properties would be lost during JSON serialization', [...path, key])
        }
        for (let index = length - 1; index >= 0; index--) {
          const descriptor = descriptors[index]
          if (!descriptor || !Object.hasOwn(descriptor, 'value'))
            return failure('NON_JSON_VALUE', 'Sparse arrays and accessors are not JSON values', [...path, index])
          stack.push({ value: descriptor.value, path: [...path, index], depth: depth + 1, exiting: false })
        }
      }
      else {
        for (const [key, descriptor] of Object.entries(descriptors)) {
          if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value'))
            return failure('NON_JSON_VALUE', 'Non-enumerable fields and accessors are not JSON values', [...path, key])
          stack.push({ value: descriptor.value, path: [...path, key], depth: depth + 1, exiting: false })
        }
      }
    }
    catch {
      return failure('NON_JSON_VALUE', 'The value cannot be inspected safely', path)
    }
  }

  try {
    const parsed = jsonValueSchema.safeParse(structuredClone(input))
    if (!parsed.success)
      return failure('NON_JSON_VALUE', 'Expected a JSON value')
    return { success: true, data: parsed.data }
  }
  catch {
    return failure('NON_JSON_VALUE', 'The value cannot be cloned and parsed safely')
  }
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
  const json = validateJsonValue(input, limits.data.maxDepth)
  if (!json.success)
    return json
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
  const json = validateJsonValue(input, limits.data.maxDepth + BRIDGE_DEPTH_ALLOWANCE)
  if (!json.success)
    return json
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
