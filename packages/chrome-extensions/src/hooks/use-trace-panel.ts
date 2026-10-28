import type { CallRecord, TraceRecord, TraceSummary, UsageSummary } from '@trace-script/core'
import type { TraceEventEnvelope } from '@trace-script/metadata'
import type { ComputedRef, Ref, ShallowRef } from 'vue'
import type { WorkerToPanelMessage } from '@/messages'
import type { EventTypeFilter, StatusFilter, TracePanelFilter } from '@/types/trace-panel'
import { aggregateEvents, sumUsage } from '@trace-script/core'
import { onKeyStroke, useEventListener, useToggle } from '@vueuse/core'
import { computed, onMounted, onUnmounted, reactive, shallowRef } from 'vue'
import { EXTENSION_MESSAGE_TYPE, EXTENSION_PORT_NAME } from '@/messages'
import { previewEvents } from '@/preview'
import { matchesCall, matchesTrace, TRACE_FILTER_VALUE } from '@/utils/ui-model'

const TIMELINE_FALLBACK_HEIGHT = 140
const RESIZE_STEP = 4

interface TracePanelState {
  events: ShallowRef<TraceEventEnvelope[]>
  traces: ComputedRef<TraceSummary[]>
  calls: ComputedRef<CallRecord[]>
  selectedId: ShallowRef<string>
  activeId: ComputedRef<string>
  selectedRecord: ComputedRef<TraceRecord | false>
  isPreview: ShallowRef<boolean>
  connected: ShallowRef<boolean>
  filtersVisible: ShallowRef<boolean>
  recording: Ref<boolean>
  filter: TracePanelFilter
  agents: ComputedRef<string[]>
  visibleCalls: ComputedRef<CallRecord[]>
  visibleTraces: ComputedRef<TraceSummary[]>
  totalUsage: ComputedRef<UsageSummary>
  visibleUsage: ComputedRef<UsageSummary>
  failedCount: ComputedRef<number>
  failedTraceCount: ComputedRef<number>
  timelineHeight: ShallowRef<number>
  detailsWidth: ShallowRef<number>
  workspaceClass: ComputedRef<string>
  contentClass: ComputedRef<string>
  toggleRecording: (value?: boolean) => boolean
  handleMessage: (message: WorkerToPanelMessage) => void
  selectEvent: (id: string) => void
  clearEvents: () => void
  addPreviewEvents: () => void
  startResize: (kind: 'timeline' | 'details', event: PointerEvent) => void
  nudgeTimeline: (delta: number) => void
}

