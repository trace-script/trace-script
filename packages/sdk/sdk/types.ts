import type { TraceError, TraceEventEnvelope } from '@trace-script/metadata'

export type SdkIssueCode
  = 'disabled' | 'disposed' | 'no-window' | 'no-session' | 'no-trace'
    | 'session-active' | 'trace-active' | 'invalid-options' | 'invalid-event'
    | 'sequence-conflict' | 'redaction-failed' | 'send-failed' | 'event-too-large'
    | 'handshake-failed'

export interface SdkIssue {
  code: SdkIssueCode
  message: string
}

export type SdkResult = { ok: true } | { ok: false, issue: SdkIssue }
export type SdkValueResult<T> = { ok: true, value: T } | { ok: false, issue: SdkIssue }

export interface TraceSdkOptions {
  enabled?: boolean
  batchSize?: number
  flushIntervalMs?: number
  maxEventBytes?: number
  maxBatchBytes?: number
  handshakeTimeoutMs?: number
  redact?: (event: TraceEventEnvelope) => TraceEventEnvelope
  onError?: (issue: SdkIssue) => void
  debug?: boolean
}

export interface SdkStats {
  emitted: number
  sent: number
  batches: number
  queued: number
  dropped: number
  configurationErrors: number
  validationErrors: number
  redactionErrors: number
  sendErrors: number
  handshakeErrors: number
}

export type SpanOptions = Pick<TraceEventEnvelope, 'parentId' | 'attributes' | 'payload' | 'agent' | 'model' | 'metrics'>
export type CompletionOptions = Pick<TraceEventEnvelope, 'payload' | 'attributes' | 'metrics' | 'error'> & {
  status?: 'success' | 'error' | 'cancelled'
}

export interface SessionContext {
  sessionId: string
  traceId: string
}

export interface TraceContext extends SessionContext {
  spanId: string
}

export interface SpanHandle {
  spanId: string
  sessionId: string
  traceId: string
  end: (options?: CompletionOptions) => SdkResult
  fail: (error: TraceError) => SdkResult
}

export interface TraceSdk {
  configure: (options: TraceSdkOptions) => SdkResult
  startSession: (name?: string, options?: SpanOptions) => SdkValueResult<SessionContext>
  endSession: (options?: CompletionOptions) => SdkResult
  startTrace: (name: string, options?: SpanOptions) => SdkValueResult<TraceContext>
  endTrace: (options?: CompletionOptions) => SdkResult
  emit: (event: TraceEventEnvelope) => SdkValueResult<TraceEventEnvelope>
  startSpan: (name: string, options?: SpanOptions) => SdkValueResult<SpanHandle>
  flush: () => SdkValueResult<number>
  dispose: () => SdkResult
  isCollectorAvailable: (timeoutMs?: number) => Promise<boolean>
  getStats: () => SdkStats
}
