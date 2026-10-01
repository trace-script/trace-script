const eventButton = document.getElementById('send-event')
const sessionButton = document.getElementById('send-session')

// Synthetic ChatGPT-style conversation. No API key, network request or real model call.
const question = '请用一句话解释 window.postMessage 的作用。'
const chunks = [
  'window.postMessage ',
  '允许窗口之间安全地传递消息，',
  '也可以用于网页与浏览器扩展的 content script 通信。',
]
const answer = chunks.join('')

const steps = [
  { type: 'session.start', name: '开始 ChatGPT 示例会话', status: 'running', payload: { source: 'chatgpt-demo', simulated: true } },
  { type: 'message.user', name: '用户提问', status: 'success', payload: { role: 'user', content: question } },
  { type: 'model.request', name: 'ChatGPT 模型请求（模拟）', status: 'running', payload: { stream: true, messages: [{ role: 'user', content: question }] } },
  { type: 'message.assistant.start', name: 'ChatGPT 开始回复', status: 'running', payload: { role: 'assistant' } },
  ...chunks.map(content => ({ type: 'message.assistant.delta', name: 'ChatGPT 回复片段', status: 'running', payload: { delta: content } })),
  { type: 'model.response', name: 'ChatGPT 模型响应（模拟）', status: 'success', payload: { finishReason: 'stop', content: answer } },
  { type: 'message.assistant.completed', name: 'ChatGPT 完整回复', status: 'success', payload: { role: 'assistant', content: answer } },
  { type: 'session.end', name: '结束 ChatGPT 示例会话', status: 'success', payload: { simulated: true } },
]

function createEvent(step, sessionId, traceId, sequence, timestamp) {
  return {
    eventId: crypto.randomUUID(),
    sessionId,
    traceId,
    parentId: null,
    sequence,
    timestamp,
    agent: 'ChatGPT',
    model: { name: 'chatgpt-demo', simulated: true },
    ...step,
  }
}

function send(kind, data) {
  const envelope = { channel: 'agent-trace', version: '1.0', kind, [kind]: data }
  window.postMessage(envelope, window.location.origin)
  console.info(`[ChatGPT Demo] 已投递 ${kind}`, envelope)
}

eventButton.addEventListener('click', () => {
  // One small object, one postMessage, one panel record.
  const event = createEvent(steps[1], crypto.randomUUID(), crypto.randomUUID(), 1, Date.now())
  send('event', event)
})

sessionButton.addEventListener('click', () => {
  // Send the complete session as one object, preserving its nested structure.
  const sessionId = crypto.randomUUID()
  const traceId = crypto.randomUUID()
  const endedAt = Date.now()
  const startedAt = endedAt - (steps.length - 1) * 250
  const events = steps.map((step, index) => createEvent(step, sessionId, traceId, index + 1, startedAt + index * 250))
  events.at(-1).duration = endedAt - startedAt

  send('session', {
    sessionId,
    traceId,
    name: 'ChatGPT 完整示例会话',
    agent: 'ChatGPT',
    model: { name: 'chatgpt-demo', simulated: true },
    simulated: true,
    status: 'success',
    startedAt,
    endedAt,
    duration: endedAt - startedAt,
    messages: [
      { role: 'user', content: question },
      { role: 'assistant', content: answer },
    ],
    events,
  })
})
