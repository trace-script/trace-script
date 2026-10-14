<script setup lang="ts">
import { createTraceSdk } from '@trace-script/sdk'
import { computed, shallowRef } from 'vue'

interface WeatherTool {
  type: 'function'
  name: 'get_weather'
  description: string
  parameters: {
    type: 'object'
    properties: { city: { type: 'string' } }
    required: ['city']
    additionalProperties: false
  }
  strict: true
}

interface UserInput { role: 'user', content: string }
interface FunctionCall { type: 'function_call', call_id: string, name: 'get_weather', arguments: string }
interface FunctionCallOutput { type: 'function_call_output', call_id: string, output: string }
interface MessageOutput { type: 'message', content: [{ type: 'output_text', text: string }] }
type ResponseItem = FunctionCall | MessageOutput
interface ModelRequest {
  model: 'gpt-4.1'
  input: (UserInput | FunctionCall | FunctionCallOutput | MessageOutput)[]
  tools: WeatherTool[]
}
interface ModelResponse {
  id: string
  output: ResponseItem[]
  output_text: string
  usage: { input_tokens: number, output_tokens: number, total_tokens: number }
}
interface WeatherData { city: string, condition: string, temperature: number }
interface TimelineItem {
  label: string
  detail: string
  type: 'input' | 'model' | 'tool' | 'output'
  state: 'idle' | 'done' | 'active'
}

const sdk = createTraceSdk()
const city = shallowRef('北京')
const sentCount = shallowRef(0)
const running = shallowRef(false)
const status = shallowRef('还没有运行 Trace')
const answer = shallowRef('')
const activeTab = shallowRef<'overview' | 'payload'>('overview')
const timeline = shallowRef<TimelineItem[]>([
  { label: '用户输入', detail: '等待运行', type: 'input', state: 'idle' },
  { label: '模型响应', detail: 'Responses API', type: 'model', state: 'idle' },
  { label: '工具调用', detail: 'get_weather', type: 'tool', state: 'idle' },
  { label: '最终输出', detail: 'output_text', type: 'output', state: 'idle' },
])
const lastRequest = shallowRef<ModelRequest | false>(false)
const lastResponse = shallowRef<ModelResponse | false>(false)

const buttonLabel = computed(() => running.value ? '运行中' : '运行 Agent')
const runCountLabel = computed(() => sentCount.value === 0 ? '尚未运行' : `${sentCount.value} 次运行`)
const formattedRequest = computed(() => {
  if (!lastRequest.value)
    return '{\n  "input": []\n}'

  return JSON.stringify(lastRequest.value, null, 2)
})
const formattedResponse = computed(() => {
  if (!lastResponse.value)
    return '{\n  "output": []\n}'

  return JSON.stringify(lastResponse.value, null, 2)
})
const totalTokens = computed(() => lastResponse.value ? lastResponse.value.usage.total_tokens.toString() : '—')
const completedSteps = computed(() => {
  const doneItems = timeline.value.filter(item => item.state === 'done')
  return doneItems.length
})
const statusIndicatorClass = computed(() => {
  if (running.value)
    return 'bg-indigo-500'
  if (answer.value)
    return 'bg-emerald-500'
  return 'bg-slate-300'
})

const weatherTool: WeatherTool = {
  type: 'function',
  name: 'get_weather',
  description: 'Get the current weather for a city',
  parameters: {
    type: 'object',
    properties: { city: { type: 'string' } },
    required: ['city'],
    additionalProperties: false,
  },
  strict: true,
}

function wait(milliseconds: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, milliseconds))
}

function setTimeline(index: number, state: TimelineItem['state'], detail: string): void {
  timeline.value = timeline.value.map((item, itemIndex) => {
    const isCurrentStep = itemIndex === index
    let nextState: TimelineItem['state'] = 'idle'
    if (itemIndex < index)
      nextState = 'done'
    else if (isCurrentStep)
      nextState = state

    const nextDetail = isCurrentStep ? detail : item.detail
    return { ...item, state: nextState, detail: nextDetail }
  })
}

