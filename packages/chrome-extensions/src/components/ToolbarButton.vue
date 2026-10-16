<script setup lang="ts">
withDefaults(defineProps<{
  label: string
  active?: boolean
  tone?: 'default' | 'danger'
}>(), {
  active: false,
  tone: 'default',
})
</script>

<template>
  <button
    type="button"
    class="h-7 whitespace-nowrap rounded-[0.1875rem] border border-control-border bg-control-bg px-2.25 hover:bg-control-hover"
    :class="[
      active ? 'bg-control-hover' : '',
      tone === 'danger' ? 'border-danger text-danger' : '',
    ]"
    :aria-label="label"
  >
    <slot>{{ label }}</slot>
  </button>
</template>
