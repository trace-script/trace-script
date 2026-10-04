# 阶段 5：DevTools 面板 UI

## 1. 阶段目标

使用 Nuxt、Vue 3 和 shadcn/vue 完成可用于日常调试的 Network 风格界面。MVP UI 的核心是：连接状态、Session 选择、事件筛选、事件表格、瀑布时间轴和事件详情。

本阶段优先保证信息密度和调试效率，不追求营销站点式视觉效果。

Panel 位于 `packages/chrome-extensions/panel`，属于 Chrome 插件包内部模块，不单独发布 npm 包。它可以复用 `metadata` 的数据类型和 `core` 的平台无关计算函数，但 Chrome 通信通过本包内的适配层完成。

## 2. UI 原则

- 默认采用紧凑型深色界面，并跟随 DevTools 主题；
- 使用 Geist Sans 展示界面文字，Geist Mono 展示 ID、时间、Token、代码和 JSON；
- 基础颜色通过 CSS Token 定义，状态色保持单一语义；
- 页面级组件只负责组合，业务状态进入 composable 或 store；
- props 向下、events 向上，组件契约使用 TypeScript；
- 列表派生结果使用 `computed`，watcher 只承担副作用；
- 用户提供的数据默认按纯文本渲染，不对未清洗内容使用 `v-html`；
- 第一版完成行为后再引入虚拟列表等性能优化。

## 3. 页面结构

```text
TraceWorkbench
├── TraceToolbar
├── TraceFilterBar
├── SessionSelector
└── TraceSplitView
    ├── TraceTable
    │   ├── TraceTableHeader
    │   └── TraceTableRow
    │       └── TraceWaterfallCell
    └── TraceDetailsPanel
        ├── OverviewTab
        ├── PayloadTab
        ├── TimingTab
        ├── RelationsTab
        └── RawJsonTab
```

## 4. 组件职责与契约

| 组件 | 单一职责 | 主要输入 | 主要输出 |
| --- | --- | --- | --- |
| `TraceWorkbench` | 组合页面区域和连接状态 | 当前标签页上下文 | 无业务事件 |
| `TraceToolbar` | 录制、清空、导入导出和设置入口 | recording、connection、usage | toggle、clear、import、export |
| `SessionSelector` | 选择和搜索 Session | sessions、selectedId | select-session |
| `TraceFilterBar` | 编辑筛选条件 | filter model、available facets | update-filter、reset |
| `TraceTable` | 展示排序后的事件列表 | rows、columns、selection | select、sort、resize-column |
| `TraceTableRow` | 展示单个事件摘要 | row、selected | select、context-action |
| `TraceWaterfallCell` | 绘制相对时间与持续时间 | start、duration、range | hover |
| `TraceDetailsPanel` | 组织事件详情 Tabs | selected event | close、navigate-related |
| `TraceJsonViewer` | 安全展示和检索 JSON | value、search | copy-path、copy-value |
| `TraceEmptyState` | 展示未授权、未连接、无数据等状态 | state | grant-access、retry |

不得让 `pages/index.vue` 同时承担 Port 连接、查询、筛选和复杂 UI。页面入口应只组合 `TraceWorkbench` 和顶层 Provider。

## 5. Composable 划分

建议实现：

- `useTraceConnection`：管理 Panel Port、断线重连和连接状态；
- `useTraceSessions`：加载与选择 Session；
- `useTraceQuery`：处理快照、游标分页和增量事件；
- `useTraceFilters`：维护筛选源状态并派生查询条件；
- `useTraceSelection`：维护当前事件和关联导航；
- `useTraceColumns`：列显示、宽度和排序；
- `usePanelLayout`：详情面板位置、尺寸和持久化；
- `useTraceExport`：导入导出用户流程。

Composable 返回只读状态和显式 action。对于大型事件数组优先使用浅层响应式引用，避免 Vue 深度代理整个 Payload 树。

