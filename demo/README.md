# Agent Trace 最小 Demo

原生 HTML / JavaScript + Chrome Manifest V3。无需安装依赖、构建或调用 ChatGPT API。
测试页面只有两个发送按钮；DevTools 的 **Agent Trace** 面板只有文本 / 原始 JSON。

## 运行

1. 打开 Chrome 的 `chrome://extensions/`，开启「开发者模式」。
2. 点击「加载已解压的扩展程序」，选择本目录中的 **`extension/`** 文件夹（不是整个 `demo/`）。
3. 在项目根目录运行（需要 Node.js 18 或更新版本）：

   ```sh
   node demo/serve.mjs
   ```

4. 打开 <http://127.0.0.1:4173>。
5. 打开该页面的 Chrome DevTools，选择 **Agent Trace** 标签页。窄窗口中可能需要点击 `»` 查看。
6. 等面板显示「已连接标签页」，选择页面上的一个按钮：
   - **发送单个 object 节点**：一次发送一个用户消息事件，面板增加一条 `kind: "event"` 记录。
   - **发送完整 session 数据**：一次发送一个完整会话对象，面板增加一条 `kind: "session"` 记录，内部包含 10 个事件及完整对话。
7. 完整 session 通过一次 `postMessage` 投递，Panel 保留并展示嵌套的 `session.events`。

修改 demo 后，请在扩展管理页面重新加载扩展，关闭 DevTools，刷新测试页面后重新打开面板。

可选：没有 Node.js 时，用 Python 标准库启动相同页面：

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory demo/page
```

请通过 HTTP 访问页面。直接打开 `file://` 文件不属于本 demo 的监听范围。

## 通信链路

```text
双按钮页面
  → window.postMessage({ channel, version, kind, event 或 session }, location.origin)
  → content-script.js：校验同窗口、同源、协议及消息大小
  → chrome.runtime.sendMessage
  → background.js：二次校验、补充来源，仅转发给当前打开的面板
  → chrome.runtime Port：按 inspectedWindow.tabId 推送
  → panel.js：通过 textContent 展示原始 JSON
```

扩展只监听 `http://127.0.0.1/*` 和 `http://localhost/*` 的顶层页面，不需要全站权限。
同源校验用于限定数据来源，不用于识别页面内的某一个脚本。

单条消息最多 8 KiB；当前面板最多展示最近 100 条投递记录。
一个事件或一个完整 session 都占一条记录，session 内的事件不会拆散；每个 session 最多 100 个事件，仍受总消息大小限制。
数据仅存在于当前面板的内存中，不写入 Chrome Storage、IndexedDB 或网页存储。
刷新测试页面会清空面板：content script 在每次页面加载时发送清空通知，面板也监听被调试页面的导航事件。
重新打开 DevTools 或重新加载面板时从空白状态开始，没有历史记录恢复。
只有点击按钮投递数据后，当前已打开的面板才会出现对应的 JSON；面板关闭期间发送的数据不会补发。
面板断开 Port 后会自动重连，重连不读取历史数据。

## 示例数据

这是模拟的 ChatGPT 对话，模型名称为 `chatgpt-demo`，带有 `simulated: true` 标记。
没有真实模型调用、真实 Token / 费用统计或内部思维链。

用户提问：「请用一句话解释 window.postMessage 的作用。」

单个 object 按钮发送一个 `message.user` 事件。

完整 session 按钮发送包含以下事件的对象：

1. `session.start`
2. `message.user`
3. `model.request`
4. `message.assistant.start`
5. 三条 `message.assistant.delta`
6. `model.response`
7. `message.assistant.completed`
8. `session.end`

每次点击都生成新的 `sessionId` 和 `traceId`，每个事件有独立的 `eventId`。
完整 session 内的 10 个事件共享该会话的 `sessionId` 和 `traceId`，`sequence` 从 1 到 10。
其中的时间戳模拟了一段 2250ms 的聊天过程，实际投递是一次性的。
面板中的每条记录包括 `kind`、`recordId`、`event` 或 `session`，以及扩展补充的 `tabId`、`frameId`、`origin`、`url`、`receivedAt`。

两种消息信封结构：

