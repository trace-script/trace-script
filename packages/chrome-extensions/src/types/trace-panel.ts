import type { CallStatus, TraceStatus } from '@trace-script/core'

export type EventTypeFilter = 'all' | 'model' | 'tool'
export type StatusFilter = 'all' | CallStatus | TraceStatus
export interface TracePanelFilter {
  query: string
  type: EventTypeFilter
  status: StatusFilter
  agent: string
  onlyErrors: boolean
}
export type DetailTab = 'Input / Output' | 'Overview' | 'Usage' | 'Timing' | 'Relations' | 'Raw Events'
