import type { ProtocolIssue } from '@trace-script/core'
import { safeParseBridgeMessage } from '@trace-script/core'
import { TRACE_CHANNEL } from '@trace-script/metadata'

export type RecordResult
  = | { success: true }
    | { success: false, reason: ProtocolIssue['code'] | 'DELIVERY_FAILED' | 'TRACE_ENDED' }

export interface TraceHandle {
  readonly traceId: string
  recordRequest: (request: object) => RecordResult
  recordResponse: (response: object) => RecordResult
  recordToolResult: (result: { callId: string, output: string }) => RecordResult
  end: () => RecordResult
  fail: (error: Error | string) => RecordResult
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
          const parsed = safeParseBridgeMessage({ channel: TRACE_CHANNEL, kind: 'trace-event', data: envelope })
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

      record({ type: 'trace.start' })

      return {
        traceId,
        recordRequest(request: object) {
          return record({ type: 'model.request', payload: request })
        },
        recordResponse(response: object) {
          return record({ type: 'model.response', payload: response })
        },
        recordToolResult(result: { callId: string, output: string }) {
          return record({ type: 'tool.result', payload: result })
        },
        end() {
          if (ended)
            return { success: true }
          const result = record({ type: 'trace.end' })
          if (result.success)
            ended = true
          return result
        },
        fail(error: Error | string) {
          if (ended)
            return { success: true }
          const message = error instanceof Error ? error.message : error
          const result = record({ type: 'trace.error', payload: { message } })
          if (result.success)
            ended = true
          return result
        },
      }
    },
  }
}
