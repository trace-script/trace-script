import { eventFilterSchema } from '@trace-script/metadata'
// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TraceFilterBar from '../apps/panel/app/components/trace/TraceFilterBar.vue'
import TraceJsonViewer from '../apps/panel/app/components/trace/TraceJsonViewer.vue'
import TraceTable from '../apps/panel/app/components/trace/TraceTable.vue'

describe('workbench interactions', () => {
  it('emits composed filters and supports resetting', async () => {
    const wrapper = mount(TraceFilterBar, { props: { filter: eventFilterSchema.parse({ model: 'model' }), traces: [] } })

    await wrapper.get('input[aria-label="Search events"]').setValue('tool')

    expect(wrapper.emitted('change')?.[0]?.[0]).toMatchObject({ text: 'tool', model: 'model' })

    await wrapper.findAll('button').find(button => button.text() === 'Reset')?.trigger('click')

    expect(wrapper.emitted('change')?.at(-1)?.[0]).toMatchObject({ text: '', model: '' })
  })

  it('renders hostile JSON as text and delays collapsed details', () => {
    const wrapper = mount(TraceJsonViewer, { props: { value: { content: '<img src=x onerror=alert(1)>', nested: { apiKey: '[REDACTED]' } } } })

    expect(wrapper.find('img').exists()).toBeFalsy()

    expect(wrapper.text()).toContain('<img src=x onerror=alert(1)>')

    expect(wrapper.find('details').attributes('open')).toBeUndefined()
  })

  it('selects a row with Enter and reports pagination actions', async () => {
    const wrapper = mount(TraceTable, { props: { rows: [{ version: '1.0', eventId: '1', traceId: 't', sessionId: 's', type: 'log', name: 'Example', sequence: 1, timestamp: '2026-10-04T00:00:00.000Z' }], selectedId: '', columns: ['type'], filter: eventFilterSchema.parse({}), total: 300, cursor: 0, nextCursor: 200, loading: false } })

    await wrapper.get('tbody tr').trigger('keydown.enter')

    expect(wrapper.emitted('select')?.[0]).toEqual(['1'])

    await wrapper.findAll('button').find(button => button.text().includes('Next'))?.trigger('click')

    expect(wrapper.emitted('page')?.[0]).toEqual([200])
  })
})
