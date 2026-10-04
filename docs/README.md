# Trace Script 开发计划

> 状态：Draft
>
> 最后更新：2026-10-01
>
> 适用范围：Chrome Manifest V3、Nuxt、Vue 3、shadcn/vue

## 1. 文档目的

本目录将 Trace Script 的产品方案拆成可以逐阶段执行和验收的开发任务。每个阶段均包含：

- 阶段目标与范围；
- 前置条件；
- 具体执行任务；
- 推荐操作顺序；
- 交付物；
- 验收标准；
- 风险与边界。

当前计划只描述如何实施，不代表已经完成对应代码。

## 2. 产品目标

Trace Script 是一个嵌入 Chrome DevTools 的 Agent 会话可视化调试工具。网页中的 Agent 应用通过浏览器事件投递 Trace 数据，扩展负责接收、校验、存储和展示。主界面参考 Chrome DevTools Network 面板，提供事件列表、筛选、瀑布时间轴、详情查看、错误定位以及导入导出能力。

第一版默认采用以下技术决策：

- Chrome Manifest V3；
- 使用 `chrome.devtools.panels` 创建真正的 DevTools Panel；
- 网页通过 `window.postMessage` 投递数据；
- content script 负责网页与扩展之间的桥接；
- service worker 负责校验、路由、持久化调度和实时广播；
- IndexedDB 保存 Trace 数据，`chrome.storage.local` 保存用户设置；
- Nuxt 使用客户端 SPA 模式构建面板；
- Vue 3 Composition API、`<script setup lang="ts">`；
- shadcn/vue 提供基础交互组件和主题系统。

## 3. 仓库包职责

当前仓库采用 pnpm workspace。完整边界和依赖规则见[包职责与依赖边界](./00-package-boundaries.md)。开发期间按以下职责组织：

| 包 | 主要职责 |
| --- | --- |
| `@trace-script/core` | 可供 Chrome 和未来其他平台复用的核心函数 |
| `@trace-script/chrome-extensions` | Chrome 插件，包括数据接收、存储适配和 Nuxt DevTools Panel |
| `@trace-script/metadata` | 发布端、核心逻辑和接收端共享的 Schema 结构元素 |
| `@trace-script/sdk` | 面向第三方开发者的数据发布 SDK |
| `@trace-script/shared` | 不含平台和领域语义的共享工具函数 |
| `@trace-script/tsconfig` | 统一 TypeScript 配置，不单独拆分业务阶段 |

`metadata` 是协议 Schema 的唯一来源；`core` 保持平台无关；`sdk` 负责发布；`chrome-extensions` 负责接收、存储和呈现；`shared` 不承担无法分类代码的兜底职责。Panel 属于 `chrome-extensions`，不创建独立 workspace。

## 4. 阶段与依赖关系

| 阶段 | 文档 | 依赖 | 预计工期 |
| --- | --- | --- | --- |
| 0 | [包职责与依赖边界](./00-package-boundaries.md) Review 与范围冻结 | 无 | 1–2 天 |
| 1 | [项目基础与扩展骨架](./01-project-foundation.md) | 阶段 0 | 2–3 天 |
| 2 | [Trace 协议与网页 SDK](./02-trace-protocol-and-sdk.md) | 阶段 1 | 3–4 天 |
| 3 | [扩展数据接收链路](./03-extension-ingestion.md) | 阶段 2 | 3–4 天 |
| 4 | [数据存储与查询](./04-storage-and-query.md) | 阶段 2、3 | 3–4 天 |
| 5 | [DevTools 面板 UI](./05-devtools-panel-ui.md) | 阶段 1、2、3 | 6–8 天 |
| 6 | [调试能力、性能与安全](./06-debugging-performance-security.md) | 阶段 4、5 | 4–6 天 |
| 7 | [测试、打包与发布](./07-testing-and-release.md) | 所有阶段 | 3–4 天 |

单人开发完成可用 MVP 预计需要 4–6 周；如果包含 Chrome Web Store 发布准备和更完整的跨版本迁移测试，按 5–7 周安排更稳妥。

## 5. 里程碑

### M1：数据可达

测试网页发送一个合法事件后，该事件能够出现在 DevTools Panel 中，并能区分当前被检查的标签页。

对应阶段：1–3。

### M2：数据可恢复

面板关闭并重新打开后，仍能查询之前接收的 Session、Trace 和 Event；保留策略和清空操作可用。

对应阶段：4。

### M3：数据可调试

用户能够搜索和筛选事件，查看输入、输出、错误、Timing、关联事件以及原始 JSON。

对应阶段：5–6。

### M4：可交付

核心自动化测试通过，扩展可作为 unpacked extension 安装，生产构建不包含远程执行代码，发布材料齐全。

对应阶段：7。

## 6. 全局完成定义

任何阶段只有同时满足以下条件才可标记为完成：

1. 文档列出的必做任务全部完成；
2. 对外类型和消息均有显式 TypeScript 定义；
3. 错误路径有可观察结果，不静默丢弃数据；
4. 新增功能有与风险相称的测试；
5. `pnpm lint`、类型检查和相关测试通过；
6. 不引入 Manifest V3 禁止的远程代码或 `eval`；
7. 验收记录包含测试环境、步骤和实际结果；
8. 对协议、存储或权限的变更同步更新本目录文档。

## 7. Review 时需要确认的边界

- MVP 只支持 Chrome，Edge 作为兼容性验证目标，Firefox 暂不承诺；
- MVP 只接收当前网页主动发送的 Trace，不主动拦截模型 HTTP 请求；
- 第一版只监听顶层 frame，iframe 支持进入后续版本；
- 页面发送的数据均视为不可信输入；
- 第一版不要求展示模型内部思维链，只展示业务主动提供的日志、摘要和可观察事件；
- 第一版 UI 以事件表格和详情面板为主，Conversation 和 Trace Tree 属于增强功能。

## 8. 官方参考

- [Chrome DevTools 扩展架构](https://developer.chrome.com/docs/extensions/how-to/devtools/extend-devtools)
- [Chrome Content Scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Chrome Message Passing](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)
- [Nuxt Client-side Rendering](https://nuxt.com/docs/3.x/guide/concepts/rendering)
- [shadcn/vue Nuxt 安装](https://www.shadcn-vue.com/docs/installation/nuxt)
