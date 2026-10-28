import type { CallRecord } from './types'
import { recordId } from './metrics'

export function emptyCall(traceId: string, kind: 'model' | 'tool', key: string): CallRecord {
  return {
    id: recordId(traceId, kind, key),
    traceId,
    kind,
    callId: key,
    name: kind === 'model' ? 'Model call' : 'Tool call',
    model: '—',
    agent: '—',
    status: kind === 'model' ? 'running' : 'waiting',
    errors: [],
    issues: [],
    events: [],
    conflicts: [],
    tokens: {},
    timing: { anomalous: false },
    associationConflict: false,
  }
}

export function conflict(call: CallRecord, message: string): void {
  call.associationConflict = true
  if (!call.issues.includes(message))
    call.issues.push(message)
}
