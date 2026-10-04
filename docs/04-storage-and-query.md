# 阶段 4：数据存储与查询

## 1. 阶段目标

建立可迁移、可查询、可清理的本地 Trace 存储。面板关闭、DevTools 关闭或 service worker 被回收后，用户仍能恢复之前的 Session、Trace 和 Event。

主体数据使用 IndexedDB，用户设置使用 `chrome.storage.local`。不得使用 service worker 全局变量或 `localStorage` 作为事实来源。

## 2. 前置条件

- Trace 协议和事件标准化规则已经确定；
- service worker 可以接收合法事件；
- 已定义当前标签页与 Session、Trace 的归属方式；
- 已确定默认数据保留策略。

## 3. IndexedDB 数据模型

建议第一版使用以下 Object Store：

### 3.1 `sessions`

| 字段 | 用途 |
| --- | --- |
| `sessionId` | 主键 |
| `tabId` | 标签页归属 |
| `origin` | 数据来源站点 |
| `startedAt` / `endedAt` | Session 时间范围 |
| `status` | 运行状态 |
| `traceCount` / `eventCount` | 汇总统计 |
| `lastReceivedAt` | 最近接收时间 |

索引：`tabId`、`origin`、`startedAt`、`lastReceivedAt`。

### 3.2 `traces`

| 字段 | 用途 |
| --- | --- |
| `traceId` | 主键 |
| `sessionId` | Session 关系 |
| `tabId` | 快速按标签页查询 |
| `name` | Trace 名称 |
| `status` | 聚合状态 |
| `startedAt` / `endedAt` | Trace 时间范围 |
| `durationMs` | 聚合耗时 |
| `eventCount` | 事件数量 |

索引：`sessionId`、`tabId`、`status`、`startedAt`。

### 3.3 `events`

| 字段 | 用途 |
| --- | --- |
| `eventId` | 主键 |
| `sessionId` / `traceId` | 关系字段 |
| `parentId` | 父事件关系 |
| `tabId` / `frameId` | 页面来源 |
| `sequence` | Trace 内顺序 |
| `timestamp` / `receivedAt` | 页面和接收时间 |
| `type` / `status` | 筛选字段 |
| `name` | 搜索和展示 |
| `payload` / `attributes` | 事件内容 |

复合索引至少覆盖：

- `[traceId, sequence]`；
- `[sessionId, timestamp]`；
- `[tabId, receivedAt]`；
- `[traceId, type]`；
- `[traceId, status]`。

第一版可以将 Payload 存在 Event 内。只有在真实数据证明大 Payload 明显影响列表查询后，再拆分 `payloads` Store。

## 4. Repository API

Repository 的平台无关接口放在 `core`，IndexedDB 与 `chrome.storage.local` 的具体实现放在 `chrome-extensions`。UI 只能调用 Chrome 插件提供的查询服务，不直接散落 IndexedDB 操作。建议接口包括：

- `appendEvents(events)`；
- `getSession(sessionId)`；
- `listSessions(query)`；
- `getTrace(traceId)`；
- `listTraces(query)`；
- `listEvents(query, cursor)`；
- `getEvent(eventId)`；
- `deleteSession(sessionId)`；
- `clearByOrigin(origin)`；
- `clearAll()`；
- `estimateUsage()`；
- `runRetentionPolicy()`；
- `exportSession(sessionId)`；
- `importSession(document)`。

查询接口必须支持分页或游标，不允许默认一次读取所有历史事件。

## 5. 执行任务

### 5.1 建立数据库版本和迁移机制

操作：

1. 定义数据库名称和初始版本；
2. 将建表和索引逻辑集中在迁移文件；
3. 禁止在普通查询路径中临时创建或修改索引；
4. 准备升级失败的恢复策略；
5. 在开发 Fixtures 上验证从空数据库升级；
6. 后续每次 Schema 变化都增加新版本，不直接修改旧迁移。

### 5.2 实现事务写入

操作：

1. 一个事件批次在单次事务中写入；
2. 同步更新 Session 和 Trace 汇总；
3. 重复 `eventId` 按协议规则幂等处理；
4. 写入失败返回明确错误，不向 Panel 声称已经持久化；
5. 广播实时事件时标记其持久化状态，避免 UI 与存储结果不一致。

### 5.3 实现查询和游标

操作：

1. 先实现按标签页查询 Session；
2. 再实现按 Session 查询 Trace；
3. 实现按 Trace 分页读取 Event；
4. 支持类型、状态、时间和关键字条件；
5. 对 UI 返回轻量列表 DTO，详情按需读取完整 Payload；
6. 将排序规则固定为 `sequence` 优先、时间次之。

### 5.4 实现设置与保留策略

使用 `chrome.storage.local` 保存：

- 是否录制；
- 已授权站点；
- 主题；
- 面板布局；
- 默认筛选；
- 最大保存天数；
- 最大 Session 数；
- 最大估算空间；
- 脱敏字段规则。

默认保留建议：最近 7 天或 100 个 Session，以先达到的限制为准。空间阈值应基于 `navigator.storage.estimate()` 结果，不以固定文件大小猜测。

### 5.5 导入导出

操作：

1. 定义包含 `formatVersion` 的导出文档；
2. 导出时包含 Session、Trace、Event 和必要元数据；
3. 导入前执行完整 Schema 校验；
4. 导入数据默认标记为 `imported`，不伪装为当前标签页实时数据；
5. ID 冲突时使用明确策略，不静默覆盖；
6. 大文件采用流式或分批处理，避免锁死面板。

## 6. 验收步骤

1. 写入协议 Fixtures，Session、Trace、Event 数量正确；
2. 同一事件重复写入，数据不重复且汇总不膨胀；
3. 关闭并重新打开 DevTools，历史数据仍可查询；
4. 终止并重新唤醒 service worker，数据仍可查询；
5. 按类型、状态和时间过滤，结果正确且排序稳定；
6. 数据量超过单页大小时，游标分页无重复、无遗漏；
7. 执行保留策略后只删除目标 Session 及其关联数据；
8. 导出后清空，再导入，主要字段和事件数量一致；
9. 导入损坏或未知版本文件时，原数据库不被污染；
10. 设置变更后扩展重启仍能恢复。

## 7. 完成标准

- IndexedDB 是 Trace 数据的唯一事实来源；
- Repository 接口属于 `core`，Chrome 存储适配器属于 `chrome-extensions`；
- Repository API 与 Vue 组件解耦；
- 数据库具备显式版本与迁移机制；
- 分页、清理、导入导出均有测试；
- 用户设置与 Trace 主体数据分开存储；
- 存储失败和空间不足可被用户观察。

## 8. 参考

- [Chrome 扩展中的 Storage 与 IndexedDB](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies)
- [chrome.storage API](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [Extension Service Worker 生命周期](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
