<script setup lang="ts">
import type { EventRow, StoredEvent } from '@trace-script/metadata'
import { computed, shallowRef } from 'vue'
import TraceJsonViewer from './TraceJsonViewer.vue'

const props = defineProps<{ stored: StoredEvent, related: EventRow[], presentation: EventRow | false, message: { content: string, incomplete: boolean, contentMismatch: boolean } | false, width: number }>()
defineEmits<{ close: [], navigate: [id: string] }>()
const tab = shallowRef('Overview')
const event = computed(() => props.stored.event)
const display = computed(() => props.presentation || props.stored.event)
</script>

<template>
  <aside class="details-panel" :style="{ width: `${width}px` }" aria-label="Event details">
    <header class="details-header">
      <div>
        <p class="eyebrow">
          EVENT DETAILS
        </p><h2>{{ event.name }}</h2>
      </div><button aria-label="Close event details" @click="$emit('close')">
        ✕
      </button>
    </header>
    <div class="detail-tabs" role="tablist">
      <button v-for="name in ['Overview', 'Payload', 'Timing', 'Relations', 'Raw JSON']" :key="name" role="tab" :aria-selected="tab === name" @click="tab = name">
        {{ name }}
      </button>
    </div>
    <div class="detail-body" role="tabpanel">
      <template v-if="tab === 'Overview'">
        <span class="status-pill" :class="display.status">{{ display.status ?? event.type }}</span><dl>
          <dt>Type</dt><dd>{{ event.type }}</dd><dt>Event ID</dt><dd class="mono">
            {{ event.eventId }}
          </dd><dt>Trace ID</dt><dd class="mono">
            {{ event.traceId }}
          </dd><dt>Session</dt><dd class="mono">
            {{ event.sessionId }}
          </dd><dt>Model</dt><dd>{{ event.model?.name ?? '—' }}</dd><dt>Agent</dt><dd>{{ event.agent?.name ?? '—' }}</dd><dt>Tokens · in / out</dt><dd>{{ event.metrics?.inputTokens ?? '—' }} / {{ event.metrics?.outputTokens ?? '—' }}</dd><dt>Received</dt><dd>{{ stored.receivedAt }}</dd>
        </dl><div v-if="event.error" class="error-card">
          <strong>{{ event.error.message }}</strong><pre>{{ event.error.stack }}</pre>
        </div>
      </template>
      <template v-else-if="tab === 'Payload'">
        <section v-if="message" class="message-preview">
          <h3>Assembled response · {{ message.incomplete ? 'Streaming / incomplete' : 'Complete' }}</h3><p v-if="message.contentMismatch" class="dim">
            Completed text differs from the captured deltas.
          </p><TraceJsonViewer :value="message.content" />
        </section>
        <TraceJsonViewer :key="event.eventId" :value="event.payload ?? {}" />
      </template>
      <template v-else-if="tab === 'Timing'">
        <dl><dt>Started (UTC)</dt><dd>{{ event.timestamp }}</dd><dt>Duration</dt><dd>{{ display.durationMs === undefined ? 'Instantaneous or incomplete' : `${display.durationMs.toFixed(2)} ms` }}</dd><dt>Sequence</dt><dd>{{ event.sequence }}</dd><dt>Received (UTC)</dt><dd>{{ stored.receivedAt }}</dd></dl><p class="dim">
          Timing reflects the timestamps and durations supplied by your application.
        </p>
      </template>
      <template v-else-if="tab === 'Relations'">
        <p v-if="!related.length" class="dim">
          No related events were found. A parent may not have been captured.
        </p><p v-if="event.parentId && !related.some(row => row.eventId === event.parentId)" class="dim">
          Parent {{ event.parentId }} is missing from this Trace.
        </p><button v-for="row in related" :key="row.eventId" class="relation" @click="$emit('navigate', row.eventId)">
          {{ row.parentId === event.eventId ? '↓' : '↑' }} {{ row.name }} <span class="dim">{{ row.type }}</span>
        </button>
      </template>
      <TraceJsonViewer v-else :value="event" />
    </div>
  </aside>
</template>