export function useTracePanel(): TracePanelState {
  const events = shallowRef<TraceEventEnvelope[]>([])
  const isPreview = shallowRef(false)
  const connected = shallowRef(false)
  const [recording, toggleRecording] = useToggle(true)

  const traces = computed(() => aggregateEvents(events.value))
  const calls = computed(() => {
    const allCalls = traces.value.flatMap(trace => trace.calls)
    return allCalls.sort((left, right) => {
      const leftTimestamp = left.timing.start ?? left.timing.end ?? left.events[0]?.timestamp ?? ''
      const rightTimestamp = right.timing.start ?? right.timing.end ?? right.events[0]?.timestamp ?? ''
      return Date.parse(leftTimestamp) - Date.parse(rightTimestamp) || left.id.localeCompare(right.id)
    })
  })
  const records = computed(() => traces.value.flatMap(trace => [trace, ...trace.calls]))

  const filtersVisible = shallowRef(true)
  const filter = reactive({
    query: '',
    type: TRACE_FILTER_VALUE.ALL as EventTypeFilter,
    status: TRACE_FILTER_VALUE.ALL as StatusFilter,
    agent: TRACE_FILTER_VALUE.ALL,
    onlyErrors: false,
  })
  const agents = computed(() => {
    const callAgents = calls.value.map(call => call.agent).filter(agent => agent !== '—')
    return [TRACE_FILTER_VALUE.ALL, ...new Set(callAgents)]
  })
  const visibleTraces = computed(() => traces.value.filter((trace) => {
    return matchesTrace(trace, filter)
      || trace.calls.some(call => matchesCall(call, filter, trace))
  }))
  const visibleCalls = computed(() => calls.value.filter((call) => {
    const trace = traces.value.find(trace => trace.traceId === call.traceId)
    return matchesCall(call, filter, trace)
  }))

  const selectedId = shallowRef('')
  const selectedSources = shallowRef<string[]>([])
  const selectedKind = shallowRef<'trace' | 'model' | 'tool'>('trace')
  const selectedRecord = computed(() => {
    const selected = records.value.find(record => record.id === selectedId.value)
    if (selected)
      return selected

    // Pairing late events can change a record's ID; recover it from its source events.
    return records.value.find((record) => {
      return record.kind === selectedKind.value
        && record.events.some(event => selectedSources.value.includes(event.eventId))
    }) ?? false
  })
  const activeId = computed(() => selectedRecord.value ? selectedRecord.value.id : '')

  function selectEvent(id: string): void {
    const record = records.value.find(record => record.id === id)
    if (!record)
      return
    selectedId.value = id
    selectedSources.value = record.events.map(event => event.eventId)
    selectedKind.value = record.kind
  }

  const totalUsage = computed(() => sumUsage(calls.value))
  const visibleUsage = computed(() => sumUsage(visibleCalls.value))
  const failedCount = computed(() => calls.value.filter(call => call.status === 'failed').length)
  const failedTraceCount = computed(() => {
    return traces.value.filter(trace => trace.status === 'failed' || trace.status === 'conflict').length
  })

  function handleMessage(message: WorkerToPanelMessage): void {
    if (message.type === EXTENSION_MESSAGE_TYPE.TRACE_QUERY_RESULT)
      events.value = [...message.events]
    else if (message.type === EXTENSION_MESSAGE_TYPE.TRACE_EVENTS_APPEND && recording.value)
      events.value = [...events.value, message.event]
    if (!selectedRecord.value) {
      const first = calls.value[0] ?? traces.value[0]
      if (first)
        selectEvent(first.id)
    }
  }
  function clearEvents(): void {
    events.value = []
    selectedId.value = ''
    selectedSources.value = []
  }
  function addPreviewEvents(): void {
    if (!isPreview.value)
      return
    const suffix = String(events.value.length)
    const offset = events.value.length * 1000
    events.value = [...events.value, ...previewEvents.map(event => ({
      ...event,
      traceId: `${event.traceId}-${suffix}`,
      eventId: `${event.eventId}-${suffix}`,
      timestamp: new Date(Date.parse(event.timestamp) + offset).toISOString(),
    }))]
  }

  const timelineHeight = shallowRef(0)
  const detailsWidth = shallowRef(500)
  const dragging = shallowRef<'timeline' | 'details' | ''>('')
  let dragOrigin = 0
  let dragSize = 0
  const workspaceClass = computed(() => timelineHeight.value > 0
    ? `timeline-layout-${timelineHeight.value}`
    : 'timeline-layout-auto')
  const contentClass = computed(() => `details-layout-${detailsWidth.value}`)

  function startResize(kind: 'timeline' | 'details', event: PointerEvent): void {
    dragging.value = kind
    dragOrigin = kind === 'timeline' ? event.clientY : event.clientX
    if (kind === 'timeline') {
      const handle = event.currentTarget as HTMLElement
      dragSize = timelineHeight.value > 0
        ? timelineHeight.value
        : handle.previousElementSibling?.getBoundingClientRect().height ?? TIMELINE_FALLBACK_HEIGHT
    }
    else {
      dragSize = detailsWidth.value
    }
    ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
  }
  function resize(event: PointerEvent): void {
    if (!dragging.value)
      return
    if (dragging.value === 'timeline') {
      const delta = event.clientY - dragOrigin
      const requestedHeight = dragSize + delta
      timelineHeight.value = snapResize(requestedHeight, 80, 360)
    }
    else {
      const delta = dragOrigin - event.clientX
      const requestedWidth = dragSize + delta
      detailsWidth.value = snapResize(requestedWidth, 260, 520)
    }
  }
  function nudgeTimeline(delta: number): void {
    const autoHeight = (document.querySelector('.agent-work-overview') as HTMLElement | null)?.offsetHeight ?? TIMELINE_FALLBACK_HEIGHT
    const current = timelineHeight.value > 0 ? timelineHeight.value : autoHeight
    timelineHeight.value = snapResize(current + delta, 80, 360)
  }
  useEventListener('pointermove', resize)
  useEventListener('pointerup', () => dragging.value = '')

  onKeyStroke(['ArrowDown', 'ArrowUp', 'Escape'], (event) => {
    const target = event.target
    if (target instanceof HTMLElement && (target.closest('input, select, textarea, [role="separator"], [role="tablist"], .agent-work-overview') || target.isContentEditable))
      return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const ids = visibleCalls.value.map(call => call.id)
      if (!ids.length)
        return
      event.preventDefault()
      const index = ids.indexOf(activeId.value)
      const next = event.key === 'ArrowDown' ? Math.min(index + 1, ids.length - 1) : Math.max(index - 1, 0)
      selectEvent(ids[next]!)
    }
    if (event.key === 'Escape') {
      selectedId.value = ''
      selectedSources.value = []
    }
  })

  let cleanup = (): void => {}
  onMounted(() => {
    if (typeof chrome === 'undefined' || !chrome.devtools?.inspectedWindow) {
      isPreview.value = true
      connected.value = true
      events.value = [...previewEvents]
      const first = calls.value[0]
      if (first)
        selectEvent(first.id)
      return
    }
    const port = chrome.runtime.connect({ name: EXTENSION_PORT_NAME.PANEL })
    port.onMessage.addListener(handleMessage)
    port.postMessage({ type: EXTENSION_MESSAGE_TYPE.PANEL_CONNECT, tabId: chrome.devtools.inspectedWindow.tabId })
    connected.value = true
    cleanup = () => {
      port.onMessage.removeListener(handleMessage)
      port.disconnect()
      connected.value = false
    }
  })
  onUnmounted(() => {
    cleanup()
  })

  return {
    events,
    traces,
    calls,
    selectedId,
    activeId,
    selectedRecord,
    isPreview,
    connected,
    filtersVisible,
    recording,
    filter,
    agents,
    visibleCalls,
    visibleTraces,
    totalUsage,
    visibleUsage,
    failedCount,
    failedTraceCount,
    timelineHeight,
    detailsWidth,
    workspaceClass,
    contentClass,
    toggleRecording,
    handleMessage,
    selectEvent,
    clearEvents,
    addPreviewEvents,
    startResize,
    nudgeTimeline,
  }
}

function snapResize(value: number, minimum: number, maximum: number): number {
  const steppedValue = Math.round(value / RESIZE_STEP) * RESIZE_STEP
  return Math.min(maximum, Math.max(minimum, steppedValue))
}
