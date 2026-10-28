<script setup lang="ts">
import type { PropType } from 'vue'
import type { AgentWorkOverviewItem, AgentWorkOverviewRange, AgentWorkOverviewTheme } from './model'
import { formatMilliseconds, isUndefined } from '@trace-script/shared'
import { onKeyStroke, useDevicePixelRatio, useFocus, useRafFn, useResizeObserver } from '@vueuse/core'
import { computed, nextTick, reactive, shallowRef, useId, useTemplateRef, watch } from 'vue'
import { createAgentWorkOverviewLayout, createAgentWorkOverviewTicks, findAgentWorkOverviewItem, niceTickStep } from './timeline'

const props = defineProps({
  ariaLabel: {
    type: String,
    default: 'Agent work overview',
  },
  emptyText: {
    type: String,
    default: 'No work items',
  },
  items: {
    type: Array as PropType<readonly AgentWorkOverviewItem[]>,
    required: true,
  },
  minimumWidth: {
    type: Number,
    default: 0,
  },
  selectedId: {
    type: String,
    default: '',
  },
  theme: {
    type: String as PropType<AgentWorkOverviewTheme>,
    default: 'auto',
  },
})

const emit = defineEmits<{
  select: [item: AgentWorkOverviewItem]
  selectRange: [range: AgentWorkOverviewRange]
}>()

const ROW_HEIGHT = 28
const BAR_HEIGHT = 12
const MINIMUM_BAR_WIDTH = 3
const MINIMUM_TICK_SPACING = 320
const MAX_ZOOM = 100

const instanceId = useId()
const componentHost = useTemplateRef<HTMLElement>('componentHost')
const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
const eventsViewport = useTemplateRef<HTMLElement>('eventsViewport')
const ruler = useTemplateRef<HTMLElement>('ruler')
const layout = computed(() => createAgentWorkOverviewLayout(props.items))
const viewportWidth = shallowRef(0)
const zoom = shallowRef(1)
const focusedIndex = shallowRef(0)
const hoveredId = shallowRef('')
const { focused: keyboardFocused } = useFocus(componentHost)
const { pixelRatio } = useDevicePixelRatio()
const tooltip = reactive({
  text: '',
  visible: false,
  x: 0,
  y: 0,
})
const selection = reactive({
  active: false,
  didMove: false,
  pointerId: 0,
  startX: 0,
  endX: 0,
})
const baseWidth = computed(() => Math.max(viewportWidth.value, props.minimumWidth))
const contentWidth = computed(() => baseWidth.value * zoom.value)
const rowHeight = ROW_HEIGHT
const canvasHeight = computed(() => layout.value.groups.length * ROW_HEIGHT)
const timelineTicks = computed(() => {
  const duration = layout.value.duration
  const width = contentWidth.value
  if (duration <= 0 || width <= 0)
    return []
  const pixelsPerMs = width / duration
  const step = niceTickStep(MINIMUM_TICK_SPACING / pixelsPerMs)
  return createAgentWorkOverviewTicks(duration, step)
})
const focusedId = computed(() => layout.value.rows[focusedIndex.value]?.item.id ?? '')
const focusedLabel = computed(() => {
  const row = layout.value.rows[focusedIndex.value]
  return row ? `${row.item.name}, ${row.item.group}, ${durationText(row.item)}, ${row.item.status}` : ''
})
const activeOptionId = `${instanceId}-option`

function durationText(item: AgentWorkOverviewItem): string {
  return item.durationLabel ?? (isUndefined(item.duration) ? 'Duration unknown' : formatMilliseconds(Math.max(0, item.duration)))
}

