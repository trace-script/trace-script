<script setup lang="ts">
import type { EventFilter, TraceSummary } from '@trace-script/metadata'
import { eventFilterSchema, TRACE_EVENT_TYPES, TRACE_STATUSES } from '@trace-script/metadata'

defineProps<{ filter: EventFilter, traces: TraceSummary[] }>()
const emit = defineEmits<{ change: [value: EventFilter] }>()
function value(event: Event): string {
  return event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement ? event.target.value : ''
}
</script>

<template>
  <div class="filterbar">
    <input aria-label="Search events" placeholder="Filter by name, ID, agent or model…" :value="filter.text" @input="emit('change', { ...filter, text: value($event) })">
    <select aria-label="Event type" :value="filter.type" @change="emit('change', { ...filter, type: value($event) })">
      <option value="">
        All types
      </option><option v-for="type in TRACE_EVENT_TYPES" :key="type">
        {{ type }}
      </option>
    </select>
    <select aria-label="Event status" :value="filter.status" @change="emit('change', { ...filter, status: value($event) })">
      <option value="">
        All statuses
      </option><option v-for="state in TRACE_STATUSES" :key="state">
        {{ state }}
      </option>
    </select>
    <select aria-label="Trace" :value="filter.traceId" @change="emit('change', { ...filter, traceId: value($event) })">
      <option value="">
        All traces
      </option><option v-for="trace in traces" :key="trace.key" :value="trace.traceId">
        {{ trace.name }}
      </option>
    </select>
    <button :aria-pressed="filter.status === 'error'" @click="emit('change', { ...filter, status: filter.status === 'error' ? '' : 'error' })">
      Errors only
    </button>
    <button @click="emit('change', eventFilterSchema.parse({}))">
      Reset
    </button>
    <details class="advanced">
      <summary>More filters</summary><div class="advanced-fields">
        <input aria-label="Agent" placeholder="Exact agent name" :value="filter.agent" @change="emit('change', { ...filter, agent: value($event) })">
        <input aria-label="Model" placeholder="Exact model name" :value="filter.model" @change="emit('change', { ...filter, model: value($event) })">
        <input aria-label="From UTC time" placeholder="From ISO UTC time" :value="filter.from" @change="emit('change', { ...filter, from: value($event) })">
        <input aria-label="To UTC time" placeholder="To ISO UTC time" :value="filter.to" @change="emit('change', { ...filter, to: value($event) })">
      </div>
    </details>
  </div>
</template>
