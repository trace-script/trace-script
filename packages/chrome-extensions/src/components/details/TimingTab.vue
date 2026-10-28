<script setup lang="ts">
import type { TraceRecord } from '@trace-script/core'
import { isUndefined } from '@trace-script/shared'
import { computed } from 'vue'
import { timingText } from '@/utils/ui-model'

const props = defineProps<{ record: TraceRecord }>()
const fields = computed(() => {
  const record = props.record
  return [
    { label: 'Start', value: record.timing.start ?? '— (input / start missing)' },
    { label: 'Completion', value: record.timing.end ?? '— (completion missing)' },
    {
      label: record.kind === 'tool' ? 'Return interval' : 'Duration',
      value: timingText(record.timing, record.kind === 'trace' && record.status === 'running'),
    },
  ]
})
</script>

<template>
  <div>
    <dl class="details-fields">
      <template v-for="field in fields" :key="field.label">
        <dt class="details-field-label">
          {{ field.label }}
        </dt>
        <dd class="details-field-value">
          {{ field.value }}
        </dd>
      </template>
    </dl>
    <p v-if="record.timing.anomalous" class="status-incomplete">
      Time anomaly: completion precedes start. Original timestamps are preserved; no negative duration is shown.
    </p>
    <p v-if="record.kind === 'model'">
      Observed interval from recording the request to the final response (or a located failure). This is not server processing time.
    </p>
    <p v-else-if="record.kind === 'tool'">
      Return interval from the model's tool declaration to the result (or a located failure). Includes waiting, scheduling and execution; it is not measured tool execution time.
    </p>
    <p v-else>
      Trace interval from start to end or error, including parallel work and waits. Call durations are never summed to replace this interval.
    </p>
    <p v-if="isUndefined(record.timing.duration) && !record.timing.anomalous">
      Both endpoints are required for a final interval. Waiting calls do not have a final duration of zero.
    </p>
  </div>
</template>