const { resume: scheduleDraw } = useRafFn(drawOverview, { immediate: false, once: true })
let zoomAnimation = { startZoom: 1, startScrollLeft: 0, targetZoom: 1, targetScrollLeft: 0, startedAt: 0 }
const { pause: pauseZoom, resume: resumeZoom } = useRafFn(({ timestamp }) => {
  const viewport = eventsViewport.value
  if (!viewport) {
    pauseZoom()
    return
  }
  const progress = Math.min(1, (timestamp - zoomAnimation.startedAt) / 240)
  const eased = 1 - (1 - progress) ** 3
  zoom.value = zoomAnimation.startZoom + (zoomAnimation.targetZoom - zoomAnimation.startZoom) * eased
  viewport.scrollLeft = zoomAnimation.startScrollLeft + (zoomAnimation.targetScrollLeft - zoomAnimation.startScrollLeft) * eased
  syncRulerPosition(viewport.scrollLeft)
  scheduleDraw()
  if (progress >= 1)
    pauseZoom()
}, { immediate: false })

function readColor(name: string, fallback: string): string {
  const host = componentHost.value
  if (!host)
    return fallback
  return getComputedStyle(host).getPropertyValue(name).trim() || fallback
}

function drawOverview(): void {
  const target = canvas.value
  if (!target)
    return
  const context = target.getContext('2d')
  if (!context)
    return

  const width = contentWidth.value
  const visibleWidth = viewportWidth.value
  const visibleStart = eventsViewport.value?.scrollLeft ?? 0
  const height = canvasHeight.value
  const ratio = pixelRatio.value || 1
  const bitmapWidth = Math.max(1, Math.round(visibleWidth * ratio))
  const bitmapHeight = Math.max(1, Math.round(height * ratio))
  if (target.width !== bitmapWidth)
    target.width = bitmapWidth
  if (target.height !== bitmapHeight)
    target.height = bitmapHeight
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  context.clearRect(0, 0, visibleWidth, height)
  context.fillStyle = readColor('--awo-bg', '#fff')
  context.fillRect(0, 0, visibleWidth, height)

  const divider = readColor('--awo-divider', '#d8dee8')
  const grid = readColor('--awo-grid', 'rgba(120, 130, 150, 0.18)')
  const selected = readColor('--awo-selected', '#2563eb')
  const focused = readColor('--awo-focused', '#7c3aed')
  const colors = {
    cancelled: readColor('--awo-cancelled', '#7b8491'),
    failed: readColor('--awo-failed', '#dc5c5c'),
    running: readColor('--awo-running', '#d79a28'),
    success: readColor('--awo-success', '#31a37d'),
    waiting: readColor('--awo-running', '#d79a28'),
    incomplete: readColor('--awo-cancelled', '#7b8491'),
    interrupted: readColor('--awo-cancelled', '#7b8491'),
    unknown: readColor('--awo-cancelled', '#7b8491'),
  }

  context.lineWidth = 1
  const rowHeightValue = rowHeight
  const barOffset = Math.max(0, (rowHeightValue - BAR_HEIGHT) / 2)
  for (let groupIndex = 0; groupIndex < layout.value.groups.length; groupIndex++) {
    const rowTop = groupIndex * rowHeightValue
    context.strokeStyle = divider
    context.beginPath()
    context.moveTo(0, rowTop + rowHeightValue - 0.5)
    context.lineTo(visibleWidth, rowTop + rowHeightValue - 0.5)
    context.stroke()

    context.strokeStyle = grid
    for (let tickIndex = 1; tickIndex < timelineTicks.value.length - 1; tickIndex++) {
      const tick = timelineTicks.value[tickIndex]
      if (!tick)
        continue
      const x = tick.position / 100 * width - visibleStart
      if (x < 0 || x > visibleWidth)
        continue
      context.beginPath()
      context.moveTo(x + 0.5, rowTop)
      context.lineTo(x + 0.5, rowTop + rowHeightValue)
      context.stroke()
    }

    const group = layout.value.groups[groupIndex]
    if (!group)
      continue
    for (const row of group.rows) {
      const barWidth = Math.max(row.duration / layout.value.duration * width, MINIMUM_BAR_WIDTH)
      const contentX = Math.min(row.start / layout.value.duration * width, width - barWidth)
      const x = contentX - visibleStart
      if (x + barWidth < 0 || x > visibleWidth)
        continue
      const y = rowTop + barOffset
      context.fillStyle = colors[row.item.status]
      context.fillRect(x, y, barWidth, BAR_HEIGHT)

      if (row.overlapCount > 0) {
        context.strokeStyle = 'rgba(255, 255, 255, 0.6)'
        context.strokeRect(x + 0.5, y + 0.5, Math.max(0, barWidth - 1), BAR_HEIGHT - 1)
      }
      const isKeyboardFocused = keyboardFocused.value && row.item.id === focusedId.value
      if (row.item.id === props.selectedId || row.item.id === hoveredId.value || isKeyboardFocused) {
        context.strokeStyle = row.item.id === props.selectedId ? selected : focused
        context.lineWidth = 2
        context.strokeRect(x - 1, y - 1, barWidth + 2, BAR_HEIGHT + 2)
        context.lineWidth = 1
      }
    }
  }

  if (selection.active) {
    const left = Math.min(selection.startX, selection.endX) - visibleStart
    const right = Math.max(selection.startX, selection.endX) - visibleStart
    context.fillStyle = readColor('--awo-selection', 'rgba(37, 99, 235, 0.18)')
    context.fillRect(left, 0, right - left, height)
    context.strokeStyle = readColor('--awo-selection', 'rgba(37, 99, 235, 0.85)')
    context.strokeRect(left + 0.5, 0.5, Math.max(0, right - left - 1), height - 1)
  }
}