function timelineStepClass(item: TimelineItem): string {
  if (item.state === 'done')
    return 'bg-emerald-100 text-emerald-700'
  if (item.state === 'active')
    return 'bg-indigo-100 text-indigo-600 ring-4 ring-indigo-50'
  return 'bg-slate-100 text-slate-400'
}

function timelineStepLabel(item: TimelineItem, index: number): string | number {
  if (item.state === 'done')
    return '✓'
  if (item.state === 'active')
    return '•'
  return index + 1
}

async function responsesCreate(request: ModelRequest): Promise<ModelResponse> {
  await wait(420)
  const toolResult = request.input.find((item): item is FunctionCallOutput => 'type' in item && item.type === 'function_call_output')
  if (!toolResult) {
    const firstInput = request.input[0]
    let requestedCity = '北京'
    if (firstInput && 'role' in firstInput && firstInput.role === 'user') {
      const cityWithSuffix = firstInput.content.replace('请告诉我', '')
      requestedCity = cityWithSuffix.replace('的天气', '')
    }
    return {
      id: `resp_${Date.now().toString(36)}`,
      output: [{
        type: 'function_call',
        call_id: `call_${Date.now().toString(36)}`,
        name: 'get_weather',
        arguments: JSON.stringify({ city: requestedCity }),
      }],
      output_text: '',
      usage: { input_tokens: 24, output_tokens: 12, total_tokens: 36 },
    }
  }

  const weather = JSON.parse(toolResult.output) as WeatherData
  const outputText = `${weather.city}今天${weather.condition}，${weather.temperature}°C。`
  return {
    id: `resp_${Date.now().toString(36)}`,
    output: [{ type: 'message', content: [{ type: 'output_text', text: outputText }] }],
    output_text: outputText,
    usage: { input_tokens: 42, output_tokens: 14, total_tokens: 56 },
  }
}

async function getWeather(requestedCity: string): Promise<WeatherData> {
  await wait(520)
  return { city: requestedCity, condition: '晴', temperature: 22 }
}

async function answerWeather(userText: string): Promise<string> {
  const trace = sdk.startTrace()
  try {
    const firstRequest: ModelRequest = { model: 'gpt-4.1', input: [{ role: 'user', content: userText }], tools: [weatherTool] }
    lastRequest.value = firstRequest
    const requestResult = trace.recordRequest(firstRequest)
    if (!requestResult.success)
      throw new Error(`记录模型请求失败：${requestResult.reason}`)

    setTimeline(1, 'active', '等待模型决定下一步')
    const firstResponse = await responsesCreate(firstRequest)
    lastResponse.value = firstResponse
    const responseResult = trace.recordResponse(firstResponse)
    if (!responseResult.success)
      throw new Error(`记录模型响应失败：${responseResult.reason}`)
    const call = firstResponse.output.find((item): item is FunctionCall => item.type === 'function_call')
    if (!call)
      throw new Error('模型没有请求天气工具')

    setTimeline(2, 'active', '执行 get_weather')
    const argumentsData = JSON.parse(call.arguments) as { city: string }
    const weather = await getWeather(argumentsData.city)
    const toolOutput = JSON.stringify(weather)
    const toolResult = trace.recordToolResult({ callId: call.call_id, output: toolOutput })
    if (!toolResult.success)
      throw new Error(`记录工具结果失败：${toolResult.reason}`)

    const toolResultInput: FunctionCallOutput = {
      type: 'function_call_output',
      call_id: call.call_id,
      output: toolOutput,
    }
    const followUpInput = [...firstRequest.input, ...firstResponse.output, toolResultInput]
    const secondRequest: ModelRequest = {
      model: firstRequest.model,
      input: followUpInput,
      tools: firstRequest.tools,
    }
    lastRequest.value = secondRequest
    const secondRequestResult = trace.recordRequest(secondRequest)
    if (!secondRequestResult.success)
      throw new Error(`记录模型请求失败：${secondRequestResult.reason}`)
    setTimeline(3, 'active', '生成最终 output_text')
    const secondResponse = await responsesCreate(secondRequest)
    lastResponse.value = secondResponse
    const secondResponseResult = trace.recordResponse(secondResponse)
    if (!secondResponseResult.success)
      throw new Error(`记录模型响应失败：${secondResponseResult.reason}`)
    const endResult = trace.end()
    if (!endResult.success)
      throw new Error(`结束 Trace 失败：${endResult.reason}`)
    setTimeline(4, 'done', '已完成')
    return secondResponse.output_text
  }
  catch (error) {
    trace.fail(error instanceof Error ? error : '天气流程失败')
    throw error
  }
}

