import type { ProtocolIssue } from '@trace-script/core'
import { safeParseBridgeMessage } from '@trace-script/core'
import { TRACE_BRIDGE_KIND, TRACE_CHANNEL, TRACE_EVENT_TYPE } from '@trace-script/metadata'

export type RecordResult
  = | { success: true }
    | { success: false, reason: ProtocolIssue['code'] | 'DELIVERY_FAILED' | 'TRACE_ENDED' }

export type RequestRecordResult = RecordResult & { requestId: string }
export type ErrorTarget = { requestId: string } | { callId: string }
export interface ToolResult {
  callId: string
  output: string
  status?: 'success' | 'failed' | 'cancelled'
  message?: string
}

export interface TraceHandle {
  readonly traceId: string
  recordRequest: (request: object) => RequestRecordResult
  recordResponse: (requestId: string, response: object) => RecordResult
  recordToolResult: (result: ToolResult) => RecordResult
  end: (status?: 'cancelled') => RecordResult
  fail: (error: Error | string, target?: ErrorTarget) => RecordResult
}

let fallbackCounter = 0

function createId(): string {
  if (globalThis.crypto?.randomUUID)
    return globalThis.crypto.randomUUID()
  fallbackCounter++
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${fallbackCounter}`
}

export function createTraceSdk(): { startTrace: () => TraceHandle } {
  return {
    startTrace() {
      const traceId = createId()
      let sequence = 0
      let ended = false

      function record(event: object): RecordResult {
        if (ended)
          return { success: false, reason: 'TRACE_ENDED' }
        try {
          const envelope = {
            eventId: createId(),
            traceId,
            sequence: sequence + 1,
            timestamp: new Date().toISOString(),
            ...event,
          }
          const parsed = safeParseBridgeMessage({ channel: TRACE_CHANNEL, kind: TRACE_BRIDGE_KIND, data: envelope })
          if (!parsed.success)
            return { success: false, reason: parsed.issues[0]?.code ?? 'INVALID_BRIDGE' }
          window.postMessage(parsed.data, window.location.origin)
          sequence++
          return { success: true }
        }
        catch {
          return { success: false, reason: 'DELIVERY_FAILED' }
        }
      }

      record({ type: TRACE_EVENT_TYPE.TRACE_START })

      return {
        traceId,
        recordRequest(request: object): RequestRecordResult {
          const requestId = createId()
          const result = record({ type: TRACE_EVENT_TYPE.MODEL_REQUEST, requestId, payload: request })
          return { ...result, requestId }
        },
        recordResponse(requestId: string, response: object) {
          return record({ type: TRACE_EVENT_TYPE.MODEL_RESPONSE, requestId, payload: response })
        },
        recordToolResult(result: ToolResult) {
          return record({ type: TRACE_EVENT_TYPE.TOOL_RESULT, payload: result })
        },
        end(status?: 'cancelled') {
          if (ended)
            return { success: true }
          const result = record({ type: TRACE_EVENT_TYPE.TRACE_END, ...(status ? { status } : {}) })
          if (result.success)
            ended = true
          return result
        },
        fail(error: Error | string, target?: ErrorTarget) {
          if (ended)
            return { success: true }
          const message = error instanceof Error ? error.message : error
          const result = record({ type: TRACE_EVENT_TYPE.TRACE_ERROR, payload: { message, ...target } })
          if (result.success)
            ended = true
          return result
        },
      }
    },
  }
}
