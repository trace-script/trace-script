<script setup lang="ts">
import type { UsageSummary } from '@trace-script/core'
import { amountText } from '@/utils/ui-model'

defineProps<{ connected: boolean, traceCount: number, callCount: number, visibleCount: number, totalUsage: UsageSummary, visibleUsage: UsageSummary, failedCount: number, failedTraceCount: number }>()
const itemClass = 'border-r border-divider px-2.5'
</script>

<template>
  <footer class="flex shrink-0 flex-wrap gap-y-1 border-t border-divider bg-panel-raised py-1 text-xs text-panel-muted" aria-label="Call summary">
    <span :class="itemClass">{{ connected ? 'Connected' : 'Disconnected' }}</span>
    <span :class="itemClass">{{ traceCount }} traces · {{ callCount }} calls · {{ visibleCount }} matched</span>
    <span :class="itemClass">All model tokens — In: {{ amountText(totalUsage.input) }} · Out: {{ amountText(totalUsage.output) }} · Total: {{ amountText(totalUsage.total) }}</span>
    <span :class="itemClass">Matched model tokens — In: {{ amountText(visibleUsage.input) }} · Out: {{ amountText(visibleUsage.output) }} · Total: {{ amountText(visibleUsage.total) }}</span>
    <span :class="[itemClass, { 'text-danger': failedCount || failedTraceCount }]">{{ failedCount }} failed calls · {{ failedTraceCount }} failed or conflicting traces</span>
    <span class="ml-auto px-2.5">↑↓ Navigate</span>
  </footer>
</template>
