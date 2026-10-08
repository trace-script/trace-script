# 阶段 2：最小 Trace 协议与网页 SDK

## 目标与现状

让网页应用以少量显式调用记录一次 OpenAI Responses 对话，并把事件交给浏览器扩展。应用应能把传给 `responses.create()` 的请求对象和收到的响应对象直接交给 SDK，无需拆分 `response.output` 或转成另一套消息格式。

本文的最小事件 Schema、core 解析和网页 SDK 已实现。扩展接收方仍属于下一阶段；当前 SDK 可以向页面发送消息，但尚不能在扩展面板中查看事件。

## 最小协议

### 事件与字段

一个 Trace 对应应用处理一次用户请求。SDK 发送下列事件；生命周期方法产生开始和终结事件。

| 事件 | `payload` | 产生时机 |
| --- | --- | --- |
| `trace.start` | 省略 | `startTrace()` |
| `model.request` | 传给 `responses.create()` 的请求对象 | 每次请求之前 |
| `model.response` | `responses.create()` 返回的完整响应对象 | 每次请求成功之后 |
| `tool.result` | `{ callId, output }` | 应用执行一次工具之后 |
| `trace.end` | 省略 | 应用正常结束 |
| `trace.error` | `{ message }` | 应用捕获异常并结束 |

每个事件只保留以下公共字段：

| 字段 | 来源 | 用途 |
| --- | --- | --- |
| `eventId` | SDK | 标识单个事件 |
| `traceId` | SDK | 关联本次请求中的事件 |
| `sequence` | SDK | 同一 Trace 内从 1 递增，确定顺序 |
| `timestamp` | SDK | 事件产生时的 UTC ISO 8601 时间 |
| `type` | SDK 方法决定 | 区分事件 |
| `payload` | 应用传入；开始和正常结束事件省略 | 保留请求、响应或工具结果 |

`payload` 必须是可 JSON 序列化的数据。SDK 在调用时保存 JSON 快照，避免应用随后修改请求对象影响已记录事件；不能序列化时返回明确的记录失败，不能阻断模型或工具调用。SDK 不删除、不改名 `response.output`、`usage` 等 OpenAI 字段，也不从响应推导另一套消息结构。应用须避免把密钥放进被记录的请求；自动脱敏策略留待后续设计。

`tool.result.payload.callId` 使用响应中 `function_call.call_id`；`output` 使用应用实际提交给下一次模型请求的工具输出。扩展可据此关联原始响应中的工具调用。最小版不要求 `sessionId`、`parentId`、`name`、`status`、`durationMs`、`agent`、`model`、`attributes`、`error` 或 `metrics` 等独立字段。模型、用量和工具调用信息可从原始请求/响应读取，不在写入时重复加工。

例如，一条模型响应事件的形状如下。响应内容仅用于展示；实际应保留服务端返回的完整响应，包括其余字段及合法空值。

```json
{
  "eventId": "evt_3",
  "traceId": "tr_1",
  "sequence": 3,
  "timestamp": "2026-01-01T00:00:03.000Z",
  "type": "model.response",
  "payload": {
    "id": "resp_1",
    "object": "response",
    "output": [{ "type": "function_call", "call_id": "call_1", "name": "get_weather", "arguments": "{\"city\":\"北京\"}" }],
    "usage": { "input_tokens": 42, "output_tokens": 12, "total_tokens": 54 }
  }
}
```

### 页面传输边界

SDK 使用 `window.postMessage({ channel: 'trace-script', kind: 'trace-event', data: event }, window.location.origin)` 投递单个事件。扩展仅接受顶层页面、同源且符合协议的消息，并再次校验事件。SDK 不依赖 `chrome.*`，也不承诺扩展不存在、页面关闭或导航时可靠送达。

## 应用与 SDK 的职责

| 步骤 | 应用提供或处理 | SDK 处理 |
| --- | --- | --- |
| 初始化 | 在页面中创建 SDK 实例 | 保存投递目标 |
| 开始一次用户请求 | 调用 `startTrace()`，保管返回的句柄 | 生成 `traceId` 和 `trace.start` |
| 调用模型前 | 构造 OpenAI Responses 请求对象；同一对象传给 `recordRequest()` 和 `responses.create()` | 保存快照，生成 `model.request` 与公共字段 |
| 模型返回后 | 将完整 `response` 传给 `recordResponse()`；应用自己读取 `response.output` 决定业务操作 | 保存快照，生成 `model.response`；不拆解响应 |
| 执行工具后 | 执行工具，将 `call_id` 和真正提交给模型的输出传给 `recordToolResult()` | 生成 `tool.result` |
| 完成或失败 | 调用 `end()` 或 `fail(error)`；业务异常仍由应用处理 | 生成唯一终结事件；从 `Error` 提取可序列化的消息 |

