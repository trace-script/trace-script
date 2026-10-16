import type { TraceEventEnvelope } from '@trace-script/metadata'
import type { ComputedRef, Ref } from 'vue'
import type { WorkerToPanelMessage } from '@/messages'
import type { EventTypeFilter, StatusFilter, TracePanelFilter } from '@/types/trace-panel'
import { useEventListener, useToggle } from '@vueuse/core'
import { computed, ref as deepRef, onMounted, onUnmounted, reactive, shallowRef } from 'vue'
import { EXTENSION_MESSAGE_TYPE, EXTENSION_PORT_NAME } from '@/messages'
import { eventAgent, eventDuration, eventName, eventStatus, eventTimestamp, eventTokens, TRACE_FILTER_VALUE, TRACE_STATUS } from '@/utils/ui-model'

const TIMELINE_FALLBACK_HEIGHT = 140
const RESIZE_STEP = 4

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
  workspaceClass: ComputedRef<string>
  contentClass: ComputedRef<string>
  toggleRecording: () => boolean
  handleMessage: (message: WorkerToPanelMessage) => void
  selectEvent: (id: string) => void
  clearEvents: () => void
  addPreviewEvents: () => void
  startResize: (kind: 'timeline' | 'details', event: PointerEvent) => void
  nudgeTimeline: (delta: number) => void
}

export function useTracePanel(): TracePanelState {
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
  const visibleEvents = computed(() => {
    const query = filter.query.toLowerCase()
    return events.value.filter((event) => {
      const agent = eventAgent(event)
      const status = eventStatus(event)
      const searchableText = `${eventName(event)} ${event.eventId} ${event.traceId} ${agent}`.toLowerCase()
      const matchesQuery = !filter.query || searchableText.includes(query)
      const matchesType = filter.type === TRACE_FILTER_VALUE.ALL || event.type === filter.type
      const matchesStatus = filter.status === TRACE_FILTER_VALUE.ALL || status === filter.status
      const matchesAgent = filter.agent === TRACE_FILTER_VALUE.ALL || agent === filter.agent
      const matchesErrorFilter = !filter.onlyErrors || status === TRACE_STATUS.FAILED
      return matchesQuery && matchesType && matchesStatus && matchesAgent && matchesErrorFilter
    })
  })
  const selectedEvent = computed(() => events.value.find(event => event.eventId === selectedId.value))
  const agents = computed(() => {
    const eventAgents = events.value.map(eventAgent)
    const namedAgents = eventAgents.filter(agent => agent !== '—')
    const uniqueAgents = new Set(namedAgents)
    return [TRACE_FILTER_VALUE.ALL, ...uniqueAgents]
  })
  const totalTokens = computed(() => {
    return events.value.reduce((sum, event) => {
      const tokens = eventTokens(event) ?? 0
      return sum + tokens
    }, 0)
  })
  const visibleTokens = computed(() => {
    return visibleEvents.value.reduce((sum, event) => {
      const tokens = eventTokens(event) ?? 0
      return sum + tokens
    }, 0)
  })
  const failedCount = computed(() => {
    const failedEvents = events.value.filter(event => eventStatus(event) === TRACE_STATUS.FAILED)
    return failedEvents.length
  })
  const maxDuration = computed(() => {
    return events.value.reduce((max, event) => {
      const duration = eventDuration(event)
      return Math.max(max, duration)
    }, 0)
  })
  const totalDuration = computed(() => {
    return events.value.reduce((sum, event) => {
      const duration = eventDuration(event)
      return sum + duration
    }, 0)
  })
  const workspaceClass = computed(() => timelineHeight.value > 0
    ? `timeline-layout-${timelineHeight.value}`
    : 'timeline-layout-auto')
  const contentClass = computed(() => `details-layout-${detailsWidth.value}`)
  function handleMessage(message: WorkerToPanelMessage): void {
    if (message.type === EXTENSION_MESSAGE_TYPE.TRACE_QUERY_RESULT) {
      events.value = [...message.events]
    }
    else if (message.type === EXTENSION_MESSAGE_TYPE.TRACE_EVENTS_APPEND && recording.value) {
      const alreadyReceived = events.value.some(event => event.eventId === message.event.eventId)
      if (!alreadyReceived)
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
        : handle.previousElementSibling?.getBoundingClientRect().height ?? TIMELINE_FALLBACK_HEIGHT
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
  function stopResize(): void {
    dragging.value = null
    window.removeEventListener('pointermove', resize)
  }
  function nudgeTimeline(delta: number): void {
    const autoHeight = (document.querySelector('.agent-work-overview') as HTMLElement | null)?.offsetHeight ?? TIMELINE_FALLBACK_HEIGHT
    const current = timelineHeight.value > 0 ? timelineHeight.value : autoHeight
    timelineHeight.value = snapResize(current + delta, 80, 360)
  }
  function keyboard(event: KeyboardEvent): void {
    const index = visibleEvents.value.findIndex(item => item.eventId === selectedId.value)
    if (event.key === 'ArrowDown' && visibleEvents.value.length) {
      const lastIndex = visibleEvents.value.length - 1
      const nextIndex = Math.min(index + 1, lastIndex)
      selectedId.value = visibleEvents.value[nextIndex]!.eventId
    }
    if (event.key === 'ArrowUp' && visibleEvents.value.length) {
      const previousIndex = Math.max(index - 1, 0)
      selectedId.value = visibleEvents.value[previousIndex]!.eventId
    }
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
