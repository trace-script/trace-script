import type { TraceEventEnvelope } from '@trace-script/metadata'

export type CallStatus = 'running' | 'waiting' | 'success' | 'failed' | 'cancelled' | 'incomplete' | 'interrupted' | 'unknown'
export type TraceStatus = 'running' | 'success' | 'failed' | 'cancelled' | 'conflict'

export interface Tokens {
  input?: number
  output?: number
  total?: number
}

export interface TokenAmount {
  value?: number
  complete: boolean
}

export interface UsageSummary {
  input: TokenAmount
  output: TokenAmount
  total: TokenAmount
}

export interface Timing {
  start?: string
  end?: string
  duration?: number
  anomalous: boolean
}

export interface CallRecord {
  id: string
  traceId: string
  kind: 'model' | 'tool'
  callId: string
  name: string
  model: string
  agent: string
  status: CallStatus
  input?: string
  output?: string
  declaration?: string
  parentId?: string
  errors: string[]
  issues: string[]
  events: TraceEventEnvelope[]
  conflicts: TraceEventEnvelope[]
  tokens: Tokens
  usage?: string
  usageEventId?: string
  timing: Timing
  associationConflict: boolean
}

export interface TraceSummary {
  id: string
  traceId: string
  kind: 'trace'
  status: TraceStatus
  calls: CallRecord[]
  events: TraceEventEnvelope[]
  conflicts: TraceEventEnvelope[]
  errors: string[]
  issues: string[]
  timing: Timing
  tokens: UsageSummary
}

export type TraceRecord = CallRecord | TraceSummary
