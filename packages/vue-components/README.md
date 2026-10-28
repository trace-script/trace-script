# `@trace-script/vue-components`

Independent Vue 3 components for visualizing agent activity.

## AgentWorkOverview

`AgentWorkOverview` renders grouped work items on a shared time scale. It uses Canvas for the event blocks and DOM elements for labels, ticks, tooltips, and accessibility metadata.

```vue
<script setup lang="ts">
import type { AgentWorkOverviewItem } from '@trace-script/vue-components'
import { AGENT_WORK_STATUS, AgentWorkOverview } from '@trace-script/vue-components'

const items: AgentWorkOverviewItem[] = [
  {
    id: 'reasoning',
    name: 'Agent reasoning',
    group: 'Agent',
    startTime: 0,
    duration: 480,
    status: AGENT_WORK_STATUS.SUCCESS,
  },
]
</script>

<template>
  <AgentWorkOverview :items="items" @select="console.log" />
</template>
```

The component emits the complete selected item through `select` and a zoomed interval through `selectRange`. `startTime` and `duration` use milliseconds; `startTime` may be relative or absolute as long as every item uses the same clock. Set `minimum-width` when the full timeline should remain horizontally scrollable before zooming.

Omit `duration` when the final interval is unknown; the item remains selectable as a minimum-width marker and is labelled “Duration unknown”, distinct from an observed zero interval. `durationLabel` can supply a more specific label such as a tool return interval or time anomaly. Waiting, incomplete, interrupted, and unknown states retain their status in accessible labels and tooltips.
