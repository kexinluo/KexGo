# KexGo 设计说明

版本：MVP 0.1  
定位：本地优先的极简音乐播放器，快速对轴是内置工具，不是产品主线。

---

## 1. 产品结构和技术选型

### 1.1 一句话原则

- **播放器优先**：默认视图是歌曲、封面、歌词和播放条，不把用户拽进编辑器。
- **本地优先**：音乐只存路径；歌词、封面、草稿才由 KexGo 托管。
- **在线只找词**：使用 LRCLIB 的开放歌词，不下载音频，不碰付费内容与平台接口。
- **五分钟能完成对轴**：只做逐行 LRC，空格跟打，不做字幕软件。

### 1.2 技术栈与理由

| 层 | 选型 | 为什么 |
| --- | --- | --- |
| 桌面壳 | Tauri v2 | 用系统 WebView2，安装包和空载内存显著小于 Electron；Rust 命令边界清晰 |
| 前端 | Vue 3 + TypeScript + Vite | 单页状态简单，SFC 便于将播放器、歌词、对轴器拆成独立视图；打包产物小 |
| 状态 | 轻量 reactive 单例（`src/stores/app.ts`） | MVP 不需要引入 Pinia；避免多一份样板代码 |
| 音频 | Rust `rodio 0.19` + `symphonia` | rodio 负责输出与 Sink，symphonia 提供 MP3 / FLAC / AAC(M4A) / WAV / Vorbis 解码；解码、输出都在 Rust 侧 |
| 元数据 | `lofty 0.18` | 读标题、歌手、专辑、内嵌封面；只读，不改原文件标签 |
| 存储 | JSON（`library.json`） | 单用户本地曲库，数据量通常 < 几百首；比 SQLite 少依赖、便于人工检查与迁移 |
| 在线歌词 | LRCLIB (`lrclib.net`) | 免费、无需 key、同时提供纯文本和同步 LRC，使用条款清晰 |
| 原生对话框 | `rfd` | 文件/封面/LRC 选择与导出，不需要额外前端插件与能力配置 |
| 网络 | Rust `reqwest` | 请求不经过 WebView，避免了 CORS；也方便设置在线的超时 / UA / 结果整理 |

### 1.3 线程模型

```
Vue WebView                         Rust 进程
──────────                          ─────────────────────────────
invoke("play_track") ───────────▶  Tauri command
                                      │  mpsc::send(Play)
                                      ▼
                                   kexgo-audio 专用线程
                                   ├─ rodio OutputStream / Sink
                                   ├─ 解码 symphonia
                                   └─ 每 80ms 刷新 PlayerSnapshot
                                      │
              player:tick 事件 ◀──── kexgo-audio-ticker（250ms）
```

音频设备、`OutputStream`、`Sink` 都只存在于音频线程内，不塞进 Tauri 全局状态，避免 `!Send` / `!Sync` 的平台差异。播放失败通过一 command 的 reply channel 同步返回给前端，而不是只留下“看起来在播放但没有声音”的假状态。

### 1.4 项目结构

```
src/
  api.ts                    浏览器/Tauri 双实现，唯一 I/O 边界
  stores/app.ts             播放、选曲、导入、找词、弹层、toast
  components/               播放器与对轴界面
  utils/lrc.ts              LRC parse / normalize / offset / format
src-tauri/src/
  lib.rs                    AppState、Tauri setup、command 注册
  commands.rs               所有 invoke 命令
  library.rs                曲库、导入、文件托管、草稿、导出
  audio.rs                  独立音频线程 + ticker
  lyrics.rs                 LRCLIB 适配
  models.rs                 camelCase JSON 数据契约
```

### 1.5 关键取舍

