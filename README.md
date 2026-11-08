# KexGo

**一个安静、离线优先的本地音乐播放器。**

不抓取任何音乐平台的音频，不做推荐、社交、评论或直播——产品的中心是「播放」。

**技术栈**：Tauri v2 · Vue 3 + TypeScript · Rust（rodio / symphonia / lofty）

<p align="center">
  <img src="screenshots/player.png" alt="KexGo 播放器" width="900">
</p>

---

## 目录

- [功能一览](#功能一览)
- [截图](#截图)
- [快速开始](#快速开始)
- [数据存储](#数据存储)
- [项目结构](#项目结构)
- [隐私与合规](#隐私与合规)
- [键盘速查](#键盘速查)
- [已知限制](#已知限制)
- [License](#license)

---

## 功能一览

### 播放与曲库
- 拖拽或文件选择导入，支持多选；MP3 / FLAC / M4A / AAC / WAV / OGG / OPUS。
- Rust 音频引擎：独立音频线程 + 250ms 进度事件，支持播放、暂停、拖动、上一首 / 下一首。
- 音量 0–100 显示、10% 吸附、静音恢复上次非零值，恢复时 180ms 线性淡入。
- 播放队列：添加、移除、拖拽排序、打乱、清空，顺序持久化。
- 播放模式：顺序循环 / 单曲循环 / 随机。
- 曲库排序：标题 / 歌手 / 播放次数 / 自定义顺序（可拖动）。
- 基础标签：历史标签补全、多标签 **AND** 筛选、筛选结果一键入队。
- 歌单分享：导出 / 导入带版本号的 JSON（只含元数据、标签、队列顺序、播放模式，不含音频）。

### 歌词与对轴
- 自动关联同名 `.lrc`（UTF-8 / UTF-16 / GB18030 兜底）与同名图片 / `cover.*`，否则读取内嵌封面。
- 逐行高亮与平滑滚动；纯文本歌词可一键进入对轴。
- LRCLIB 开放歌词库查询：优先精确匹配，再列搜索结果。
- 跟打式对轴：空格打点、方向键微调、Z 撤销、R 回退 3 秒、S 保存。
- 反应延迟补偿（默认 `-150ms`）、整体偏移、700ms 自动保存草稿、重启恢复。
- 保存到应用数据目录，可选同时写同目录 `.lrc`；支持另存 / 导出。
- **翻译与注音**：每行独立 sidecar 保存，手动填写翻译、日文假名、全罗马音、韩文罗马音；不修改原 LRC。
  - 日文支持「汉字上方假名」与「全罗马音」两种显示；韩文支持罗马音。
  - 自动生成暂为 provider 占位接口，不依赖任何外部 API 也能使用。

### 稳定性
- 导入和播放前检查真实容器；比如：导入fragmented MP4（分片 MP4）会明确提示不支持并停止解码。
- 启动校验路径、播放前校验可解码性与时长；区分「文件不存在 / 无法读取 / 无法解码 / 无法读取时长」，禁用播放并显示原因。
- 解码线程 panic 被捕获，不会让整个应用退出。

### 设置与个性化
- 深色 / 浅色 / 跟随系统；预设色板 + 主色 / 强调色取色器，自动保证深浅模式下的文字对比度。
- UI 字体、歌词字体、字号；中文 / 西文 / 日文 / 韩文独立 fallback 链，按每行文字脚本自动选择。
- 布局开关与尺寸：曲库侧栏、封面、标签、歌词、侧栏宽度、封面比例。
- 快捷键自定义：播放、上下曲、音量、±5s / ±10s、倍速（按住 / 切换 / Alt+方向键）以及对轴组合键，含冲突检查与恢复默认。
- 右键菜单：可配置显示项与顺序（曲库与队列通用）。
- 暂停策略：瞬时 / 淡出淡入（时长可调），支持单曲覆盖。
- 数据目录迁移：复制到新目录并提示重启，**旧目录不删除**。
- 自定义 CSS：独立 `custom.css`，保存即生效，外部修改自动热重载，出错回滚最后可用版本。

### 桌面集成
- 系统托盘：显示、上一首、播放 / 暂停、下一首、退出；关闭或最小化可隐藏到托盘。
- Windows 媒体键：▶⏸⏭⏮（通过 `tauri-plugin-global-shortcut`）。
- 播放页律动：可关闭的轻量 Canvas 动画，**默认关闭**，不做真实频谱 / RMS 采集。
- 图标统一使用开源 [Lucide](https://lucide.dev)（`@lucide/vue`）。

---

## 截图

| 自定义主色与设置 | 快捷键设置 |
| --- | --- |
| ![设置](screenshots/phase3-settings-colors.png) | ![快捷键](screenshots/phase3-settings-shortcuts.png) |

| 歌词翻译与注音 | 翻译 / 注音编辑 |
| --- | --- |
| ![注音](screenshots/phase3-lyrics-annotations.png) | ![编辑器](screenshots/phase3-lyrics-editor.png) |

<details>
<summary>更多截图</summary>

| 快速对轴 | 队列 |
| --- | --- |
| ![对轴](screenshots/align.png) | ![队列](screenshots/phase2-queue.png) |

| 标签筛选 | 右键菜单 |
| --- | --- |
| ![筛选](screenshots/phase2-library.png) | ![右键菜单](screenshots/phase3-context-menu.png) |

| 数据目录 / 自定义 CSS | 字体设置 |
| --- | --- |
| ![高级](screenshots/phase3-advanced.png) | ![字体](screenshots/phase3-settings-fonts.png) |

| 不支持格式提示 | 文件缺失提示 |
| --- | --- |
| ![不支持](screenshots/import-unsupported.png) | ![文件缺失](screenshots/track-issue.png) |

</details>

---

## 快速开始

### 环境要求

| 用途 | 要求 |
| --- | --- |
| 前端预览 | Node.js ≥ 20、pnpm 10（`corepack enable` 会使用 `packageManager` 指定版本） |
| 桌面构建 | 以上 + Rust stable（**≥ 1.90**）+ MSVC Build Tools + WebView2 |

> Rust 1.90 是 `tauri-plugin-global-shortcut`（媒体键）的最低要求。

### 常用命令

```bash
pnpm install
pnpm dev          # 仅前端预览（含演示曲目）：http://127.0.0.1:1420/?demo=1
pnpm tauri dev    # 完整桌面应用
pnpm test         # 单元测试（LRC / 队列 / 排序 / 标签 / 歌单 JSON / 偏好）
pnpm build        # 类型检查 + 生产构建
pnpm test:ui      # 浏览器 UI 冒烟测试（需先运行 pnpm dev）
pnpm tauri build  # 生成 Windows 安装包（NSIS + MSI）
```

### 首次使用

1. 拖入音频文件，或点击右上角「导入歌曲」。
2. KexGo 会自动关联同名 `.lrc` 和封面；没有歌词时会静默尝试 LRCLIB。
3. 想手动对轴：点「快速对轴」，按空格逐行打点，`S` 保存。
4. 想加翻译 / 注音：歌词栏点「翻译/注音」，格式见[键盘速查](#键盘速查)下的说明。

---

## 数据存储

所有数据默认位于系统应用数据目录（Windows 为 `%APPDATA%\com.kexgo.player`），可在设置 → 高级中迁移。

```
<数据目录>/
├── library.json          # 曲库与设置
├── covers/               # 托管封面
├── lyrics/{id}.lrc       # 托管歌词
├── drafts/{id}.json      # 对轴草稿
├── notes/{id}.json       # 歌词翻译 / 假名 / 罗马音
├── custom.css            # 自定义 CSS
└── custom.last-good.css  # 自定义 CSS 最后可用版本
```

- **原始音频文件永远只读**，曲库只保存绝对路径，不复制、不写入标签。
- 结构变更均为附加字段 + 默认值，旧数据无需手动迁移。
- 数据目录指针存于配置目录的 `location.json`；迁移只复制，不删除旧目录。

---

## 项目结构

```
.
├── src/
│   ├── App.vue                  # 应用骨架、快捷键分发、托盘事件
│   ├── api.ts                   # Tauri invoke 封装 + 浏览器预览 fallback
│   ├── types.ts                 # 共享类型（Track / Settings / Preferences …）
│   ├── stores/app.ts            # 播放器、曲库、队列、偏好等全局状态
│   ├── components/
│   │   ├── LibrarySidebar.vue   # 曲库、排序、标签筛选、右键菜单
│   │   ├── NowPlaying.vue       # 封面、歌曲信息、标签
│   │   ├── LyricsPane.vue       # 歌词滚动、注音与翻译渲染
│   │   ├── PlayerBar.vue        # 播放控制、倍速、音量
│   │   ├── QueueDrawer.vue      # 播放队列
│   │   ├── AlignView.vue        # 快速对轴器
│   │   ├── SettingsModal.vue    # 设置面板
│   │   ├── LyricsNotesModal.vue # 翻译 / 注音编辑器
│   │   └── …
│   └── utils/                   # lrc / queue / library / tags / playlist / shortcuts / preferences
├── src-tauri/
│   └── src/
│       ├── audio.rs             # rodio 音频线程、淡入淡出、倍速
│       ├── commands.rs          # Tauri 命令
│       ├── library.rs           # JSON 曲库、导入、校验
│       ├── lyrics.rs            # LRCLIB 查询
│       └── lib.rs               # 托盘、媒体键、数据目录
├── docs/
│   ├── DESIGN.md                # 设计说明（技术选型、流程、状态机）
│   └── ACCEPTANCE.md            # 验收清单
├── scripts/                     # 演示音频生成、UI 冒烟脚本
└── screenshots/
```

---

## 隐私与合规

- 音乐、歌词、翻译注音、草稿、设置**全部只保存在本机**。
- 无账号、无埋点、无遥测、无在线音频下载。
- 仅在进入曲目或主动点击「找词」时请求 `lrclib.net`；不含任何平台爬虫或批量抓取。
- 原始音频文件只读，KexGo 不修改用户文件标签。

---

## 键盘速查

### 播放器（可在设置 → 快捷键中全部修改）

| 默认键 | 行为 |
| --- | --- |
| `空格` | 播放 / 暂停 |
| `Ctrl + ← / →` | 上一首 / 下一首 |
| `← / →` | 后退 / 前进 5 秒 |
| `Shift + ← / →` | 后退 / 前进 10 秒 |
| `Ctrl + ↑ / ↓` | 音量 ±5% |
| `F`（按住） | 临时加速 |
| `T` | 倍速切换 1× / 1.5× |
| `Alt + ↑ / ↓` | 降低 / 提高倍速 |
| `/` | 聚焦搜索框 |
| `Esc` | 关闭弹窗 / 退出对轴器 |

### 对轴器

| 默认键 | 行为 |
| --- | --- |
| `P` | 播放 / 暂停 |
| `空格` | 给当前行打点并跳到下一行，不打断播放 |
| `← / →` | 当前行 ±100ms |
| `Shift + ← / →` | ±10ms |
| `Ctrl + ← / →` | ±500ms |
| `Z` | 撤销 |
| `R` | 回退 3 秒 |
| `S` / `Ctrl + S` | 保存 LRC |
| `Esc` | 返回播放器（草稿已自动保存） |

> 以上均为默认值，可在设置 → 快捷键中自定义，重复绑定会提示冲突。

### 注音格式

在「翻译 / 注音」编辑器中：

- 假名：`沈[しず]むように溶[と]けて` —— 方括号只标注对应的汉字。
- 罗马音：整行填写 `shizumu you ni tokete`。
- 韩文罗马音：填入「罗马音」一列。
- 显示模式在设置 → 字体 → 歌词注音显示切换：关闭 / 汉字上方假名 / 全罗马音。

---

## 构建与发版

### 本地

```bash
pnpm install
pnpm test
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml --lib
pnpm tauri build
```

产物位于 `src-tauri/target/release/bundle/`（NSIS `.exe` 与 MSI `.msi`）。

---

## 已知限制

- 仅 Windows 为主要验证平台；macOS / Linux 未做专门适配（托盘、媒体键行为可能不同）。
- 自动生成翻译 / 注音为占位接口，当前需手动填写。
- 播放页律动为装饰性动画，不反映真实音频电平。
- 队列按 trackId 去重，同一首歌不能在队列中重复出现。
- 对轴器固定使用深色界面，以保持一致的对轴观感。
- 浏览器预览模式不创建系统托盘、不读取本地文件系统。
- 媒体键与托盘菜单的运行时行为需在真实桌面环境验证，CI 只验证编译与单测。

---

## License

代码以 MIT 许可发布（见 [LICENSE](LICENSE)）。

KexGo 仅用于播放用户自己拥有或有权播放的本地音乐文件，不提供任何音频来源。
