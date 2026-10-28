export const AGENT_WORK_STATUS = {
  CANCELLED: 'cancelled',
  FAILED: 'failed',
  RUNNING: 'running',
  SUCCESS: 'success',
  WAITING: 'waiting',
  INCOMPLETE: 'incomplete',
  INTERRUPTED: 'interrupted',
  UNKNOWN: 'unknown',
} as const

export type AgentWorkStatus = typeof AGENT_WORK_STATUS[keyof typeof AGENT_WORK_STATUS]

export interface AgentWorkOverviewItem {
  id: string
  name: string
  group: string
  startTime: number
  duration?: number
  durationLabel?: string
  status: AgentWorkStatus
}

export type AgentWorkOverviewTheme = 'auto' | 'dark' | 'light'

export interface AgentWorkOverviewRange {
  startTime: number
  endTime: number
}