- **不把音频复制进应用目录**：几百首音乐会让应用数据膨胀，且用户希望“曲库指向我自己的文件”。封面、LRC 是小的、需要稳定访问的附件，因此复制。
- **不做原生 Sidecar 自动写入**：导入时不覆盖用户原目录；只有用户勾选“同时写入歌曲同目录 .lrc”或主动导出时才写。
- **JSON 而不是 SQLite**：MVP 没有全文搜索、增量同步、事务并发压力。JSON 的原子写入和体积都够用。数据模型预留了后续迁移 SQLite 的字段。
- **不做音频标签写回**：避免误改用户文件；title/artist 可在 KexGo 内编辑，只影响曲库显示。

---

## 2. 数据库 / 本地存储设计

### 2.1 数据目录

Windows 下由 Tauri `app_data_dir()` 提供，通常为：

```
%APPDATA%\com.kexgo.player\
├── library.json
├── covers\
│   └── {trackId}.jpg | .png | .webp
├── lyrics\
│   └── {trackId}.lrc
└── drafts\
    └── {trackId}.json
```

- 原始音频：**只保存绝对路径**，不复制。
- 封面：从同目录图片或内嵌图片复制，避免原图移动导致失效。
- LRC：导入后复制为 `lyrics/{trackId}.lrc`；导出和 sidecar 是额外动作。
- 草稿：以 trackId 命名的 JSON，用于防误关。

### 2.2 `library.json`

```json
{
  "tracks": [
    {
      "id": "d3a5c8c8-...",
      "filePath": "D:\\Music\\林间电台 - 第八号夜车.mp3",
      "title": "第八号夜车",
      "artist": "林间电台",
      "album": "慢速城市",
      "duration": 96.0,
      "coverPath": "C:\\Users\\me\\AppData\\Roaming\\com.kexgo.player\\covers\\d3a5c8c8.png",
      "lrcPath": "C:\\Users\\me\\AppData\\Roaming\\com.kexgo.player\\lyrics\\d3a5c8c8.lrc",
      "lyricsText": "[00:09.50]穿过潮湿的街道\n...",
      "lyricsOrigin": "sidecar",
      "createdAt": 1762180000000,
      "updatedAt": 1762180000000
    }
  ],
  "settings": {
    "lastTrackId": "d3a5c8c8-...",
    "lastPosition": 44.5,
    "volume": 0.78,
    "compensationMs": -150
  }
}
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `id` | UUID，稳定关联封面/LRC/草稿 |
| `filePath` | 原始音频绝对路径；播放时 Rust 从磁盘解码 |
| `title/artist/album` | 标签优先，读不到用文件名；可轻量编辑 |
| `duration` | 秒，lofty 读取，失败时 symphonia 探测，播放后由解码器校正 |
| `coverPath` | 托管封面的本地路径，可为 null |
| `lrcPath` | 托管 LRC 的本地路径，可为 null |
| `lyricsText` | 当前采用的歌词文本（含时间轴或纯文本）；播放视图直接解析它 |
| `lyricsOrigin` | `sidecar` / `lrclib` / `manual` / `unknown` / `embedded` |
| `createdAt/updatedAt` | 毫秒时间戳，仅用于展示与草稿判断 |
| `settings.lastPosition` | 上次播放位置，用于启动恢复 |
| `settings.compensationMs` | 对轴的反应补偿，默认 -150ms |

### 2.3 草稿

```json
{
  "version": 1,
  "trackId": "d3a5c8c8-...",
  "lines": [
    { "id": "lyric-line-1", "text": "穿过潮湿的街道", "timeMs": 9500 }
  ],
  "cursor": 3,
  "compensationMs": -150,
  "savedAt": 1762180000000
}
```

进入对轴器时，仅当草稿与当前歌词的文本序列一致才恢复；否则忽略，避免把旧草稿套到新歌词上。

### 2.4 持久化策略

- 曲库写操作在 Rust 的 `Mutex<LibraryStore>` 内串行执行，结束时写回 `library.json`。
- 播放位置每 5 秒、暂停/切歌时保存，避免每帧写盘。
- 对轴器中的每次改动 700ms 防抖后自动写草稿；关闭对轴器时强制 flush。
- 不做跨设备同步，不做账号体系。

---

## 3. 导入流程与在线歌词查询

### 3.1 导入：一条歌曲的完整流水线

```
用户拖入 / 选择文件
        │
        ▼
