<script setup lang="ts">
import { formatDuration } from '@/utils/ui-model'

defineProps<{ connected: boolean, eventCount: number, visibleCount: number, totalTokens: number, visibleTokens: number, failedCount: number, maxDuration: number, totalDuration: number }>()

const statusItemClass = 'inline-flex items-center gap-1 whitespace-nowrap border-r border-divider px-2.5'
</script>

<template>
  <footer class="flex items-center border-t border-divider bg-panel-raised py-1 text-sm text-panel-muted" aria-label="Trace summary">
    <span class="gap-0 text-panel-text" :class="statusItemClass">
      <i class="mr-2 block size-2 rounded-full" :class="connected ? 'bg-success' : 'bg-danger'" />
      {{ connected ? 'Connected' : 'Disconnected' }}
    </span>
    <span :class="statusItemClass"><strong>{{ eventCount }}</strong> events</span>
    <span :class="statusItemClass"><strong>{{ visibleCount }}</strong> visible</span>
    <span :class="statusItemClass"><strong>{{ totalTokens }}</strong> tokens</span>
    <span :class="statusItemClass"><strong>{{ visibleTokens }}</strong> visible tokens</span>
    <span :class="[statusItemClass, failedCount ? 'text-danger' : '']"><strong>{{ failedCount }}</strong> failed</span>
    <span :class="statusItemClass">Max duration: <strong>{{ formatDuration(maxDuration) }}</strong></span>
    <span :class="statusItemClass">Total duration: <strong>{{ formatDuration(totalDuration) }}</strong></span>
    <span class="flex-1" />
    <span class="inline-flex items-center gap-1 whitespace-nowrap px-2.5 text-[#70757a]">↑↓ Navigate</span>
  </footer>
</template>
