<script setup lang="ts">
import type { TraceEventEnvelope } from '@trace-script/metadata'
import type { TraceStatus } from '@/utils/ui-model'
import { eventAgent, eventDuration, eventModel, eventName, eventStatus, eventTokens, eventTraceId, formatDuration } from '@/utils/ui-model'

defineProps<{ events: TraceEventEnvelope[], selectedId: string }>()
const emit = defineEmits<{ select: [id: string] }>()
function tokens(value: number | undefined): string {
  if (value === undefined)
    return '—'
  return value > 999 ? `${(value / 1000).toFixed(1)}k` : String(value)
}

const columns = [
  { key: 'trace-id', label: 'Trace ID' },
  { key: 'name', label: 'Name' },
  { key: 'agent', label: 'Agent' },
  { key: 'duration', label: 'Duration' },
  { key: 'type', label: 'Type' },
  { key: 'status', label: 'Status' },
  { key: 'model', label: 'Model' },
  { key: 'tokens', label: 'Tokens' },
] as const

function statusClass(status: TraceStatus): string {
  if (status === 'running')
    return 'text-warning [&_.status-dot]:bg-warning'
  if (status === 'failed')
    return 'text-danger [&_.status-dot]:bg-danger'
  if (status === 'cancelled')
    return 'text-panel-muted [&_.status-dot]:bg-panel-muted'
  return 'text-success [&_.status-dot]:bg-success'
}
</script>

<template>
  <section class="min-h-0 min-w-0 overflow-auto" aria-label="Trace events">
    <div class="sticky top-0 z-1 grid grid-cols-[18%_20%_10%_10%_12%_13%_10%_7%] items-center border-b border-divider bg-panel-surface text-sm text-panel-muted">
      <span
        v-for="column in columns"
        :key="column.key"
        class="min-w-0 overflow-hidden px-2 py-2 text-ellipsis whitespace-nowrap"
      >
        {{ column.label }}
      </span>
    </div>
    <div v-if="events.length">
      <button
        v-for="event in events"
        :key="event.eventId"
        type="button"
        class="grid min-h-11 w-full grid-cols-[18%_20%_10%_10%_12%_13%_10%_7%] items-center border-0 border-b border-divider bg-panel-bg text-left text-sm odd:bg-[#282828] hover:bg-[#3d3d3d] aria-selected:bg-[#3d3d3d] aria-selected:shadow-[inset_0.125rem_0_var(--color-accent)]"
        :aria-selected="event.eventId === selectedId"
        @click="emit('select', event.eventId)"
      >
        <span class="min-w-0 truncate px-2" :title="eventTraceId(event)">{{ eventTraceId(event) }}</span>
        <span class="flex min-w-0 flex-col gap-0.5 truncate px-2"><strong>{{ eventName(event) }}</strong></span>
        <span class="min-w-0 truncate px-2">{{ eventAgent(event) }}</span>
        <span class="min-w-0 overflow-hidden px-2 tabular-nums text-ellipsis whitespace-nowrap">{{ formatDuration(eventDuration(event)) }}</span>
        <span class="min-w-0 truncate px-2 text-panel-muted">{{ event.type }}</span>
        <span
          class="inline-flex min-w-0 items-center overflow-hidden px-2 text-ellipsis whitespace-nowrap"
          :class="statusClass(eventStatus(event))"
        ><i class="status-dot mr-2 block size-2 shrink-0 rounded-full" />{{ eventStatus(event) }}</span>
        <span class="min-w-0 truncate px-2">{{ eventModel(event) }}</span>
        <span class="min-w-0 overflow-hidden px-2 text-left tabular-nums text-ellipsis whitespace-nowrap">{{ tokens(eventTokens(event)) }}</span>
      </button>
    </div>
    <p v-else class="m-auto grid min-h-20 place-items-center text-center text-panel-muted">
      No events match these filters
    </p>
  </section>
</template>
