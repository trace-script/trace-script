<script setup lang="ts">
import type { TraceEventEnvelope } from '@trace-script/metadata'
import type { DetailTab } from '@/types/trace-panel'
import { computed, shallowRef, watch } from 'vue'
import { Detail, Overview, Payload, Raw, Relations, Timming, Usage } from '@/components/details'
import { eventPayload } from '@/utils/ui-model'

const props = defineProps<{ event?: TraceEventEnvelope, siblings: TraceEventEnvelope[] }>()
const emit = defineEmits<{ select: [id: string] }>()
const tabs: readonly DetailTab[] = ['Overview', 'Usage', 'Payload', 'Timing', 'Relations', 'Raw']
const tab = shallowRef<DetailTab>('Overview')

watch(() => props.event?.eventId, () => {
  tab.value = 'Overview'
})
const payload = computed(() => props.event ? eventPayload(props.event) : {})
const related = computed(() => {
  const selectedEvent = props.event
  if (!selectedEvent)
    return []

  return props.siblings.filter((item) => {
    const sharesTrace = item.traceId === selectedEvent.traceId
    const isOtherEvent = item.eventId !== selectedEvent.eventId
    return sharesTrace && isOtherEvent
  })
})
</script>

<template>
  <aside class="flex min-h-0 min-w-0 flex-col bg-panel-surface" aria-label="Event details">
    <template v-if="event">
      <Detail v-model:active="tab" :tabs="tabs" />
      <div class="min-h-0 flex-1 overflow-auto p-2.5 text-sm [scrollbar-gutter:auto]">
        <Overview v-if="tab === 'Overview'" :event="event" />
        <Usage v-else-if="tab === 'Usage'" :event="event" />
        <Payload v-else-if="tab === 'Payload'" :payload="payload" />
        <Timming v-else-if="tab === 'Timing'" :event="event" />
        <Relations
          v-else-if="tab === 'Relations'"
          :related="related"
          @select="emit('select', $event)"
        />
        <Raw v-else :value="event" />
      </div>
    </template>
    <p v-else class="m-auto grid min-h-20 place-items-center text-center text-panel-muted">
      Select an event to inspect details
    </p>
  </aside>
</template>
