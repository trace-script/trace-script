import type { TraceEventEnvelope } from '@trace-script/metadata'
import type { CallRecord, Timing, TokenAmount, Tokens, UsageSummary } from './types'
import { isArray, isNumber, isObject, isUndefined } from '@trace-script/shared'

export function recordId(traceId: string, kind: 'trace' | 'model' | 'tool', key = ''): string {
  return JSON.stringify([traceId, kind, key])
}

export function compareEvents(a: TraceEventEnvelope, b: TraceEventEnvelope): number {
  return a.sequence - b.sequence || Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.eventId.localeCompare(b.eventId)
}

export function callTiming(start?: string, end?: string): Timing {
  if (!start || !end)
    return { start, end, anomalous: false }
  const duration = Date.parse(end) - Date.parse(start)
  if (!isNumber(duration) || duration < 0)
    return { start, end, anomalous: true }
  return { start, end, duration, anomalous: false }
}

export function validToken(value: number): boolean {
  return Number.isInteger(value) && value >= 0
}

export function responseTokens(event: Extract<TraceEventEnvelope, { type: 'model.response' }>): Tokens {
  const usage = event.payload.usage
  if (!isObject(usage) || isArray(usage))
    return {}
  const input = 'input_tokens' in usage ? usage.input_tokens : usage.prompt_tokens
  const output = 'output_tokens' in usage ? usage.output_tokens : usage.completion_tokens
  const result: Tokens = {}
  if (isNumber(input) && validToken(input))
    result.input = input
  if (isNumber(output) && validToken(output))
    result.output = output
  if (isNumber(usage.total_tokens) && validToken(usage.total_tokens))
    result.total = usage.total_tokens
  else if (!('total_tokens' in usage) && !isUndefined(result.input) && !isUndefined(result.output) && validToken(result.input + result.output))
    result.total = result.input + result.output
  return result
}

export function sumUsage(calls: readonly CallRecord[]): UsageSummary {
  const models = calls.filter(call => call.kind === 'model')
  function sum(key: keyof Tokens): TokenAmount {
    const values = models.flatMap((call) => {
      const value = call.tokens[key]
      return isUndefined(value) ? [] : [value]
    })
    const value = values.reduce((total, value) => total + value, 0)
    if (!values.length || !validToken(value))
      return { complete: false }
    return { value, complete: models.length > 0 && values.length === models.length }
  }
  return { input: sum('input'), output: sum('output'), total: sum('total') }
}
