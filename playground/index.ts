import type { TraceEventEnvelope } from '@trace-script/metadata'
import { aggregateMessages, aggregateSpans, normalizeTraceEvents, safeParseBridgeMessage } from '@trace-script/core'
import { PROTOCOL_VERSION, TRACE_CHANNEL } from '@trace-script/metadata'
import { createTraceSdk } from '@trace-script/sdk'
import { invalidFieldEvent, oversizedEvent, protocolScenarios, unsupportedVersionEvent } from '../fixtures/protocol'

const status = document.querySelector<HTMLElement>('#status')
const collector = document.querySelector<HTMLElement>('#collector')
const output = document.querySelector<HTMLElement>('#output')
const counters = document.querySelector<HTMLElement>('#counters')
const scenario = document.querySelector<HTMLSelectElement>('#scenario')
const sendSdk = document.querySelector<HTMLButtonElement>('#send-sdk')
const sendNative = document.querySelector<HTMLButtonElement>('#send-native')
const lifecycle = document.querySelector<HTMLButtonElement>('#lifecycle')
const check = document.querySelector<HTMLButtonElement>('#check-collector')
const clear = document.querySelector<HTMLButtonElement>('#clear')

if (!status || !collector || !output || !counters || !scenario || !sendSdk || !sendNative || !lifecycle || !check || !clear)
  throw new Error('The playground page is missing a required control')

const sdk = createTraceSdk({
  onError(issue) {
    status.textContent = `${issue.code}: ${issue.message}`
  },
})
let received: TraceEventEnvelope[] = []
let rejected = 0
let batchCount = 0
let runCount = 0

scenario.addEventListener('change', () => {
  sendSdk.disabled = !Object.hasOwn(protocolScenarios, scenario.value)
})

function render(): void {
  const normalized = normalizeTraceEvents(received)
  counters.textContent = `页面捕获 ${received.length} 条 · 去重后 ${normalized.events.length} 条 · 批次 ${batchCount} · 拒绝 ${rejected}`
  output.textContent = JSON.stringify({
    sdk: sdk.getStats(),
    duplicates: normalized.duplicateCount,
    conflicts: normalized.conflictingEventIds,
    orphans: normalized.orphanEventIds,
    spans: aggregateSpans(received),
    messages: aggregateMessages(received),
    events: normalized.events,
  }, null, 2)
}

function scenarioEvents(): TraceEventEnvelope[] {
  const selection = Object.entries(protocolScenarios).find(([name]) => name === scenario.value)
  if (!selection)
    return []
  runCount++
  const prefix = `playground-${runCount}-${crypto.randomUUID()}`
  return selection[1].map(event => ({
    ...event,
    eventId: `${prefix}-${event.eventId}`,
    sessionId: `${prefix}-${event.sessionId}`,
    traceId: `${prefix}-${event.traceId}`,
    ...(event.parentId ? { parentId: `${prefix}-${event.parentId}` } : {}),
  }))
}

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== window.location.origin)
    return
  // Observe the transport without answering collector handshakes.
  if (!event.data || event.data.channel !== TRACE_CHANNEL)
    return
  const parsed = safeParseBridgeMessage(event.data)
  if (!parsed.success) {
    rejected++
    status.textContent = parsed.issues.map(issue => `${issue.code}: ${issue.message}`).join('; ')
    render()
    return
  }
  if (parsed.data.kind === 'trace-event' || parsed.data.kind === 'trace-batch') {
    received.push(...(parsed.data.kind === 'trace-event' ? [parsed.data.data] : parsed.data.data))
    if (received.length > 500)
      received = received.slice(-500)
    batchCount++
    render()
  }
})

sendSdk.addEventListener('click', () => {
  const events = scenarioEvents()
  let accepted = 0
  for (const event of events) {
    if (sdk.emit(event).ok)
      accepted++
  }
  if (sdk.flush().ok)
    status.textContent = `SDK 接受 ${accepted}/${events.length} 条事件；乱序与重复序号会被 SDK 拒绝。`
  render()
})

sendNative.addEventListener('click', () => {
  const invalid = scenario.value === 'invalid'
    ? invalidFieldEvent
    : scenario.value === 'version'
      ? unsupportedVersionEvent
      : scenario.value === 'oversized' ? oversizedEvent : false
  if (invalid) {
    window.postMessage({ channel: TRACE_CHANNEL, version: PROTOCOL_VERSION, kind: 'trace-event', data: invalid }, window.location.origin)
  }
  else {
    const data = scenarioEvents()
    if (data.length === 0)
      return
    window.postMessage({ channel: TRACE_CHANNEL, version: PROTOCOL_VERSION, kind: 'trace-batch', data }, window.location.origin)
  }
  status.textContent = '原生协议已发布；请检查页面捕获结果和 DevTools 面板。'
})

lifecycle.addEventListener('click', () => {
  if (!sdk.startSession('Playground session').ok)
    return
  if (!sdk.startTrace('Simulated agent turn').ok) {
    sdk.endSession()
    return
  }
  const span = sdk.startSpan('Simulated tool', { payload: { input: 'sample query' } })
  if (span.ok)
    span.value.end({ payload: { output: ['local fixture result'] } })
  sdk.endTrace()
  sdk.endSession()
  if (sdk.flush().ok)
    status.textContent = 'Session、Trace 与 Span 生命周期已发布。'
  render()
})

check.addEventListener('click', async () => {
  check.disabled = true
  collector.textContent = '正在检测采集器…'
  const available = await sdk.isCollectorAvailable()
  collector.textContent = available ? '采集器握手成功' : '未收到采集器响应，页面发布仍可继续'
  check.disabled = false
})

clear.addEventListener('click', () => {
  received = []
  rejected = 0
  batchCount = 0
  status.textContent = '页面捕获记录已清空。'
  render()
})

render()
