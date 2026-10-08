<script setup lang="ts">
import type { JsonValue } from '@trace-script/metadata'
import { computed, shallowRef } from 'vue'
import TraceJsonNode from './TraceJsonNode.vue'

const props = withDefaults(defineProps<{ value: JsonValue, path?: string }>(), { path: '$' })
const search = shallowRef('')
const limit = shallowRef(100)
const feedback = shallowRef('')
const entries = computed(() => props.value !== null && typeof props.value === 'object' ? Object.entries(props.value).filter(([key, value]) => !search.value || `${key} ${JSON.stringify(value)}`.toLowerCase().includes(search.value.toLowerCase())) : [])
const serialized = computed(() => JSON.stringify(props.value, null, 2))
async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)

    feedback.value = 'Copied'
  }
  catch {
    feedback.value = 'Copy unavailable'
  }
}
</script>

<template>
  <div class="json-viewer">
    <div class="json-actions">
      <input v-model="search" aria-label="Search JSON" placeholder="Search keys or values"><button @click="copy(serialized)">
        Copy value
      </button><button @click="copy(path)">
        Copy path
      </button><span role="status">{{ feedback }}</span>
    </div>
    <template v-if="value !== null && typeof value === 'object'">
      <TraceJsonNode v-for="[key, child] in entries.slice(0, limit)" :key="key" :label="key" :value="child" :path="Array.isArray(value) ? `${path}[${key}]` : `${path}[${JSON.stringify(key)}]`" :search="search" @copy="copy" />
      <button v-if="entries.length > limit" @click="limit += 100">
        Show 100 more
      </button>
    </template>
    <pre v-else>{{ serialized }}</pre>
  </div>
</template>
