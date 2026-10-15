import type { TraceEventEnvelope } from '@trace-script/metadata'
import type { ComputedRef, Ref } from 'vue'
import type { WorkerToPanelMessage } from '@/messages'
import type { EventTypeFilter, StatusFilter, TracePanelFilter } from '@/types/trace-panel'
import { useEventListener, useToggle } from '@vueuse/core'
import { computed, ref as deepRef, onMounted, onUnmounted, reactive, shallowRef } from 'vue'
import { EXTENSION_MESSAGE_TYPE, EXTENSION_PORT_NAME } from '@/messages'
import { eventAgent, eventDuration, eventName, eventStatus, eventTimestamp, eventTokens, TRACE_FILTER_VALUE, TRACE_STATUS } from '@/utils/ui-model'

interface TracePanelState {
  events: Ref<TraceEventEnvelope[]>
  selectedId: Ref<string>
  selectedEvent: ComputedRef<TraceEventEnvelope | undefined>
  isPreview: Ref<boolean>
  connected: Ref<boolean>
  filtersVisible: Ref<boolean>
  recording: Ref<boolean>
  filter: TracePanelFilter
  agents: ComputedRef<string[]>
  visibleEvents: ComputedRef<TraceEventEnvelope[]>
  totalTokens: ComputedRef<number>
  visibleTokens: ComputedRef<number>
  failedCount: ComputedRef<number>
  maxDuration: ComputedRef<number>
  totalDuration: ComputedRef<number>
  timelineHeight: Ref<number>
  detailsWidth: Ref<number>
  workspaceStyle: ComputedRef<{ gridTemplateRows: string }>
  contentStyle: ComputedRef<{ gridTemplateColumns: string }>
  toggleRecording: () => boolean
  handleMessage: (message: WorkerToPanelMessage) => void
  selectEvent: (id: string) => void
  clearEvents: () => void
  addPreviewEvents: () => void
  startResize: (kind: 'timeline' | 'details', event: PointerEvent) => void
  nudgeTimeline: (delta: number) => void
}

export function useTracePanel(): TracePanelState {
  return createTracePanel()
}

