<script setup lang="ts">
defineProps<{ value: unknown }>()
</script>

<template>
  <pre class="m-0 overflow-auto font-mono text-xs leading-6 whitespace-pre-wrap text-gray-300 [overflow-wrap:anywhere]">{{ JSON.stringify(value, null, 2) }}</pre>
</template>
