import type { TraceEventEnvelope } from '@trace-script/metadata'
import type { WorkerToPanelMessage } from '@/messages'
import { aggregateEvents } from '@trace-script/core'
import { AgentWorkOverview } from '@trace-script/vue-components'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, nextTick } from 'vue'
import App from '@/app.vue'
import PayloadTab from '@/components/details/PayloadTab.vue'
import { useTracePanel } from '@/hooks/use-trace-panel'
import { EXTENSION_MESSAGE_TYPE } from '@/messages'
import { previewEvents } from '@/preview'
import { toOverviewItems } from '@/utils/overview-model'
import EventDetails from '@/views/EventDetails.vue'

vi.mock('@iconify/vue', () => ({ Icon: { template: '<span />' } }))

const event = {
  eventId: 'event-1',
  traceId: 'trace-1',
  sequence: 1,
  timestamp: '2026-01-01T00:00:00.000Z',
  type: 'trace.start',
} satisfies TraceEventEnvelope

describe('trace panel state', () => {
  it('keeps a selected legacy response when pairing changes its ID and another call precedes it', async () => {
    const wrapper = mount(defineComponent({ setup: useTracePanel, template: '<div />' }))
    const base = { traceId: 'legacy-selection', timestamp: '2026-01-01T00:00:00.000Z' }
    const events: TraceEventEnvelope[] = [
      { ...base, eventId: 'other-request', sequence: 1, type: 'model.request', requestId: 'other', payload: { input: 'other' } },
      { ...base, eventId: 'other-response', sequence: 2, type: 'model.response', requestId: 'other', payload: { output_text: 'other result' } },
      {
        ...base,
        eventId: 'legacy-response',
        timestamp: '2026-01-01T00:00:04.000Z',
        sequence: 4,
        type: 'model.response',
        payload: { output_text: 'selected result' },
      },
    ]
    wrapper.vm.handleMessage({ type: EXTENSION_MESSAGE_TYPE.TRACE_QUERY_RESULT, events })
    const legacy = wrapper.vm.calls.find(call => call.events.some(event => event.eventId === 'legacy-response'))!
    wrapper.vm.selectEvent(legacy.id)
    wrapper.vm.handleMessage({ type: EXTENSION_MESSAGE_TYPE.TRACE_EVENTS_APPEND, event: {
      ...base,
      eventId: 'legacy-request',
      timestamp: '2026-01-01T00:00:03.000Z',
      sequence: 3,
      type: 'model.request',
      payload: { input: 'legacy question' },
    } })
    await nextTick()
    const selected = wrapper.vm.selectedRecord
    expect(selected && selected.kind === 'model' && selected.input).toContain('legacy question')
    expect(selected && selected.id).not.toBe(legacy.id)
    wrapper.unmount()
  })

  it('shows exactly six call rows for two complete three-call runs without summary rows or regions', async () => {
    const wrapper = mount(App)
    await nextTick()
    expect(wrapper.findAll('tbody tr')).toHaveLength(3)
    expect(wrapper.findAll('thead th').map(cell => cell.text())).toEqual(['TraceID', 'Name', 'Agent', 'Duration', 'Type', 'Status', 'Model', 'Tokens'])
    await wrapper.findAll('button').find(button => button.text() === 'Add sample Trace')!.trigger('click')
    expect(wrapper.findAll('tbody tr')).toHaveLength(6)
    expect(wrapper.findAll('.event-row')).toHaveLength(6)
    expect(wrapper.find('[aria-label="Trace summaries"]').exists()).toBeFalsy()
    expect(wrapper.find('.trace-summary').exists()).toBeFalsy()
    expect(wrapper.find('footer').text()).toContain('2 traces · 6 calls')
    await wrapper.find('.trace-link').trigger('click')
    expect(wrapper.find('.details-content').text()).toContain('Trace lifecycle')
    wrapper.unmount()
  })

  it('shares flat filtered calls between the list and the existing timeline', async () => {
    const wrapper = mount(App)
    await nextTick()
    expect(wrapper.findAll('.event-row')).toHaveLength(3)
    expect(wrapper.find('[aria-label="Trace summaries"]').exists()).toBeFalsy()
    expect(wrapper.findAll('.agent-work-overview__label-row').map(row => row.text())).toEqual(['model2', 'tool1'])
    const overview = wrapper.findComponent(AgentWorkOverview)
    const items = overview.props('items')
    expect(items.map(item => item.duration)).toEqual([900, 500, 400])
    const tool = items[1]!
    overview.vm.$emit('select', tool)
    await nextTick()
    expect(wrapper.find('.event-row[aria-selected="true"]').text()).toContain('get_weather')
    expect(wrapper.find('.details-content').text()).toContain('Beijing')
    await wrapper.find('select[aria-label="Type"]').setValue('tool')
    expect(wrapper.findAll('.event-row')).toHaveLength(1)
    expect(wrapper.findAll('.agent-work-overview__label-row').map(row => row.text())).toEqual(['tool1'])
    expect(wrapper.findAll('.trace-link')).toHaveLength(1)
    expect(wrapper.find('footer').text()).toContain('Matched model tokens — In: —')
    await wrapper.find('input[aria-label="Search name or ID"]').setValue('no matching call')
    expect(wrapper.findAll('.event-row')).toHaveLength(0)
    expect(overview.props('items')).toHaveLength(0)
    wrapper.unmount()
  })

  it('orders interleaved Traces by call time while sharing two timeline groups', () => {
    const wrapper = mount(defineComponent({ setup: useTracePanel, template: '<div />' }))
    const events = ['z-early', 'a-later'].flatMap((traceId, index) => previewEvents.map(event => ({
      ...event,
      traceId,
      eventId: `${traceId}-${event.eventId}`,
      timestamp: new Date(Date.parse(event.timestamp) + index * 500).toISOString(),
    })))
    wrapper.vm.handleMessage({ type: EXTENSION_MESSAGE_TYPE.TRACE_QUERY_RESULT, events: events.reverse() })
    expect(wrapper.vm.visibleCalls.map(call => `${call.traceId}:${call.callId}`)).toEqual([
      'z-early:request-1',
      'a-later:request-1',
      'z-early:call-weather',
      'a-later:call-weather',
      'z-early:request-2',
      'a-later:request-2',
    ])
    const overview = mount(AgentWorkOverview, { props: { items: toOverviewItems(wrapper.vm.visibleCalls) } })
    expect(overview.findAll('.agent-work-overview__label-row').map(row => row.text())).toEqual(['model4', 'tool2'])
    overview.unmount()
    wrapper.unmount()
  })

  it.each([true, false])('keeps Trace errors visible with or without a model call: %s', async (withCall) => {
    const listeners: ((message: WorkerToPanelMessage) => void)[] = []
    const port = { onMessage: { addListener: (listener: (message: WorkerToPanelMessage) => void) => listeners.push(listener), removeListener: vi.fn() }, postMessage: vi.fn(), disconnect: vi.fn() }
    vi.stubGlobal('chrome', { devtools: { inspectedWindow: { tabId: 1 } }, runtime: { connect: () => port } })
    const wrapper = mount(App)
    try {
      const events: TraceEventEnvelope[] = [
        event,
        ...(withCall ? [{ ...event, eventId: 'request', sequence: 2, type: 'model.request' as const, requestId: 'r', payload: { input: 'question' } }] : []),
        { ...event, eventId: 'error', sequence: 3, type: 'trace.error', payload: { message: 'unlocated failure' } },
      ]
      listeners[0]!({ type: EXTENSION_MESSAGE_TYPE.TRACE_QUERY_RESULT, events })
      await nextTick()
      await wrapper.findAll('button').find(button => button.text() === 'Only errors')!.trigger('click')
      expect(wrapper.findAll('.event-row')).toHaveLength(withCall ? 1 : 0)
      expect(wrapper.find('[aria-label="Trace calls"]').text()).toContain('unlocated failure')
      expect(wrapper.find('footer').text()).toContain('1 failed or conflicting traces')
      await wrapper.find(withCall ? '.trace-link' : '.trace-issue-link').trigger('click')
      expect(wrapper.find('.details-content').text()).toContain('unlocated failure')
    }
    finally {
      wrapper.unmount()
      vi.unstubAllGlobals()
    }
  })

  it.each([false, true])('keeps call-less failures and conflicts inspectable alongside call rows, only errors: %s', async (onlyErrors) => {
    const listeners: ((message: WorkerToPanelMessage) => void)[] = []
    const port = { onMessage: { addListener: (listener: (message: WorkerToPanelMessage) => void) => listeners.push(listener), removeListener: vi.fn() }, postMessage: vi.fn(), disconnect: vi.fn() }
    vi.stubGlobal('chrome', { devtools: { inspectedWindow: { tabId: 1 } }, runtime: { connect: () => port } })
    const wrapper = mount(App)
    try {
      const events: TraceEventEnvelope[] = [
        event,
        { ...event, eventId: 'error', sequence: 2, type: 'trace.error', payload: { message: 'failure before calls' } },
        { ...event, eventId: 'call-request', traceId: 'with-call', type: 'model.request', requestId: 'r', payload: { input: 'question' } },
        { ...event, eventId: 'call-error', traceId: 'with-call', sequence: 2, type: 'trace.error', payload: { message: 'failure with a call' } },
        { ...event, eventId: 'end', traceId: 'conflicting', type: 'trace.end' },
        { ...event, eventId: 'cancel', traceId: 'conflicting', sequence: 2, type: 'trace.end', status: 'cancelled' },
      ]
      listeners[0]!({ type: EXTENSION_MESSAGE_TYPE.TRACE_QUERY_RESULT, events })
      await nextTick()
      if (onlyErrors)
        await wrapper.findAll('button').find(button => button.text() === 'Only errors')!.trigger('click')

      expect(wrapper.findAll('.event-row')).toHaveLength(1)
      expect(wrapper.find('[aria-label="Trace calls"]').text()).not.toContain('No calls match these filters')
      const links = wrapper.findAll('.trace-issue-link')
      expect(links).toHaveLength(2)
      const failed = links.find(link => link.text().includes('failure before calls'))!
      await failed.trigger('click')
      expect(wrapper.find('.details-content').text()).toContain('failure before calls')
      const conflicting = links.find(link => link.text().includes('Conflicting Trace terminal events'))!
      await conflicting.trigger('click')
      expect(wrapper.find('.details-content').text()).toContain('Conflicting Trace terminal events')
    }
    finally {
      wrapper.unmount()
      vi.unstubAllGlobals()
    }
  })

  it('loads a query snapshot even when recording is paused', () => {
    const PanelState = defineComponent({
      setup() {
        return useTracePanel()
      },
      template: '<div />',
    })
    const wrapper = mount(PanelState)

    wrapper.vm.toggleRecording()
    wrapper.vm.handleMessage({ type: EXTENSION_MESSAGE_TYPE.TRACE_QUERY_RESULT, events: [event] })

    expect(wrapper.vm.events).toEqual([event])
    wrapper.unmount()
  })

  it('keeps explicit output-first selection and legacy source selection when input arrives', async () => {
    for (const explicit of [true, false]) {
      const wrapper = mount(defineComponent({ setup: useTracePanel, template: '<div />' }))
      const response: TraceEventEnvelope = {
        eventId: 'response',
        traceId: 't',
        sequence: 2,
        timestamp: '2026-01-01T00:00:01.000Z',
        type: 'model.response',
        ...(explicit ? { requestId: 'r' } : {}),
        payload: { output_text: 'Result' },
      }
      const request: TraceEventEnvelope = {
        eventId: 'request',
        traceId: 't',
        sequence: 1,
        timestamp: '2026-01-01T00:00:00.000Z',
        type: 'model.request',
        ...(explicit ? { requestId: 'r' } : {}),
        payload: { input: 'Question' },
      }
      wrapper.vm.handleMessage({ type: EXTENSION_MESSAGE_TYPE.TRACE_QUERY_RESULT, events: [response] })
      wrapper.vm.selectEvent(wrapper.vm.calls[0]!.id)
      const before = wrapper.vm.activeId
      wrapper.vm.handleMessage({ type: EXTENSION_MESSAGE_TYPE.TRACE_EVENTS_APPEND, event: request })
      await nextTick()
      expect(wrapper.vm.calls).toHaveLength(1)
      expect(wrapper.vm.selectedRecord && wrapper.vm.selectedRecord.kind).toBe('model')
      expect(wrapper.vm.activeId).toBe(wrapper.vm.calls[0]!.id)
      expect(wrapper.vm.selectedRecord && 'input' in wrapper.vm.selectedRecord ? wrapper.vm.selectedRecord.input : '').toContain('Question')
      if (explicit)
        expect(wrapper.vm.activeId).toBe(before)
      wrapper.unmount()
    }
  })

  it('retains conflicting arrivals for aggregation rather than discarding them in transport', () => {
    const wrapper = mount(defineComponent({ setup: useTracePanel, template: '<div />' }))
    const response = previewEvents.find(event => event.type === 'model.response')!
    wrapper.vm.handleMessage({ type: EXTENSION_MESSAGE_TYPE.TRACE_QUERY_RESULT, events: [response] })
    wrapper.vm.handleMessage({ type: EXTENSION_MESSAGE_TYPE.TRACE_EVENTS_APPEND, event: { ...response, timestamp: '2024-01-01T12:00:09.000Z' } })
    expect(wrapper.vm.events).toHaveLength(2)
    expect(wrapper.vm.calls).toHaveLength(2)
    expect(wrapper.vm.calls[0]!.associationConflict).toBeTruthy()
    expect(wrapper.vm.totalUsage.total.value).toBeUndefined()
    wrapper.unmount()
  })

  it('keeps the active detail tab and scroll container when output arrives', async () => {
    const state = mount(defineComponent({ setup: useTracePanel, template: '<div />' }))
    const request = previewEvents[1]!
    const response = previewEvents[2]!
    state.vm.handleMessage({ type: EXTENSION_MESSAGE_TYPE.TRACE_QUERY_RESULT, events: [request] })
    const details = mount(defineComponent({
      components: { EventDetails },
      setup: () => ({ record: computed(() => state.vm.calls[0]), traces: computed(() => state.vm.traces) }),
      template: '<EventDetails :record="record" :traces="traces" />',
    }))
    const usageTab = details.findAll('[role="tab"]').find(tab => tab.text() === 'Usage')!
    await usageTab.trigger('click')
    const scroll = details.find('.details-content').element
    scroll.scrollTop = 80
    state.vm.handleMessage({ type: EXTENSION_MESSAGE_TYPE.TRACE_EVENTS_APPEND, event: response })
    await nextTick()
    expect(details.find('[role="tab"][aria-selected="true"]').text()).toBe('Usage')
    expect(details.find('.details-content').element).toBe(scroll)
    expect(scroll.scrollTop).toBe(80)
    expect(details.text()).toContain('36')
    details.unmount()
    state.unmount()
  })

  it('navigates only flat visible calls and keeps Trace and related-call jumps available', async () => {
    const wrapper = mount(defineComponent({ setup: useTracePanel, template: '<div />' }))
    const trace = wrapper.vm.traces[0]!
    wrapper.vm.selectEvent(trace.id)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    await nextTick()
    expect(wrapper.vm.activeId).toBe(trace.calls[0]!.id)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    await nextTick()
    expect(wrapper.vm.activeId).toBe(trace.calls[1]!.id)
    wrapper.vm.filter.type = 'model'
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    await nextTick()
    expect(wrapper.vm.activeId).toBe(trace.calls[0]!.id)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    await nextTick()
    expect(wrapper.vm.activeId).toBe(trace.calls[2]!.id)
    wrapper.vm.selectEvent(trace.calls[1]!.id)
    expect(wrapper.vm.activeId).toBe(trace.calls[1]!.id)
    wrapper.vm.selectEvent(trace.id)
    expect(wrapper.vm.selectedRecord && wrapper.vm.selectedRecord.kind).toBe('trace')
    wrapper.unmount()
  })

  it('renders payload markup as text without creating executable elements', () => {
    const malicious: TraceEventEnvelope = {
      eventId: 'malicious',
      traceId: 't',
      sequence: 1,
      timestamp: '2026-01-01T00:00:00.000Z',
      type: 'model.response',
      payload: { output_text: '<img src=x onerror="alert(1)"><script>alert(1)</script>' },
    }
    const wrapper = mount(PayloadTab, { props: { record: aggregateEvents([malicious])[0]!.calls[0]! } })
    expect(wrapper.text()).toContain('<img')
    expect(wrapper.find('img').exists()).toBeFalsy()
    expect(wrapper.find('script').exists()).toBeFalsy()
    wrapper.unmount()
  })
})
