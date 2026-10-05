import type { TraceEventEnvelope } from '@trace-script/metadata'
import { PROTOCOL_VERSION } from '@trace-script/metadata'

export const baseEvent = {
  version: PROTOCOL_VERSION,
  eventId: 'event-1',
  sessionId: 'session-1',
  traceId: 'trace-1',
  sequence: 1,
  timestamp: '2026-10-04T00:00:00.000Z',
  type: 'log',
  name: 'Protocol fixture',
  status: 'success',
} satisfies TraceEventEnvelope

export const conversationEvents: TraceEventEnvelope[] = [
  { ...baseEvent, eventId: 'session-start', type: 'session.start', status: 'running' },
  { ...baseEvent, eventId: 'user-message', sequence: 2, type: 'message.user', payload: { role: 'user', content: 'Explain postMessage.' } },
  { ...baseEvent, eventId: 'assistant-start', sequence: 3, type: 'message.assistant.start', status: 'running' },
  { ...baseEvent, eventId: 'assistant-completed', sequence: 4, type: 'message.assistant.completed', parentId: 'assistant-start', payload: { content: 'It sends a message between windows.' } },
  { ...baseEvent, eventId: 'session-end', sequence: 5, type: 'session.end', parentId: 'session-start', timestamp: '2026-10-04T00:00:00.100Z' },
]

export const streamingEvents: TraceEventEnvelope[] = [
  { ...baseEvent, eventId: 'model-request', type: 'model.request', status: 'running', model: { name: 'fixture-model', provider: 'simulated' } },
  { ...baseEvent, eventId: 'message-start', sequence: 2, type: 'message.assistant.start', parentId: 'model-request', status: 'running' },
  { ...baseEvent, eventId: 'delta-1', sequence: 3, type: 'message.assistant.delta', parentId: 'message-start', payload: { delta: 'Hello ' }, status: 'running' },
  { ...baseEvent, eventId: 'delta-2', sequence: 4, type: 'message.assistant.delta', parentId: 'message-start', payload: { delta: 'world.' }, status: 'running' },
  { ...baseEvent, eventId: 'model-response', sequence: 5, type: 'model.response', parentId: 'model-request', timestamp: '2026-10-04T00:00:00.050Z', metrics: { inputTokens: 5, outputTokens: 3, totalTokens: 8 } },
  { ...baseEvent, eventId: 'message-completed', sequence: 6, type: 'message.assistant.completed', parentId: 'message-start', payload: { content: 'Hello world.' } },
]

export const toolSuccessEvents: TraceEventEnvelope[] = [
  { ...baseEvent, eventId: 'tool-start', type: 'tool.start', name: 'Search', status: 'running', payload: { query: 'protocol' } },
  { ...baseEvent, eventId: 'tool-result', type: 'tool.result', sequence: 2, parentId: 'tool-start', timestamp: '2026-10-04T00:00:00.025Z', payload: { results: ['Found'] } },
]

export const toolRetryEvents: TraceEventEnvelope[] = [
  { ...baseEvent, eventId: 'tool-attempt-1', type: 'tool.start', status: 'running' },
  { ...baseEvent, eventId: 'tool-failure', sequence: 2, type: 'tool.error', parentId: 'tool-attempt-1', error: { message: 'Temporary failure', code: 'RETRYABLE' }, timestamp: '2026-10-04T00:00:00.010Z', status: 'error' },
  { ...baseEvent, eventId: 'tool-attempt-2', sequence: 3, type: 'tool.start', parentId: 'tool-attempt-1', status: 'running', timestamp: '2026-10-04T00:00:00.020Z' },
  { ...baseEvent, eventId: 'tool-retry-result', sequence: 4, type: 'tool.result', parentId: 'tool-attempt-2', timestamp: '2026-10-04T00:00:00.040Z' },
]

export const agentHandoffEvents: TraceEventEnvelope[] = [
  { ...baseEvent, eventId: 'agent-start', type: 'agent.start', status: 'running', agent: { id: 'planner', name: 'Planner' } },
  { ...baseEvent, eventId: 'agent-handoff', sequence: 2, type: 'agent.handoff', parentId: 'agent-start', agent: { id: 'researcher', name: 'Researcher' }, payload: { from: 'planner', to: 'researcher' } },
  { ...baseEvent, eventId: 'researcher-start', sequence: 3, type: 'agent.start', parentId: 'agent-handoff', agent: { id: 'researcher', name: 'Researcher' }, status: 'running' },
  { ...baseEvent, eventId: 'researcher-end', sequence: 4, type: 'agent.end', parentId: 'researcher-start' },
  { ...baseEvent, eventId: 'agent-end', sequence: 5, type: 'agent.end', parentId: 'agent-start' },
]

export const outOfOrderEvents = [...streamingEvents].reverse()
export const duplicateEvents = [...conversationEvents, ...conversationEvents]
export const invalidFieldEvent = { ...baseEvent, status: 'finished', sequence: 0 }
export const unsupportedVersionEvent = { ...baseEvent, version: '0.9' }
export const oversizedEvent = { ...baseEvent, payload: { content: 'x'.repeat(1024 * 1024) } }

export const protocolScenarios = {
  conversation: conversationEvents,
  streaming: streamingEvents,
  toolSuccess: toolSuccessEvents,
  toolRetry: toolRetryEvents,
  agentHandoff: agentHandoffEvents,
  outOfOrder: outOfOrderEvents,
  duplicate: duplicateEvents,
}
