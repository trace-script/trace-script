import type { EventFilter, EventRow, ExportDocument, SessionSummary, StoredEvent, TraceSummary } from '@trace-script/metadata'

import type { ComputedRef, ShallowRef } from 'vue'
import type { PanelSettings } from '../../../extension/types/messages'
import { eventFilterSchema, exportDocumentSchema, sessionSchema, storedEventSchema, traceEventEnvelopeSchema, traceSummarySchema } from '@trace-script/metadata'
import { computed, onMounted, onUnmounted, shallowRef, watch } from 'vue'
import { z } from 'zod'
import { collectorSchema, defaultCollector, settingsSchema } from '../../../extension/types/messages'
import { createPanelConnection } from '../services/connection'

export interface Workbench {
  sessions: ShallowRef<SessionSummary[]>
  selectedSession: ShallowRef<string>
  session: ComputedRef<SessionSummary | false>
  rows: ShallowRef<EventRow[]>
  traces: ShallowRef<TraceSummary[]>
  selected: ShallowRef<StoredEvent | false>
  related: ShallowRef<EventRow[]>
  message: ShallowRef<{ content: string, incomplete: boolean, contentMismatch: boolean } | false>
  presentation: ShallowRef<EventRow | false>
  navigate: (id: string) => Promise<void>
  total: ShallowRef<number>
  cursor: ShallowRef<number>
  nextCursor: ShallowRef<number>
  filter: ShallowRef<EventFilter>
  settings: ShallowRef<PanelSettings>
  collector: ShallowRef<ReturnType<typeof defaultCollector>>
  status: ShallowRef<string>
  error: ShallowRef<string>
  notice: ShallowRef<string>
  origin: ShallowRef<string>
  allowed: ShallowRef<boolean>
  supported: ShallowRef<boolean>
  sites: ShallowRef<string[]>
  usage: ShallowRef<number>
  quota: ShallowRef<number>
  loading: ShallowRef<boolean>
  exportPreview: ShallowRef<ExportDocument | false>
  refresh: () => Promise<void>
  selectSession: (key: string) => void
  setFilter: (value: EventFilter) => void
  selectEvent: (id: string) => Promise<void>
  saveSettings: (value: PanelSettings) => Promise<void>
  prepareExport: () => Promise<void>
  download: () => void
  importFile: (file: File) => Promise<void>
  removeSession: () => Promise<void>
  clearAll: () => Promise<void>
  closeDetail: () => void
  cancelExport: () => void
  page: (value: number) => void
  grant: () => Promise<void>
  revoke: (site: string) => Promise<void>
}

