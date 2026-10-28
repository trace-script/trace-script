<script setup lang="ts">
import type { EventTypeFilter, StatusFilter } from '@/types/trace-panel'
import { Icon } from '@iconify/vue'
import { computed } from 'vue'
import FilterSelect from '@/components/FilterSelect.vue'
import ToolbarButton from '@/components/ToolbarButton.vue'
import { TRACE_FILTER_VALUE, TRACE_STATUS } from '@/utils/ui-model'

const props = defineProps<{
  total: number
  visible: number
  preview: boolean
  recording: boolean
  filtersVisible: boolean
  onlyErrors: boolean
  agents: readonly string[]
}>()

const emit = defineEmits<{
  clear: []
  add: []
  toggleRecording: []
  toggleFilters: []
  toggleErrors: []
}>()
const query = defineModel<string>('query', { required: true })
const type = defineModel<EventTypeFilter>('type', { required: true })
const status = defineModel<StatusFilter>('status', { required: true })
const agent = defineModel<string>('agent', { required: true })
const recordingActionLabel = computed(() => props.recording ? 'Pause live updates' : 'Resume live updates')

const typeOptions = [TRACE_FILTER_VALUE.ALL, 'model', 'tool'] as const
const statusOptions = [TRACE_FILTER_VALUE.ALL, ...Object.values(TRACE_STATUS)]
</script>

<template>
  <header class="min-h-12 border-b border-divider bg-panel-raised px-3 py-2">
    <div class="flex min-w-0 items-center gap-2">
      <aside class="flex items-center">
        <button
          type="button"
          class="inline-flex size-7 items-center justify-center rounded-[0.1875rem] border-0 bg-transparent p-0 text-panel-muted hover:bg-control-hover hover:text-panel-text [&_svg]:block [&_svg]:size-5"
          :class="recording ? 'text-success' : 'text-danger'"
          :aria-label="recordingActionLabel"
          :title="recordingActionLabel"
          @click="emit('toggleRecording')"
        >
          <Icon :icon="recording ? 'mdi:record-circle-outline' : 'mdi:play-outline'" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="inline-flex size-7 items-center justify-center rounded-[0.1875rem] border-0 bg-transparent p-0 text-panel-muted hover:bg-control-hover hover:text-panel-text [&_svg]:block [&_svg]:size-5"
          aria-label="Clear traces"
          title="Clear traces"
          @click="emit('clear')"
        >
          <Icon icon="mdi:delete-outline" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="inline-flex size-7 items-center justify-center rounded-[0.1875rem] border-0 bg-transparent p-0 text-panel-muted hover:bg-control-hover hover:text-panel-text [&_svg]:block [&_svg]:size-5"
          :class="filtersVisible ? 'bg-control-hover text-panel-text' : ''"
          :aria-pressed="filtersVisible"
          aria-label="Toggle filters"
          title="Toggle filters"
          @click="emit('toggleFilters')"
        >
          <Icon icon="mdi:filter-variant" aria-hidden="true" />
        </button>
      </aside>
      <span class="h-6 border-l border-divider" />
      <div v-show="filtersVisible" class="flex min-w-0 items-center gap-1.75">
        <input
          v-model="query"
          class="h-7.5 w-50 rounded-[0.1875rem] border border-control-border bg-panel-bg px-2 py-1.5 leading-4"
          type="search"
          placeholder="Search name or ID…"
          aria-label="Search name or ID"
        >
        <FilterSelect
          v-model="type"
          label="Type"
          all-label="All types"
          :options="typeOptions"
        />
        <FilterSelect
          v-model="status"
          label="Status"
          all-label="All statuses"
          :options="statusOptions"
        />
        <FilterSelect
          v-model="agent"
          label="Agent"
          all-label="All agents"
          :options="agents"
        />
        <button
          type="button"
          class="h-7 min-w-7 whitespace-nowrap rounded-[0.1875rem] border border-control-border bg-control-bg px-2 text-panel-muted hover:bg-control-hover hover:text-panel-text"
          :class="onlyErrors ? 'border-danger text-danger' : ''"
          @click="emit('toggleErrors')"
        >
          Only errors
        </button>
      </div>
      <span class="ml-auto whitespace-nowrap text-panel-muted">{{ visible }} of {{ total }} calls</span>
      <template v-if="preview">
        <ToolbarButton label="Add sample Trace" @click="emit('add')">
          Add sample Trace
        </ToolbarButton>
        <span class="rounded-full border border-cyan-700 px-3 py-1 text-xs text-cyan-300 uppercase">Preview</span>
      </template>
    </div>
  </header>
</template>