function itemAtPointer(event: PointerEvent | MouseEvent): AgentWorkOverviewItem | false {
  const target = canvas.value
  const viewport = eventsViewport.value
  if (!target || !viewport)
    return false
  const bounds = target.getBoundingClientRect()
  return findAgentWorkOverviewItem(
    layout.value,
    viewport.scrollLeft + event.clientX - bounds.left,
    event.clientY - bounds.top,
    contentWidth.value,
    rowHeight,
    MINIMUM_BAR_WIDTH,
  )
}

function handlePointerMove(event: PointerEvent): void {
  if (selection.active) {
    const target = canvas.value
    const viewport = eventsViewport.value
    if (!target || !viewport)
      return
    selection.endX = viewport.scrollLeft + event.clientX - target.getBoundingClientRect().left
    if (Math.abs(selection.endX - selection.startX) > 3)
      selection.didMove = true
    tooltip.visible = false
    scheduleDraw()
    return
  }

  const item = itemAtPointer(event)
  if (!item) {
    hoveredId.value = ''
    tooltip.visible = false
    return
  }

  const host = componentHost.value
  if (!host)
    return
  const hostBounds = host.getBoundingClientRect()
  if (hoveredId.value !== item.id) {
    const row = layout.value.rows.find(candidate => candidate.item.id === item.id)
    tooltip.text = `${item.name} · ${item.group} · ${durationText(item)} · ${item.status} · ${row?.overlapCount ? 'parallel' : 'serial'}`
  }
  hoveredId.value = item.id
  tooltip.x = event.clientX - hostBounds.left + 12
  tooltip.y = event.clientY - hostBounds.top + 12
  tooltip.visible = true
}

function handlePointerLeave(): void {
  hoveredId.value = ''
  tooltip.visible = false
}

function handlePointerDown(event: PointerEvent): void {
  const target = canvas.value
  const viewport = eventsViewport.value
  if (!target || !viewport || event.button !== 0)
    return
  selection.active = true
  selection.didMove = false
  selection.pointerId = event.pointerId
  selection.startX = viewport.scrollLeft + event.clientX - target.getBoundingClientRect().left
  selection.endX = selection.startX
  hoveredId.value = ''
  tooltip.visible = false
  target.setPointerCapture(event.pointerId)
  scheduleDraw()
}