## 6. shadcn/vue 组件映射

| 产品区域 | 建议组件 |
| --- | --- |
| 工具栏 | Button、Tooltip、DropdownMenu、Separator |
| 筛选栏 | Input、Select、Popover、Command、Badge |
| 主列表 | Table、ScrollArea、Tooltip |
| 分栏 | Resizable Panel |
| 详情内容 | Tabs、ScrollArea、Separator |
| 设置 | Sheet、Form、Switch、Select |
| 危险操作 | AlertDialog |
| 空状态和错误 | Alert、Skeleton、Button |

shadcn/vue 组件源码进入项目后视为本项目代码。只添加实际需要的组件，不一次性安装全部组件。

## 7. 执行任务

### 7.1 建立主题和布局

操作：

1. 定义背景、前景、边框、选中行和状态色 Token；
2. 定义紧凑型字号、行高、间距和圆角；
3. 接入 DevTools 主题或提供深浅色兜底；
4. 完成全屏工作台、工具栏、筛选栏和分栏布局；
5. 确认最小面板宽度下仍可操作。

### 7.2 实现连接与空状态

至少覆盖：

- 尚未授权当前站点；
- 已授权但未检测到 SDK；
- 已连接但尚无事件；
- 正在读取历史数据；
- service worker 连接中断；
- 数据库错误；
- 正常录制中；
- 录制暂停。

### 7.3 实现 Session 与事件表格

表格第一版列：

- Name；
- Type；
- Status；
- Agent；
- Model；
- Tokens；
- Duration；
- Start；
- Timeline。

操作：

1. 支持固定表头和垂直滚动；
2. 支持行选中、键盘上下移动和 Enter 打开详情；
3. 支持列排序、显隐和宽度调整；
4. 新事件到达时保持用户滚动位置；
5. 只有用户位于列表尾部时才自动跟随最新事件；
6. 正在运行、成功、失败和取消状态具有可辨识图标和文本。

### 7.4 实现筛选

操作：

1. 文本搜索 Name、ID 和可索引属性；
2. 筛选 Type、Status、Agent 和 Model；
3. 提供“只看错误”和“清除全部筛选”；
4. 筛选条件可以序列化并恢复；
5. 明确显示当前结果数和总事件数。

### 7.5 实现详情面板

Tabs 内容：

- Overview：类型、状态、模型、Agent、Token、ID 和时间；
- Input/Output 或 Payload：结构化内容；
- Timing：排队、模型、工具和总耗时；
- Relations：父事件、子事件和同一 Trace 相关事件；
- Raw JSON：规范化后的完整事件。

长文本支持复制，JSON 支持折叠、搜索、复制路径和复制值。复制操作应提供可见反馈。

## 8. 验收步骤

1. 打开无权限网页，显示授权引导；
2. 授权并发送 Fixtures，事件表格正确显示；
3. 使用 Type、Status、Agent、Model 和文本条件筛选，数量正确；
4. 键盘可以选择事件并打开详情；
5. 打开模型、工具和错误事件，详情字段与原始数据一致；
6. 点击父子事件链接可以完成关联跳转；
7. 暂停录制后 UI 状态明确，已有数据仍可浏览；
8. 新事件到达时，用户正在阅读的历史位置不会被强制拉到底部；
9. 深浅主题下文字、边框、选中态和错误态均清晰；
10. 面板宽度缩小时，主要操作仍可访问；
11. Payload 中包含 HTML 或脚本字符串时，只显示文本，不执行；
12. 页面刷新、Panel 重连和 Session 切换无未处理异常。

## 9. 完成标准

- Network 风格的主工作流完整；
- 组件边界和 props/emits 契约清晰；
- 页面组件保持轻量；
- 所有主要空状态、加载状态和错误状态均有设计；
- 基础键盘操作和焦点可见性可用；
- 未信任 Payload 不会作为 HTML 执行。
