<script setup lang="ts">
import type { JsonValue } from '@trace-script/metadata'
import { computed, shallowRef } from 'vue'

const props = defineProps<{ value: JsonValue, label: string, path: string, search: string }>()
defineEmits<{ copy: [text: string] }>()
const expanded = shallowRef(false)
const limit = shallowRef(100)
const object = computed(() => props.value !== null && typeof props.value === 'object')
const preview = computed(() => Array.isArray(props.value) ? `Array(${props.value.length})` : object.value ? '{…}' : String(props.value).slice(0, 140))
const entries = computed(() => props.value !== null && typeof props.value === 'object' ? Object.entries(props.value).filter(([key, value]) => !props.search || `${key} ${JSON.stringify(value)}`.toLowerCase().includes(props.search.toLowerCase())) : [])
function toggle(event: Event): void {
  if (event.target instanceof HTMLDetailsElement)
    expanded.value = event.target.open
}
function childPath(key: string): string {
  return Array.isArray(props.value) ? `${props.path}[${key}]` : `${props.path}[${JSON.stringify(key)}]`
}
</script>

<template>
  <details class="json-entry" @toggle="toggle">
    <summary><span class="json-key">{{ label }}</span> <span class="dim">{{ preview }}</span></summary>
    <div v-if="expanded" class="json-child">
      <div class="json-actions">
        <button @click="$emit('copy', path)">
          Copy path
        </button><button @click="$emit('copy', JSON.stringify(value, null, 2))">
          Copy value
        </button>
      </div>
      <template v-if="object">
        <TraceJsonNode v-for="[key, child] in entries.slice(0, limit)" :key="key" :value="child" :label="key" :path="childPath(key)" :search="search" @copy="$emit('copy', $event)" />
        <button v-if="entries.length > limit" @click="limit += 100">
          Show 100 more ({{ entries.length - limit }} remaining)
        </button>
      </template>
      <pre v-else>{{ JSON.stringify(value, null, 2) }}</pre>
    </div>
  </details>
</template>
