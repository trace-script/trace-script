<script setup lang="ts">
import type { CallRecord, TraceSummary } from '@trace-script/core'
import { computed } from 'vue'
import { timingText, tokenText } from '@/utils/ui-model'

const props = defineProps<{ calls: CallRecord[], traces: TraceSummary[], selectedId: string }>()
const emit = defineEmits<{ select: [id: string] }>()
const columns = ['TraceID', 'Name', 'Agent', 'Duration', 'Type', 'Status', 'Model', 'Tokens']
const rows = computed(() => props.calls.map(call => ({ call, trace: props.traces.find(trace => trace.traceId === call.traceId) })))
const issues = computed(() => props.traces.filter(trace => (trace.status === 'failed' || trace.status === 'conflict') && !props.calls.some(call => call.traceId === trace.traceId)))
</script>

<template>
  <section class="min-h-0 min-w-0 overflow-auto" aria-label="Trace calls">
    <table class="w-full min-w-250 table-fixed text-left text-xs">
      <thead class="sticky top-0 z-1 border-b border-divider bg-panel-surface text-panel-muted">
        <tr>
          <th
            v-for="column in columns"
            :key="column"
            class="px-2 py-2 font-medium first:w-1/5"
          >
            {{ column }}
          </th>
        </tr>
      </thead>
      <tbody class="event-table-body">
        <tr
          v-for="{ call, trace } in rows"
          :key="call.id"
          class="event-row cursor-pointer border-b border-divider bg-panel-bg odd:bg-panel-surface hover:bg-control-hover aria-selected:bg-control-hover [&>td]:px-2 [&>td]:py-2"
          :aria-selected="call.id === selectedId"
          @click="emit('select', call.id)"
        >
          <td class="min-w-0">
            <button
              v-if="trace"
              type="button"
              class="trace-link block max-w-full truncate text-left text-panel-muted underline decoration-dotted"
              :title="call.traceId"
              :aria-label="`Inspect Trace ${call.traceId}`"
              @click.stop="emit('select', trace.id)"
            >
              {{ call.traceId }}
            </button>
            <span v-if="trace && (trace.status === 'failed' || trace.status === 'conflict')" class="block text-danger">Trace {{ trace.status }}: {{ trace.errors.join('; ') || trace.issues.join('; ') }}</span>
          </td>
          <td>
            <button
              type="button"
              class="block max-w-full truncate text-left font-semibold"
              :aria-label="`${call.name} · ${call.callId}`"
              @click.stop="emit('select', call.id)"
            >
              {{ call.name }}
            </button>
          </td>
          <td class="truncate">
            {{ call.agent }}
          </td>
          <td :title="call.kind === 'tool' ? 'Return interval, including waiting and execution' : 'Observed request to final response interval'">
            {{ timingText(call.timing, call.status === 'running') }}
          </td>
          <td>{{ call.kind }}</td>
          <td :class="`status-${call.status}`">
            {{ call.status }}<span v-if="call.associationConflict" class="block text-warning">Conflict</span>
          </td>
          <td class="truncate" :title="call.model">
            {{ call.model }}
          </td>
          <td>{{ tokenText(call.tokens.total) }}</td>
        </tr>
      </tbody>
    </table>
    <div v-if="!calls.length || issues.length" class="grid min-h-20 place-items-center gap-2 p-3 text-center text-panel-muted">
      <p v-if="!calls.length">
        No calls match these filters
      </p>
      <button
        v-for="trace in issues"
        :key="trace.id"
        type="button"
        class="trace-issue-link text-danger underline"
        @click="emit('select', trace.id)"
      >
        Inspect Trace {{ trace.traceId }} · {{ trace.status }}: {{ trace.errors.join('; ') || trace.issues.join('; ') }}
      </button>
    </div>
  </section>
</template>
