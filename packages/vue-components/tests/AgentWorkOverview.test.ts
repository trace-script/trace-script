import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import AgentWorkOverview from '@/AgentWorkOverview.vue'
import { AGENT_WORK_STATUS } from '@/model'

const items = [
  { id: 'agent', name: 'Agent reasoning', group: 'Agent', startTime: 0, duration: 100, status: AGENT_WORK_STATUS.RUNNING },
  { id: 'tool', name: 'Tool call', group: 'Tool', startTime: 100, duration: 50, status: AGENT_WORK_STATUS.SUCCESS },
]

const frames = new Map<number, FrameRequestCallback>()
const observers: TestResizeObserver[] = []
let clock = 0

class TestResizeObserver implements ResizeObserver {
  target: Element = document.createElement('div')

  readonly observe = vi.fn((target: Element) => {
    this.target = target
    this.resize()
  })

  readonly unobserve = vi.fn()

  readonly disconnect = vi.fn()

  constructor(readonly callback: ResizeObserverCallback) {
    observers.push(this)
  }

  resize(): void {
    const element = this.target as HTMLElement
    this.callback([{ contentRect: { width: element.clientWidth, height: element.clientHeight } } as ResizeObserverEntry], this)
  }
}

function advanceFrame(timestamp: number): void {
  clock = timestamp
  const callbacks = [...frames.values()]
  frames.clear()
  for (const callback of callbacks)
    callback(timestamp)
}

describe('agent work overview', () => {
  enableAutoUnmount(afterEach)

  it('distinguishes unknown duration from an observed zero interval', async () => {
    const wrapper = mount(AgentWorkOverview, { props: { items: [{ id: 'unknown', name: 'Unfinished', group: 'model', startTime: 0, status: AGENT_WORK_STATUS.UNKNOWN }] } })
    expect(wrapper.find('[role="option"]').text()).toContain('Duration unknown')
    expect(wrapper.find('[role="option"]').text()).not.toContain('0 ms')
    await wrapper.setProps({ items: [{ id: 'zero', name: 'Completed', group: 'model', startTime: 0, duration: 0, status: AGENT_WORK_STATUS.SUCCESS }] })
    expect(wrapper.find('[role="option"]').text()).toContain('0 ms')
    wrapper.unmount()
  })

  beforeEach(() => {
    vi.restoreAllMocks()
    clock = 0
    frames.clear()
    observers.length = 0
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(640)
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(640)
    vi.stubGlobal('ResizeObserver', TestResizeObserver)
    let frameId = 0
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(++frameId, callback)
      return frameId
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      frames.delete(id)
    })
    vi.spyOn(Date, 'now').mockImplementation(() => clock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
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
    await nextTick()
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

  it('tracks viewport replacement and resize after initially empty items', async () => {
    const wrapper = mount(AgentWorkOverview, { props: { items: [] } })
    await wrapper.setProps({ items })
    const viewport = wrapper.find('.agent-work-overview__events').element
    const observer = observers.at(-1)!
    expect(observer.observe).toHaveBeenCalledWith(viewport, { box: 'border-box' })
    expect(wrapper.find('canvas').attributes('width')).toBe('640')

    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(480)
    observer.resize()
    await nextTick()
    expect(wrapper.find('canvas').attributes('width')).toBe('480')

    await wrapper.setProps({ items: [] })
    expect(observer.disconnect).toHaveBeenCalledOnce()
    await wrapper.setProps({ items })
    const replacement = observers.at(-1)!
    expect(replacement.observe).toHaveBeenCalledWith(wrapper.find('.agent-work-overview__events').element, { box: 'border-box' })
    wrapper.unmount()
    expect(replacement.disconnect).toHaveBeenCalledOnce()
    expect(frames.size).toBe(0)
  })

  it('coalesces redraws into one frame and stops scheduling while idle', async () => {
    const wrapper = mount(AgentWorkOverview, { props: { items } })
    await nextTick()
    await wrapper.setProps({ selectedId: 'tool' })
    await wrapper.setProps({ selectedId: 'agent' })
    expect(frames.size).toBe(1)
    advanceFrame(16)
    expect(frames.size).toBe(0)
    await wrapper.setProps({ selectedId: 'tool' })
    expect(frames.size).toBe(1)
    wrapper.unmount()
    expect(frames.size).toBe(0)
  })

  it('animates range zoom for 240 ms and keeps scrolling aligned with the ruler', async () => {
    const wrapper = mount(AgentWorkOverview, { props: { items } })
    await nextTick()
    const canvas = wrapper.find('canvas')
    canvas.element.setPointerCapture = vi.fn()
    canvas.element.hasPointerCapture = vi.fn().mockReturnValue(true)
    canvas.element.releasePointerCapture = vi.fn()
    await canvas.trigger('pointerdown', { button: 0, pointerId: 1, clientX: 100 })
    await canvas.trigger('pointermove', { pointerId: 1, clientX: 300 })
    await canvas.trigger('pointerup', { pointerId: 1, clientX: 300 })
    expect(wrapper.emitted('selectRange')).toHaveLength(1)

    advanceFrame(120)
    await nextTick()
    expect(wrapper.find('.agent-work-overview__canvas-track').attributes('style')).toContain('width: 1872px')
    expect(wrapper.find('.agent-work-overview__events').element.scrollLeft).toBe(280)
    advanceFrame(240)
    await nextTick()
    expect(wrapper.find('.agent-work-overview__canvas-track').attributes('style')).toContain('width: 2048px')
    expect(wrapper.find('.agent-work-overview__events').element.scrollLeft).toBe(320)
    expect(wrapper.find('.agent-work-overview__ruler').attributes('style')).toContain('translate3d(-320px, 0, 0)')
    advanceFrame(256)
    expect(frames.size).toBe(0)
  })
})