function createTracePanel(): TracePanelState {
  const events = deepRef<TraceEventEnvelope[]>([])
  const selectedId = shallowRef('')
  const isPreview = shallowRef(false)
  const connected = shallowRef(false)
  const filtersVisible = shallowRef(true)
  const [recording, toggleRecording] = useToggle(true)
  const filter = reactive({
    query: '',
    type: TRACE_FILTER_VALUE.ALL as EventTypeFilter,
    status: TRACE_FILTER_VALUE.ALL as StatusFilter,
    agent: TRACE_FILTER_VALUE.ALL,
    onlyErrors: false,
  })
  // 0 表示「按内容自适应高度」，用户拖拽或按键调整后变为显式像素高度。
  const timelineHeight = shallowRef(0)
  const detailsWidth = shallowRef(500)
  const dragging = shallowRef<'timeline' | 'details' | null>(null)
  let dragOrigin = 0
  let dragSize = 0
  let cleanup = (): void => {}
  const previewEvents = [
    { eventId: 'preview-start', traceId: 'preview-trace', sequence: 1, timestamp: '2024-01-01T12:00:00.000Z', type: 'trace.start' },
    {
      eventId: 'preview-request',
      traceId: 'preview-trace',
      sequence: 2,
      timestamp: '2024-01-01T12:00:00.120Z',
      type: 'model.request',
      payload: { name: 'model.request', model: 'gpt-4.1-mini', agent: 'planner', input: 'Summarize the latest trace.' },
    },
    {
      eventId: 'preview-response',
      traceId: 'preview-trace',
      sequence: 3,
      timestamp: '2024-01-01T12:00:01.340Z',
      type: 'model.response',
      payload: {
        name: 'model.response',
        model: 'gpt-4.1-mini',
        agent: 'planner',
        output_text: 'The trace is healthy.',
        usage: { total_tokens: 42 },
        duration_ms: 1220,
        status: 'success',
      },
    },
    {
      eventId: 'preview-tool',
      traceId: 'preview-trace',
      sequence: 4,
      timestamp: '2024-01-01T12:00:02.000Z',
      type: 'tool.result',
      payload: { callId: 'call_preview', output: 'Tool result received.' },
    },
  ] as TraceEventEnvelope[]
  const visibleEvents = computed(() => events.value.filter((event) => {
    const haystack = `${eventName(event)} ${event.eventId} ${event.traceId} ${eventAgent(event)}`.toLowerCase()
    return (!filter.query || haystack.includes(filter.query.toLowerCase())) && (filter.type === TRACE_FILTER_VALUE.ALL || event.type === filter.type) && (filter.status === TRACE_FILTER_VALUE.ALL || eventStatus(event) === filter.status) && (filter.agent === TRACE_FILTER_VALUE.ALL || eventAgent(event) === filter.agent) && (!filter.onlyErrors || eventStatus(event) === TRACE_STATUS.FAILED)
  }))
  const selectedEvent = computed(() => events.value.find(event => event.eventId === selectedId.value))
  const agents = computed(() => [TRACE_FILTER_VALUE.ALL, ...new Set(events.value.map(eventAgent).filter(agent => agent !== '—'))])
  const totalTokens = computed(() => events.value.reduce((sum, event) => sum + (eventTokens(event) ?? 0), 0))
  const visibleTokens = computed(() => visibleEvents.value.reduce((sum, event) => sum + (eventTokens(event) ?? 0), 0))
  const failedCount = computed(() => events.value.filter(event => eventStatus(event) === TRACE_STATUS.FAILED).length)
  const maxDuration = computed(() => events.value.reduce((max, event) => Math.max(max, eventDuration(event)), 0))
  const totalDuration = computed(() => events.value.reduce((sum, event) => sum + eventDuration(event), 0))
  const workspaceStyle = computed(() => {
    const rows = timelineHeight.value > 0 ? `${timelineHeight.value}px` : 'auto'
    return { gridTemplateRows: `${rows} 1px minmax(0, 1fr)` }
  })
  const contentStyle = computed(() => ({ gridTemplateColumns: `minmax(0, 1fr) 1px ${detailsWidth.value}px` }))
  function handleMessage(message: WorkerToPanelMessage): void {
    if (message.type === EXTENSION_MESSAGE_TYPE.TRACE_QUERY_RESULT) {
      events.value = [...message.events]
    }
    else if (message.type === EXTENSION_MESSAGE_TYPE.TRACE_EVENTS_APPEND && recording.value && !events.value.some(event => event.eventId === message.event.eventId)) {
      events.value = [...events.value, message.event]
    }
    if (!selectedId.value && events.value[0])
      selectedId.value = events.value[0].eventId
  }
  function selectEvent(id: string): void {
    selectedId.value = id
  }
  function clearEvents(): void {
    events.value = []
    selectedId.value = ''
  }
  function addPreviewEvents(): void {
    if (!isPreview.value)
      return
    const offset = events.value.length
    const base = eventTimestamp(previewEvents[0]!) + offset * 3000
    const additions = Array.from({ length: 10 }, (_, index) => {
      const event = previewEvents[index % previewEvents.length]!
      return {
        ...event,
        eventId: `preview-${base}-${index}`,
        sequence: offset + index + 1,
        timestamp: new Date(base + index * 100).toISOString(),
      }
    })
    events.value = [...events.value, ...additions]
  }
  function startResize(kind: 'timeline' | 'details', event: PointerEvent): void {
    dragging.value = kind
    dragOrigin = kind === 'timeline' ? event.clientY : event.clientX
    if (kind === 'timeline') {
      const handle = event.currentTarget as HTMLElement
      dragSize = timelineHeight.value > 0
        ? timelineHeight.value
        : handle.previousElementSibling?.getBoundingClientRect().height ?? 140
    }
    else {
      dragSize = detailsWidth.value
    }
    window.addEventListener('pointermove', resize)
    window.addEventListener('pointerup', stopResize, { once: true })
    ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
  }
  function resize(event: PointerEvent): void {
    if (!dragging.value)
      return
    const delta = dragging.value === 'timeline' ? event.clientY - dragOrigin : dragOrigin - event.clientX
    if (dragging.value === 'timeline')
      timelineHeight.value = Math.min(360, Math.max(80, dragSize + delta))
    else
      detailsWidth.value = Math.min(520, Math.max(260, dragSize + delta))
  }
  function stopResize(): void {
    dragging.value = null
    window.removeEventListener('pointermove', resize)
  }
  function nudgeTimeline(delta: number): void {
    const autoHeight = (document.querySelector('.agent-work-overview') as HTMLElement | null)?.offsetHeight ?? 140
    const current = timelineHeight.value > 0 ? timelineHeight.value : autoHeight
    timelineHeight.value = Math.min(360, Math.max(80, current + delta))
  }
  function keyboard(event: KeyboardEvent): void {
    const index = visibleEvents.value.findIndex(item => item.eventId === selectedId.value)
    if (event.key === 'ArrowDown' && visibleEvents.value.length)
      selectedId.value = visibleEvents.value[Math.min(index + 1, visibleEvents.value.length - 1)]!.eventId
    if (event.key === 'ArrowUp' && visibleEvents.value.length)
      selectedId.value = visibleEvents.value[Math.max(index - 1, 0)]!.eventId
    if (event.key === 'Escape')
      selectedId.value = ''
  }
  onMounted(() => {
    if (typeof chrome === 'undefined' || !chrome.devtools?.inspectedWindow) {
      isPreview.value = true
      connected.value = true
      events.value = [...previewEvents]
      selectedId.value = previewEvents[0]!.eventId
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
  useEventListener('keydown', keyboard)
  onUnmounted(() => {
    cleanup()
    window.removeEventListener('pointermove', resize)
  })
  return {
    events,
    selectedId,
    selectedEvent,
    isPreview,
    connected,
    filtersVisible,
    recording,
    filter,
    agents,
    visibleEvents,
    totalTokens,
    visibleTokens,
    failedCount,
    maxDuration,
    totalDuration,
    timelineHeight,
    detailsWidth,
    workspaceStyle,
    contentStyle,
    toggleRecording,
    handleMessage,
    selectEvent,
    clearEvents,
    addPreviewEvents,
    startResize,
    nudgeTimeline,
  }
}
