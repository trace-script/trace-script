<script setup lang="ts">
import type { PanelSettings } from '../../../../extension/types/messages'
import { shallowRef } from 'vue'

const props = defineProps<{ settings: PanelSettings, sites: string[], usage: number, quota: number }>()
const emit = defineEmits<{ save: [value: PanelSettings], revoke: [site: string], close: [], clear: [] }>()
const draft = shallowRef({ ...props.settings })
const redactFields = shallowRef(props.settings.redactFields.join(', '))
function number(event: Event): number {
  return event.target instanceof HTMLInputElement ? Number(event.target.value) : 0
}
function save(): void {
  emit('save', { ...draft.value, redactFields: redactFields.value.split(',').map(value => value.trim()).filter(Boolean) })

  emit('close')
}
</script>

<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <section class="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" @keydown.esc="$emit('close')">
      <header>
        <h2 id="settings-title">
          Settings
        </h2><button aria-label="Close settings" @click="$emit('close')">
          ✕
        </button>
      </header>
      <form @submit.prevent="save">
        <label>Theme<select v-model="draft.theme"><option value="system">Follow DevTools / system</option><option value="dark">Dark</option><option value="light">Light</option></select></label>
        <label>Keep Sessions for (days)<input type="number" min="1" max="365" :value="draft.retentionDays" @input="draft = { ...draft, retentionDays: number($event) }"></label>
        <label>Maximum Sessions<input type="number" min="1" max="1000" :value="draft.maxSessions" @input="draft = { ...draft, maxSessions: number($event) }"></label>
        <label>Storage budget (MiB)<input type="number" min="10" max="1000" :value="draft.maxStorageMb" @input="draft = { ...draft, maxStorageMb: number($event) }"></label>
        <label>Additional sensitive field names<input v-model="redactFields" placeholder="email, account_number"></label><p class="dim">
          Credentials and cookies are hidden automatically. Field matching is case insensitive. Free text still needs your review.
        </p>
        <fieldset><legend>Visible columns</legend><label v-for="column in ['type', 'status', 'agent', 'model', 'tokens', 'duration', 'start', 'timeline']" :key="column" class="check"><input v-model="draft.columns" type="checkbox" :value="column">{{ column }}</label></fieldset>
        <label>Details width (px)<input v-model.number="draft.detailWidth" type="range" min="280" max="900" step="20"></label>
        <details><summary>Column widths</summary><label v-for="column in ['name', ...draft.columns]" :key="column">{{ column }}<input type="number" min="70" max="600" :value="draft.columnWidths[column] ?? (column === 'name' ? 230 : column === 'timeline' ? 160 : 120)" @input="draft = { ...draft, columnWidths: { ...draft.columnWidths, [column]: number($event) } }"></label></details>
        <p class="dim">
          {{ (usage / 1024 / 1024).toFixed(1) }} MiB used / {{ (quota / 1024 / 1024).toFixed(0) }} MiB estimated browser quota
        </p>
        <h3>Authorized sites</h3><p v-if="!sites.length" class="dim">
          No sites authorized.
        </p><div v-for="site in sites" :key="site" class="site-row">
          <span class="mono">{{ site }}</span><button type="button" @click="$emit('revoke', site)">
            Revoke
          </button>
        </div>
        <footer>
          <button type="button" class="danger" @click="$emit('clear')">
            Delete all data
          </button><button class="primary" type="submit">
            Save settings
          </button>
        </footer>
      </form>
    </section>
  </div>
</template>