过滤扩展名（mp3/flac/m4a/aac/wav/ogg/opus）
        │
        ├─ 曲库里已有同一路径？ ──是──▶ 跳过并汇总
        │
        ▼
读元数据（lofty）
  title / artist / album / duration / embedded cover
        │
        ▼
扫描歌曲同目录
  ├─ 同名 *.lrc？ ──是──▶ utf-8 / utf-16 / gb18030 解码
  ├─ 同名图片、cover.*、folder.*、front.*？ ──是──▶ 作为封面
        │（外部封面优先于内嵌封面）
        ▼
复制封面 ──▶ %APPDATA%/.../covers/{id}.{ext}
复制 LRC ──▶ %APPDATA%/.../lyrics/{id}.lrc
（音频本身仍然只存路径）
        │
        ▼
写 library.json ──▶ 返回 ImportSummary
        │
        ▼
前端选中第一首，自动播放；若没有歌词，静默尝试 LRCLIB
```

关键点：

1. **本地 LRC 优先**：有同名 `.lrc` 就当场解析，不联网。
2. **封面优先级**：同名图片 → `cover.*` / `folder.*` / `front.*` → 内嵌图片 → 用户手动选择。
3. **封面复制**：`copy_cover_from_file` / `copy_embedded_cover` 写应用目录；`file_path` 永不写入原图路径。
4. **失败隔离**：多选导入时，一首损坏不影响其它歌曲；`ImportSummary` 带 `added / skipped / failed`。
5. **编码兜底**：很多中文 LRC 是 GBK/GB18030，Rust 侧先严格 UTF-8，再 UTF-16 BOM，再 GB18030。

核心代码位置：

- 导入：`src-tauri/src/library.rs` → `import_paths` / `import_one`
- 同名检测：`find_sidecar_lrc` / `find_sidecar_cover`
- 元数据与内嵌封面：`read_metadata`
- 前端导入：`src/stores/app.ts` → `chooseAudio` / `importPaths` / `importResult`

### 3.2 找词：在线优先，本地兜底，手动兜底

```
选中一首歌
   │
   ├─ 已有歌词文本？ ──是──▶ 解析并显示
   │
   ▼ 无歌词
自动查询 LRCLIB（每首每会话最多一次，不打断播放）
   │
   ├─ 返回同步 LRC，且时长差 ≤ 6 秒
   │        └─▶ 自动导入 + toast + 可直接进入对轴
   │
   ├─ 返回纯文本 / 时长不匹配 / 无结果
   │        └─▶ 播放器显示“没有找到匹配的歌词”与 CTA
   │
   ▼ 用户点击「找词」
找词弹窗：
   ├─ 精确 /api/get（歌名 + 歌手 + 专辑 + 时长）
   ├─ 再 /api/search，按同步优先、时长接近排序
   ├─ 选择「使用歌词」或「对轴微调」
   ├─ 或粘贴纯文本歌词，清理后进入跟打
   └─ 或手动导入本地 LRC
