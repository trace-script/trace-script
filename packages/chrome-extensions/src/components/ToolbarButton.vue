<script setup lang="ts">
defineProps<{ label: string }>()
</script>

<template>
  <button
    type="button"
    class="h-7 whitespace-nowrap rounded-[0.1875rem] border border-control-border bg-control-bg px-2.25 hover:bg-control-hover"
    :aria-label="label"
  >
    <slot>{{ label }}</slot>
  </button>
</template>
