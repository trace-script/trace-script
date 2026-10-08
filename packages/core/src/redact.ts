import type { JsonValue, TraceEventEnvelope } from '@trace-script/metadata'
import { inspectJson } from './json'
import { parseTraceEvent } from './parse'

export const DEFAULT_REDACT_FIELDS = ['authorization', 'cookie', 'set-cookie', 'apiKey', 'api_key', 'accessToken', 'refreshToken', 'access_token', 'refresh_token', 'password', 'secret']
export function redactJson(value: JsonValue, fields: readonly string[] = DEFAULT_REDACT_FIELDS): JsonValue {
  const hidden = new Set(fields.map(field => field.toLowerCase()))

  function visit(item: JsonValue): JsonValue {
    if (Array.isArray(item))
      return item.map(visit)

    if (item === null || typeof item !== 'object')
      return item

    return Object.fromEntries(Object.entries(item).map(([key, child]) => {
      if (hidden.has(key.toLowerCase()))
        return [key, '[REDACTED]']

      if ((key === 'arguments' || key === 'output') && typeof child === 'string') {
        try {
          return [key, JSON.stringify(visit(inspectJson(JSON.parse(child))))]
        }
        catch {
          return [key, child]
        }
      }

      return [key, visit(child)]
    }))
  }

  return visit(value)
}
export function redactEvent(event: TraceEventEnvelope, fields: readonly string[] = DEFAULT_REDACT_FIELDS): TraceEventEnvelope {
  const structural = new Set(['eventid', 'traceid', 'sessionid', 'parentid', 'version', 'type', 'sequence', 'timestamp', 'status'])

  return parseTraceEvent(redactJson(event, fields.filter(field => !structural.has(field.toLowerCase()))))
}
