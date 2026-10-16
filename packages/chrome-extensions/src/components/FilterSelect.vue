<script setup lang="ts">
defineProps<{ modelValue: string, options: readonly string[], label: string, allLabel: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
function handleChange(event: Event): void {
  emit('update:modelValue', (event.target as HTMLSelectElement).value)
}
</script>

<template>
  <label class="flex items-center gap-1.25 whitespace-nowrap text-panel-muted"><select
    class="h-7 w-auto rounded-[0.1875rem] border border-control-border bg-control-bg px-1.5 [field-sizing:content]"
    :value="modelValue"
    :aria-label="label"
    @change="handleChange"
  >
    <option
      v-for="option in options"
      :key="option"
      :value="option"
    >
      {{ option === 'all' ? allLabel : option }}
    </option>
  </select></label>
</template>