```js
// 单个节点
window.postMessage({ channel: 'agent-trace', version: '1.0', kind: 'event', event: { /* 用户消息事件 */ } }, window.location.origin)

// 完整会话：一个对象、一次发送
window.postMessage({
  channel: 'agent-trace',
  version: '1.0',
  kind: 'session',
  session: {
    sessionId: '...',
    traceId: '...',
    name: 'ChatGPT 完整示例会话',
    status: 'success',
    startedAt: 0,
    endedAt: 2250,
    duration: 2250,
    messages: [/* 用户提问、完整回复 */],
    events: [/* 按顺序排列的 10 个事件 */],
  },
}, window.location.origin)
```

协议同时兼容旧的 `{ channel, version, event }` 消息。一次投递只能包含 `event` 或 `session` 其中一种。
session 内各事件的会话和 Trace ID 必须与外层一致，事件 ID 不能重复，`sequence` 必须递增。

自定义发送示例（在测试页面的 Console 执行）：

```js
window.postMessage({
  channel: 'agent-trace',
  version: '1.0',
  kind: 'event',
  event: {
    eventId: crypto.randomUUID(),
    sessionId: 'custom-session',
    traceId: 'custom-trace',
    sequence: 1,
    timestamp: Date.now(),
    type: 'message.user',
    name: '自定义用户消息',
    status: 'success',
    payload: { role: 'user', content: '你好，ChatGPT！' },
  },
}, window.location.origin)
```

## 手动验收

- 页面只有两个按钮，无第三方脚本、样式或 API 请求。
- 点击单个 object 按钮，只增加一条 `event` 记录，类型为 `message.user`。
- 点击完整 session 按钮，只增加一条 `session` 记录，包含两个 `messages` 和 10 个 `events`；最后一个事件为 `session.end`。
- 完整 session 的 `sequence` 从 1 到 10；完整回复与三个片段拼接的内容一致。
- 每个按钮再次点击都增加一条记录，生成新的会话 / Trace ID。
- 首次打开面板时没有 JSON 数据，只有等待提示；点击按钮后才出现数据。
- 已有数据时刷新测试页面，面板立即清空；未再次点击按钮前，始终不显示旧数据。
- 关闭 DevTools 后重开，或重新加载面板，不会恢复以前的数据。
- 面板关闭期间点击按钮，之后打开面板仍为空；需要再次点击按钮才能显示数据。
- 两个测试标签页各自打开面板，点击其中一个页面只更新对应的面板。
- 发送错误 `channel` / `version`、缺少必填字段、session 内事件 ID / 顺序异常或超出 8 KiB 的消息，面板不会增加记录。
- Payload 中的 HTML / 脚本文本仅显示为文字，不会执行。

## 文件

```text
demo/
  README.md
  serve.mjs                  # Node 标准库 HTTP 服务
  page/
    index.html               # 双按钮页面
    chatgpt-demo.js           # 生成单个事件和完整会话对象
  extension/
    manifest.json            # MV3 扩展声明
    protocol.js              # 共享协议校验
    content-script.js        # 网页 → 扩展桥接
    background.js            # 按标签页实时转发，不缓存数据
    devtools.html
    devtools.js              # 注册 Agent Trace Panel
    panel.html
    panel.js                 # 接收事件并展示 JSON
```

## 排查

- 找不到面板：确认加载的是 `extension/`，关闭 DevTools 后重新打开。
- 页面发送后没有记录：加载 / 重载扩展后刷新测试页面，让 content script 重新注入；确认访问的是 HTTP 本地地址。
- 扩展重载后旧面板连接失效：关闭 DevTools，刷新页面，再重新打开 DevTools。
- 端口被占用：停止占用 4173 的本地服务，或使用 Python 启动命令选择另一个端口。
- 其他错误：查看页面 Console 中的 `[Agent Trace Demo]` 提示，以及扩展管理页面里的 service worker Console。

API 参考：[Chrome DevTools 扩展](https://developer.chrome.com/docs/extensions/how-to/devtools/extend-devtools)、[Content Scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)、[Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)、[页面导航事件](https://developer.chrome.com/docs/extensions/reference/api/devtools/network#event-onNavigated)。