async function runWeatherAgent() {
  if (running.value)
    return
  running.value = true
  answer.value = ''
  status.value = '正在运行 Responses 流程…'
  timeline.value = timeline.value.map((item) => {
    const state = item.type === 'input' ? 'active' : 'idle'
    return { ...item, state }
  })
  try {
    answer.value = await answerWeather(`请告诉我${city.value}的天气`)
    sentCount.value++
    status.value = 'Trace 已完成'
  }
  catch (error) {
    status.value = `运行失败：${error instanceof Error ? error.message : '未知错误'}`
  }
  finally {
    running.value = false
  }
}
</script>

<template>
  <main class="min-h-screen bg-slate-50 text-slate-900 selection:bg-indigo-100 selection:text-indigo-900">
    <header class="border-b border-slate-200/80 bg-white/80 backdrop-blur">
      <div class="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 lg:px-8">
        <div class="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span class="text-xl text-indigo-600">✦</span>
          <span>Trace Script</span>
          <span class="font-normal text-slate-400">/ Playground</span>
        </div>
        <div class="hidden items-center gap-3 font-mono text-[10px] text-slate-500 sm:flex">
          <span class="h-1.5 w-1.5 rounded-full bg-emerald-500 ring-4 ring-emerald-100" /> Live session <span class="h-4 w-px bg-slate-200" /> {{ runCountLabel }}
        </div>
      </div>
    </header>
    <section class="mx-auto flex max-w-6xl items-end justify-between gap-8 px-6 pb-10 pt-16 lg:px-8 lg:pt-20">
      <div>
        <p class="mb-3 font-mono text-[10px] font-medium tracking-[.18em] text-indigo-600">
          RESPONSES PLAYGROUND
        </p>
        <h1 class="max-w-2xl text-4xl font-bold tracking-[-.055em] text-slate-950 sm:text-5xl">
          把一次 Agent 运行看清楚。
        </h1>
        <p class="mt-4 text-base text-slate-500">
          输入一个问题，观察模型如何选择工具，再生成最终响应。
        </p>
      </div>
      <div class="hidden shrink-0 items-center gap-2 rounded-full border border-indigo-100 bg-white px-4 py-2 font-mono text-[10px] text-slate-500 shadow-sm sm:flex">
        <span class="h-1.5 w-1.5 rounded-full bg-emerald-500" /> OpenAI Responses
      </div>
    </section>
    <section class="mx-auto grid max-w-6xl grid-cols-1 gap-4 px-6 lg:grid-cols-2 lg:px-8">
      <div class="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm shadow-slate-200/40">
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-3">
            <span class="font-mono text-[10px] text-slate-400">01</span>
            <h2 class="text-base font-semibold tracking-tight">
              发起一次请求
            </h2>
          </div>
          <span class="rounded-md bg-indigo-50 px-2 py-1 font-mono text-[10px] text-indigo-600">POST /responses</span>
        </div>
        <form class="mt-9" @submit.prevent="runWeatherAgent">
          <label for="city" class="mb-2 block text-xs font-semibold text-slate-600">你想了解哪个城市的天气？</label>
          <div class="flex flex-col gap-2 sm:flex-row">
            <input id="city" v-model="city" :disabled="running" autocomplete="off" class="min-w-0 flex-1 rounded-lg border border-slate-300 bg-slate-50/50 px-3.5 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-100 disabled:cursor-wait disabled:opacity-60"><button type="submit" :disabled="running" class="flex min-h-11 items-center justify-center gap-4 rounded-lg bg-indigo-700 px-4 text-sm font-semibold text-white transition hover:-translate-y-px hover:bg-indigo-800 disabled:cursor-wait disabled:opacity-60">
              <span>{{ buttonLabel }}</span>
              <span class="text-lg font-normal">↗</span>
            </button>
          </div>
        </form>
        <div class="mt-4 flex items-center gap-2 font-mono text-[10px] text-slate-400">
          <span class="text-sm text-indigo-500">⌘</span>
          <span>将触发 2 次模型响应和 1 次工具调用</span>
          <kbd class="ml-auto rounded border border-slate-200 px-1.5 py-0.5 text-slate-400">Enter</kbd>
        </div>
      </div>
      <div class="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm shadow-slate-200/40">
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-3">
            <span class="font-mono text-[10px] text-slate-400">02</span>
            <h2 class="text-base font-semibold tracking-tight">
              运行流程
            </h2>
          </div>
          <span class="font-mono text-[10px] text-slate-400">{{ completedSteps }} / 4 完成</span>
        </div>
        <div class="mt-6">
          <div v-for="(item, index) in timeline" :key="item.type" class="flex min-h-12 items-start">
            <div class="flex w-7 shrink-0 flex-col items-center">
              <span class="z-10 grid h-5 w-5 place-items-center rounded-full font-mono text-[10px]" :class="timelineStepClass(item)">{{ timelineStepLabel(item, index) }}</span>
              <span v-if="index < timeline.length - 1" class="h-7 w-px bg-slate-200" />
            </div>
            <div class="flex flex-1 flex-col gap-0.5 pb-4 pl-3">
              <strong class="text-xs" :class="item.state === 'active' ? 'text-indigo-600' : ''">{{ item.label }}</strong>
              <span class="font-mono text-[10px] text-slate-400">{{ item.detail }}</span>
            </div>
            <span v-if="item.state === 'done'" class="font-mono text-[10px] text-emerald-600">完成</span>
            <span v-else-if="item.state === 'active'" class="font-mono text-[10px] text-indigo-600">进行中</span>
          </div>
        </div>
      </div>
      <div class="rounded-2xl border bg-white p-7 shadow-sm shadow-slate-200/40 lg:col-span-2" :class="answer ? 'border-indigo-200' : 'border-slate-200'">
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-3">
            <span class="font-mono text-[10px] text-slate-400">03</span>
            <h2 class="text-base font-semibold tracking-tight">
              最终响应
            </h2>
          </div>
          <span v-if="answer" class="rounded-md bg-emerald-50 px-2 py-1 font-mono text-[10px] text-emerald-700">成功</span>
        </div>
        <div v-if="answer" class="mt-7 flex items-center gap-4">
          <div class="grid h-11 w-11 place-items-center rounded-xl bg-amber-50 text-xl text-amber-600">
            ☀
          </div>
          <div>
            <p class="mb-1 font-mono text-[10px] text-slate-400">
              output_text
            </p>
            <p class="text-xl font-semibold tracking-tight">
              {{ answer }}
            </p>
          </div>
        </div>
        <div v-else class="flex min-h-[91px] items-center gap-4 text-sm text-slate-400">
          <div class="grid h-11 w-11 place-items-center rounded-full border border-dashed border-slate-300 text-slate-400">
            ✦
          </div>
          <p>运行后，模型的最终回答会显示在这里</p>
        </div>
        <p class="mt-5 flex items-center gap-2 border-t border-slate-100 pt-4 font-mono text-[10px] text-slate-400" role="status" aria-live="polite">
          <span class="h-1.5 w-1.5 rounded-full" :class="statusIndicatorClass" />{{ status }}
        </p>
      </div>
    </section>
    <section class="mx-auto max-w-6xl px-6 pb-10 pt-12 lg:px-8">
      <div class="mb-4 flex items-end justify-between">
        <div>
          <p class="mb-2 font-mono text-[10px] font-medium tracking-[.18em] text-indigo-600">
            INSPECTOR
          </p>
          <h2 class="text-xl font-semibold tracking-tight">
            请求与响应载荷
          </h2>
        </div>
        <div class="flex gap-1 rounded-lg bg-slate-200/70 p-1" role="tablist">
          <button class="rounded-md px-3 py-1.5 text-[11px] transition" :class="activeTab === 'overview' ? 'bg-white font-semibold text-indigo-700 shadow-sm' : 'text-slate-500'" @click="activeTab = 'overview'">
            概览
          </button>
          <button class="rounded-md px-3 py-1.5 text-[11px] transition" :class="activeTab === 'payload' ? 'bg-white font-semibold text-indigo-700 shadow-sm' : 'text-slate-500'" @click="activeTab = 'payload'">
            JSON
          </button>
        </div>
      </div>
      <div v-if="activeTab === 'overview'" class="grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-white sm:grid-cols-4">
        <div class="border-b border-slate-100 p-5 sm:border-b-0 sm:border-r">
          <span class="font-mono text-[10px] text-slate-400">模型</span>
          <strong class="mt-2 block text-sm">gpt-4.1</strong>
        </div>
        <div class="border-b border-slate-100 p-5 sm:border-b-0 sm:border-r">
          <span class="font-mono text-[10px] text-slate-400">事件</span>
          <strong class="mt-2 block text-sm">4 <small class="font-mono text-[10px] font-normal text-slate-400">items</small></strong>
        </div>
        <div class="border-r border-slate-100 p-5">
          <span class="font-mono text-[10px] text-slate-400">Token 使用</span>
          <strong class="mt-2 block text-sm">{{ totalTokens }} <small class="font-mono text-[10px] font-normal text-slate-400">tokens</small></strong>
        </div>
        <div class="p-5">
          <span class="font-mono text-[10px] text-slate-400">工具</span>
          <strong class="mt-2 block text-sm">get_weather</strong>
        </div>
      </div>
      <div v-else class="grid gap-4 md:grid-cols-2">
        <div>
          <div class="mb-2 font-mono text-[10px] text-slate-400">
            request
          </div>
          <pre class="max-h-64 overflow-auto rounded-xl bg-slate-900 p-4 font-mono text-[11px] leading-relaxed text-slate-200">{{ formattedRequest }}</pre>
        </div>
        <div>
          <div class="mb-2 font-mono text-[10px] text-slate-400">
            response
          </div>
          <pre class="max-h-64 overflow-auto rounded-xl bg-slate-900 p-4 font-mono text-[11px] leading-relaxed text-slate-200">{{ formattedResponse }}</pre>
        </div>
      </div>
    </section>
    <footer class="mx-auto flex max-w-6xl justify-between px-6 pb-8 font-mono text-[10px] text-slate-400 lg:px-8">
      <span>Trace every step of your agent</span>
      <span>Open DevTools → Agent Trace <span class="text-indigo-600">↗</span></span>
    </footer>
  </main>
</template>

<style scoped>
.playground {
  max-width: 45rem;
  margin: 4rem auto;
  padding: 0 1.5rem;
  font-family: system-ui, sans-serif;
  line-height: 1.6;
}

.city-field {
  display: grid;
  gap: 0.375rem;
  max-width: 17.5rem;
  margin: 1.5rem 0 1rem;
}

.agent-form {
  display: grid;
  justify-items: start;
}

.city-field input {
  padding: 0.5625rem 0.625rem;
  border: 1px solid #9aa8c2;
  border-radius: 0.375rem;
  font: inherit;
}

.send-button {
  padding: 0.625rem 1rem;
  border: 1px solid #2455d6;
  border-radius: 0.375rem;
  background: #2455d6;
  color: white;
  font: inherit;
  cursor: pointer;
}

.send-button:disabled {
  cursor: wait;
  opacity: 0.65;
}

.send-button:focus-visible,
.city-field input:focus-visible {
  outline: 0.125rem solid #2455d6;
  outline-offset: 0.1875rem;
}

.answer {
  margin-top: 1.5rem;
  font-size: 1.2rem;
  font-weight: 600;
}
</style>
