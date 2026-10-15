import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import AgentWorkOverview from '../src/AgentWorkOverview.vue'
import { AGENT_WORK_STATUS } from '../src/model'

const items = [
  { id: 'agent', name: 'Agent reasoning', group: 'Agent', startTime: 0, duration: 100, status: AGENT_WORK_STATUS.RUNNING },
  { id: 'tool', name: 'Tool call', group: 'Tool', startTime: 100, duration: 50, status: AGENT_WORK_STATUS.SUCCESS },
]

describe('agent work overview', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(640)
    vi.stubGlobal('ResizeObserver', class {
      disconnect(): void {}
      observe(): void {}
    })
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
  })

  it('renders groups and an empty state', () => {
    const wrapper = mount(AgentWorkOverview, { props: { items } })
    expect(wrapper.text()).toContain('Agent')
    expect(wrapper.text()).toContain('Tool')

    const empty = mount(AgentWorkOverview, { props: { emptyText: 'Nothing running', items: [] } })
    expect(empty.text()).toContain('Nothing running')
  })

  it('emits the focused item from the keyboard', async () => {
    const wrapper = mount(AgentWorkOverview, { props: { items } })
    await wrapper.trigger('keydown', { key: 'ArrowRight' })
    await wrapper.trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('select')).toEqual([[items[1]]])
  })

  it('reflects the controlled selection in its accessible options', () => {
    const wrapper = mount(AgentWorkOverview, { props: { items, selectedId: 'tool' } })
    const selected = wrapper.find('[role="option"][aria-selected="true"]')

    expect(selected.text()).toContain('Tool call')
  })

  it('keeps the canvas bitmap limited to the viewport at maximum zoom', async () => {
    const wrapper = mount(AgentWorkOverview, { props: { items } })
    await nextTick()

    for (let index = 0; index < 30; index++)
      await wrapper.trigger('wheel', { clientX: 320, deltaY: -1 })

    expect(wrapper.find('.agent-work-overview__canvas-track').attributes('style')).toContain('width: 64000px')
    expect(wrapper.find('canvas').attributes('style')).toContain('width: 640px')
    expect(wrapper.find('canvas').attributes('width')).toBe('640')
  })

  it('uses a minimum content width without enlarging the canvas bitmap', async () => {
    const wrapper = mount(AgentWorkOverview, { props: { items, minimumWidth: 4800 } })
    await nextTick()

    expect(wrapper.find('.agent-work-overview__canvas-track').attributes('style')).toContain('width: 4800px')
    expect(wrapper.find('canvas').attributes('style')).toContain('width: 640px')
    expect(wrapper.find('canvas').attributes('width')).toBe('640')
  })
})
