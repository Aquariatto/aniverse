# AniVerse —— 应用层接口设计说明

> 课程作业 · 应用层模块搭建与前端交互实现
> 作者：申锦豪
> 对应代码：`frontend/src/`（前端）、`frontend/server/`（服务层）
> 运行方式：`python start.py` → http://127.0.0.1:8787

---

## 一、UI 需求分析

先把界面拆成"页面 → 需要什么数据 → 需要什么操作"，再反推接口。AniVerse 共有 10 个页面，
其中 6 个是数据密集型交互页（要读写状态），4 个是浏览型页面（只读或轻量写）。

| 页面 | 路由 | 核心数据 | 需要的操作 |
|---|---|---|---|
| 角色大厅 | `/` | 角色列表、当前角色、故事状态 | 切换共鸣角色、召唤新角色、查看系统概览 |
| 陪伴对话 | `/chat/:id` | 当前角色的消息流、角色设定、记忆 | 发消息、生成配图、改角色设定、开启新话题 |
| 剧情模式 | `/galgame/:id` | 场景、情绪、立绘变体、好感度 | 选择回应、推进剧情、触发 CG、切换场景 |
| 剧情世界 | `/story/:id` | 世界状态、剧情回合记录 | 输入行动 → 返回叙事 |
| 记忆空间 | `/memory/:id` | 记忆条目 + 向量检索结果 | 语义搜索、新增/编辑/删除记忆 |
| 我的图库 | `/gallery` | 素材列表、收藏状态 | 上传、在线生图、收藏、删除、下载 |
| 追番清单 | `/catalog` | 番剧数据（远程）、收藏与进度 | 搜索、筛选、加入清单、更新进度 |
| 数据仪表盘 | `/dashboard` | 聚合统计 | 只读 |
| 提醒 | `/reminders` | 提醒条目 | 增删、完成、自然语言解析时间 |
| 创建角色 | `/create` | 表单状态 | 提交 → 生成新角色 |
| 全站音乐播放器 | 所有页面顶部 | 当前歌曲、播放进度、内置歌单、搜索结果 | 播放/暂停、上下首、拖动进度、搜索点播 |

**从 UI 需求推出三类接口需求：**

1. **状态读写类**：角色、消息、记忆、素材、提醒、追番清单 —— 需要统一的读写接口和持久化策略；
2. **AI 生成类**：对话回复、剧情演绎、图像生成、提示词润色 —— 需要异步接口 + 超时/重试/降级；
3. **检索计算类**：记忆语义检索、场景选择、番剧远程检索、歌曲搜索与可播性探测 —— 需要"输入 → 排序/过滤 → 输出"的接口。

另有一个**跨页面常驻**的诉求：音乐播放器在每个页面都在，且切页面时不能中断播放。
这决定了它不能放进 Pinia store（组件卸载即销毁），而要用模块级单例托管 `<audio>` 与播放状态。

---

## 二、应用层分层

```
┌─────────────────────────────────────────────────────────┐
│ 视图层  views/*.vue、components/*.vue                     │
│   只负责渲染与事件绑定，不直接 fetch、不直接写 localStorage │
└───────────────┬─────────────────────────────────────────┘
                │ 调用 action / 读取 state
┌───────────────▼─────────────────────────────────────────┐
│ 应用层  stores/app.ts（Pinia，唯一状态源）                 │
│   状态管理 · 业务编排 · 持久化 · 错误兜底                  │
└───────────────┬─────────────────────────────────────────┘
                │ 调用数据访问函数
┌───────────────▼─────────────────────────────────────────┐
│ 数据访问层  src/data/                                     │
│   aiApi（对话/剧情）· image（压缩）· affinity（等级派生）  │
│   galgameAssets（场景/情绪/变体）· assets（缩略图）        │
│   mock（初始数据）· seiraPersona（人设提示词）             │
└───────────────┬─────────────────────────────────────────┘
                │ 同源 HTTP  fetch('/api/...')
┌───────────────▼─────────────────────────────────────────┐
│ 服务层  server/index.mjs（零依赖 Node http）               │
│   静态资源 + API 代理 + 提示词编排 + 降级逻辑              │
└───────────────┬─────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────┐
│ 上游服务  DeepSeek（对话）· Cloudflare bge-m3（向量）      │
│           图像生成服务 · AniList GraphQL（番剧数据）        │
└─────────────────────────────────────────────────────────┘
```

**分层的三条硬约定：**