function handlePointerUp(event: PointerEvent): void {
  const target = canvas.value
  if (target?.hasPointerCapture(event.pointerId))
    target.releasePointerCapture(event.pointerId)
  if (!selection.active)
    return
  const didMove = selection.didMove
  const startX = selection.startX
  const endX = selection.endX
  selection.active = false
  selection.didMove = false
  scheduleDraw()

  if (didMove) {
    const duration = layout.value.duration
    const width = contentWidth.value
    if (duration <= 0 || width <= 0)
      return
    const left = Math.min(startX, endX)
    const right = Math.max(startX, endX)
    const range: AgentWorkOverviewRange = {
      startTime: left / width * duration,
      endTime: right / width * duration,
    }
    zoomToRange(range)
    emit('selectRange', range)
    return
  }

  const item = itemAtPointer(event)
  if (item)
    selectItem(item)
}

function handlePointerCancel(event: PointerEvent): void {
  const target = canvas.value
  if (target?.hasPointerCapture(event.pointerId))
    target.releasePointerCapture(event.pointerId)
  selection.active = false
  selection.didMove = false
  scheduleDraw()
}

function handleScroll(event: Event): void {
  const target = event.currentTarget
  if (target instanceof HTMLElement) {
    syncRulerPosition(target.scrollLeft)
    scheduleDraw()
  }
}

function handleWheel(event: WheelEvent): void {
  const viewport = eventsViewport.value
  if (!viewport)
    return
  event.preventDefault()

  const factor = event.deltaY < 0 ? 1.2 : 1 / 1.2
  const oldZoom = zoom.value
  const nextZoom = Math.min(MAX_ZOOM, Math.max(1, oldZoom * factor))
  if (nextZoom === oldZoom)
    return

  // 以鼠标位置为锚点缩放，让指针下的内容在放大/缩小后保持不动。
  const pointerX = event.clientX - viewport.getBoundingClientRect().left
  const previousRatio = (viewport.scrollLeft + pointerX) / contentWidth.value
  zoom.value = nextZoom
  const nextWidth = baseWidth.value * nextZoom
  scheduleDraw()
  void nextTick(() => {
    viewport.scrollLeft = Math.max(0, previousRatio * nextWidth - pointerX)
    syncRulerPosition(viewport.scrollLeft)
  })
}

function zoomToRange(range: AgentWorkOverviewRange): void {
  const viewport = eventsViewport.value
  if (!viewport)
    return
  const duration = layout.value.duration
  if (duration <= 0)
    return
  const span = Math.max(range.endTime - range.startTime, duration / 1000)
  const targetZoom = Math.min(MAX_ZOOM, Math.max(1, duration / span))
  const targetScrollLeft = range.startTime / duration * baseWidth.value * targetZoom

  zoomAnimation = {
    startZoom: zoom.value,
    startScrollLeft: viewport.scrollLeft,
    targetZoom,
    targetScrollLeft,
    startedAt: performance.now(),
  }
  pauseZoom()
  resumeZoom()
}

function syncRulerPosition(value: number): void {
  const rulerElement = ruler.value
  if (rulerElement)
    rulerElement.style.transform = `translate3d(-${value}px, 0, 0)`
}

onKeyStroke(['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Enter', ' '], (event) => {
  if (layout.value.rows.length === 0)
    return

  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    event.preventDefault()
    focusedIndex.value = Math.min(layout.value.rows.length - 1, focusedIndex.value + 1)
    return
  }
  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    event.preventDefault()
    focusedIndex.value = Math.max(0, focusedIndex.value - 1)
    return
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    const row = layout.value.rows[focusedIndex.value]
    if (row)
      selectItem(row.item)
  }
}, { target: componentHost })

function selectItem(item: AgentWorkOverviewItem): void {
  const index = layout.value.rows.findIndex(row => row.item.id === item.id)
  if (index >= 0)
    focusedIndex.value = index
  emit('select', item)
}

