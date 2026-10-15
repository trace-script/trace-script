<script setup lang="ts">
import type { AgentWorkOverviewItem } from '@trace-script/vue-components'
import { AgentWorkOverview } from '@trace-script/vue-components'
import { computed } from 'vue'
import { useTracePanel } from './hooks/use-trace-panel'
import { toOverviewItems } from './utils/overview-model'
import EventDetails from './views/EventDetails.vue'
import EventTable from './views/EventTable.vue'
import TraceStatusBar from './views/TraceStatusBar.vue'
import TraceToolbar from './views/TraceToolbar.vue'

const {
  events,
  selectedId,
  selectedEvent,
  isPreview,
  connected,
  filtersVisible,
  recording,
  filter,
  agents,
  visibleEvents,
  totalTokens,
  visibleTokens,
  failedCount,
  maxDuration,
  totalDuration,
  detailsWidth,
  workspaceStyle,
  contentStyle,
  toggleRecording,
  selectEvent,
  clearEvents,
  addPreviewEvents,
  startResize,
  nudgeTimeline,
} = useTracePanel()

const overviewItems = computed(() => toOverviewItems(visibleEvents.value))

function onOverviewSelect(item: AgentWorkOverviewItem): void {
  selectEvent(item.id)
}
</script>

<template>
  <main class="trace-app">
    <TraceToolbar v-model:query="filter.query" v-model:type="filter.type" v-model:status="filter.status" v-model:agent="filter.agent" :agents="agents" :total="events.length" :visible="visibleEvents.length" :preview="isPreview" :recording="recording" :filters-visible="filtersVisible" :only-errors="filter.onlyErrors" @clear="clearEvents" @add="addPreviewEvents" @toggle-recording="toggleRecording" @toggle-filters="filtersVisible = !filtersVisible" @toggle-errors="filter.onlyErrors = !filter.onlyErrors" />
    <div class="trace-workspace" :style="workspaceStyle">
      <AgentWorkOverview :items="overviewItems" :selected-id="selectedId" theme="dark" @select="onOverviewSelect" />
      <div class="resize-handle resize-handle-vertical" role="separator" aria-label="Resize timeline height" tabindex="0" @pointerdown="startResize('timeline', $event)" @keydown.down.prevent="nudgeTimeline(8)" @keydown.up.prevent="nudgeTimeline(-8)" />
      <div class="content-workspace" :style="contentStyle">
        <EventTable :events="visibleEvents" :selected-id="selectedId" @select="selectEvent" />
        <div class="resize-handle resize-handle-horizontal" role="separator" aria-label="Resize details panel width" tabindex="0" @pointerdown="startResize('details', $event)" @keydown.left.prevent="detailsWidth = Math.min(520, detailsWidth + 8)" @keydown.right.prevent="detailsWidth = Math.max(260, detailsWidth - 8)" />
        <EventDetails :event="selectedEvent" :siblings="events" @select="selectEvent" />
      </div>
    </div>
    <TraceStatusBar :connected="connected" :event-count="events.length" :visible-count="visibleEvents.length" :total-tokens="totalTokens" :visible-tokens="visibleTokens" :failed-count="failedCount" :max-duration="maxDuration" :total-duration="totalDuration" />
  </main>
</template>

<style scoped>
.trace-app {
  display: flex;
  width: 100%;
  height: 100%;
  flex-direction: column;
  overflow: hidden;
  background: var(--panel-bg);
}
.trace-workspace {
  display: grid;
  min-height: 0;
  flex: 1;
}
.resize-handle {
  z-index: 2;
  background: var(--divider);
}
.resize-handle:hover,
.resize-handle:focus {
  background: var(--accent);
}
.resize-handle-vertical {
  height: 1px;
  cursor: row-resize;
}
.resize-handle-horizontal {
  width: 1px;
  cursor: col-resize;
}
.content-workspace {
  display: grid;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.trace-workspace :deep(.agent-work-overview) {
  min-height: 0;
  max-height: 22.5rem;
  border: 0;
  border-radius: 0;
}
</style>
