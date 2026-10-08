<script setup lang="ts">
import { createTraceClient, observeOpenAIResponse } from '@trace-script/sdk'
import { onUnmounted, shallowRef } from 'vue'

const message = shallowRef('Ready to publish a trace. Open DevTools → Agent Trace and allow this site.')
const running = shallowRef(false)
const client = createTraceClient({ onDiagnostic: value => message.value = value })
async function demo(): Promise<void> {
  const session = client.startSession('Research assistant')

  const trace = client.startTrace(session, 'Plan a weekend in Kyoto')

  trace.emit({ type: 'message.user', name: 'Plan a weekend in Kyoto', payload: { role: 'user', content: [{ type: 'input_text', text: 'Plan a weekend in Kyoto.' }] } })

  const observer = observeOpenAIResponse(trace, { model: 'example-model', input: 'Plan a weekend in Kyoto.', stream: true })

  observer.item({ type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'search_places', arguments: '{"city":"Kyoto"}' }, false)

  await new Promise(resolve => setTimeout(resolve, 180))

  observer.item({ type: 'function_call_output', call_id: 'call_1', output: '{"places":["Fushimi Inari","Arashiyama"]}' })

  const item = { type: 'message', id: 'msg_1', role: 'assistant', content: [{ type: 'output_text', text: 'Explore Fushimi Inari, then visit Arashiyama.' }] }

  observer.stream({ type: 'response.output_item.added', sequence_number: 1, item })

  let sequence = 2

  for (const delta of ['Explore ', 'Fushimi Inari, ', 'then visit ', 'Arashiyama.']) {
    observer.stream({ type: 'response.output_text.delta', item_id: 'msg_1', sequence_number: sequence++, delta })

    await new Promise(resolve => setTimeout(resolve, 60))
  }

  observer.response({ id: 'resp_1', status: 'completed', output: [item], usage: { input_tokens: 124, output_tokens: 28, total_tokens: 152 } })

  trace.emit({ type: 'tool.error', name: 'Weather service unavailable', status: 'error', error: { message: 'Example timeout; retry with cached forecast' }, payload: { apiKey: 'example-secret', content: '<img src=x onerror=alert(1)>' } })

  trace.end()

  client.endSession(session)

  message.value = 'Published research assistant Session, including a tool call, streamed reply and error.'
}
async function benchmark(count: number, delay = 50): Promise<void> {
  if (running.value)
    return

  running.value = true

  const session = client.startSession(`Benchmark ${count.toLocaleString()}`)

  const trace = client.startTrace(session, 'Benchmark')

  for (let i = 0; i < count && running.value; i++) {
    trace.emit({ type: i % 100 === 0 ? 'error' : 'log', name: `Event ${i}`, status: i % 100 === 0 ? 'error' : 'success', payload: { index: i } })

    if (i % 50 === 49) {
      client.flush()

      message.value = `Published ${i + 1} / ${count} events`

      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  trace.end()

  client.endSession(session)

  running.value = false

  message.value = `Benchmark finished. SDK stats: ${JSON.stringify(client.getStats())}`
}
onUnmounted(() => {
  running.value = false

  client.dispose()
})
</script>

<template>
  <main class="playground">
    <p class="label">
      TRACE SCRIPT / PLAYGROUND
    </p><h1>See your agent<br>from the inside.</h1><p class="intro">
      Publish realistic, local-only traces to your DevTools panel.<br>No API key or external model request is needed.
    </p>
    <section>
      <h2>Start with a complete story</h2><p>OpenAI Responses shaped inputs, a function call, streaming text, usage and an error.</p><button id="send-demo" @click="demo">
        Publish example Session →
      </button><button @click="client.isCollectorAvailable().then(available => message = available ? 'Collector is available' : 'Collector unavailable; authorize this site first')">
        Check connection
      </button>
    </section>
    <section>
      <h2>Measure the limits</h2><div class="buttons">
        <button v-for="count in [1000, 10000, 50000]" :key="count" :disabled="running" @click="benchmark(count)">
          {{ count.toLocaleString() }} events
        </button><button :disabled="running" @click="benchmark(15000, 1000)">
          50 events/s · 5 minutes
        </button><button v-if="running" @click="running = false">
          Stop
        </button>
      </div>
    </section>
    <p class="result" role="status">
      {{ message }}
    </p><footer>All events stay in this browser. Use the panel to filter, export and clear them.</footer>
  </main>
</template>
