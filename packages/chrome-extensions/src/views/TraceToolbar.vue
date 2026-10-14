<script setup lang="ts">
import type { TraceEventEnvelope } from '@trace-script/metadata'
import { Icon } from '@iconify/vue'
import { TRACE_EVENT_TYPE } from '@trace-script/metadata'
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
const type = defineModel<typeof TRACE_FILTER_VALUE.ALL | TraceEventEnvelope['type']>('type', { required: true })
const status = defineModel<typeof TRACE_FILTER_VALUE.ALL | typeof TRACE_STATUS[keyof typeof TRACE_STATUS]>('status', { required: true })
const agent = defineModel<string>('agent', { required: true })
const recordingActionLabel = computed(() => props.recording ? 'Pause live updates' : 'Resume live updates')

const typeOptions = [
  TRACE_FILTER_VALUE.ALL,
  TRACE_EVENT_TYPE.TRACE_START,
  TRACE_EVENT_TYPE.MODEL_REQUEST,
  TRACE_EVENT_TYPE.MODEL_RESPONSE,
  TRACE_EVENT_TYPE.TOOL_RESULT,
  TRACE_EVENT_TYPE.TRACE_END,
  TRACE_EVENT_TYPE.TRACE_ERROR,
] as const

const statusOptions = [
  TRACE_FILTER_VALUE.ALL,
  TRACE_STATUS.SUCCESS,
  TRACE_STATUS.RUNNING,
  TRACE_STATUS.FAILED,
  TRACE_STATUS.CANCELLED,
] as const
</script>

<template>
  <header class="trace-toolbar">
    <div class="toolbar-main">
      <aside>
        <button
          type="button"
          class="icon-button"
          :class="recording ? 'is-live' : 'is-paused'"
          :aria-label="recordingActionLabel"
          :title="recordingActionLabel"
          @click="emit('toggleRecording')"
        >
          <Icon :icon="recording ? 'mdi:record-circle-outline' : 'mdi:play-outline'" aria-hidden="true" />
        </button>
        <button type="button" class="icon-button" aria-label="Clear events" title="Clear events" @click="emit('clear')">
          <Icon icon="mdi:delete-outline" aria-hidden="true" />
        </button>
        <button type="button" class="icon-button" :class="filtersVisible ? 'is-active' : ''" :aria-pressed="filtersVisible" aria-label="Toggle filters" title="Toggle filters" @click="emit('toggleFilters')">
          <Icon icon="mdi:filter-variant" aria-hidden="true" />
        </button>
      </aside>
      <span class="toolbar-divider" />
      <div v-show="filtersVisible" class="filter-bar">
        <input v-model="query" class="trace-search" type="search" placeholder="Search name or ID…" aria-label="Search name or ID">
        <FilterSelect v-model="type" label="Type" all-label="All types" :options="typeOptions" />
        <FilterSelect v-model="status" label="Status" all-label="All statuses" :options="statusOptions" />
        <FilterSelect v-model="agent" label="Agent" all-label="All agents" :options="agents" />
        <button type="button" class="filter-button" :class="onlyErrors ? 'is-error' : ''" @click="emit('toggleErrors')">
          Only errors
        </button>
      </div>
      <span class="event-count">{{ visible }} of {{ total }}</span>
      <template v-if="preview">
        <ToolbarButton label="Add 10 events" @click="emit('add')">
          Add 10 events
        </ToolbarButton>
        <span class="preview-badge">Preview</span>
      </template>
    </div>
  </header>
</template>

<style scoped>
.trace-toolbar {
  min-height: 3rem;
  border-bottom: 1px solid var(--divider);
  background: var(--panel-raised);
  padding: 0.5rem 0.75rem;
}
.toolbar-main {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.5rem;
}
.preview-badge {
  padding: 4px 0.75rem;
  border: 1px solid #0e7490;
  border-radius: 100rem;
  color: #67e8f9;
  font-size: 0.75rem;
  text-transform: uppercase;
}
.icon-button,
.filter-button {
  min-width: 1.75rem;
  height: 1.75rem;
  background: transparent;
  color: var(--text-muted);
}
.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 3px;
}
.icon-button svg {
  display: block;
  width: 1.25rem;
  height: 1.25rem;
}
.icon-button:hover,
.icon-button.is-active,
.filter-button:hover {
  border-color: var(--control-border);
  background: var(--control-hover);
  color: var(--text);
}
.icon-button:hover {
  border-color: transparent;
}
.icon-button.is-live {
  color: var(--success);
}
.icon-button.is-paused {
  color: var(--danger);
}
.toolbar-divider {
  height: 1.5rem;
  border-left: 1px solid var(--divider);
}
.filter-bar {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.4375rem;
}
.trace-search {
  width: 12.5rem;
  height: 1.875rem;
  border: 1px solid var(--control-border);
  border-radius: 3px;
  background: #202124;
  padding: 0.375rem 0.5rem;
  line-height: 1rem;
}
.filter-button {
  border-color: var(--control-border);
  background: var(--control-bg);
  padding: 0 0.5rem;
  white-space: nowrap;
  border-radius: 3px;
}
.filter-button.is-error {
  border-color: var(--danger);
  color: var(--danger);
}
.event-count {
  margin-left: auto;
  color: var(--text-muted);
  white-space: nowrap;
}
</style>
