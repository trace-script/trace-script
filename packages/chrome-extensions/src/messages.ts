import type { TraceEventEnvelope } from '@trace-script/metadata'
import { isNumber, isObject, isString } from '@trace-script/shared'

export const EXTENSION_MESSAGE_TYPE = {
  INGEST_EVENT: 'INGEST_EVENT',
  PANEL_CONNECT: 'PANEL_CONNECT',
  TRACE_QUERY: 'TRACE_QUERY',
  TRACE_QUERY_RESULT: 'TRACE_QUERY_RESULT',
  TRACE_EVENTS_APPEND: 'TRACE_EVENTS_APPEND',
} as const

export const EXTENSION_PORT_NAME = {
  CONTENT: 'trace-content',
  PANEL: 'trace-panel',
} as const

export interface ContentToWorkerMessage {
  type: typeof EXTENSION_MESSAGE_TYPE.INGEST_EVENT
  event: TraceEventEnvelope
}

export type PanelToWorkerMessage = {
  type: typeof EXTENSION_MESSAGE_TYPE.PANEL_CONNECT
  tabId: number
} | {
  type: typeof EXTENSION_MESSAGE_TYPE.TRACE_QUERY
}

export type WorkerToPanelMessage = {
  type: typeof EXTENSION_MESSAGE_TYPE.TRACE_QUERY_RESULT
  events: TraceEventEnvelope[]
} | {
  type: typeof EXTENSION_MESSAGE_TYPE.TRACE_EVENTS_APPEND
  event: TraceEventEnvelope
}

export function isContentToWorkerMessage(message: object): message is ContentToWorkerMessage {
  if (!isObject(message) || !('type' in message))
    return false
  if (!isString(message.type) || message.type !== EXTENSION_MESSAGE_TYPE.INGEST_EVENT)
    return false
  if (!('event' in message))
    return false
  return isObject(message.event)
}

export function isPanelToWorkerMessage(message: object): message is PanelToWorkerMessage {
  if (!isObject(message) || !('type' in message) || !isString(message.type))
    return false
  if (message.type === EXTENSION_MESSAGE_TYPE.PANEL_CONNECT)
    return 'tabId' in message && isNumber(message.tabId)
  return message.type === EXTENSION_MESSAGE_TYPE.TRACE_QUERY
}
