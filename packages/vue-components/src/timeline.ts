import type { AgentWorkOverviewItem } from './model'

export interface AgentWorkOverviewRow {
  item: AgentWorkOverviewItem
  start: number
  duration: number
  overlapCount: number
}

export interface AgentWorkOverviewGroup {
  name: string
  rows: AgentWorkOverviewRow[]
}

export interface AgentWorkOverviewTick {
  time: number
  position: number
}

export interface AgentWorkOverviewLayout {
  duration: number
  groups: AgentWorkOverviewGroup[]
  rows: AgentWorkOverviewRow[]
}

export function createAgentWorkOverviewLayout(items: readonly AgentWorkOverviewItem[]): AgentWorkOverviewLayout {
  const orderedItems = [...items].sort((left, right) => left.startTime - right.startTime || left.id.localeCompare(right.id))
  const firstStart = orderedItems.length > 0 ? Math.min(...orderedItems.map(item => item.startTime)) : 0
  const rows = orderedItems.map(item => ({
    item,
    start: Math.max(0, item.startTime - firstStart),
    duration: Math.max(0, item.duration),
    overlapCount: 0,
  }))

  let furthestEnd = 0
  let furthestRowIndex = -1
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex]
    if (!row)
      continue
    const rowEnd = row.start + row.duration
    if (row.start < furthestEnd) {
      row.overlapCount = 1
      const furthestRow = rows[furthestRowIndex]
      if (furthestRow)
        furthestRow.overlapCount = 1
    }
    if (rowEnd > furthestEnd) {
      furthestEnd = rowEnd
      furthestRowIndex = rowIndex
    }
  }

  const groupedRows = new Map<string, AgentWorkOverviewRow[]>()
  for (const row of rows) {
    const group = groupedRows.get(row.item.group)
    if (group)
      group.push(row)
    else
      groupedRows.set(row.item.group, [row])
  }

  const duration = Math.max(1, ...rows.map(row => row.start + row.duration))

  return {
    duration,
    groups: [...groupedRows].map(([name, groupRows]) => ({ name, rows: groupRows })),
    rows,
  }
}

// 把任意原始步长取整到最接近的「好看」1/2/5 × 10^n 序列（1、2、5、10、20、50、100…），
// 让时间轴刻度的间隔自动推导为整数，且刻度间距始终贴近目标最小间距。
export function niceTickStep(rawStep: number): number {
  const exponent = Math.floor(Math.log10(rawStep))
  const fraction = rawStep / 10 ** exponent
  const niceFraction = fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10
  return niceFraction * 10 ** exponent
}

export function createAgentWorkOverviewTicks(duration: number, stepMs: number): AgentWorkOverviewTick[] {
  const step = Math.max(1, stepMs)
  const count = Math.floor(duration / step)
  return Array.from({ length: count + 1 }, (_, index) => {
    const time = index * step
    return { time, position: duration > 0 ? time / duration * 100 : 0 }
  })
}

export function findAgentWorkOverviewItem(
  layout: AgentWorkOverviewLayout,
  x: number,
  y: number,
  width: number,
  rowHeight: number,
  minimumBarWidth: number,
): AgentWorkOverviewItem | false {
  const groupIndex = Math.floor(y / rowHeight)
  const group = layout.groups[groupIndex]
  if (!group)
    return false

  for (let index = group.rows.length - 1; index >= 0; index--) {
    const row = group.rows[index]
    if (!row)
      continue
    const start = Math.min(row.start / layout.duration * width, width - minimumBarWidth)
    const end = start + Math.max(row.duration / layout.duration * width, minimumBarWidth)
    if (x >= start && x <= end)
      return row.item
  }

  return false
}
