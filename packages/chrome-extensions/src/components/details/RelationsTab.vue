<script setup lang="ts">
import type { TraceRecord, TraceSummary } from '@trace-script/core'
import { computed } from 'vue'

const props = defineProps<{ record: TraceRecord, trace: TraceSummary }>()
const emit = defineEmits<{ select: [id: string] }>()
const parent = computed(() => {
  const record = props.record
  return record.kind === 'tool' ? props.trace.calls.find(call => call.id === record.parentId) : undefined
})
</script>

<template>
  <div class="relations">
    <h3 class="details-section-label">
      Trace
    </h3>
    <button @click="emit('select', trace.id)">
      {{ trace.traceId }} · {{ trace.status }}
    </button>
    <template v-if="parent">
      <h3 class="details-section-label">
        Parent model call
      </h3>
      <button @click="emit('select', parent.id)">
        {{ parent.name }} · {{ parent.callId }}
      </button>
    </template>
    <h3 class="details-section-label">
      Calls in this Trace
    </h3>
    <button
      v-for="call in trace.calls"
      :key="call.id"
      :aria-pressed="call.id === record.id"
      @click="emit('select', call.id)"
    >
      {{ call.name }} · {{ call.kind }} · {{ call.callId }} · {{ call.status }}
    </button>
  </div>
</template>

<style scoped>
.relations button {
  display: block;
  width: 100%;
  margin-bottom: 6px;
  border: 1px solid var(--color-divider);
  background: var(--color-control-bg);
  padding: 8px;
  text-align: left;
  overflow-wrap: anywhere;
}
.relations h3 {
  margin-top: 1.25rem;
}
</style>
