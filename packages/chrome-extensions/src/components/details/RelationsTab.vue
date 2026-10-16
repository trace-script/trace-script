<script setup lang="ts">
import type { TraceEventEnvelope } from '@trace-script/metadata'
import { eventName } from '@/utils/ui-model'

defineProps<{ related: TraceEventEnvelope[] }>()
const emit = defineEmits<{ select: [id: string] }>()
</script>

<template>
  <p class="mb-2 font-semibold text-panel-muted">
    Trace and event links
  </p>
  <button
    v-for="item in related"
    :key="item.eventId"
    type="button"
    class="mb-2 block w-full rounded-[0.1875rem] border border-control-border bg-control-bg px-3 py-2.5 text-left text-panel-text hover:border-accent hover:bg-control-hover"
    @click="emit('select', item.eventId)"
  >
    {{ eventName(item) }} · #{{ item.sequence }}
  </button>
  <p v-if="!related.length" class="m-auto grid min-h-20 place-items-center text-center text-panel-muted">
    No related events
  </p>
</template>