1. **视图不持有业务状态**：组件里没有 `fetch`、没有 `localStorage.setItem`，全部走 store；
2. **store 不直接拼提示词**：提示词放在 `server/` 或 `data/seiraPersona.ts`，store 只传结构化参数；
3. **数据访问层无状态**：`src/data/*` 里的函数要么是纯函数（压缩、等级、缩略图），要么是无副作用的请求封装，方便单测。

**一个例外：音乐播放器**。它需要跨路由存活，因此用模块级单例（`src/data/music.ts` 顶层 `ref` + 一个 `new Audio()`）
托管播放状态，页面组件只订阅；这样切页面不会重载音频，也不会出现两个 `<audio>` 同时响。

---

## 三、状态模型（TypeScript 接口）

```ts
interface Character {
  id: string
  name: string
  title: string
  avatar: string
  color: string
  affinity: number            // 0–100
  level: string               // 由 affinity 派生：心动/亲近/熟悉/陌生
  tags: string[]
  status: 'online' | 'away'
  favorite?: boolean
  personaPrompt?: string      // 角色设定，可在对话页编辑
}

interface Message {
  id: number
  role: 'user' | 'assistant' | 'system'
  content: string
  time: string
  emotion?: string
  images?: string[]           // base64，落盘前按预算裁剪
}

interface Memory {
  id: number
  characterId: string
  content: string
  date: string
  tags: string[]
  score?: number              // 语义检索得分（0–1）
  embedding?: number[]        // 1024 维，仅内存
}

interface Asset {
  id: number
  title: string
  image: string               // URL 或 dataURL
  tags: string[]
  size: string
  favorite?: boolean
  source?: 'upload' | 'ai' | 'builtin'
}

interface Reminder {
  id: number
  characterId: string
  title: string
  dueAt: string               // ISO 时间
  repeat: string              // 无 / 每天 / 每周
  done: boolean
}

interface WatchlistItem {
  id: number
  title: string
  cover: string
  status: '在看' | '想看' | '已看'
  progress: number
  tags: string[]
}

interface MusicSong {
  id: number
  name: string
  artists: string
  album?: string
  durationMs: number
  cover: string
  fee?: number
  score?: number
  playable?: boolean | null   // 服务端探测结果：true 可播 / false 需要会员 / null 未探测
  src?: string                // 内置歌单的本地音源，有值就不再请求接口
}
```

**派生规则（不落库，读时计算）：**

| 好感度区间 | 等级 | 说明 |
|---|---|---|
| ≥ 75 | 心动 | 解锁更亲密的称呼与主动关心 |
| 50–74 | 亲近 | 默认状态 |
| 25–49 | 熟悉 | 语气偏客气 |
| < 25 | 陌生 | 首次见面的距离感 |

---

## 四、应用层接口（Pinia Store）

`stores/app.ts` 对外暴露 **24 个公开 action**，分为五组。

### 4.1 角色与全局

| 接口 | 入参 | 返回 | 副作用 | 主要调用方 |
|---|---|---|---|---|
| `setActiveCharacter(id)` | `string` | `void` | 写 `aniverse.characters.v1`、重建当前会话上下文 | 大厅、侧边栏、对话页 |
| `createCharacter(payload)` | `{name, title, avatar, tags, personaPrompt}` | 新角色 `id` | 追加角色、初始化该角色的消息数组 | 创建页 |
| `updateCharacterProfile(id, payload)` | `{name?, title?, tags?, personaPrompt?}` | `void` | 就地更新、落盘、toast 提示 | 对话页"编辑角色设定"抽屉 |
| `toggleCharacterFavorite(id)` | `string` | `void` | 切换收藏 | 角色卡、图库 |
| `applyAffinity(id, delta)` | `string, number` | `void` | 夹取 0–100、**派生等级**、跨级时 toast | 对话回合、剧情选择 |
| `notify(type, title, message?)` | — | `void` | 推一条 toast（内部方法） | 全部 action |

### 4.2 对话

| 接口 | 入参 | 返回 | 副作用 |
|---|---|---|---|
| `sendMessage(characterId, content, options?)` | `string, string, {images?, emotion?}` | `Promise<Message>` | 1) 检索相关记忆 2) 组装请求 3) 调 `/api/chat/turn` 4) 追加消息 5) 更新好感度/情绪 6) 抽取记忆 |
| `appendUserMessage(characterId, content)` | `string, string` | `void` | 只追加不请求（剧情联动用） |
| `startNewTopic(characterId)` | `string` | `void` | 清空当前会话上下文、保留长期记忆 |

### 4.3 记忆

