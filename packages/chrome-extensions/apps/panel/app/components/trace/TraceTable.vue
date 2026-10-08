<script setup lang="ts">
import type { EventFilter, EventRow, TraceSummary } from '@trace-script/metadata'
import { eventTiming } from '@trace-script/core'
import { computed, nextTick, shallowRef, useTemplateRef, watch } from 'vue'

const props = defineProps<{ rows: EventRow[], selectedId: string, columns: string[], traces?: TraceSummary[], widths?: Record<string, number>, filter: EventFilter, total: number, cursor: number, nextCursor: number, loading: boolean }>()
const emit = defineEmits<{ select: [id: string], filter: [filter: EventFilter], page: [cursor: number] }>()
const scroller = useTemplateRef<HTMLDivElement>('scroller')
const follow = shallowRef(true)
const display = computed(() => props.rows.map((row) => {
  const trace = props.traces?.find(trace => trace.traceId === row.traceId)
  const start = Date.parse(trace?.startedAt ?? row.timestamp)
  const end = Math.max(Date.parse(trace?.endedAt ?? row.timestamp), Date.parse(row.timestamp) + (row.durationMs ?? 0))
  return { row, timing: eventTiming(row, start, end) }
}))
function sort(sort: EventFilter['sort']): void {
  emit('filter', { ...props.filter, sort, descending: props.filter.sort === sort && !props.filter.descending })
}
function scroll(): void {
  const el = scroller.value

  if (el)
    follow.value = el.scrollHeight - el.scrollTop - el.clientHeight < 50
}
function key(event: KeyboardEvent, index: number): void {
  const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0

  if (!step)
    return

  event.preventDefault()

  const row = props.rows[index + step]

  if (row) {
    emit('select', row.eventId)

    scroller.value?.querySelectorAll<HTMLTableRowElement>('tbody tr')[index + step]?.focus()
  }
}
watch(() => props.rows.at(-1)?.eventId, async () => {
  if (follow.value) {
    await nextTick()

    const el = scroller.value

    if (el)
      el.scrollTop = el.scrollHeight
  }
})
watch(() => [props.selectedId, props.cursor], async () => {
  await nextTick()
  const index = props.rows.findIndex(row => row.eventId === props.selectedId)
  const target = scroller.value?.querySelectorAll<HTMLTableRowElement>('tbody tr')[index]
  target?.scrollIntoView?.({ block: 'nearest' })
})
</script>

<template>
  <section class="event-list" aria-label="Trace events" :aria-busy="loading">
    <div ref="scroller" class="table-scroll" @scroll="scroll">
      <table class="trace-table">
        <colgroup>
          <col :style="{ width: `${widths?.name ?? 230}px` }">
          <col v-for="column in columns" :key="column" :style="{ width: `${widths?.[column] ?? (column === 'timeline' ? 160 : 120)}px` }">
        </colgroup>
        <thead>
          <tr>
            <th class="name-column">
              <button @click="sort('name')">
                Name ↕
              </button>
            </th>
            <th v-if="columns.includes('type')">
              <button @click="sort('type')">
                Type ↕
              </button>
            </th>
            <th v-if="columns.includes('status')">
              <button @click="sort('status')">
                Status ↕
              </button>
            </th>
            <th v-if="columns.includes('agent')">
              Agent
            </th><th v-if="columns.includes('model')">
              Model
            </th><th v-if="columns.includes('tokens')">
              Tokens
            </th>
            <th v-if="columns.includes('duration')">
              <button @click="sort('durationMs')">
                Duration ↕
              </button>
            </th><th v-if="columns.includes('start')">
              <button @click="sort('timestamp')">
                Start ↕
              </button>
            </th><th v-if="columns.includes('timeline')">
              Timeline
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="({ row, timing }, index) in display" :key="row.eventId" tabindex="0" :aria-selected="selectedId === row.eventId" :class="{ selected: selectedId === row.eventId }" @click="emit('select', row.eventId)" @keydown.enter="emit('select', row.eventId)" @keydown="key($event, index)">
            <td class="event-name" :title="row.name">
              <span class="event-dot" :class="row.status ?? (row.type.endsWith('error') ? 'error' : '')" />{{ row.name }}
            </td>
            <td v-if="columns.includes('type')" class="mono dim">
              {{ row.type }}
            </td><td v-if="columns.includes('status')">
              <span class="status-pill" :class="row.status">{{ row.status ?? (row.type.endsWith('error') ? 'error' : 'event') }}</span>
            </td>
            <td v-if="columns.includes('agent')">
              {{ row.agent?.name ?? '—' }}
            </td><td v-if="columns.includes('model')">
              {{ row.model?.name ?? '—' }}
            </td><td v-if="columns.includes('tokens')" class="mono">
              {{ row.metrics?.totalTokens ?? '—' }}
            </td>
            <td v-if="columns.includes('duration')" class="mono">
              {{ row.durationMs === undefined ? '—' : `${row.durationMs.toFixed(1)} ms` }}
            </td><td v-if="columns.includes('start')" class="mono dim">
              {{ row.timestamp.slice(11, 23) }}
            </td>
            <td v-if="columns.includes('timeline')" class="timeline" :title="`${row.timestamp} → ${new Date(Date.parse(row.timestamp) + timing.duration).toISOString()} · ${timing.duration} ms · ${row.status ?? 'event'}`">
              <span class="waterfall" :class="row.status" :style="{ marginLeft: `${timing.offset}%`, width: `${timing.width}%` }" />
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!rows.length" class="empty-list">
        {{ loading ? 'Loading events…' : 'No events match the current filters.' }}
      </div>
    </div>
    <footer class="list-footer">
      <span>{{ total.toLocaleString() }} matching events · {{ cursor + (rows.length ? 1 : 0) }}–{{ cursor + rows.length }}</span><div>
        <button :disabled="cursor === 0" @click="emit('page', Math.max(0, cursor - 200))">
          ← Previous
        </button><button :disabled="nextCursor < 0" @click="emit('page', nextCursor)">
          Next →
        </button>
      </div>
    </footer>
  </section>
</template>
