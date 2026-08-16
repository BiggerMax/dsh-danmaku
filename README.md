# dsh-danmaku

将 DeepSeek Harness **轨迹功能（trajectory）** 的输出以**弹幕**形式实时显示在对话页面中——工具调用、轮次切换、助手回复等事件会像视频弹幕一样从右向左飞过屏幕。

## 架构

纯客户端插件，全部逻辑在浏览器半区：

```
Session 轨迹事件 → Node Definitions → DanmakuBus → overlay.tsx (shell.overlay)
```

- 注册 5 个 `ConversationNodeDefinition`，匹配 `user/message`、`assistant/message`、`tool/call`、`tool/result`、`turn/start`、`turn/end` 事件
- 通过 `ConversationViewDefinition`（target: `danmaku`）将节点增量喂给弹幕总线
- 弹幕层注册到 `shell.overlay` 槽位（点击穿透，覆盖全页面）

## 弹幕类型

| 类型 | 图标 | 边色 | 说明 |
|------|------|------|------|
| 用户消息 | 👤 | 黄色 | 仅直接人类输入，跳过合成上下文 |
| 助手回复 | 🤖 | 绿色 | 最终消息内容摘要 |
| 工具调用 | ⚙️ | 蓝色 | 工具名 + 参数摘要 |
| 工具结果 | ✅/❌ | 绿/红 | 成功/失败结果 |
| 轮次 | 🚀/🏁 | 紫色 | 第 N 轮开始/结束 |

## 控制面板

右上角胶囊形控件（可拖拽）：

- **弹幕开关**：精致的滑动开关，一键切换总开关（开启时绿色渐变 + 辉光）
- **速度滑块**：60–350 px/s，实时调节滚动速度
- **贴边自动收纳**：拖到屏幕边缘 48px 内松手即贴边收起为小标签，悬停/点击自动展开；位置与收纳状态持久化到 localStorage

设置持久化到 `localStorage`（key: `dsh.trajectory-danmaku.settings`）。

## 构建

```bash
npm install          # 安装 dev 依赖（typescript, tsdown, @types/react）
npm run build        # host tsc + client tsdown → lib/
npm pack             # 打包 tgz
```

## 安装与注入

**方式一：dev_inject_plugin（运行时注入，免重启）**

```bash
dev_inject_plugin /path/to/dsh-danmaku
```

**方式二：dev_install_package（持久化到 bundles，重启后自动装配）**

```bash
dev_install_package /path/to/dsh-danmaku
```

注入后刷新页面即可看到弹幕效果。

## 技术细节

- **弹幕轨道**：14 轨道，`argmin` 调度（选最早空闲轨道，匀速无碰撞）
- **CSS 动画**：`translateX(100vw) → translateX(-110%)`，时长 = 距离 / 速度
- **去重**：`buildViewNode` 返回的 key 在 View Builder 中去重，初始/历史回填不弹
- **性能**：`useSyncExternalStore` + `pointer-events: none` 层，不干扰应用交互

## 开发

```
dsh-danmaku/
├── src/
│   ├── index.ts              # host 半区（no-op）
│   └── client/
│       ├── index.tsx         # 客户端入口（注册定义 + 视图 + overlay）
│       ├── bus.ts            # 弹幕事件总线
│       ├── definitions.ts    # 5 个轨迹事件 → 弹幕节点定义
│       ├── format.ts         # ContentBlock → 文本提取
│       ├── settings.ts       # 持久化设置
│       ├── overlay.tsx       # React 弹幕层组件
│       └── types.ts          # 弹幕项类型
├── lib/                      # 构建产物
├── tsconfig.json
├── tsdown.config.ts          # 客户端 bundle 配置（__ModuleLoader__ banner）
├── scripts/build.sh
└── package.json
```