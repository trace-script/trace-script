# 包职责与依赖边界

## 1. 文档目的

本文档固定 Trace Script monorepo 中各 package 的功能背景、允许依赖和禁止事项。后续开发计划、代码 Review 和新增功能均以此边界为准。

## 2. 包职责

### 2.1 `packages/core`

定位：平台无关的核心函数包，为当前 Chrome 插件以及后续其他平台提供可复用能力。

主要内容：

- Trace 事件校验和标准化函数；
- Session、Trace、Event、Span 的关系计算；
- 事件排序、去重、聚合和状态归并；
- 流式 delta 聚合；
- 筛选、查询条件、Timing 和瀑布图计算；
- 导入导出数据的转换和版本迁移；
- Repository 等平台无关接口；
- 脱敏规则的通用执行逻辑。

边界：

- 不使用 `chrome.*`；
- 不访问 DOM、IndexedDB、文件系统或网络；
- 不包含 Vue、Nuxt 和 UI 组件；
- 不负责定义 Chrome 扩展内部消息；
- 输入输出应当可以在浏览器扩展、Web 应用、Node.js 工具和未来其他平台复用。

### 2.2 `packages/chrome-extensions`

定位：完整的 Chrome 插件实现，包括数据接收、后台处理、存储适配和 DevTools Panel。

主要内容：

- Manifest V3；
- content script；
- extension service worker；
- DevTools page 与 `chrome.devtools.panels` 注册；
- Nuxt + shadcn/vue Panel UI；
- Chrome Runtime Port 和内部消息类型；
- IndexedDB Repository 实现；
- `chrome.storage.local` 设置实现；
- 站点授权、权限管理、扩展打包和发布资源。

边界：

- 可以依赖 `core`、`metadata` 和 `shared`；
- 不通过导入 `sdk` 来接收数据；
- 与 SDK 通过 `metadata` 定义的公开消息 Schema 通信；
- Chrome 专属类型和逻辑保留在本包，不能下沉到 `shared`；
- Panel 属于本包内部模块，不新增独立的 `@trace-script/panel` workspace。

### 2.3 `packages/metadata`

定位：共享的 Schema 结构元素，是发布端、核心逻辑和接收端共同遵循的数据契约。

主要内容：

- 协议版本；
- Session、Trace、Event、Span、Actor、Model、Metrics、Error 等 Schema；
- 事件类型、状态和错误码；
- 页面投递消息的 Channel Schema；
- 导入导出文件格式 Schema；
- 从 Schema 推导的 TypeScript 类型；
- 可跨包复用的协议 Fixtures 类型定义。

边界：

- 不包含事件排序、聚合等业务函数；
- 不包含 SDK 发布流程；
- 不包含 Chrome、Vue 或存储实现；
- Schema 应保持平台无关，并作为协议的唯一结构来源；
- 禁止使用无约束 `any` 作为公共数据字段，未知输入使用 `unknown`。

### 2.4 `packages/sdk`

定位：提供给第三方开发者的数据发布 SDK，将符合 `metadata` Schema 的 Trace 数据发布给支持的采集端。当前首要采集端是 Chrome 插件。

主要内容：

- SDK 初始化和配置；
- Session、Trace、Event 和 Span 发布 API；
- `window.postMessage` 浏览器发布适配器；
- 事件批处理、flush 和缓冲；
- 发布前 Schema 检查；
- 发布前脱敏钩子；
- 扩展可用性握手；
- 第三方接入示例和类型声明。

边界：

- 不依赖 `chrome.*`；
- 不包含 DevTools Panel 或接收端逻辑；
- Chrome 插件不存在或未连接时，不得影响第三方宿主应用；
- 默认保持轻量，不直接引入 Chrome 插件实现；
- 可以依赖 `metadata` 与 `shared`，只有确有需要时才复用 `core` 的平台无关函数。

### 2.5 `packages/shared`

定位：共享的通用工具函数包。

主要内容：

- 通用 ID、时间、字符串、数组和对象工具；
- 与业务协议无关的序列化辅助函数；
- 通用错误处理和结果类型；
- 多个 package 确实共同使用的轻量工具。

边界：

