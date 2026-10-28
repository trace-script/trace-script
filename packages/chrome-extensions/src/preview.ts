import type { TraceEventEnvelope } from '@trace-script/metadata'

// Seven original events represent two model calls and one tool return.
export const previewEvents: TraceEventEnvelope[] = [
  { eventId: 'preview-start', traceId: 'preview-trace', sequence: 1, timestamp: '2024-01-01T12:00:00.000Z', type: 'trace.start' },
  {
    eventId: 'preview-request-1',
    traceId: 'preview-trace',
    requestId: 'request-1',
    sequence: 2,
    timestamp: '2024-01-01T12:00:00.100Z',
    type: 'model.request',
    payload: { model: 'gpt-4.1-mini', agent: 'planner', input: 'Weather in Beijing?' },
  },
  {
    eventId: 'preview-response-1',
    traceId: 'preview-trace',
    requestId: 'request-1',
    sequence: 3,
    timestamp: '2024-01-01T12:00:01.000Z',
    type: 'model.response',
    payload: {
      status: 'completed',
      output: [{
        type: 'function_call',
        call_id: 'call-weather',
        name: 'get_weather',
        arguments: '{"city":"Beijing"}',
      }],
      usage: { input_tokens: 24, output_tokens: 12, total_tokens: 36 },
    },
  },
  {
    eventId: 'preview-tool',
    traceId: 'preview-trace',
    sequence: 4,
    timestamp: '2024-01-01T12:00:01.500Z',
    type: 'tool.result',
    payload: { callId: 'call-weather', output: '{"condition":"sunny","temperature":22}' },
  },
  {
    eventId: 'preview-request-2',
    traceId: 'preview-trace',
    requestId: 'request-2',
    sequence: 5,
    timestamp: '2024-01-01T12:00:01.600Z',
    type: 'model.request',
    payload: {
      model: 'gpt-4.1-mini',
      agent: 'planner',
      input: [
        { type: 'function_call_output', call_id: 'call-weather', output: '{"condition":"sunny","temperature":22}' },
      ],
    },
  },
  {
    eventId: 'preview-response-2',
    traceId: 'preview-trace',
    requestId: 'request-2',
    sequence: 6,
    timestamp: '2024-01-01T12:00:02.000Z',
    type: 'model.response',
    payload: {
      status: 'completed',
      output_text: 'Beijing is sunny, 22°C.',
      output: [],
      usage: { input_tokens: 42, output_tokens: 14, total_tokens: 56 },
    },
  },
  { eventId: 'preview-end', traceId: 'preview-trace', sequence: 7, timestamp: '2024-01-01T12:00:02.100Z', type: 'trace.end' },
]
