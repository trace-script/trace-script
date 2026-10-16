<script setup lang="ts">
import type { DetailTab } from '@/types/trace-panel'

defineProps<{ tabs: readonly DetailTab[], active: DetailTab }>()
const emit = defineEmits<{ 'update:active': [tab: DetailTab] }>()
</script>

<template>
  <nav
    class="flex h-auto shrink-0 gap-0 border-b border-divider bg-panel-surface"
    aria-label="Detail views"
    role="tablist"
  >
    <button
      v-for="item in tabs"
      :key="item"
      type="button"
      role="tab"
      class="h-auto min-h-0 shrink-0 cursor-pointer whitespace-nowrap border-0 border-b-2 border-panel-surface bg-transparent px-4 py-2 text-sm font-semibold text-panel-muted hover:border-control-hover hover:bg-control-hover hover:text-panel-text aria-selected:border-accent aria-selected:text-accent"
      :aria-selected="active === item"
      @click="emit('update:active', item)"
    >
      {{ item }}
    </button>
  </nav>
</template>
