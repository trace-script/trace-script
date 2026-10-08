<script setup lang="ts">
import { shallowRef, useTemplateRef } from 'vue'
import { useWorkbench } from '../../composables/useWorkbench'
import TraceDetails from './TraceDetails.vue'
import TraceFilterBar from './TraceFilterBar.vue'
import TraceSettings from './TraceSettings.vue'
import TraceTable from './TraceTable.vue'

const { sessions, selectedSession, session, rows, traces, selected, related, message, presentation, navigate, total, cursor, nextCursor, filter, settings, collector, status, error, notice, origin, allowed, supported, sites, usage, quota, loading, exportPreview, refresh, selectSession, setFilter, selectEvent, saveSettings, prepareExport, download, importFile, removeSession, clearAll, closeDetail, cancelExport, page, grant, revoke } = useWorkbench()
const deletion = shallowRef<'session' | 'all' | false>(false)
const showSettings = shallowRef(false)
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
function select(event: Event): void {
  if (event.target instanceof HTMLSelectElement)
    selectSession(event.target.value)
}
function importChanged(event: Event): void {
  if (event.target instanceof HTMLInputElement) {
    const file = event.target.files?.[0]

    if (file)
      void importFile(file)

    event.target.value = ''
  }
}
</script>

<template>
  <main class="workbench">
    <header class="app-header">
      <div class="brand">
        <span class="brand-icon">⌁</span><strong>Trace Script</strong><span class="header-divider" /><span class="dim">Agent observability</span>
      </div><span class="connection"><span class="event-dot" :class="status === 'Connected' ? 'success' : 'pending'" />{{ status }}</span>
    </header>
    <div class="toolbar">
      <button :class="{ recording: settings.recording }" :aria-pressed="settings.recording" @click="saveSettings({ ...settings, recording: !settings.recording })">
        {{ settings.recording ? '● Recording' : '▶ Resume' }}
      </button><button :disabled="!session" @click="deletion = 'session'">
        Clear Session
      </button><span class="toolbar-spacer" /><button @click="fileInput?.click()">
        ↑ Import
      </button><button :disabled="!session" @click="prepareExport">
        ↓ Export
      </button><button @click="showSettings = true">
        Settings
      </button><input ref="fileInput" hidden type="file" accept=".json,application/json" @change="importChanged">
    </div>
    <div v-if="error" class="alert error-alert" role="alert">
      {{ error }} <button @click="refresh">
        Retry
      </button>
    </div>
    <div v-if="notice" class="notice" role="status">
      {{ notice }}
    </div>
    <section v-if="status === 'Connected' && !allowed" class="access-banner">
      <div><strong>{{ supported ? 'Connect this site to Trace Script' : 'This page cannot be recorded' }}</strong><p>{{ supported ? `${origin} · Grant access to collect events published by your application.` : 'Open an HTTP or HTTPS application, then open its DevTools.' }}</p></div><button v-if="supported" class="primary" @click="grant">
        Allow this site
      </button>
    </section>
    <div class="sessionbar">
      <label for="session-select">SESSION</label><select id="session-select" :value="selectedSession" @change="select">
        <option v-if="!sessions.length" value="">
          Waiting for a Session
        </option><option v-for="item in sessions" :key="item.key" :value="item.key">
          {{ item.source === 'imported' ? '[Imported] ' : '' }}{{ item.name }} · {{ item.eventCount.toLocaleString() }} events
        </option>
      </select><span class="dim">{{ session ? session.origin : origin }}</span><span class="toolbar-spacer" /><span class="mono dim">{{ session ? session.traceCount : 0 }} traces</span>
    </div>
    <TraceFilterBar :filter="filter" :traces="traces" @change="setFilter" />
    <div v-if="!sessions.length" class="welcome">
      <span class="welcome-mark">⌁</span><p class="eyebrow">
        FOLLOW EVERY STEP
      </p><h1>Your agent, in focus.</h1><p>Inspect model requests, tool calls and streamed responses.<br>Publish your first Session with the SDK, or import a trace file.</p><code>const session = client.startSession('My agent')</code><p class="dim">
        {{ allowed ? 'Site authorized. Waiting for your application to publish events.' : 'Authorize this site to start collecting.' }}
      </p><button @click="fileInput?.click()">
        Import a Session
      </button>
    </div>
    <div v-else class="split-view">
      <TraceTable :rows="rows" :selected-id="selected ? selected.event.eventId : ''" :columns="settings.columns" :widths="settings.columnWidths" :traces="traces" :filter="filter" :total="total" :cursor="cursor" :next-cursor="nextCursor" :loading="loading" @select="selectEvent" @filter="setFilter" @page="page" /><TraceDetails v-if="selected" :stored="selected" :related="related" :message="message" :presentation="presentation" :width="settings.detailWidth" @close="closeDetail" @navigate="navigate" />
    </div>
    <footer class="statusbar">
      <span><span class="event-dot" :class="settings.recording ? 'success' : 'pending'" />{{ settings.recording ? 'Listening for events' : 'Recording paused' }}</span><span class="toolbar-spacer" /><span>{{ collector.accepted.toLocaleString() }} accepted</span><span>{{ collector.rejected }} rejected</span><span :class="{ danger: collector.dropped > 0 }">{{ collector.dropped }} dropped</span><span>{{ collector.duplicates }} duplicates</span><span v-if="collector.paused">{{ collector.paused }} skipped while paused</span>
    </footer>
    <div v-if="collector.lastError" class="diagnostic" role="status">
      {{ collector.lastError }}
    </div>
    <div v-if="deletion" class="modal-backdrop">
      <section class="modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-title">
        <h2 id="delete-title">
          Delete {{ deletion === 'all' ? 'all stored data' : 'this Session' }}?
        </h2><p>Associated traces and events will be removed permanently.</p><footer>
          <button @click="deletion = false">
            Cancel
          </button><button class="danger" @click="deletion === 'all' ? clearAll() : removeSession(); deletion = false">
            Delete permanently
          </button>
        </footer>
      </section>
    </div>
    <TraceSettings v-if="showSettings" :settings="settings" :sites="sites" :usage="usage" :quota="quota" @save="saveSettings" @revoke="revoke" @close="showSettings = false" @clear="showSettings = false; deletion = 'all'" />
    <div v-if="exportPreview" class="modal-backdrop">
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="export-title">
        <header>
          <h2 id="export-title">
            Review export
          </h2><button aria-label="Close export" @click="cancelExport">
            ✕
          </button>
        </header><p><strong>{{ exportPreview.session.name }}</strong></p><p>{{ exportPreview.events.length.toLocaleString() }} events · {{ exportPreview.traces.length }} traces</p><p class="dim">
          Sensitive fields have been redacted. Prompts and free text may still contain private information. Review your data before sharing.
        </p><details><summary>Preview redacted data</summary><pre class="export-preview">{{ JSON.stringify(exportPreview.events.slice(0, 3), null, 2) }}</pre></details><footer>
          <button @click="cancelExport">
            Cancel
          </button><button class="primary" @click="download">
            Download JSON
          </button>
        </footer>
      </section>
    </div>
  </main>
</template>