const snapshotSchema = z.object({ sessions: z.array(sessionSchema), settings: settingsSchema, collector: collectorSchema, origin: z.string(), allowed: z.boolean(), supported: z.boolean(), sites: z.array(z.string()), usage: z.number(), quota: z.number() })
const querySchema = z.object({ page: z.object({ rows: z.array(traceEventEnvelopeSchema), total: z.number(), nextCursor: z.number() }), traces: z.array(traceSummarySchema) })
const detailSchema = z.object({ stored: storedEventSchema, related: z.array(traceEventEnvelopeSchema), presentation: traceEventEnvelopeSchema, message: z.union([z.literal(false), z.object({ content: z.string(), incomplete: z.boolean(), contentMismatch: z.boolean() })]) })
export function useWorkbench(): Workbench {
  const sessions = shallowRef<SessionSummary[]>([])

  const selectedSession = shallowRef('')

  const rows = shallowRef<EventRow[]>([])

  const traces = shallowRef<TraceSummary[]>([])

  const selected = shallowRef<StoredEvent | false>(false)

  const related = shallowRef<EventRow[]>([])
  const message = shallowRef<{ content: string, incomplete: boolean, contentMismatch: boolean } | false>(false)
  const presentation = shallowRef<EventRow | false>(false)

  const total = shallowRef(0)

  const cursor = shallowRef(0)

  const nextCursor = shallowRef(-1)

  const filter = shallowRef<EventFilter>(eventFilterSchema.parse({}))

  const settings = shallowRef<PanelSettings>(settingsSchema.parse({}))

  const collector = shallowRef(defaultCollector())

  const status = shallowRef('Connecting')

  const error = shallowRef('')

  const notice = shallowRef('')

  const origin = shallowRef('')

  const allowed = shallowRef(false)

  const supported = shallowRef(false)

  const sites = shallowRef<string[]>([])

  const usage = shallowRef(0)

  const quota = shallowRef(0)

  const loading = shallowRef(false)

  const exportPreview = shallowRef<ExportDocument | false>(false)

  let revision = 0

  let selectionRevision = 0

  let refreshing = false

  let dirty = false

  let initialized = false

  let debounce: ReturnType<typeof setTimeout> | false = false

  const connection = createPanelConnection(scheduleRefresh, value => status.value = value)

  const session = computed(() => sessions.value.find(item => item.key === selectedSession.value) ?? false)

  const theme = computed(() => settings.value.theme === 'system' ? connection.theme() : settings.value.theme)

  watch(theme, value => document.documentElement.classList.toggle('dark', value === 'dark'), { immediate: true })

  async function attempt(action: () => Promise<void>): Promise<void> {
    error.value = ''

    try {
      await action()
    }
    catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Operation failed'
    }
  }

  async function query(): Promise<void> {
    const token = ++revision

    if (!selectedSession.value) {
      rows.value = []
      traces.value = []
      nextCursor.value = -1
      loading.value = false
      total.value = 0

      return
    }

    loading.value = true

    try {
      const result = querySchema.parse(await connection.request({ command: 'query', sessionKey: selectedSession.value, filter: filter.value, cursor: cursor.value }))

      if (token !== revision)
        return

      rows.value = result.page.rows

      total.value = result.page.total

      nextCursor.value = result.page.nextCursor

      traces.value = result.traces
    }
    finally {
      if (token === revision)
        loading.value = false
    }
  }

  async function refresh(): Promise<void> {
    if (refreshing) {
      dirty = true

      return
    }

    refreshing = true

    await attempt(async () => {
      const data = snapshotSchema.parse(await connection.request({ command: 'snapshot' }))

      sessions.value = data.sessions

      collector.value = data.collector

      settings.value = data.settings

      origin.value = data.origin

      allowed.value = data.allowed

      supported.value = data.supported

      sites.value = data.sites

      usage.value = data.usage

      quota.value = data.quota

      if (!initialized) {
        filter.value = data.settings.filter

        initialized = true
      }

      if (!sessions.value.some(item => item.key === selectedSession.value)) {
        selectedSession.value = sessions.value[0]?.key ?? ''

        cursor.value = 0

        selectionRevision++
        selected.value = false
      }

      await query()
      if (selected.value)
        await selectEvent(selected.value.event.eventId)
    })

    refreshing = false

    if (dirty) {
      dirty = false

      scheduleRefresh()
    }
  }

  function scheduleRefresh(): void {
    if (document.hidden) {
      dirty = true

      return
    }

    if (debounce !== false)
      return

    debounce = setTimeout(() => {
      debounce = false

      void refresh()
    }, 120)
  }

  function visibility(): void {
    if (!document.hidden)
      scheduleRefresh()
  }

  function selectSession(key: string): void {
    selectionRevision++
    selectedSession.value = key

    cursor.value = 0

    selected.value = false

    void attempt(query)
  }

  function setFilter(value: EventFilter): void {
    filter.value = value

    cursor.value = 0

    void attempt(query)

    void saveSettings({ ...settings.value, filter: value })
  }

  async function selectEvent(eventId: string): Promise<void> {
    const token = ++selectionRevision

    await attempt(async () => {
      const data = detailSchema.parse(await connection.request({ command: 'detail', sessionKey: selectedSession.value, eventId }))

      if (token === selectionRevision) {
        selected.value = data.stored

        related.value = data.related
        message.value = data.message
        presentation.value = data.presentation
      }
    })
  }

  async function navigate(eventId: string): Promise<void> {
    await attempt(async () => {
      const key = selectedSession.value
      const location = z.object({ cursor: z.number() }).parse(await connection.request({ command: 'locate', sessionKey: key, eventId, filter: filter.value }))
      if (key !== selectedSession.value)
        return
      if (location.cursor >= 0) {
        cursor.value = location.cursor
        await query()
        notice.value = ''
      }
      else {
        notice.value = 'Related event is outside the current filters. Details are shown; filters are preserved.'
      }
      await selectEvent(eventId)
    })
  }

  async function saveSettings(value: PanelSettings): Promise<void> {
    await attempt(async () => {
      await connection.request({ command: 'settings', settings: value })

      settings.value = value
    })
  }

  async function prepareExport(): Promise<void> {
    await attempt(async () => {
      exportPreview.value = exportDocumentSchema.parse(await connection.request({ command: 'export', sessionKey: selectedSession.value, traceId: filter.value.traceId }))
    })
  }

  function download(): void {
    const document = exportPreview.value

    if (!document)
      return

    const url = URL.createObjectURL(new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' }))

    const anchor = window.document.createElement('a')

    anchor.href = url

    anchor.download = `trace-${document.session.sessionId}.json`

    anchor.click()

    setTimeout(() => URL.revokeObjectURL(url), 1000)

    exportPreview.value = false

    notice.value = 'Export downloaded'
  }

  async function importFile(file: File): Promise<void> {
    await attempt(async () => {
      if (file.size > 50 * 1024 * 1024)
        throw new Error('Import limit is 50 MiB')

      loading.value = true

      try {
        const result = z.object({ sessionKey: z.string() }).parse(await connection.request({ command: 'import', text: await file.text() }))

        selectedSession.value = result.sessionKey

        cursor.value = 0

        await refresh()

        notice.value = 'Session imported'
      }
      finally {
        loading.value = false
      }
    })
  }

  async function removeSession(): Promise<void> {
    if (!selectedSession.value)
      return

    await attempt(async () => {
      await connection.request({ command: 'delete', sessionKey: selectedSession.value })

      selected.value = false

      await refresh()
    })
  }

  async function clearAll(): Promise<void> {
    await attempt(async () => {
      await connection.request({ command: 'clear-all' })

      await refresh()
    })
  }

  onMounted(() => {
    connection.connect()

    document.addEventListener('visibilitychange', visibility)
  })

  onUnmounted(() => {
    connection.dispose()

    if (debounce !== false)
      clearTimeout(debounce)

    document.removeEventListener('visibilitychange', visibility)
  })

  return { sessions, selectedSession, session, rows, traces, selected, related, message, presentation, navigate, total, cursor, nextCursor, filter, settings, collector, status, error, notice, origin, allowed, supported, sites, usage, quota, loading, exportPreview, refresh, selectSession, setFilter, selectEvent, saveSettings, prepareExport, download, importFile, removeSession, clearAll, closeDetail: () => {
    selectionRevision++

    selected.value = false
  }, cancelExport: () => exportPreview.value = false, page: (value: number) => {
    cursor.value = Math.max(0, value)

    void attempt(query)
  }, grant: () => attempt(() => connection.grant(origin.value)), revoke: (site: string) => attempt(() => connection.revoke(site)) }
}