| 接口 | 入参 | 返回 | 副作用 |
|---|---|---|---|
| `addMemory(payload)` | `{characterId, content, tags}` | `void` | 追加、落盘 |
| `updateMemory(id, patch)` | `number, Partial<Memory>` | `void` | 就地更新 |
| `deleteMemory(id)` | `number` | `void` | 删除、落盘 |

### 4.4 素材与图库

| 接口 | 入参 | 返回 | 副作用 |
|---|---|---|---|
| `addAsset(payload)` | `{title, image, tags, source}` | `void` | 追加、按 1.2MB 预算裁剪 |
| `saveGeneratedAsset(rawImage, options)` | `string, {prompt?, title?, tags?, keepAlpha?, ratio?}` | `Promise<Asset>` | 压缩 → 裁剪 → 入图库 → 返回实体 |
| `attachGeneratedImage(characterId, rawImage, prompt)` | `string, string, string` | `Promise<void>` | 压缩后挂到该角色最近一条消息 |
| `toggleAssetFavorite(id)` / `removeAsset(id)` | `number` | `void` | 收藏 / 删除 |

### 4.5 追番与提醒

| 接口 | 入参 | 返回 | 副作用 |
|---|---|---|---|
| `addToWatchlist(item)` | `WatchlistItem` | `void` | 去重后加入、落盘 |
| `updateWatchlistStatus(id, status)` | `number, string` | `void` | 改状态 |
| `bumpWatchlistProgress(id, delta)` | `number, number` | `void` | 进度 +1 / 标记已看 |
| `addReminder(reminder)` | `Reminder` | `void` | 插入 + 重排定时器 |
| `completeReminder(id)` / `removeReminder(id)` | `number` | `void` | 完成 / 删除 |
| `rescheduleReminder(id)` | `number` | `void` | 按 `repeat` 计算下一次触发时间 |

> 内部还有 4 个持久化辅助函数（`persistMessages / persistCharacters / persistAssets / persistReminders`）
> 和 1 个配额裁剪函数 `trimMessageImages`，不对外暴露。

### 4.6 音乐播放（模块级单例，`src/data/music.ts`）

音乐不走 Pinia：组件卸载不能中断播放，所以用模块顶层 `ref` + 单个 `Audio` 实例托管，
所有页面共享同一份播放状态。对外导出 **10 个函数 + 6 个响应式状态**。

| 接口 | 入参 | 返回 | 说明 |
|---|---|---|---|
| `loadPlaylist()` | — | `Promise<void>` | 拉 `/music/playlist.json`（10 首内置），首曲预挂 `src`，点播放零延迟 |
| `searchSongs(keyword)` | `string` | `Promise<MusicSong[]>` | 调 `/api/music/search`，返回最多 3 条 |
| `playSong(song)` | `MusicSong` | `Promise<void>` | 有本地 `src` 直接播，否则先 `/api/music/url` 解析；失败抛错给 UI |
| `playAt(index)` / `nextTrack()` / `prevTrack()` | `number` | `Promise<void>` | 歌单内切歌（环形，越界回绕） |
| `togglePlay()` | — | `Promise<void>` | 暂停/继续；没挂音源时先解析再播 |
| `seekTo(percent)` | `number` | `void` | 0–100 定位；元数据未就绪时暂存，`loadedmetadata` 后补 |
| `stopMusic()` | — | `void` | 停播并清空当前曲目 |
| `useMusic()` | — | 状态对象 | `current / playing / loading / progress / currentTime / duration / error` |

**副作用**：`ended` 自动续播下一首；当前曲目写入 `aniverse.music.v1`，刷新后仍在。

---

## 五、服务端接口（HTTP，16 条业务接口）

统一约定：

- 全部同源，前端用相对路径 `/api/...`，无需配置域名；
- 返回体统一带 `ok` 字段；失败返回 `{ok:false, error}`，HTTP 状态码 4xx/5xx；
- 服务端持有密钥，密钥**不下发到前端**；
- 单个上游调用超时 30–60s，图像类失败自动重试 3 次；
- 音乐音源走服务端代理，前端不直连第三方域名（避免跨域与防盗链）。

