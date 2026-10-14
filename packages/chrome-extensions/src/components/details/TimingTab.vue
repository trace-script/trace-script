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
  <dl class="details-fields">
    <template v-for="field in fields" :key="field.label">
      <dt class="details-field-label">
        {{ field.label }}
      </dt>
      <dd class="details-field-value">
        {{ field.value(props.event) }}
      </dd>
    </template>
  </dl>
</template>