watch(
  [layout, contentWidth, canvasHeight, hoveredId, focusedId, keyboardFocused, pixelRatio, () => props.selectedId, () => props.theme],
  scheduleDraw,
  { flush: 'post' },
)

watch(
  () => props.selectedId,
  (selectedId) => {
    const index = layout.value.rows.findIndex(row => row.item.id === selectedId)
    if (index >= 0)
      focusedIndex.value = index
  },
  { immediate: true },
)

function updateViewportWidth(): void {
  viewportWidth.value = eventsViewport.value?.clientWidth ?? 0
  scheduleDraw()
}

watch(eventsViewport, updateViewportWidth, { flush: 'post' })
useResizeObserver(eventsViewport, updateViewportWidth)
</script>

<template>
  <section
    ref="componentHost"
    class="agent-work-overview"
    :class="`agent-work-overview--${theme}`"
    :aria-activedescendant="activeOptionId"
    :aria-label="ariaLabel"
    role="listbox"
    tabindex="0"
    @wheel.prevent="handleWheel"
  >
    <template v-if="layout.rows.length">
      <header class="agent-work-overview__header">
        <div class="agent-work-overview__title">
          Timeline
        </div>
        <div class="agent-work-overview__ruler-viewport">
          <div
            ref="ruler"
            class="agent-work-overview__ruler"
            :style="{ width: `${contentWidth}px` }"
          >
            <span
              v-for="tick in timelineTicks"
              :key="tick.time"
              class="agent-work-overview__tick"
              :style="{ left: `${tick.position}%` }"
            >
              {{ formatMilliseconds(tick.time) }}
            </span>
          </div>
        </div>
      </header>

      <div class="agent-work-overview__body">
        <div class="agent-work-overview__labels">
          <div
            v-for="group in layout.groups"
            :key="group.name"
            class="agent-work-overview__label-row"
          >
            <strong :title="group.name">{{ group.name }}</strong>
            <small>{{ group.rows.length }}</small>
          </div>
        </div>
        <div
          ref="eventsViewport"
          class="agent-work-overview__events"
          @scroll="handleScroll"
        >
          <div class="agent-work-overview__canvas-track" :style="{ height: `${canvasHeight}px`, width: `${contentWidth}px` }">
            <canvas
              ref="canvas"
              class="agent-work-overview__canvas"
              :class="{ 'agent-work-overview__canvas--selecting': selection.active }"
              :height="canvasHeight"
              :style="{ height: `${canvasHeight}px`, width: `${viewportWidth}px` }"
              :width="viewportWidth"
              aria-hidden="true"
              @pointercancel="handlePointerCancel"
              @pointerdown="handlePointerDown"
              @pointerleave="handlePointerLeave"
              @pointermove="handlePointerMove"
              @pointerup="handlePointerUp"
            />
          </div>
        </div>
      </div>

      <div class="agent-work-overview__options">
        <span
          :id="activeOptionId"
          :aria-selected="focusedId === selectedId"
          role="option"
        >
          {{ focusedLabel }}
        </span>
      </div>

      <div
        v-show="tooltip.visible"
        class="agent-work-overview__tooltip"
        :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }"
        role="tooltip"
      >
        {{ tooltip.text }}
      </div>
    </template>
    <div v-else class="agent-work-overview__empty">
      {{ emptyText }}
    </div>
  </section>
</template>

<style scoped>
.agent-work-overview {
  --awo-bg: #fff;
  --awo-bg-muted: #f7f8fa;
  --awo-text: #24262b;
  --awo-text-muted: #6f7782;
  --awo-divider: #d8dee8;
  --awo-grid: rgb(120 130 150 / 18%);
  --awo-success: #31a37d;
  --awo-running: #d79a28;
  --awo-failed: #dc5c5c;
  --awo-cancelled: #7b8491;
  --awo-selected: #2563eb;
  --awo-focused: #7c3aed;

  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--awo-divider);
  border-radius: 0.625rem;
  background: var(--awo-bg);
  color: var(--awo-text);
  font-family: ui-sans-serif, system-ui, sans-serif;
  outline: none;
}

