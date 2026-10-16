<script setup lang="ts">
defineProps<{ payload: Record<string, unknown> }>()
</script>

<template>
  <div class="mb-2 font-semibold text-panel-muted">
    Response payload
  </div>
  <pre class="m-0 overflow-auto font-mono text-xs leading-6 whitespace-pre-wrap text-gray-300 [overflow-wrap:anywhere]">{{ JSON.stringify(payload, null, 2) }}</pre>
</template>
