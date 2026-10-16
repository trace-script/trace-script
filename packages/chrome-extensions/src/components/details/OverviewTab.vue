<script setup lang="ts">
import type { TraceEventEnvelope } from '@trace-script/metadata'
import { eventAgent, eventModel, eventStatus, eventTraceId, TRACE_STATUS } from '@/utils/ui-model'

const props = defineProps<{ event: TraceEventEnvelope }>()

function statusClass(event: TraceEventEnvelope): string {
  const status = eventStatus(event)
  if (status === TRACE_STATUS.RUNNING)
    return 'text-warning'
  if (status === TRACE_STATUS.FAILED)
    return 'text-danger'
  if (status === TRACE_STATUS.CANCELLED)
    return 'text-panel-muted'
  return 'text-success'
}

const fields = [
  { label: 'Type', value: (event: TraceEventEnvelope) => event.type, className: () => '' },
  { label: 'Status', value: eventStatus, className: statusClass },
  { label: 'Agent', value: eventAgent, className: () => '' },
  { label: 'Model', value: eventModel, className: () => '' },
  { label: 'Trace ID', value: eventTraceId, className: () => '' },
  { label: 'Event ID', value: (event: TraceEventEnvelope) => event.eventId, className: () => '' },
  { label: 'Sequence', value: (event: TraceEventEnvelope) => `#${event.sequence}`, className: () => '' },
  { label: 'Timestamp', value: (event: TraceEventEnvelope) => event.timestamp, className: () => '' },
] as const
</script>

<template>
  <dl class="mb-5 grid grid-cols-[6.875rem_minmax(0,1fr)] gap-x-4">
    <template v-for="field in fields" :key="field.label">
      <dt class="flex min-h-7 items-center p-0 text-sm leading-3.5 font-semibold text-panel-muted">
        {{ field.label }}
      </dt>
      <dd
        class="flex min-h-7 min-w-0 items-center p-0 text-sm leading-3.5 text-panel-text [overflow-wrap:anywhere]"
        :class="field.className(props.event)"
      >
        {{ field.value(props.event) }}
      </dd>
    </template>
  </dl>
</template>