- 不放 Trace Schema，Schema 属于 `metadata`；
- 不放 Trace 聚合和查询逻辑，此类逻辑属于 `core`；
- 不放 Chrome 内部消息类型，此类类型属于 `chrome-extensions`；
- 不放 SDK 发布 API；
- 不成为无法分类代码的兜底目录。

### 2.6 `packages/tsconfig`

定位：统一 TypeScript 配置。其职责由目录名称和配置文件直接表达，本开发计划不再单独拆分业务任务。

## 3. 依赖方向

允许的主要依赖关系：

```text
core ───────────────> metadata
core ───────────────> shared

sdk ────────────────> metadata
sdk ────────────────> shared
sdk ──(按需)────────> core

chrome-extensions ──> metadata
chrome-extensions ──> core
chrome-extensions ──> shared
```

明确禁止：

```text
metadata          -X-> core / sdk / chrome-extensions
shared            -X-> metadata / core / sdk / chrome-extensions
core              -X-> sdk / chrome-extensions
sdk               -X-> chrome-extensions
chrome-extensions -X-> sdk
```

`chrome-extensions` 与 `sdk` 不互相导入。双方通过 `metadata` 中的协议和浏览器消息通道协作，避免发布端与接收端实现耦合。

## 4. 数据流与包映射

```text
第三方 Agent 应用
  -> @trace-script/sdk
  -> metadata 定义的 window.postMessage 数据
  -> chrome-extensions/content script
  -> chrome-extensions/service worker
  -> chrome-extensions/IndexedDB adapter
  -> chrome-extensions/Nuxt DevTools Panel

metadata: 定义整条链路的数据结构
core: 提供整条链路可复用的计算和转换函数
shared: 提供多个包共同使用的基础工具
```

## 5. 开发任务归属判断

新增功能时按以下顺序判断：

1. 它是否是共享数据结构？是则进入 `metadata`；
2. 它是否是平台无关的 Trace 计算或转换？是则进入 `core`；
3. 它是否帮助第三方发布数据？是则进入 `sdk`；
4. 它是否依赖 Chrome、DevTools、IndexedDB 或 Panel UI？是则进入 `chrome-extensions`；
5. 它是否是不含领域和平台语义、且至少被两个包真实复用的工具？是则进入 `shared`；
6. 如果仍无法判断，应先重新定义职责，不直接放入 `shared`。

## 6. 阶段任务映射

| 开发阶段 | `metadata` | `core` | `sdk` | `chrome-extensions` | `shared` |
| --- | --- | --- | --- | --- | --- |
| 项目骨架 | 导出入口 | 导出入口 | 导出入口 | Manifest、Nuxt Panel、构建组装 | 导出入口 |
| 协议与发布 | 定义 Schema | 校验、标准化、聚合 | 第三方发布 API | 接入公开消息 Schema | 提供通用工具 |
| 数据接收 | 提供消息结构 | 校验接收数据 | 不参与接收实现 | content、worker、Panel Port | 提供通用工具 |
| 存储查询 | 定义存储 DTO | Repository 接口、查询计算 | 不参与 | IndexedDB 与设置适配 | 提供通用工具 |
| Panel UI | 提供展示类型 | Timing、筛选等纯函数 | 不参与 | Nuxt、Vue、shadcn/vue UI | 提供通用工具 |
| 性能安全 | 定义限制相关结构 | 脱敏和聚合函数 | 发布端批处理与脱敏 | 限流、权限、CSP、虚拟列表 | 提供通用工具 |
| 测试发布 | Schema 测试 | 纯函数测试 | 发布行为测试 | 集成、组件、E2E 和打包 | 工具测试 |

执行时先完成 `metadata` 的共享契约，再并行推进 `core` 和 `sdk`，随后由 `chrome-extensions` 接入。`shared` 只在至少两个包出现真实重复需求时新增工具，不提前堆积候选函数。

## 7. 验收标准

- 每个新增模块都能明确归属一个 package；
- `metadata` 是协议结构的唯一来源；
- `core` 的单元测试不需要浏览器或 Chrome 环境；
- `sdk` 可以在未安装 Chrome 插件的网页中安全运行；
- `chrome-extensions` 不导入 `sdk`；
- Chrome 专属消息、存储和 UI 均保留在 `chrome-extensions`；
- `shared` 中没有 Trace Schema、业务聚合或 Chrome 专属代码；
- 依赖图不存在循环依赖和反向依赖。
