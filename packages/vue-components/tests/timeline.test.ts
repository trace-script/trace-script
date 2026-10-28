import { describe, expect, it } from 'vitest'
import { AGENT_WORK_STATUS } from '@/model'
import { createAgentWorkOverviewLayout, createAgentWorkOverviewTicks, findAgentWorkOverviewItem, niceTickStep } from '@/timeline'

const items = [
  { id: 'model', name: 'Model request', group: 'Model', startTime: 120, duration: 80, status: AGENT_WORK_STATUS.SUCCESS },
  { id: 'agent', name: 'Agent reasoning', group: 'Agent', startTime: 100, duration: 100, status: AGENT_WORK_STATUS.RUNNING },
  { id: 'tool', name: 'Tool call', group: 'Tool', startTime: 220, duration: 0, status: AGENT_WORK_STATUS.CANCELLED },
]

describe('agent work overview timeline', () => {
  it('normalizes items into ordered groups and relative time', () => {
    const layout = createAgentWorkOverviewLayout(items)

    expect(layout.rows.map(row => row.item.id)).toEqual(['agent', 'model', 'tool'])
    expect(layout.rows.map(row => row.start)).toEqual([0, 20, 120])
    expect(layout.groups.map(group => group.name)).toEqual(['Agent', 'Model', 'Tool'])
    expect(layout.duration).toBe(120)
  })

  it('counts overlapping work and clamps negative durations', () => {
    const layout = createAgentWorkOverviewLayout([
      ...items,
      { id: 'invalid', name: 'Invalid', group: 'Agent', startTime: 90, duration: -10, status: AGENT_WORK_STATUS.FAILED },
    ])

    expect(layout.rows.find(row => row.item.id === 'agent')?.overlapCount).toBe(1)
    expect(layout.rows.find(row => row.item.id === 'invalid')?.duration).toBe(0)
  })

  it('marks both overlapping intervals but leaves touching intervals unmarked', () => {
    const layout = createAgentWorkOverviewLayout([
      { ...items[0]!, id: 'first', startTime: 0, duration: 100 },
      { ...items[0]!, id: 'overlapping', startTime: 50, duration: 50 },
      { ...items[0]!, id: 'touching', startTime: 100, duration: 20 },
    ])
    expect(layout.rows.map(row => [row.item.id, row.overlapCount])).toEqual([
      ['first', 1],
      ['overlapping', 1],
      ['touching', 0],
    ])
  })

  it('keeps empty layouts safe for rendering and hit testing', () => {
    const layout = createAgentWorkOverviewLayout([])
    expect(layout).toEqual({ duration: 1, groups: [], rows: [] })
    expect(findAgentWorkOverviewItem(layout, 0, 0, 600, 32, 3)).toBeFalsy()
  })

  it('finds visible bars including zero-duration work', () => {
    const layout = createAgentWorkOverviewLayout(items)

    expect(findAgentWorkOverviewItem(layout, 1, 1, 600, 32, 3)).toEqual(items[1])
    expect(findAgentWorkOverviewItem(layout, 598, 65, 600, 32, 3)).toEqual(items[2])
    expect(findAgentWorkOverviewItem(layout, 400, 65, 600, 32, 3)).toBeFalsy()
  })

  it('generates ticks at a fixed time step from zero to the total duration', () => {
    const ticks = createAgentWorkOverviewTicks(100, 5)

    expect(ticks.map(tick => tick.time)).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100])
    expect(ticks[0]?.position).toBe(0)
    expect(ticks.at(-1)?.position).toBe(100)
    expect(ticks[10]?.position).toBeCloseTo(50)
  })

  it('does not emit a partial tick beyond the total duration', () => {
    const ticks = createAgentWorkOverviewTicks(12, 5)

    expect(ticks.map(tick => tick.time)).toEqual([0, 5, 10])
    expect(ticks.at(-1)?.position).toBe(10 / 12 * 100)
  })

  it('derives nice tick steps from the 1-2-5 sequence', () => {
    expect(niceTickStep(1)).toBe(1)
    expect(niceTickStep(2)).toBe(2)
    expect(niceTickStep(3)).toBe(5)
    expect(niceTickStep(8)).toBe(10)
    expect(niceTickStep(250)).toBe(200)
    expect(niceTickStep(800)).toBe(1000)
  })

  it('lays out more than two thousand work items', () => {
    const stressItems = Array.from({ length: 2400 }, (_, index) => ({
      id: `work-${index}`,
      name: `Work ${index}`,
      group: `Worker ${index % 8}`,
      startTime: index * 17 % 120000,
      duration: 50 + index * 31 % 2500,
      status: AGENT_WORK_STATUS.SUCCESS,
    }))

    const layout = createAgentWorkOverviewLayout(stressItems)

    expect(layout.rows).toHaveLength(2400)
    expect(layout.groups).toHaveLength(8)
    expect(layout.duration).toBeGreaterThan(40000)
  })
})
