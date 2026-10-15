import type { TraceEventEnvelope } from '@trace-script/metadata'
import type { AgentWorkOverviewItem } from '@trace-script/vue-components'
import { eventDuration, eventName, eventStatus, eventTimestamp } from '@/utils/ui-model'

export function toOverviewItem(event: TraceEventEnvelope): AgentWorkOverviewItem {
  return {
    id: event.eventId,
    name: eventName(event),
    group: event.type,
    startTime: eventTimestamp(event),
    duration: eventDuration(event),
    status: eventStatus(event),
  }
}

export function toOverviewItems(events: readonly TraceEventEnvelope[]): AgentWorkOverviewItem[] {
  return events.map(toOverviewItem)
}
