# 阶段 1：项目基础与扩展骨架

## 1. 阶段目标

建立可持续开发的 monorepo 边界和最小 Chrome DevTools 扩展骨架。完成后，开发者应当能够构建扩展、将其加载到 Chrome，并在 DevTools 中看到一个由 Nuxt 渲染的空白 Agent Trace 面板。

本阶段只打通构建与页面入口，不实现正式 Trace 协议和数据展示。

## 2. 前置条件

- 已确认 MVP 使用 Chrome Manifest V3；
- 已确认面板嵌入 Chrome DevTools；
- 已确认 Nuxt 使用 `ssr: false` 的客户端 SPA；
- 已确定包职责，避免协议、Chrome Runtime 和 UI 相互耦合。

## 3. 目标目录

建议在现有 workspace 中形成以下结构：

```text
packages/
  core/
  chrome-extensions/
    extension/
      background/
      content/
      devtools/
      manifest/
      types/
    panel/
      app/
        assets/
        components/
        composables/
        pages/
        utils/
      public/
      nuxt.config.ts
      components.json
  metadata/
  sdk/
  shared/
  tsconfig/
```

`panel` 是 `chrome-extensions` 包中的内部模块，负责 UI 和用户交互，不是独立 workspace。Chrome API 入口、Panel、存储适配和扩展打包均由 `chrome-extensions` 负责。

## 4. 执行任务

### 4.1 冻结 workspace 边界

操作：

1. 为各包补充明确的 `exports` 和构建入口；
2. 以[包职责与依赖边界](./00-package-boundaries.md)作为依赖基线；
3. 将扩展内部通信类型放在 `chrome-extensions/extension/types`，不放入 `shared`；
4. 将共享 Schema、协议版本和公共数据类型集中在 `metadata`；
5. 将平台无关的校验、标准化、排序和聚合函数放在 `core`；
6. 检查现有 `AgentPayload`，决定兼容保留、重命名或迁移到正式事件信封；
7. 在根目录提供统一的 `build`、`dev`、`typecheck` 和 `test` 命令。

交付物：

- 包职责说明；
- workspace 依赖图；
- 可执行的根级开发和构建命令。

### 4.2 在 Chrome 插件包内创建 Nuxt Panel

操作：

1. 在 `packages/chrome-extensions/panel` 建立 Nuxt Panel 模块；
2. 保持它属于 `@trace-script/chrome-extensions`，不加入新的 workspace 包；
3. 配置 Nuxt 客户端渲染 `ssr: false`；
4. 使用静态构建产物，不依赖 Nitro 服务端；
5. 配置相对资源路径，保证页面在 `chrome-extension://` 协议下加载；
6. 加入 Tailwind CSS 与 `shadcn-nuxt`；
7. 初始化 shadcn/vue，并建立 `components/ui` 目录；
8. 建立深色主题基础 Token，但暂不实现完整业务布局；
9. 确认生产构建不加载 CDN 脚本、远程字体或远程执行代码。

Nuxt 页面应保持客户端运行，所有 Chrome API 访问通过显式适配层完成，避免组件直接散落调用 `chrome.*`。

### 4.3 创建 Manifest V3 骨架

操作：

1. 创建 `manifest.json` 生成源文件；
2. 声明 `devtools_page`；
3. 创建本地 `devtools.html` 和注册脚本；
4. 使用 `chrome.devtools.panels.create()` 注册 Agent Trace Panel；
5. 创建空的 service worker 和 content script 入口；
6. 仅声明当前阶段所需的最小权限；
7. 配置开发与生产两套扩展构建目录，避免开发文件进入发布包。

### 4.4 串联构建产物

操作：

1. 按依赖拓扑先构建 `shared` 和 `metadata`，再构建相互独立的 `core`、`sdk`，最后组装 `chrome-extensions` 及其 Nuxt Panel；
2. 将 Panel 静态产物复制或输出到扩展发布目录；
3. 将 manifest、图标、devtools 页面、content script 和 service worker 输出到同一目录；
4. 检查所有资源 URL 均能从扩展根目录解析；
5. 为 watch 模式定义稳定的重新构建顺序。

不建议在实现初期依赖复杂的热更新注入。第一阶段优先保证可重复构建和手动刷新扩展稳定可用。

## 5. 验收步骤

1. 执行根级构建命令，构建过程无错误；
2. 在 `chrome://extensions` 开启开发者模式；
3. 选择构建输出目录加载 unpacked extension；
4. 打开任意网页和该网页的 DevTools；
5. DevTools 顶部出现 Agent Trace 面板；
6. 点击面板后能显示 Nuxt 页面和构建版本信息；
7. 刷新网页、关闭再打开 DevTools，面板仍能正常创建；
8. 扩展 service worker 和面板控制台无未处理异常；
9. 断网后重新打开面板，UI 仍能加载；
10. 检查构建目录，不存在外部远程脚本引用。

## 6. 完成标准

- Chrome 能稳定加载扩展；
- Agent Trace 面板使用 Nuxt 渲染；
- 开发与生产构建均可重复执行；
- 包之间不存在循环依赖；
- UI、Chrome Runtime 和协议层的边界已经固定；
- 本阶段不要求显示 Trace 数据。

## 7. 风险与处理

| 风险 | 处理方式 |
| --- | --- |
| Nuxt 资源使用绝对路径导致扩展页面 404 | 在第一阶段验证生产构建中的 HTML、CSS、JS 路径 |
| Panel 与扩展构建工具重复处理资源 | 约定 Panel 只输出静态资源，由扩展构建统一组装 |
| Manifest 权限过大 | 从最小权限开始，站点访问使用 optional permissions |
| 开发热更新与 MV3 CSP 冲突 | 生产构建作为验收标准，开发模式不放宽发布 CSP |

## 8. 参考

- [Chrome DevTools Panels API](https://developer.chrome.com/docs/extensions/reference/api/devtools/panels)
- [Manifest V3](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
- [Nuxt 静态客户端应用](https://nuxt.com/docs/3.x/guide/concepts/rendering)
- [shadcn/vue Nuxt 安装](https://www.shadcn-vue.com/docs/installation/nuxt)