```

约束与合法性：

- 只调用 LRCLIB，不内置网易云、酷狗、QQ 音乐等平台的音频/歌词爬虫。
- 不绕过付费或会员；不下载或批量抓取平台音频。
- 用户自己提供的 LRC 可以导入，也可再次对轴。
- 在线请求使用明确的 User-Agent，结束即释放连接；没有后台轮询、批量预取。

关键代码位置：

- 后端查询：`src-tauri/src/lyrics.rs` → `search_lrclib`
- 前端自动匹配：`src/stores/app.ts` → `maybeFindLyricsAutomatically`
- 搜索结果与粘贴：`src/components/LyricsSearchModal.vue`

### 3.3 伪代码：后端单首导入

```rust
fn import_one(path) -> Track {
    let meta = read_metadata(path);          // lofty; 失败也不阻止导入
    let (lyrics, lrc_source) = find_sidecar_lrc(path)
        .map(read_text_any_encoding)
        .unwrap_or_default();

    let lrc_path = lrc_source.map(|text| {
        let dest = data_dir.join("lyrics").join(format!("{id}.lrc"));
        fs::write(&dest, text);
        dest
    });

    // 外部同名封面优先，其次读内嵌封面
    let cover_path = find_sidecar_cover(path)
        .and_then(copy_cover)
        .or_else(|| meta.embedded_cover.and_then(copy_embedded_cover));

    let title = meta.title.unwrap_or(filename_title);
    let artist = meta.artist.unwrap_or(filename_artist);
    let duration = meta.duration.or_else(|| probe_duration(path)).unwrap_or(0.0);

    Track { id, file_path: path, title, artist, duration, cover_path, lrc_path, ... }
}
```

### 3.4 伪代码：在线找词

```ts
async function findLyrics(track: Track) {
  const results = await api.searchLyrics({
    trackName: track.title,
    artistName: track.artist,
    albumName: track.album,
    duration: track.duration
  })

  // 自动流程只在时长非常接近时直接采用，避免张冠李戴
  const best = pickBestSynced(results, track.duration)
  if (best?.syncedLyrics) {
    await saveOnlineLyrics(best, { openAligner: false })
    return
  }
  openLyricsSearchModal(results)
}
```

---

## 4. 快速对轴器

### 4.1 目标

3–4 分钟歌曲 5 分钟内完成。用户不需要理解字幕软件，只需要：

1. 按 `P` 播放；
2. 听到每一句开头，按空格；
3. 有偏差时用方向键修；
4. 按 `S` 保存。

### 4.2 状态机

```
                ┌──────────┐
                │  closed  │◀──────────────────────┐
                └────┬─────┘                       │
                  打开对轴（有歌词）                │ Esc / 返回
                     ▼                             │
                ┌──────────┐   读草稿 & 解析歌词    │
                │ preparing│───────────────────────┤
                └────┬─────┘                       │
                     ▼                             │
      ┌─────────────────────────────┐              │
      │          editing            │              │
      │  playing / paused 子状态     │              │
      │  ├─ stamp（空格）            │              │
      │  ├─ nudge（方向键）          │              │
      │  ├─ undo（Z）                │              │
      │  ├─ global-offset（应用）    │              │
      │  └─ draft-save（700ms 防抖） │              │
      └───────┬──────────────┬──────┘              │
              │ S / 保存      │ 返回                │
              ▼              └─────────────────────┘
      ┌──────────┐
      │  saving  │──失败──▶ editing（toast，保留全部编辑）
      └────┬─────┘
           │ 成功写入托管 LRC / 可选 sidecar
           ▼
      ┌──────────┐
      │  saved   │──继续打点──▶ editing
      └──────────┘
