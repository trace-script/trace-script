import type { TraceEventEnvelope } from '@trace-script/metadata'
import type { CallStatus } from './types'
import { isArray, isObject, isString } from '@trace-script/shared'

export function modelMetadata(event: Extract<TraceEventEnvelope, { type: 'model.request' | 'model.response' }>, key: 'name' | 'model' | 'agent'): string {
  const trace = event.payload.trace
  const nested = isObject(trace) && !isArray(trace) ? trace[key] : undefined
  const value = nested ?? event.payload[key]
  return isString(value) ? value : ''
}

export function responseStatus(event: Extract<TraceEventEnvelope, { type: 'model.response' }>): CallStatus {
  const status = event.payload.status
  if (status === 'failed' || event.payload.error)
    return 'failed'
  if (status === 'cancelled')
    return 'cancelled'
  if (status === 'completed' || status === 'success')
    return 'success'
  if (status === 'incomplete')
    return 'incomplete'
  return 'unknown'
}
