<script setup lang="ts">
import type { TraceRecord, TraceSummary } from '@trace-script/core'
import type { DetailTab } from '@/types/trace-panel'
import { computed, shallowRef, useTemplateRef, watch } from 'vue'
import { Detail, Overview, Payload, Raw, Relations, Timming, Usage } from '@/components/details'

const props = defineProps<{ record?: TraceRecord, traces: TraceSummary[] }>()
const emit = defineEmits<{ select: [id: string] }>()
const tabs: readonly DetailTab[] = ['Input / Output', 'Overview', 'Usage', 'Timing', 'Relations', 'Raw Events']
const tab = shallowRef<DetailTab>('Input / Output')
const content = useTemplateRef<HTMLElement>('content')
watch(tab, () => {
  if (content.value)
    content.value.scrollTop = 0
}, { flush: 'post' })
const trace = computed(() => props.traces.find(trace => trace.traceId === props.record?.traceId))
</script>

<template>
  <aside class="flex min-h-0 min-w-0 flex-col bg-panel-surface" aria-label="Call details">
    <template v-if="record">
      <Detail v-model:active="tab" :tabs="tabs" />
      <div
        ref="content"
        class="details-content min-h-0 flex-1 overflow-auto p-3 text-sm [overflow-anchor:none]"
        role="tabpanel"
        :aria-label="tab"
      >
        <Payload v-if="tab === 'Input / Output'" :record="record" />
        <Overview v-else-if="tab === 'Overview'" :record="record" />
        <Usage v-else-if="tab === 'Usage'" :record="record" />
        <Timming v-else-if="tab === 'Timing'" :record="record" />
        <Relations
          v-else-if="tab === 'Relations' && trace"
          :record="record"
          :trace="trace"
          @select="emit('select', $event)"
        />
        <Raw v-else :record="record" />
      </div>
    </template>
    <p v-else class="m-auto grid min-h-20 place-items-center text-center text-panel-muted">
      Select a Trace or call to inspect details
    </p>
  </aside>
</template>
