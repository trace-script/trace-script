<script setup lang="ts">
import type { TraceRecord } from '@trace-script/core'
import { isUndefined } from '@trace-script/shared'
import { computed } from 'vue'

const props = defineProps<{ record: TraceRecord }>()
const lifecycle = computed(() => props.record.events.filter(event => event.type === 'trace.start' || event.type === 'trace.end' || event.type === 'trace.error'))
const outputHint = computed(() => {
  if (props.record.kind === 'trace')
    return ''
  if (props.record.status === 'failed')
    return 'Call failed; output not recorded. See error below.'
  if (props.record.status === 'interrupted')
    return 'Interrupted; specific cause not located.'
  if (props.record.status === 'cancelled')
    return 'Cancellation explicitly recorded; output missing.'
  if (props.record.status === 'incomplete')
    return 'Output missing after Trace ended.'
  return props.record.kind === 'tool' ? 'Waiting for result; tool execution start is not recorded.' : 'Waiting for final response.'
})
</script>

<template>
  <div>
    <template v-if="record.kind === 'trace'">
      <h3 class="details-section-label">
        Trace lifecycle · {{ record.status }}
      </h3>
      <pre class="details-code">{{ JSON.stringify(lifecycle, null, 2) }}</pre>
    </template>
    <template v-else>
      <h3 class="details-section-label">
        {{ record.kind === 'model' ? 'Request' : `Arguments · ${record.name}` }}
      </h3>
      <pre v-if="!isUndefined(record.input)" class="details-code">{{ record.input }}</pre>
      <p v-else class="missing-hint">
        Input missing {{ record.kind === 'tool' && record.declaration ? ': arguments not recorded' : '' }} .
      </p>
      <details v-if="record.declaration" class="tool-declaration">
        <summary>Original Tool Call</summary>
        <pre class="details-code">{{ record.declaration }}</pre>
      </details>
      <h3 class="details-section-label output-label">
        {{ record.kind === 'model' ? 'Response' : 'Result' }}
      </h3>
      <pre
        v-if="!isUndefined(record.output)"
        class="details-code"
        :aria-label="record.output === '' ? 'Valid empty result' : 'Output'"
      >{{ record.output === '' ? '"" (valid empty result)' : record.output }}</pre>
      <p v-else class="missing-hint">
        {{ outputHint }}
      </p>
    </template>
    <div v-if="record.errors.length" class="error-block">
      <h3>Errors</h3>
      <pre
        v-for="(error, index) in record.errors"
        :key="index"
        class="details-code"
      >{{ error }}</pre>
    </div>
    <ul v-if="record.issues.length" class="data-issues">
      <li v-for="issue in record.issues" :key="issue">
        {{ issue }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.output-label {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--color-divider);
}
.missing-hint,
.data-issues {
  color: var(--color-warning);
}
.tool-declaration {
  margin-top: 0.75rem;
}
.tool-declaration summary {
  margin-bottom: 8px;
  color: var(--color-panel-muted);
  cursor: pointer;
}
.error-block {
  margin-top: 1.25rem;
  color: var(--color-danger);
}
.error-block pre {
  color: var(--color-danger);
}
.data-issues {
  margin-top: 1.25rem;
  padding-left: 1.25rem;
  line-height: 1.6;
}
</style>