```

- `closed → preparing`：解析当前 `lyricsText` 或 `pendingAlignText`，恢复匹配的草稿。
- `editing`：所有打点、微调、撤销、偏移操作都在内存中完成；每次变更 700ms 后写草稿。
- `saving`：保存到托管 LRC；可勾选同时写入原曲目录；草稿清除。
- 播放到结尾：**不让自动下一首抢走对轴会话**；留在当前曲目，用户可保存或关闭。
- 每次变更前 push 一份 `{ lines, cursor }` 到长度上限 120 的撤销栈；撤销恢复整份快照，避免复杂的 command 反演。

### 4.3 键盘设计

| 输入 | 行为 | 实现要点 |
| --- | --- | --- |
| `P` | 播放 / 暂停 | 调 store，音频线程持续工作 |
| `空格` | 给当前行打点，光标自动下一行 | `preventDefault`，不在输入框内触发；播放不暂停 |
| `←/→` | 当前行 ±100ms | 只改当前行；没有时间戳时给出提示 |
| `Shift+←/→` | ±10ms | 优先识别 shift |
| `Ctrl/Cmd+←/→` | ±500ms | 优先识别 ctrl/meta |
| `Z` / `Ctrl+Z` | 撤销上一动作 | 打点、微调、全局偏移共用同一个栈 |
| `R` | 当前播放位置回退 3 秒 | 不改变时间戳 |
| `S` / `Ctrl+S` | 保存 LRC | `preventDefault` 浏览器保存 |
| `Esc` | 返回播放器 | 自动 flush 草稿 |
| 鼠标点击某行 | 跳到该行时间试听 | 未打点则回退到最近上一行 + 0.6s |

打点公式：

```ts
const timeMs = Math.max(0, Math.round(state.position * 1000 + compensationMs))
```

其中 `compensationMs` 默认 `-150`，因为人听到声音再按键存在反应延迟；用户可在右侧实时调整或点预设值。

### 4.4 对轴器界面结构

```
┌─────────────────────────────────────────────────────────────────┐
│ ←  快速对轴 · 歌曲名                 草稿保存中   [撤销 Z] [保存 S] │
├───────────────────────────────────────┬─────────────────────────┤
│ #   时间       歌词              状态   │  封面 · 歌名             │
│ 01  00:09.50   穿过潮湿的街道   当前行  │  00:41.62 / 01:36       │
│ 02  00:17.20   霓虹在后视镜...  已打点  │  ——●————————————         │
│ 03  --:--.--   你说城市像...   未打点  │  ⏪  ▶  ↺   P 播放/暂停  │
│ ...                                   │  [SPACE] 给当前行打点     │
│                                       │  反应延迟补偿  -150 ms   │
│                                       │  整体偏移 [0] [应用到全部] │
│                                       │  快捷键速查               │
│                                       │  ☐ 同时写入同目录 .lrc    │
│                                       │  [导出 LRC] [保存 LRC]    │
├───────────────────────────────────────┴─────────────────────────┤
│ 空格打点并下一行 · 点击行试听            已打点 8 / 13 行          │
└─────────────────────────────────────────────────────────────────┘
```

实现文件：`src/components/AlignView.vue`；核心辅助函数在 `src/utils/lrc.ts`。

### 4.5 全局偏移

```ts
function applyGlobalOffset(deltaMs: number) {
  pushHistory()
  lines = lines.map(line => ({
    ...line,
    timeMs: line.timeMs === null
      ? null
      : Math.max(0, Math.round(line.timeMs + deltaMs))
  }))
  markChanged()
}
```

适用场景：用户手里的 LRC 整体比音频早/晚。整体偏移不改变行数，也不重排列表，因此比逐行修更快。

### 4.6 LRC 导出

标准格式：

```
[mm:ss.xx]歌词文本
```

导出的实现要求：

- 分钟至少两位、秒两位、百分秒两位；超过 99 分钟也能正确处理。
- 只导出已打点的行；未打点行在 UI 中提示数量并跳过。
- 默认按时间升序排序，同一时间保持原顺序。
- 开头可选写入 `[ti:] [ar:] [al:] [by:KexGo]`。
- 统一换行符为 `\n`。

代码摘录：

```ts
export function formatLrc(lines: AlignLine[], metadata?: Metadata): string {
  const body = lines
    .filter((line): line is TimedLine => line.timeMs !== null)
    .sort((a, b) => a.timeMs - b.timeMs)
    .map((line) => {
      const totalSeconds = Math.floor(Math.max(0, line.timeMs) / 1000)
      const centis = Math.floor((line.timeMs % 1000) / 10)
      const stamp = `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:` +
        `${String(totalSeconds % 60).padStart(2, '0')}.${String(centis).padStart(2, '0')}`
      return `[${stamp}]${line.text}`
    })
  return [...header, ...body].join('\n') + '\n'
}
```

保存路径：

1. 主路径：`%APPDATA%\...\lyrics\{trackId}.lrc`（原子更新 `library.json`）。
2. 可选 sidecar：`{原歌曲同目录}\{原文件名}.lrc`，仅当用户勾选。
3. 导出：原生保存对话框，用户决定位置。

### 4.7 草稿与恢复

```ts
watch(lines, scheduleDraft, { deep: true })   // 700ms 防抖
watch(cursor, scheduleDraft)
watch(compensation, scheduleDraft)
onBeforeUnmount(() => dirty && persistDraft())
```

恢复时比对当前歌词文本序列与草稿 `lines[].text` 序列，只有完全一致才采用草稿的时间与光标；这样从“在线 LRC A”切到另一版歌词时不会错误套用旧时间。

---

## 5. MVP 实现计划（三周）

### 第一周：能播放、能导入

- 初始化 Tauri v2 + Vue 3 + Vite + TS。
- Rust 音频线程：`play / pause / resume / seek / volume / stop`，250ms tick 事件。
- 曲库 JSON；拖拽与多选导入；lofty 元数据与时长；文件列表、播放条、当前歌曲视图。
- 自动检测同名 LRC、封面并复制；内嵌封面提取。
- 验收：导入一首 Mp3 后能播放、暂停、拖动；有同名 LRC 时显示歌词。

### 第二周：歌词体验 + 在线找词

- LRC 解析 / 清理 / 当前行高亮 / 平滑滚动。
- LRCLIB `/api/get` + `/api/search`，找词弹窗、结果采纳、纯文本粘贴。
- 手动导入 LRC、修改歌名/歌手、更换封面。
- 自动查找匹配策略（时长差 ≤ 6s 自动采用），失败时优雅降级。
- 草稿模型与自动保存骨架。
- 验收：无本地 LRC 的曲目能查到词或导入纯文本；在线 LRC 可以一键进入对轴。

### 第三周：快速对轴 + 打包质量

- 跟打式对轴器：空格、方向键、撤销、回退、播放控制、列表高亮、进度条。
- 反应延迟补偿、全局偏移、纯文本清理提示。
- 保存到托管目录、可选 sidecar、导出 LRC。
- 自动恢复草稿；结束曲目不自动切歌；所有快捷键在输入框内失效。
- 安装包、图标、空状态与文案打磨，补充单元测试和视觉验收。
- 验收：3–4 分钟歌曲使用空格逐行打点，5 分钟内完成并导出合法 LRC；再次进入可微调。

---

## 6. 第一版明确不做

| 不做 | 原因 |
| --- | --- |
| 逐字 / karaoke 时间轴 | 复杂度直线上升，用户目标只是逐行跟唱 |
| 复杂波形识别、自动吸附 | 对轴器应当轻；波形只留作未来可选增强 |
| Whisper 词级时间戳接入 | 可选能力，MVP 不作为阻塞项；接口层可后续加入 |
| 复杂标签编辑、批量重命名 | 不改原音频；KexGo 只做轻量显示信息编辑 |
| 在线音频下载 / 平台爬虫 | 合规与产品边界 |
| 网易云、酷狗、QQ 音乐接口 | 不接入、不绕过付费 |
| 推荐、社交、评论、直播、广告 | 与“安静听歌”冲突 |
| 多设备云同步、账户系统 | 本地播放器不需要 |
| 复杂歌词渲染特效 | 保持可读性 |
| 专业字幕编辑器功能 | 不做偏移曲线、轨道、关键帧 |

---

## 7. 界面文案建议

### 主界面

- Logo 区：`KexGo` / `LOCAL PLAYER`
- 顶栏状态：`本地曲库` · `不联网也能听，有网就去找词。`
- 曲库标题：`音乐库 01`
- 搜索占位：`搜索歌名或歌手`
- 播放中区块：`NOW PLAYING`
- 歌词空状态：
  - 标题：`让这首歌有词`
  - 描述：`KexGo 先去开放歌词库找同步歌词。找不到也没关系，粘贴歌词，跟着唱一遍就能完成对轴。`
  - 按钮：`在线找词` / `粘贴歌词` / `导入 LRC`
- 自动找词中：`正在 LRCLIB 找歌词`
- 无结果：`没有找到匹配的歌词`
- 无网络：`在线歌词暂时不可用`
- 低干扰状态：`歌词已同步` / `待对轴` / `暂无歌词`

### 空状态

- 大标题：`把喜欢的歌，安静地放起来。`
- 说明：`拖入本地音频文件，KexGo 会自动寻找同名歌词和封面。没有歌词也没关系，跟着唱一遍就能完成对轴。`
- 主按钮：`选择音乐文件`
- 辅助：`或 直接拖进来`
- 特性短句：`01 本地播放` · `02 自动配词` · `03 五分钟对轴`
- 拖拽浮层：`松手，加入 KexGo`
- 拖拽说明：`支持多选。同名 LRC 与封面会自动跟着歌曲一起进来。`

### 导入

- 顶部按钮：`导入歌曲`
- 多选成功：`已导入 N 首歌曲` / `同名 LRC 与封面已自动关联`
- 重复：`这些歌曲已经在曲库里了`
- 部分失败：`另有 N 个文件未能读取`
- 失败 toast：`导入失败` / 具体错误原因

### 找词

- 弹窗标题：`找歌词`
- 来源说明：`LRCLIB 开放歌词库 · 优先同步 LRC · 纯文本也可导入对轴`
- 搜索按钮：`查找` / `查找中`
- 结果标签：`同步 LRC` / `纯文本` / `纯音乐`
- 主操作：`使用歌词` / `对轴微调`
- 无结果：`这次没有找到` / `可以换个写法，或者用你手里的歌词开始手动对轴。`
- 网络失败：`连接歌词库失败`
- 粘贴区标题：`或者，粘贴你手里的歌词`
- 粘贴说明：`自动去掉空行、合并短句，然后进入快速对轴`
- 开始：`开始快速对轴`
- 底部合规：`仅使用开放歌词库，不抓取音乐平台内容`

### 快速对轴

- 标题：`快速对轴`
- 状态：`自动保存已开启` / `草稿保存中…` / `草稿已自动保存`
- 按钮：`撤销` / `保存 LRC` / `导出 LRC`
- 打点卡：`给“当前歌词”打点`
- 补偿标题：`反应延迟补偿`，说明：`打点时间 = 播放时间 + 补偿`
- 偏移标题：`整体偏移`，说明：`已有 LRC 时间整体移动，不逐行修改`
- 行状态：`当前行` / `已打点` / `未打点`
- 未打点警告：`N 行未打点，保存时将跳过`
- sidecar 勾选：`同时写入歌曲同目录 .lrc`，说明：`默认只保存到 KexGo 应用数据目录`
- 恢复草稿：`已恢复上次自动保存的草稿，可以继续打点。`
- 快捷提示：`空格给当前行打点并跳到下一行` · `点击任意行试听`

### 保存成功

- 主标题：`已保存 12 行歌词`
- 托管：`保存在 KexGo 应用数据目录`
- sidecar：`已同步写入歌曲同目录的 .lrc 文件`
- 部分失败：`LRC 已保存到曲库`，附带 warning 说明 sidecar 写入失败
- 导出成功：`LRC 已导出` + 完整路径
- 找不到可保存内容：`还没有时间轴` / `至少给一行歌词打点后再保存`
- 保存失败：`保存失败` + 具体错误
- 封面：`封面已更新` / `已复制到 KexGo 的应用数据目录`
- 信息：`歌曲信息已更新`
- 移除：`已从曲库移除` / `原始音频文件不会被删除`

### 语气原则

- 短、具体、不卖萌。
- 面向动作，不用“智能”“一键革命”等空话。
- 网络失败要说清下一步；不用危险红色吓人。
- 不承诺歌词版权或准确性；明确来源为开放库。
