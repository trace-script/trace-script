<script setup lang="ts">
import type { TraceRecord } from '@trace-script/core'

defineProps<{ record: TraceRecord }>()
</script>

<template>
  <div>
    <h3 class="details-section-label">
      Source events (complete payloads)
    </h3>
    <section
      v-for="event in record.events"
      :key="event.eventId"
      class="raw-event"
    >
      <h4>{{ event.eventId }} · {{ event.type }} · sequence {{ event.sequence }}</h4>
      <pre class="details-code">{{ JSON.stringify(event, null, 2) }}</pre>
    </section>
    <template v-if="record.conflicts.length">
      <h3 class="details-section-label status-incomplete">
        Conflicting arrivals (first received value retained)
      </h3>
      <pre class="details-code">{{ JSON.stringify(record.conflicts, null, 2) }}</pre>
    </template>
  </div>
</template>

<style scoped>
.raw-event {
  margin-bottom: 1.5rem;
}
.raw-event h4 {
  overflow-wrap: anywhere;
  color: var(--color-panel-muted);
  font-size: 0.75rem;
}
</style>