.agent-work-overview:focus-visible {
  box-shadow: 0 0 0 0.1875rem color-mix(in srgb, var(--awo-focused) 24%, transparent);
}

.agent-work-overview--dark {
  --awo-bg: #202124;
  --awo-bg-muted: #292a2d;
  --awo-text: #e8eaed;
  --awo-text-muted: #9aa0a6;
  --awo-divider: #3c4043;
  --awo-grid: rgb(154 160 166 / 18%);
}

.agent-work-overview__header,
.agent-work-overview__body {
  display: grid;
  min-width: 0;
  grid-template-columns: 11rem minmax(0, 1fr);
}

.agent-work-overview__body {
  flex: 1;
  min-height: 0;
}

.agent-work-overview__header {
  height: 1.75rem;
  border-bottom: 1px solid var(--awo-divider);
  background: var(--awo-bg-muted);
}

.agent-work-overview__title {
  display: flex;
  align-items: center;
  border-right: 1px solid var(--awo-divider);
  padding: 0 0.75rem;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.agent-work-overview__ruler-viewport {
  min-width: 0;
  overflow: hidden;
}

.agent-work-overview__ruler {
  position: relative;
  height: 100%;
  will-change: transform;
}

.agent-work-overview__tick {
  position: absolute;
  top: 50%;
  color: var(--awo-text-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.625rem;
  transform: translate(-50%, -50%);
  white-space: nowrap;
}

.agent-work-overview__tick:first-child {
  transform: translate(0, -50%);
}

.agent-work-overview__tick:last-child {
  transform: translate(-100%, -50%);
}

.agent-work-overview__labels {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  border-right: 1px solid var(--awo-divider);
  background: var(--awo-bg);
}

.agent-work-overview__label-row {
  display: flex;
  flex: none;
  height: 1.75rem;
  align-items: center;
  gap: 0.5rem;
  overflow: hidden;
  border-bottom: 1px solid var(--awo-divider);
  padding: 0 0.75rem;
}

.agent-work-overview__label-row:last-child {
  border-bottom: 0;
}

.agent-work-overview__label-row strong {
  overflow: hidden;
  flex: 1;
  font-size: 0.75rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-work-overview__label-row small {
  color: var(--awo-text-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.625rem;
}

.agent-work-overview__events {
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  background: var(--awo-bg);
}

.agent-work-overview__canvas-track {
  position: relative;
}

.agent-work-overview__canvas {
  position: sticky;
  left: 0;
  display: block;
  cursor: crosshair;
  touch-action: pan-y;
}

.agent-work-overview__canvas--selecting {
  cursor: crosshair;
}

.agent-work-overview__empty {
  display: grid;
  min-height: 8rem;
  place-items: center;
  padding: 1.5rem;
  color: var(--awo-text-muted);
  font-size: 0.8125rem;
}

.agent-work-overview__tooltip {
  position: absolute;
  z-index: 2;
  max-width: min(25rem, calc(100% - 1.5rem));
  border: 1px solid rgb(255 255 255 / 16%);
  border-radius: 0.375rem;
  background: #202124;
  box-shadow: 0 0.5rem 1.5rem rgb(0 0 0 / 18%);
  color: #f8fafc;
  font-size: 0.6875rem;
  line-height: 1.4;
  padding: 0.375rem 0.5rem;
  pointer-events: none;
}

.agent-work-overview__options {
  position: absolute;
  overflow: hidden;
  width: 1px;
  height: 1px;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

@media (prefers-color-scheme: dark) {
  .agent-work-overview--auto {
    --awo-bg: #202124;
    --awo-bg-muted: #292a2d;
    --awo-text: #e8eaed;
    --awo-text-muted: #9aa0a6;
    --awo-divider: #3c4043;
    --awo-grid: rgb(154 160 166 / 18%);
  }
}
</style>
