<script setup lang="ts">
import type { AgentWorkOverviewItem } from '@trace-script/vue-components'
import { AgentWorkOverview } from '@trace-script/vue-components'
import { useToggle } from '@vueuse/core'
import { computed, toRef } from 'vue'
import { useTracePanel } from '@/hooks/use-trace-panel'
import { toOverviewItems } from '@/utils/overview-model'
import EventDetails from '@/views/EventDetails.vue'
import EventTable from '@/views/EventTable.vue'
import TraceStatusBar from '@/views/TraceStatusBar.vue'
import TraceToolbar from '@/views/TraceToolbar.vue'

const {
  traces,
  calls,
  activeId,
  selectedRecord,
  isPreview,
  connected,
  filtersVisible,
  recording,
  filter,
  agents,
  visibleCalls,
  visibleTraces,
  totalUsage,
  visibleUsage,
  failedCount,
  failedTraceCount,
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

const overviewItems = computed(() => toOverviewItems(visibleCalls.value))
const toggleFilters = useToggle(filtersVisible)
const toggleErrors = useToggle(toRef(filter, 'onlyErrors'))

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
      :total="calls.length"
      :visible="visibleCalls.length"
      :preview="isPreview"
      :recording="recording"
      :filters-visible="filtersVisible"
      :only-errors="filter.onlyErrors"
      @clear="clearEvents"
      @add="addPreviewEvents"
      @toggle-recording="toggleRecording"
      @toggle-filters="toggleFilters()"
      @toggle-errors="toggleErrors()"
    />
    <div class="grid min-h-0 flex-1" :class="workspaceClass">
      <AgentWorkOverview
        class="min-h-0 max-h-90 rounded-none border-0"
        :items="overviewItems"
        :selected-id="activeId"
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
          :calls="visibleCalls"
          :traces="visibleTraces"
          :selected-id="activeId"
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
          :record="selectedRecord || undefined"
          :traces="traces"
          @select="selectEvent"
        />
      </div>
    </div>
    <TraceStatusBar
      :connected="connected"
      :trace-count="traces.length"
      :call-count="calls.length"
      :visible-count="visibleCalls.length"
      :total-usage="totalUsage"
      :visible-usage="visibleUsage"
      :failed-count="failedCount"
      :failed-trace-count="failedTraceCount"
    />
  </main>
</template>
