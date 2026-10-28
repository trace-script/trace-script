import type { CallRecord } from '@trace-script/core'
import type { AgentWorkOverviewItem } from '@trace-script/vue-components'
import { timingText } from '@/utils/ui-model'

export function toOverviewItem(call: CallRecord): AgentWorkOverviewItem {
  return {
    id: call.id,
    name: `${call.name} · ${call.traceId} · ${call.callId}`,
    group: call.kind,
    startTime: Date.parse(call.timing.start ?? call.timing.end ?? call.events[0]?.timestamp ?? '') || 0,
    duration: call.timing.duration,
    durationLabel: `${call.kind === 'tool' ? 'Return interval' : 'Duration'}: ${timingText(call.timing, call.status === 'running')}`,
    status: call.status,
  }
}

export function toOverviewItems(calls: readonly CallRecord[]): AgentWorkOverviewItem[] {
  return calls.map(toOverviewItem)
}
