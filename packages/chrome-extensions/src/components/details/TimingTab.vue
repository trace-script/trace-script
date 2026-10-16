<script setup lang="ts">
import type { TraceEventEnvelope } from '@trace-script/metadata'
import { eventDuration, formatDuration } from '@/utils/ui-model'

const props = defineProps<{ event: TraceEventEnvelope }>()

const fields = [
  { label: 'Duration', value: (event: TraceEventEnvelope) => formatDuration(eventDuration(event)) },
  { label: 'Started', value: (event: TraceEventEnvelope) => event.timestamp },
  {
    label: 'Ended',
    value: (event: TraceEventEnvelope) => {
      const duration = eventDuration(event)
      if (!duration)
        return '—'

      const startTimestamp = Date.parse(event.timestamp)
      const endTimestamp = startTimestamp + duration
      return new Date(endTimestamp).toISOString()
    },
  },
] as const
</script>

<template>
  <dl class="mb-5 grid grid-cols-[6.875rem_minmax(0,1fr)] gap-x-4">
    <template v-for="field in fields" :key="field.label">
      <dt class="flex min-h-7 items-center p-0 text-sm leading-3.5 font-semibold text-panel-muted">
        {{ field.label }}
      </dt>
      <dd class="flex min-h-7 min-w-0 items-center p-0 text-sm leading-3.5 text-panel-text [overflow-wrap:anywhere]">
        {{ field.value(props.event) }}
      </dd>
    </template>
  </dl>
</template>
