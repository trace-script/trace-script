# 阶段 3：扩展数据接收链路

## 1. 阶段目标

完成从网页到 DevTools Panel 的实时数据链路：

```text
Page SDK
  -> window.postMessage
  -> Content Script
  -> chrome.runtime Port
  -> Service Worker
  -> DevTools Panel Port
```

完成后，测试网页发送的合法 Trace 事件应当实时出现在当前标签页对应的面板中；非法事件应被拒绝并产生可诊断记录。

## 2. 前置条件

- Manifest V3 骨架可以加载；
- Trace 协议 `1.0` 已冻结；
- `core` 提供运行时校验；
- `chrome-extensions` 已建立扩展内部消息类型目录。

## 3. 内部消息类型

建议至少定义：

| 消息 | 方向 | 用途 |
| --- | --- | --- |
| `INGEST_BATCH` | content -> worker | 提交已初步验证的事件批次 |
| `INGEST_ACK` | worker -> content | 返回接收数量和拒绝数量 |
| `PANEL_CONNECT` | panel -> worker | 注册面板与 `tabId` 的关系 |
| `PANEL_DISCONNECT` | panel -> worker | 释放面板订阅 |
| `TRACE_EVENTS_APPEND` | worker -> panel | 推送新增事件 |
| `TRACE_QUERY` | panel -> worker | 查询历史数据 |
| `TRACE_QUERY_RESULT` | worker -> panel | 返回查询结果 |
| `COLLECTOR_STATUS` | 双向 | 显示连接与录制状态 |

所有消息必须是判别联合类型，禁止使用无约束的 `{ type: string, data: any }`。

这些消息只服务于 content script、service worker 和 Panel 之间的 Chrome 插件内部通信，统一放在 `chrome-extensions`，不进入通用工具包 `shared`。

## 4. 执行任务

### 4.1 Content Script 桥接

操作：

1. 在顶层 frame 注册 `message` 监听器；
2. 检查 `event.source === window`；
3. 检查 `event.origin === window.location.origin`；
4. 检查 `channel`、协议版本和消息类型；
5. 对数据进行轻量结构检查和消息大小检查；
6. 将事件按批次通过长连接 Port 发给 service worker；
7. Port 断开时采用有限次数、带退避的重连；
8. 页面导航或 content script 卸载时清理监听器和缓冲区；
9. 不向页面暴露扩展内部数据或高权限操作。

### 4.2 Service Worker 路由

操作：

1. 在模块顶层同步注册 `onConnect` 和必要的事件监听器；
2. 根据连接名称区分 content script 与 DevTools Panel；
3. 从 `sender.tab.id`、`sender.frameId` 获取可信的标签页信息；
4. 对每个事件执行完整 Schema 校验和标准化；
5. 补充 `receivedAt`、`tabId`、`frameId` 和扩展版本；
6. 将合法事件交给存储仓库；
7. 将新事件广播给订阅同一 `tabId` 的面板；
8. 对无订阅面板的事件仍正常持久化；
9. 不使用 service worker 全局变量作为唯一数据源。

### 4.3 DevTools Panel 连接

操作：

1. 面板读取 `chrome.devtools.inspectedWindow.tabId`；
2. 创建命名 Port 并发送 `PANEL_CONNECT`；
3. 连接建立后先请求快照，再订阅增量事件；
4. 避免快照和增量之间出现事件缺口，可使用游标或最后事件序号衔接；
5. 面板隐藏时可以降低 UI 更新频率，但不能造成数据丢失；
6. 面板重新打开或 worker 重启时自动恢复连接。

### 4.4 权限与站点授权

操作：

1. MVP 不默认申请所有站点永久访问权限；
2. 使用 `optional_host_permissions` 申请用户选择的站点；
3. 授权成功后动态注册对应 content script；
4. 设置页展示已授权站点并允许撤销；
5. 权限撤销后停止监听该站点并清理运行连接；
6. 对 `file://`、无权限页面和 Chrome 内部页面显示明确状态。

## 5. 错误处理要求

| 场景 | 预期行为 |
| --- | --- |
| 非 Trace Script 消息 | 静默忽略 |
| Trace 消息格式错误 | 拒绝并记录计数，不进入存储 |
| 协议版本未知 | 返回版本错误，不尝试猜测解析 |
| Port 暂时断开 | 缓冲有限数量并尝试重连 |
| 缓冲区已满 | 按明确策略丢弃，并上报 dropped count |
| service worker 重启 | 新消息能够唤醒并继续处理 |
| 面板未打开 | 正常持久化，稍后可查询 |
| 页面高速发送 | 通过批处理和限流保护扩展进程 |

## 6. 验收步骤

1. 为测试站点授予权限并打开 DevTools 面板；
2. 页面发送一个合法事件，面板在当前标签页收到该事件；
3. 同时打开两个标签页，各面板只显示自己的数据；
4. 关闭面板继续发送事件，再打开后可以取得遗漏期间的数据；
5. 重启扩展 service worker 后继续发送，链路能够恢复；
6. 发送非本项目 channel 的 `message`，扩展不处理；
7. 发送非法协议事件，面板或诊断日志能看到拒绝原因；
8. 撤销站点权限后，该站点不再被监听；
9. 快速发送多个批次，事件数量、顺序和 dropped count 符合预期；
10. Panel 与 content script 均不能通过消息触发未授权的高权限行为。

## 7. 完成标准

- 网页到 Panel 的实时链路可工作；
- 数据按 `tabId` 隔离；
- worker 重启和 Panel 重连不会破坏链路；
- 非法数据不会进入正式存储；
- 用户能够控制站点访问权限；
- 连接状态、拒绝计数和丢弃计数可观察。

## 8. 参考

- [Chrome Content Scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Chrome Message Passing](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)
- [Extension Service Worker 生命周期](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [Chrome 扩展安全建议](https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure)