每次请求前记录请求，每次成功返回后记录响应；多轮模型调用复用同一个 Trace 句柄。SDK 不拦截 OpenAI 客户端，也不执行应用工具。

## 接入样例：一次带工具调用的完整生命周期

下例是 API 目标形状的 JavaScript mock。为突出记录顺序，省略 OpenAI 客户端初始化和真实天气服务实现。

```js
const sdk = createTraceSdk() // 页面初始化一次

async function answerWeather(userText) {
  const trace = sdk.startTrace() // SDK: trace.start，sequence=1

  try {
    // 1. 应用构造请求；SDK 只保存对象快照。
    const firstRequest = {
      model: 'gpt-4.1',
      input: [{ role: 'user', content: userText }],
      tools: [{
        type: 'function',
        name: 'get_weather',
        description: 'Get weather for a city',
        parameters: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
          additionalProperties: false,
        },
        strict: true,
      }],
    }
    trace.recordRequest(firstRequest) // SDK: model.request，sequence=2
    const firstResponse = await openai.responses.create(firstRequest)
    trace.recordResponse(firstResponse) // SDK: model.response，sequence=3；原始响应作为 payload

    // 2. 应用识别并执行工具；SDK 不解析参数或执行工具。
    const call = firstResponse.output.find(item => item.type === 'function_call')
    if (!call)
      throw new Error('Expected get_weather call in this example')
    const { city } = JSON.parse(call.arguments)
    const weather = await getWeather(city)
    const toolOutput = JSON.stringify(weather)
    trace.recordToolResult({ callId: call.call_id, output: toolOutput }) // SDK: tool.result，sequence=4

    // 3. 应用把原始模型输出与工具结果交回 OpenAI。
    const secondRequest = {
      model: 'gpt-4.1',
      input: [
        ...firstRequest.input,
        ...firstResponse.output,
        { type: 'function_call_output', call_id: call.call_id, output: toolOutput },
      ],
      tools: firstRequest.tools,
    }
    trace.recordRequest(secondRequest) // SDK: model.request，sequence=5
    const secondResponse = await openai.responses.create(secondRequest)
    trace.recordResponse(secondResponse) // SDK: model.response，sequence=6

    // 4. 应用消费最终响应；SDK 只记录结束，不重复写输出。
    trace.end() // SDK: trace.end，sequence=7
    return secondResponse.output_text
  }
  catch (error) {
    trace.fail(error) // SDK: trace.error；只在尚未结束时生效
    throw error // 业务错误仍由应用决定如何处理
  }
}
```

若首次响应就是最终回答，应用在 `recordResponse(firstResponse)` 后直接 `end()`；不产生工具事件和第二次请求。若模型请求或工具执行抛错，`fail(error)` 生成终结事件，应用照常抛出或处理错误。终结后不能继续记录事件；重复终结调用应保持幂等。

记录失败不得改变应用请求、响应或异常的控制流。`recordRequest()` 等方法返回本次记录是否成功及失败原因，便于应用选择是否显示诊断；上例省略诊断处理，不表示记录一定成功。只有成功记录的事件才占用 `sequence`。

## 最小实现与验收

1. 调整 `metadata` Schema、`core` 解析及扩展接收约定，使它们接受六种事件和六个公共字段。
2. 实现网页 SDK 的 `createTraceSdk()`、`startTrace()`、`recordRequest()`、`recordResponse()`、`recordToolResult()`、`end()` 和 `fail()`；SDK 负责生成 ID、顺序、时间、快照及单事件投递。
3. 使用同一请求对象调用 `recordRequest()` 与 OpenAI mock，完整响应对象调用 `recordResponse()`；检查接收的 `payload` 与传入的 JSON 值相同，包含 `output`、`usage` 及空值。
4. 跑通无工具、一次工具调用、模型失败、工具失败四条路径；检查事件类型、数量、顺序、`traceId`、`callId` 和唯一终结事件。
5. 测试不可序列化输入的明确记录失败，以及无扩展时应用调用不抛出投递错误；扩展端拒绝非同源或不合法消息。

## 待实现

以下是原方案中的非核心流程，本阶段不实现；需要时再确定具体 API。

- **会话与多 Agent 视图**：跨 Trace 的 `sessionId`、Agent 身份、handoff、通用 Span、父子关系及孤立事件诊断。
- **流式与聚合视图**：逐 token/delta 事件、聚合消息、乱序重排、重复事件内容冲突及派生状态。
- **传输增强**：批量发送、`flush`、可用性握手、卸载前尽力发送、重试、缓冲与丢弃计数。
- **高级配置与保护**：可配置 channel、脱敏钩子、调试开关、额外属性、独立 metrics 和精细错误码。
- **复杂 Fixtures**：失败重试、多 Agent handoff、流式消息、乱序和重复事件的跨包测试样例。
