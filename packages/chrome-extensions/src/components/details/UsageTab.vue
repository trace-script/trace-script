<script setup lang="ts">
import type { TraceRecord } from '@trace-script/core'
import { computed } from 'vue'
import { amountText, tokenText } from '@/utils/ui-model'

const props = defineProps<{ record: TraceRecord }>()
const fields = computed(() => {
  const record = props.record
  if (record.kind === 'trace') {
    return [
      { label: 'Input tokens', value: amountText(record.tokens.input) },
      { label: 'Output tokens', value: amountText(record.tokens.output) },
      { label: 'Total tokens', value: amountText(record.tokens.total) },
    ]
  }
  if (record.kind === 'model') {
    return [
      { label: 'Input tokens', value: tokenText(record.tokens.input) },
      { label: 'Output tokens', value: tokenText(record.tokens.output) },
      { label: 'Total tokens', value: tokenText(record.tokens.total) },
      { label: 'Source event', value: record.usageEventId ?? '—' },
    ]
  }
  return []
})
</script>

<template>
  <div>
    <dl v-if="fields.length" class="details-fields">
      <template v-for="field in fields" :key="field.label">
        <dt class="details-field-label">
          {{ field.label }}
        </dt>
        <dd class="details-field-value">
          {{ field.value }}
        </dd>
      </template>
    </dl>
    <template v-if="record.kind === 'trace'">
      <p>Each model call contributes once. Trace summaries and tools add no independent usage.</p>
      <p>Known consumption with incomplete data is labelled per metric.</p>
    </template>
    <template v-else-if="record.kind === 'model'">
      <p v-if="record.associationConflict" class="status-incomplete">
        Association conflict: raw usage is preserved below but excluded from determined consumption.
      </p>
      <p>Only final response usage is counted. Missing or invalid values are unknown; zero is valid. input_tokens/output_tokens take priority over prompt_tokens/completion_tokens. Total uses a valid total_tokens, or both known components.</p>
      <h3 class="details-section-label">
        Raw usage
      </h3>
      <pre class="details-code">{{ record.usage ?? 'Usage not provided' }}</pre>
    </template>
    <p v-else>
      Tools have no independent token consumption. Inspect the parent model call for response usage.
    </p>
  </div>
</template>
