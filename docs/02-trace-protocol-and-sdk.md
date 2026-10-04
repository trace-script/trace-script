# 阶段 2：Trace 协议与网页 SDK

## 1. 阶段目标

定义一个稳定、可版本化、与具体 Agent 框架无关的 Trace 协议，并通过网页 SDK 将事件投递给浏览器扩展。

协议是存储、UI、导入导出和后续生态接入的公共边界。本阶段必须先于正式 UI 开发完成。

## 2. 前置条件

- 项目包边界已确认；
- `metadata`、`core` 和 `sdk` 能独立构建；
- 已确认网页入口使用 `window.postMessage`；
- 已确认 MVP 只接收顶层页面事件。

## 3. 协议模型

### 3.1 事件信封

第一版事件应至少包含：

```ts
interface TraceEventEnvelope<T = unknown> {
  version: '1.0'
  eventId: string
  traceId: string
  sessionId: string
  parentId?: string
  sequence: number
  timestamp: string
  type: TraceEventType
  name: string
  status?: 'pending' | 'running' | 'success' | 'error' | 'cancelled'
  durationMs?: number
  agent?: TraceActor
  model?: TraceModel
  attributes?: Record<string, JsonValue>
  payload?: T
  error?: TraceError
  metrics?: TraceMetrics
}
```

约束：

- 时间统一使用 ISO 8601 UTC 字符串；
- `sequence` 在单个 Trace 中单调递增；
- ID 必须是字符串且在对应范围内唯一；
- Payload 必须可以被结构化克隆和 JSON 序列化；
- 不允许函数、DOM 节点、循环引用和不可序列化实例；
- 未识别字段允许保留，未识别 `version` 必须拒绝或进入隔离记录。

### 3.2 第一版事件类型

| 分类 | 事件类型 |
| --- | --- |
| Session | `session.start`、`session.end` |
| Message | `message.user`、`message.assistant.start`、`message.assistant.delta`、`message.assistant.completed` |
| Model | `model.request`、`model.response`、`model.error` |
| Tool | `tool.start`、`tool.result`、`tool.error` |
| Agent | `agent.start`、`agent.handoff`、`agent.end` |
| Span | `span.start`、`span.end`、`span.error` |
| General | `log`、`error` |

不把内部思维链定义为必需事件。业务如果需要展示推理说明，应使用明确的摘要或日志事件。

### 3.3 页面消息外层协议

网页投递消息使用额外的 Channel 信封，避免与页面中其他 `message` 事件冲突：

```ts
interface TraceBridgeMessage {
  channel: 'trace-script'
  version: '1.0'
  kind: 'trace-event' | 'trace-batch' | 'handshake' | 'flush'
  data: unknown
}
```

## 4. 执行任务

### 4.1 定义公共类型和 Schema

操作：

1. 在 `metadata` 中定义协议版本、可复用 Schema 结构元素，并从 Schema 推导公共 TypeScript 类型；
2. 在 `core` 中组合 `metadata` Schema，提供校验、标准化和迁移函数；
3. 将当前宽泛的 `AgentPayload.data: any` 替换为兼容迁移层或明确的 `unknown`；
4. 提供 `parseTraceEvent` 和 `safeParseTraceEvent` 两类入口；
5. 对错误输出稳定的错误码、字段路径和错误原因；
6. 建立版本迁移入口，第一版即使只有 `1.0 -> 1.0` 也保留结构。

### 4.2 定义关系与状态规则

操作：

1. 定义 `sessionId`、`traceId`、`eventId` 和 `parentId` 的关系；
2. 定义开始、结束、失败事件如何合并为可展示 Span；
3. 定义事件乱序时按 `sequence` 与 `timestamp` 的处理优先级；
4. 定义重复 `eventId` 的幂等处理；
5. 定义缺少父事件时的孤立事件策略；
6. 定义流式 delta 如何聚合为完整消息，同时保留原始事件。

### 4.3 实现网页 SDK 接口

建议 SDK 提供：

- `configure(options)`：设置 channel、批处理、脱敏和调试选项；
- `startSession()` / `endSession()`；
- `startTrace()` / `endTrace()`；
- `emit(event)`：发送完整事件；
- `startSpan()`：返回可结束或失败的 Span 句柄；
- `flush()`：立即发送等待中的批次；
- `isCollectorAvailable()`：可选握手检测。

操作：

1. 默认使用 `window.postMessage(message, window.location.origin)`；
2. SDK 不直接依赖 `chrome.*` API；
3. 默认按事件数量或短时间窗口批量发送；
4. 页面卸载前尽力执行 `flush`，但不得承诺绝对可靠送达；
5. SDK 关闭或扩展不存在时不得影响宿主 Agent 应用；
6. 提供原生事件投递示例，允许不安装 SDK 的用户直接接入协议。

### 4.4 准备协议 Fixtures

至少准备以下固定样例：

- 单轮普通对话；
- 流式模型回复；
- 一次工具调用成功；
- 工具调用失败并重试；
- 多 Agent handoff；
- 事件乱序；
- 重复事件；
- 非法字段与超大 Payload；
- 未知协议版本。

Fixtures 后续同时用于 `core`、`sdk` 和 `chrome-extensions` 中的接收、存储及 UI 测试。

## 5. 验收步骤

1. 对每种事件类型运行 Schema 正例测试；
2. 对缺失 ID、非法状态、错误时间、循环对象运行反例测试；
3. 同一个事件重复输入两次，标准化结果能够识别重复；
4. 输入乱序事件，排序规则输出稳定；
5. 输入多段 `message.assistant.delta`，能够生成正确的聚合消息；
6. 测试页面调用 SDK 后能收到结构正确的浏览器 `message` 事件；
7. 未安装扩展时调用 SDK，不抛出影响宿主页面的异常；
8. 旧版本或未知版本产生明确的兼容性错误；
9. 协议 Fixtures 可以被 `core`、`sdk` 和 `chrome-extensions` 的测试复用；
10. 公共类型生成声明文件并能被独立 TypeScript 项目使用。

## 6. 完成标准

- 协议 `1.0` 字段和语义固定；
- 公共类型不包含 `any`；
- 运行时校验、错误码和 Fixtures 已完成；
- SDK 能发送单事件和批量事件；
- SDK 不依赖扩展 ID，不影响宿主页面稳定性；
- 协议文档与实际导出类型一致。

## 7. 风险与处理

| 风险 | 处理方式 |
| --- | --- |
| 协议过早绑定某个 Agent 框架 | 核心字段保持通用，框架字段进入 `attributes` 或适配器 |
| 流式 delta 数量过大 | SDK 允许批处理，存储层保留聚合策略 |
| 页面数据包含密钥或隐私 | SDK 提供可选脱敏钩子，扩展再次执行保护规则 |
| 时间戳不可靠 | 同时记录页面时间和扩展接收时间 |
| 协议升级破坏历史数据 | 从第一版建立版本和迁移入口 |