| # | 方法 | 路径 | 入参 | 返回 | 上游 / 降级 |
|---|---|---|---|---|---|
| 1 | GET | `/api/health` | — | `{ok, model, configured}` | 无；`configured` 反映密钥是否就绪 |
| 2 | POST | `/api/chat/turn` | `{characterId, personaPrompt, history[], content, emotion}` | `{reply, emotion, affinityDelta, memory?}` | DeepSeek；失败→前端切本地演示文案 |
| 3 | POST | `/api/galgame/turn` | `{scene, emotion, history[], choice}` | `{narration, emotion, options[]}` | DeepSeek；同上 |
| 4 | POST | `/api/story/turn` | `{input, state}` | `{narration, patch}` | DeepSeek；同上 |
| 5 | POST | `/api/memory/search` | `{query, memories[]}` | `{results:[{id, score}]}` | Cloudflare `bge-m3`；失败→关键词回退 |
| 6 | POST | `/api/image/generate` | `{prompt, size, count, quality, style, background, image?}` | `{ok, images:dataURL[]}` | 图像服务；失败重试 3 次 |
| 7 | POST | `/api/image/refine` | `{prompt}` | `{ok, prompt}` | DeepSeek；3 次重试 |
| 8 | POST | `/api/reminder/parse` | `{text}` | `{title, dueAt, repeat}` | DeepSeek；失败→按关键词猜时间 |
| 9 | POST | `/api/catalog/ai-recommend` | `{tags[], watchlist[], limit}` | `{items[]}` | DeepSeek + 本地番剧库 |
| 10 | GET | `/api/catalog/recommend` | `?limit=` | `{items[]}` | 本地库排序 |
| 11 | GET | `/api/catalog/search` | `?q=` | `{items[]}` | AniList GraphQL + 中文标题翻译缓存 |
| 12 | GET | `/api/catalog/calendar` | `?season=` | `{items[]}` | AniList 当季番 |
| 13 | POST | `/api/catalog/translate` | `{texts[]}` | `{map}` | DeepSeek 批量翻译，结果内存缓存 |
| 14 | GET | `/api/music/search` | `?q=` | `{ok, songs:[{id,name,artists,cover,durationMs,playable}]}` | 第三方音乐接口；多查询合并去重 + 打分 + **并行探测前 5 首可播性** |
| 15 | GET | `/api/music/url` | `?id=` | `{ok, url}` | 解析外链音源；不可播返回 `{ok:false, error}` |
| 16 | GET | `/api/music/stream` | `?id=` + `Range` 头 | 音频流（206 分段） | 代理上游音频，透传 `Range`，支持拖动进度 |

**静态资源接口**：其余路径按 `dist/` 静态文件处理，命中缓存返回 304，文本资源 gzip，
非文本资源（图片/音频）支持 `Range` 分段（浏览大图、拖拽播放进度都依赖它）。

---

## 六、关键交互时序

### 6.1 发送一条消息（含记忆检索）

```
用户输入
  │
  ├─ ChatView 调 store.sendMessage(characterId, content)
  │
  ├─ [应用层] 取该角色最近 N 条消息 + 8 条相关记忆
  │     └─ 记忆相关性：本地向量缓存 → 未命中时 /api/memory/search
  │
  ├─ [应用层] 组装 { personaPrompt, history, content, emotion }
  │
  ├─ [数据层] POST /api/chat/turn
  │     └─ [服务层] 拼 system 提示词 → DeepSeek → 解析 JSON 回复
  │
  ├─ 成功：追加 assistant 消息、更新情绪、按 affinityDelta 调 applyAffinity
  │   失败：追加本地兜底文案 + toast「已切换到本地演示」
  │
  └─ $subscribe 去抖 600ms → 落盘 localStorage（发送中不写，避免抖动）
```

### 6.2 生成图片

```
图库"在线生图" → 填提示词/选比例 → submit()
  │
  ├─ 可选：/api/image/refine 先润色提示词
  ├─ POST /api/image/generate { prompt, size, count, quality, style, background }
  │     └─ 上游偶发返回空数组 → 服务端重试 3 次
  ├─ 得到 base64 → 按目标比例二次裁剪（上游不保证遵守比例）
  ├─ store.saveGeneratedAsset() → 压缩（长边 1024）→ 图库配额裁剪（1.2MB）
  └─ 渲染缩略图（640px WebP），点开才加载大图
```

### 6.3 情绪 / 场景切换

```
玩家点选项 → GalgameView 调 data 层的 requestGalgameTurn(choice)
  │
  ├─ POST /api/galgame/turn → { narration, emotion, options }
  ├─ 结果通过 store 写回（消息流 + 情绪 + 好感度），视图只做渲染
  ├─ normalizeEmotion(emotion) → 映射到 10 种标准情绪
  ├─ 立绘 = characterVariants[emotion][seed % 5]
  │     └─ 只预热「当前 + 下一张」，避免一次拉 5 张
  └─ 场景切换走滞后策略：连续两轮命中同一候选场景才真正切，
        防止模型输出抖动导致背景闪烁
```

### 6.4 音乐搜索与播放

