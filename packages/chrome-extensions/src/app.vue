<script setup lang="ts">
import type { AgentWorkOverviewItem } from '@trace-script/vue-components'
import { AgentWorkOverview } from '@trace-script/vue-components'
import { computed } from 'vue'
import { useTracePanel } from '@/hooks/use-trace-panel'
import { toOverviewItems } from '@/utils/overview-model'
import EventDetails from '@/views/EventDetails.vue'
import EventTable from '@/views/EventTable.vue'
import TraceStatusBar from '@/views/TraceStatusBar.vue'
import TraceToolbar from '@/views/TraceToolbar.vue'

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
  workspaceClass,
  contentClass,
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
  <main class="flex size-full flex-col overflow-hidden bg-panel-bg">
    <TraceToolbar
      v-model:query="filter.query"
      v-model:type="filter.type"
      v-model:status="filter.status"
      v-model:agent="filter.agent"
      :agents="agents"
      :total="events.length"
      :visible="visibleEvents.length"
      :preview="isPreview"
      :recording="recording"
      :filters-visible="filtersVisible"
      :only-errors="filter.onlyErrors"
      @clear="clearEvents"
      @add="addPreviewEvents"
      @toggle-recording="toggleRecording"
      @toggle-filters="filtersVisible = !filtersVisible"
      @toggle-errors="filter.onlyErrors = !filter.onlyErrors"
    />
    <div class="grid min-h-0 flex-1" :class="workspaceClass">
      <AgentWorkOverview
        class="min-h-0 max-h-90 rounded-none border-0"
        :items="overviewItems"
        :selected-id="selectedId"
        theme="dark"
        @select="onOverviewSelect"
      />
      <div
        class="z-2 h-px cursor-row-resize bg-divider hover:bg-accent focus:bg-accent"
        role="separator"
        aria-label="Resize timeline height"
        tabindex="0"
        @pointerdown="startResize('timeline', $event)"
        @keydown.down.prevent="nudgeTimeline(8)"
        @keydown.up.prevent="nudgeTimeline(-8)"
      />
      <div class="grid min-h-0 min-w-0 overflow-hidden" :class="contentClass">
        <EventTable
          :events="visibleEvents"
          :selected-id="selectedId"
          @select="selectEvent"
        />
        <div
          class="z-2 w-px cursor-col-resize bg-divider hover:bg-accent focus:bg-accent"
          role="separator"
          aria-label="Resize details panel width"
          tabindex="0"
          @pointerdown="startResize('details', $event)"
          @keydown.left.prevent="detailsWidth = Math.min(520, detailsWidth + 8)"
          @keydown.right.prevent="detailsWidth = Math.max(260, detailsWidth - 8)"
        />
        <EventDetails
          :event="selectedEvent"
          :siblings="events"
          @select="selectEvent"
        />
      </div>
    </div>
    <TraceStatusBar
      :connected="connected"
      :event-count="events.length"
      :visible-count="visibleEvents.length"
      :total-tokens="totalTokens"
      :visible-tokens="visibleTokens"
      :failed-count="failedCount"
      :max-duration="maxDuration"
      :total-duration="totalDuration"
    />
  </main>
</template>
