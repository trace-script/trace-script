<script setup lang="ts">
import type { TraceRecord } from '@trace-script/core'
import { computed } from 'vue'

const props = defineProps<{ record: TraceRecord }>()
const fields = computed(() => {
  const record = props.record
  const fields = [
    { label: 'Type', value: record.kind, className: '' },
    { label: 'Status', value: record.status, className: `status-${record.status}` },
    { label: 'Trace ID', value: record.traceId, className: '' },
  ]
  if (record.kind === 'trace') {
    fields.push({ label: 'Call count', value: String(record.calls.length), className: '' })
  }
  else {
    fields.push(
      { label: 'Call identifier', value: record.callId, className: '' },
      { label: 'Name', value: record.name, className: '' },
      { label: 'Model', value: record.model, className: '' },
      { label: 'Agent', value: record.agent, className: '' },
    )
  }
  return fields
})
</script>

<template>
  <div>
    <dl class="details-fields">
      <template v-for="field in fields" :key="field.label">
        <dt class="details-field-label">
          {{ field.label }}
        </dt>
        <dd class="details-field-value" :class="field.className">
          {{ field.value }}
        </dd>
      </template>
    </dl>
    <h3 class="details-section-label">
      Data integrity
    </h3>
    <p v-if="!record.issues.length">
      No integrity issues observed.
    </p>
    <ul v-else class="status-incomplete">
      <li v-for="issue in record.issues" :key="issue">
        {{ issue }}
      </li>
    </ul>
    <pre
      v-for="(error, index) in record.errors"
      :key="index"
      class="details-code status-failed"
    >{{ error }}</pre>
  </div>
</template>