```
点圆形按钮 → 展开面板（环形进度实时跟随 currentTime/duration）
  │
  ├─ 展开「搜索歌曲」→ 输入关键词（350ms 防抖）
  │     └─ GET /api/music/search?q=…
  │           ├─ 多组查询（原词 + 简化词）并行 → 合并去重
  │           ├─ 打分：歌名相似度 + 歌手/厂牌双向包含 + 热度
  │           └─ 并行探测前 5 首可播性 → playable 标记 → 优先返回可播的
  │
  ├─ 点某条结果 → playSong(song)
  │     ├─ 内置歌单：直接 <audio src="/music/xxx.mp3">，本地文件零延迟
  │     └─ 在线歌曲：GET /api/music/url → 服务端解析 → 挂 src → play()
  │
  ├─ 播放中：timeupdate → progress/currentTime 更新 → 环形进度 + 面板进度条
  │     └─ 拖进度条：pointerdown/move/up + setPointerCapture → seekTo(percent)
  │
  └─ ended → nextTrack() → 歌单环形续播
```

---

## 七、错误处理与降级策略

| 场景 | 处理方式 |
|---|---|
| 接口超时 / 5xx | 数据层捕获 → 返回本地演示数据 + toast 提示，界面不白屏 |
| 图像上游返回空 | 服务端重试 3 次，仍失败则前端提示"换一张试试" |
| 未配置密钥 | `/api/health` 的 `configured:false`，前端提示 AI 功能不可用，浏览/本地数据正常 |
| localStorage 超限 | 图片按预算裁剪（消息 2.4MB / 图库 1.2MB），**正文优先保留**，旧图标记为已清理 |
| 记忆检索失败 | 回退关键词匹配，不阻塞对话 |
| 图片上游忽略比例 | 前端按目标比例做居中裁剪，保证卡片不变形 |
| 歌曲需要会员 / 无版权 | 服务端预探测返回 `playable:false`，列表标 `VIP` 角标；点播失败给出提示不静默 |
| 音源返回 HTML（防盗链） | 服务端校验 `Content-Type` 必须为 `audio/*`，否则判定不可播并换下一个结果 |
| 音乐接口不可用 | 内置 10 首本地音源不受影响，仍可正常播放；仅搜索点播不可用 |

---

## 八、前端交互代码位置

| 交互 | 文件 | 说明 |
|---|---|---|
| 全局状态与业务编排 | `src/stores/app.ts` | 24 个 action、持久化、配额裁剪 |
| 对话请求封装 | `src/data/aiApi.ts` | 三个 turn 接口 + 超时/兜底 |
| 发送消息 / 打字机 / 生图入口 | `src/views/ChatView.vue` | 消息流、附件、角色设定抽屉 |
| 剧情模式（场景/立绘/选项） | `src/views/GalgameView.vue` | 情绪映射、场景滞后、CG 触发 |
| 剧情世界 | `src/views/StoryView.vue` | 行动输入 → 叙事 |
| 记忆空间 | `src/views/MemoryView.vue` | 语义搜索、评分标签、增删改 |
| 在线生图工作台 | `src/views/GalleryView.vue` | 参数面板、比例、润色、结果下载 |
| 追番清单 | `src/views/CatalogView.vue` | 搜索/筛选/收藏/进度 |
| 数据仪表盘 | `src/views/DashboardView.vue` | 聚合统计与图表 |
| 提醒 | `src/views/RemindersView.vue` | 自然语言解析 + 定时 |
| 创建角色 | `src/views/CreateView.vue` | 三步表单 |
| 音乐播放器 UI | `src/components/MusicWidget.vue` | 环形进度圆钮 + 弹出面板 + 折叠搜索 |
| 音乐播放状态 | `src/data/music.ts` | 模块级 `<audio>` 单例、播放/切歌/拖动/续播 |
| 内置歌单与音源 | `public/music/` | 10 首 mp3 + 封面 + `playlist.json`（由 `scripts/fetch-playlist.mjs` 生成） |
| 通用组件 | `src/components/` | 角色卡、好感度环、顶栏、侧边栏等 |

---

## 九、验证方式

```bash
# 启动
python start.py            # 打包版：直接起服务
npm run dev                # 源码版：热更新

# 自测
npm run build              # 类型检查 + 构建
node e2e-regression.mjs    # 16 项回归
node e2e-features.mjs      # 功能链路
node e2e-reminder.mjs      # 提醒解析
node e2e-studio.mjs        # 生图工作台
```

接口可用性检查：

```bash
curl http://127.0.0.1:8787/api/health
# {"ok":true,"model":"deepseek-flash","configured":true}
```
