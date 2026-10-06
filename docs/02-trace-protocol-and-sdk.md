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
interface TraceEventEnvelope {
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
  payload?: JsonValue
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
type TraceBridgeMessage = {
  channel: 'trace-script'
  version: '1.0'
} & (
  | { kind: 'trace-event', data: TraceEventEnvelope }
  | { kind: 'trace-batch', data: TraceEventEnvelope[] }
  | { kind: 'handshake', data: { requestId: string, phase: 'request' | 'response', available?: boolean } }
  | { kind: 'flush', data: Record<string, never> }
)
```

批次必须包含 1–100 个事件。`flush.data` 必须为空对象；握手响应以 `requestId` 对应请求，`available` 表示接收端是否可用。公共类型由 `metadata` 的 Zod Schema 推导，示例用于说明字段含义。

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

## 8. 第一版实现语义

### 8.1 JSON 边界与限制

`core` 的公开解析入口先检查原始输入，再交由 Schema 校验结构化克隆后的值，避免代理对象在检查与解析时返回不同字段。合法 JSON 包含 `null`，只接受有限数字、字符串、布尔值、数组和普通对象。循环引用、代理对象、稀疏数组、访问器、Symbol 字段、对象中的非枚举字段，以及数组的额外字段或非枚举元素均拒绝；共享对象引用不视为循环。未识别的事件、Actor、Model、Error 和 Metrics 字段在满足 JSON 约束后保留。

默认每个事件最多 1 MiB，每个桥接消息最多 2 MiB、100 个事件，按 UTF-8 字节计数。保护参数非法时返回 `INVALID_LIMITS`，不会关闭限制。

校验结果使用 `success` 判别；错误包含稳定的 `code`、字段 `path` 和 `message`。抛出式入口使用 `ProtocolValidationError` 携带相同错误信息。UTC 时间在解析后统一为带毫秒的 ISO 字符串。当前迁移入口只接受 `1.0` 并执行相同校验；未知版本返回 `UNSUPPORTED_VERSION`。

### 8.2 ID、排序与关系

- `sessionId` 标识会话，事件以 `sessionId` 和 `traceId` 共同确定所属 Trace。`eventId` 在接收的事件集合内唯一；SDK 默认生成独立 ID。
- 排序先按 `sessionId`、`traceId` 分组，再比较 Trace 内的 `sequence`、`timestamp` 和 `eventId`。排序返回新数组，不改变输入顺序。
- 相同 `eventId` 只保留首次接收的事件，累计重复次数。JSON 对象字段的插入顺序不影响相等判断；数组顺序或实际字段内容不同则记录冲突 ID。
- `parentId` 必须指向同一会话、同一 Trace 的事件。缺失父事件、跨上下文父事件、自引用和多事件父关系环中的成员都进入 `orphanEventIds`。原始事件保留；连接到环成员的其他子事件不会被误标为环成员。

### 8.3 Span 与消息聚合

Session、Model、Tool、Agent 和 Span 的开始事件各建立一条记录。结束事件通过 `parentId` 指向相同分类的开始事件；不同上下文或分类的结束事件不关闭记录。首个排序后的结束事件决定最终状态，后续结束事件的 ID 仍保留。没有匹配结束事件的记录保持 `incomplete`。

错误类型或 `status: 'error'` 优先产生错误状态，其次保留取消状态，其余匹配结束事件为成功。显式 `durationMs` 优先；否则使用结束与开始时间的差值，负值归零并标记 `timingConflict`。这些函数接收已通过协议解析的事件，完整原始事件由调用方保留。

助手消息的 delta 通过 `parentId` 关联开始事件，按事件排序追加。完成事件中存在字符串 `payload.content` 时以该文本为准，包括空字符串；没有完成文本时使用累计 delta。保留参与事件 ID；完成文本与非空 delta 不一致时标记 `contentMismatch`。其他会话或 Trace 的片段不会进入该消息。

### 8.4 验收与消融状态

根目录 `tests/metadata/`、`tests/core/` 覆盖 Schema、JSON 边界、版本错误、字节与深度边界、排序去重、父关系环、Span 配对与流式聚合；`fixtures/protocol.ts` 提供后续 SDK 和扩展测试复用的固定场景。

当前代码与测试待实际运行。候选消融包括：移除原始 JSON 检查后比较循环、访问器和稀疏数组的诊断；移除结构化克隆后比较代理对象改变字段时的深度校验；改用直接序列化比较后观察字段插入顺序的重复判定；移除父关系环诊断后比较孤立事件集合；移除桥接深度补偿后比较相同深度事件的独立与桥接解析结果。上述实验尚未执行，不能作为已通过的验证证据。
