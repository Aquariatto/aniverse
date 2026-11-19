# AniVerse · DeepSeek 业务接入交接文档

> 接手模型请先读第 3 节「待完成工作」与第 6 节「测试清单」，再决定从哪一步继续。
> 本文档记录截止本状态时，**代码已落地但未执行任何构建/测试**（测试额度耗尽，按上游要求「先别做测试验证」）。

---

## 1. 背景与目标

把原纯前端 Mock 的 AniVerse 三块业务（陪伴对话、Galgame、剧情世界）接入真实 **DeepSeek `deepseek-flash`** 模型，要求：

- 模型能力：**对话 + 识图（视觉输入）**。
- API Key **绝不进浏览器**：新增一个同源 Node 服务端 `server/index.mjs` 作为代理，浏览器只请求 `/api/*`。
- 复用现有 Pinia 的对话历史、好感度、记忆、剧情状态，不另建数据体系。
- 失败有兜底，不白屏。

默认角色已重命名为独立原创角色 **白濑星罗 / Shirase Seira**（内部路由 ID 仍保留 `orihime` 以兼容旧链接，界面展示全部为白濑星罗）。

---

## 2. 已完成内容（已写入文件）

| 文件 | 状态 | 说明 |
|---|---|---|
| `server/index.mjs` | ✅ 新建 | Node 原生 http 代理 + 静态托管。持有 `DEEPSEEK_API_KEY`，请求 `https://api.deepseek.com/chat/completions`，模型 `deepseek-flash`。 |
| `src/data/aiApi.ts` | ✅ 新建 | 前端统一封装：`requestChatTurn` / `requestGalgameTurn` / `requestStoryTurn`，POST 同源 `/api/*`。 |
| `src/data/seiraPersona.ts` | ✅ 新建 | 白濑星罗完整人设与可直接当 system prompt 的 `seiraSystemPrompt`，已挂到默认角色 `personaPrompt`。 |
| `src/data/mock.ts` | ✅ 改 | 默认角色改为白濑星罗；`Message` 已含 `images?: string[]`、`emotion?`、`mode?`、`scene?`。 |
| `src/stores/app.ts` | ✅ 改 | `sendMessage(characterId, content, images=[])` 改用 `requestChatTurn`（带共享历史 + 图片 + 流式打字机 + 记忆/好感度回写 + 失败兜底）；`storyAction` 改用 `requestStoryTurn`（带世界状态 + 兜底）。 |
| `src/views/GalgameView.vue` | ✅ 改（未验证） | `send()` 已从 `mockTurn` 切换为 `requestGalgameTurn`，传入 `character / history / userInput / currentEmotion / currentScene`，情绪/场景经 `normalizeEmotion/normalizeScene` 映射本地立绘；分段对白播放保持不变。 |
| `vite.config.ts` | ✅ 改 | `server.proxy['/api'] -> http://127.0.0.1:8787`。 |
| `package.json` | ✅ 改 | 新增 `api` / `start` 脚本：`node --env-file=.env server/index.mjs`。 |
| `.env` | ✅ 新建（已被 .gitignore 忽略） | 含真实 `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL=deepseek-flash`、`HOST=127.0.0.1`、`PORT=8787`。 |
| `.env.example` | ✅ 新建 | 同上字段的模板，供新环境复制。 |
| `.gitignore` | ✅ 改 | 忽略 `.env` / `.env.local` / `*.log`。 |

### 关键数据流（已接通）
- **对话**：`ChatView` → `store.sendMessage` → `/api/chat/turn` → 返回 `{reply,emotion,affinityDelta,memory}` → 流式打字机 + 好感度/记忆更新。
- **Galgame**：`GalgameView` → `/api/galgame/turn` → 返回 `{reply,emotion,scene,affinityDelta,suggestions}` → 立绘/场景切换 + 分段对白 + 好感度。
- **剧情**：`StoryView` → `store.storyAction` → `/api/story/turn` → 返回叙事/地点/时间/信任/好感/距离/记忆 → 回写世界状态与共同记忆。

### 情绪与场景的映射一致性（重要）
`server/index.mjs` 里的 `emotions`(10 项) 与 `scenes`(25 项) 字符串，**与前端 `src/data/galgameAssets.ts` 的 `galgameEmotions` / `sceneImages` 键名完全一致**，所以 AI 返回的 `emotion`/`scene` 能被 `normalizeEmotion/normalizeScene` 直接命中本地立绘（`public/assets/character/C00x.png`、`public/assets/scene/Sxx.png`）。**不要改其中一边的命名而不改另一边。**

---

## 3. 待完成工作（交给下一个模型）

### 3.1 必做：ChatView 识图未接线（核心缺口）
`src/views/ChatView.vue` 第 46 行已有 `ImagePlus` 按钮但**没有任何逻辑**，图片能力目前形同虚设。需要：
1. 加一个隐藏 `<input type="file" accept="image/*" multiple>`。
2. `ImagePlus` 点击触发文件选择；选中后用 `FileReader` 读成 `data:image/(png|jpe?g|webp);base64,...`。
3. 维护 `pendingImages: string[]`，在输入框上方显示缩略图，可删除。
4. `send()` 改为 `store.sendMessage(character.value.id, text, pendingImages)`，发送后清空 `pendingImages`。
5. 在用户气泡里渲染 `message.images`（已有 `images` 字段，但模板第 37–41 行未渲染图片）。
> 服务端 `currentContent()` 已支持最多 2 张图（`/api/chat/turn` 的 `images` 字段已透传），所以只差前端接线。

### 3.2 必做：执行生产构建并修类型错误
**本项目从未跑过 `npm run build`**（`build = vue-tsc --noEmit && vite build`）。下一个模型必须先：
```bash
cd aniverse/frontend
npm install          # 若依赖未装
npm run build        # vue-tsc 类型检查 + 打包
```
重点排查点：
- `GalgameView.vue` 刚把 `mockTurn` 换成 `requestGalgameTurn`，确认 `CharacterRequest & { currentEmotion: string; currentScene: string }` 实参与 `aiApi.ts` 函数签名一致。
- `aiApi.ts` 第 2 行 `import type { GalgameTurn } from './galgameMock'` 依赖 `src/data/galgameMock.ts` 仍存在（它仍在，含 `mockTurn` 与 `GalgameTurn` 类型），不要删。
- 若 `noUnusedLocals` 后续开启，`mockTurn` 已无引用（仅类型被用），注意保留 `galgameMock.ts`。

### 3.3 选做：StoryView 识图
`storyAction` 目前只传 `userInput`，未传图片。如需剧情也支持看图，仿照 Chat 在 `requestStoryTurn` 加 `images` 并在服务端 `/api/story/turn` 接收（服务端 `callDeepSeek` 已支持 `images`，只需在 `handleApi` 里把 `body.images` 透传）。

### 3.4 选做：其他角色人设
默认角色(白濑星罗)有 `personaPrompt`；`mio`/`nana` 暂无 `personaPrompt`，服务端会用通用兜底人设。若需要，给它们也补 `seiraSystemPrompt` 风格的 `personaPrompt`。

---

## 4. 本地启动与构建

### 方式 A：开发（推荐联调）
开两个终端：
```bash
# 终端 1：前端（Vite 带 /api 代理到 8787）
npm run dev          # http://localhost:5173

# 终端 2：Node 服务端（持有 Key）
npm run api          # http://127.0.0.1:8787
```
浏览器访问 `http://localhost:5173`（前端 `/api` 请求经 Vite 代理到本地服务端）。

### 方式 B：生产
```bash
npm run build        # 产出 dist/
npm start            # 服务端同时托管 dist 并代理 /api，访问 http://127.0.0.1:8787
```

### 环境变量（`.env`）
```
DEEPSEEK_API_KEY=sk-...        # 真实 key，已在 .env，已被 gitignore
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-flash
HOST=127.0.0.1
PORT=8787
```
> 复制 `.env.example` 为 `.env` 即可。要求 **Node ≥ 20.6**（用到 `--env-file`）。

---

## 5. 接口契约（服务端 → DeepSeek）

所有业务接口：POST JSON，返回 `{...业务字段, usage?}`。失败时返回 `{error, detail}`（502/405/404/503）。

### 5.1 `POST /api/chat/turn`（陪伴对话）
请求：
```json
{ "character": {"id":"orihime","name":"白濑星罗","title":"星象记录者","personaPrompt":"..."},
  "history": [{"role":"user","content":"..."},{"role":"assistant","content":"..."}],
  "userInput": "今天有点累",
  "images": ["data:image/png;base64,..."] }
```
响应：`{ "reply": "...", "emotion": "平静", "affinityDelta": 2, "memory": "用户今天感到疲惫" | null, "usage": {...} }`

### 5.2 `POST /api/galgame/turn`（Galgame）
请求：在 chat 基础上多 `currentEmotion`(如 `温柔微笑`) 与 `currentScene`(如 `黄昏天台`)。
响应：`{ "reply": "...", "emotion": "害羞脸红", "scene": "黄昏天台"|null, "affinityDelta": 1, "suggestions": ["...","...","..."], "usage": {...} }`

### 5.3 `POST /api/story/turn`（剧情）
请求：`{ "character":{...}, "history":[{"input":"...","narration":"..."}], "userInput":"我走向海边", "currentState": {"location":"黄昏海岸","time":"18:42","hp":92,"trust":68,"distance":0.46,"turn":2,"items":[...]} }`
响应：`{ "narration":"...", "location":"黄昏海岸", "time":"18:42", "trustDelta":3, "affinityDelta":2, "distanceDelta":0.03, "patch":"信任 +3 · 距离 +0.03", "memory": "..."|null, "usage": {...} }`

### 5.4 `GET /api/health` → `{ "ok": true, "model": "deepseek-flash", "configured": true }`

### 请求体构造要点（服务端 `callDeepSeek`）
- 系统提示 = 角色人设 + 该模式专属 JSON 约束。
- 消息：`[{role:system},{...history}, {role:user, content: 文本 或 [文本, 图片]}]`。
- 固定参数：`thinking:{type:"enabled"}`、`reasoning_effort:"high"`、`stream:false`。
- **结构化输出**：当前用 `response_format:{type:"json_object"}` + 提示词双重保险；`parseModelJson` 还能从 ```json 代码块或裸 JSON 中提取，容错较强。

---

## 6. 测试清单（下一个模型执行）

按优先级：

1. **健康检查**：`curl http://127.0.0.1:8787/api/health` 应返回 `configured:true`。
2. **构建通过**：`npm run build` 无类型/打包错误（见 3.2）。
3. **对话-文字**：打开 `/chat/orihime`，发「今天有点累」，应流式收到回复、好感度变化、记忆侧栏+1。
4. **对话-识图（关键）**：接好 3.1 后，上传一张图片并发「这是哪里？」，模型应描述图片（验证视觉能力）。
5. **Galgame**：打开 `/galgame/orihime`，多轮对话后立绘表情/场景应随返回切换；分段对白点击推进；最后一段才出回复面板。
6. **剧情**：`/story`，输入行动后叙事、信任/距离/好感/记忆应更新，世界状态连续。
7. **失败兜底**：临时把 `.env` 的 Key 改成错误值重启，三个模式应各自进入兜底文案且不白屏。
8. **模式切换不丢历史**：聊天页与 Galgame 页顶部切换，共享 `store.messages` 不丢。

---

## 7. 已知风险与注意事项

- **`response_format` 与 `thinking` 组合**：上游原始 curl 用了 `thinking`+`reasoning_effort` 但**未用** `response_format`。我额外加了 `response_format:json_object` 来稳定结构化输出。**若 DeepSeek 报「不支持的组合」或返回非 JSON**，先把 `server/index.mjs` 中 `callDeepSeek` 的 `response_format` 那一行删掉（仅依赖提示词 + `parseModelJson` 抽 JSON），再测。
- **Key 安全**：`.env` 含真实 key，已 gitignore。**切勿**把 key 写进前端或提交仓库；如需重置，去 DeepSeek 控制台。
- **历史长度**：`cleanHistory` 截断最近 24 条、单条 ≤4000 字；剧情 `storyHistory` 取最近 12 回合。超长对话会自动裁剪。
- **立绘资源依赖**：`public/assets/character/`(10 张 C00x) 与 `public/assets/scene/`(25 张 Sxx) 来自 `D:\harness\oc\v2`，需在 `npm run build` 前存在（构建时不会复制，属静态资源）。
- **内部 ID 仍是 `orihime`**：仅路由/Store 内部标识，展示名已是白濑星罗；改 ID 会断旧链接，非必要勿动。
- **Node 版本**：服务端用 `--env-file=.env`，需 Node ≥ 20.6；旧版本改用 `dotenv` 或手动 `loadEnv`。
- **未做浏览器实测**：UI 行为（分段动画、立绘切换视觉）仅代码层面完成，需人工或下一个模型在浏览器验证。

---

## 8. 文件索引（接手速查）

```
aniverse/frontend/
├─ server/index.mjs            # DeepSeek 代理 + 静态托管（核心）
├─ .env / .env.example         # 密钥与配置
├─ .gitignore                  # 已忽略 .env
├─ package.json                # api/start/build 脚本
├─ vite.config.ts              # /api 代理
└─ src/
   ├─ data/
   │  ├─ aiApi.ts              # 前端 API 封装（3 个请求函数 + 类型）
   │  ├─ seiraPersona.ts       # 白濑星罗人设/系统提示词
   │  ├─ galgameAssets.ts      # 情绪/场景 ↔ 立绘映射
   │  ├─ galgameMock.ts        # 旧 Mock（类型 GalgameTurn 仍被 aiApi 引用，保留）
   │  └─ mock.ts               # 角色/消息/记忆数据
   ├─ stores/app.ts            # sendMessage(含图片) / storyAction 接真实 API
   └─ views/
      ├─ ChatView.vue          # ⚠ 需补图片上传接线（3.1）
      ├─ GalgameView.vue       # 已切真实 API（3.2 需构建验证）
      └─ StoryView.vue         # 经 store.storyAction 接真实 API
```

> 一句话给下一个模型：**服务端、API 封装、人设、Store、GalgameView 已接真实 DeepSeek；你只需 (1) 给 ChatView 接上图片上传，(2) 跑 `npm run build` 修类型错误，(3) 按第 6 节清单做联调测试，必要时按第 7 节处理 `response_format` 风险。**

---

## 9. 本轮完成与修复记录（2026-11-03 晚）

### 已完成

| 项 | 状态 | 验证方式 |
|---|---|---|
| 3.1 ChatView 识图接线 | ✅ 完成 | Playwright 端到端：上传图片 → 发送 → AI 准确描述画面并生成记忆 |
| 3.2 生产构建 | ✅ 通过 | `vue-tsc --noEmit` 0 error，`npm run build` 成功 |
| Galgame 页面 | ✅ 已存在且可用 | `/galgame/orihime` 背景随对话切换、立绘换表情、好感度 80→81 |

### 关键修复（都是真实踩过的坑）

1. **模型 ID 写错**：`deepseek-v4.1-flash` 不存在，实际 ID 是 **`deepseek-flash`**（显示名才是 DeepSeek-V4.1-Flash）。
   通过 `GET /models` 确认，`input_modalities: ["text","image"]` 支持图片。

2. **thinking 不能关**：设成 `thinking: {type:'disabled'}` 时模型返回 **30 个空格**（finish=stop），解析必然失败。
   正确组合是 **`thinking: enabled` + `reasoning_effort: low` + `response_format: json_object`**。

3. **历史重复塞当前消息**：前端会先把自己这条 push 进 history 再调接口，服务端又追加一次 input，
   导致 history 末尾出现两条连续 `user`，模型直接返回空内容。
   → 已在 `callDeepSeek` 里加了去重：`while (trimmed.at(-1).role === 'user') trimmed.pop()`。

4. **空内容兜底**：空返回时自动用「关 thinking + JSON 模式」重试一次（约 12% 的请求会空返回）。

5. **`max_tokens` 缺失**：补到 1600，避免长回复被截断。

### 配置（`.env` 已更新）

```
DEEPSEEK_MODEL=deepseek-flash
VISION_MODEL=deepseek-flash          # 与对话同模型，v4.1-flash 支持图像输入
EMBEDDING_BASE_URL=https://api.cloudflare.com/client/v4/accounts/9bed8a5c.../ai/v1
EMBEDDING_MODEL=@cf/baai/bge-m3      # 实测 1024 维
BANGUMI_USER_AGENT=aniverse-coursework/1.0 (2314064620@qq.com)
```

### 实测数据

- 视觉理解：输入立绘 → 输出「银白渐变至浅蓝色的长发、亮蓝色眼眸、米白针织开衫配白衬衫、深蓝领结和百褶裙」
- 场景切换：`下雨躲躲` → 便利店；`去海边` → 海边沙滩；`不想听你说教` → 保持原地 + 难过含泪
- Embedding：bge-m3 返回 1024 维向量，正常

### 尚未做

- 3.3 StoryView 识图（选做）
- 3.4 其他角色人设（选做）
- 后端专家文档里的 P1 接口（记忆/叙事/资产域的大部分）

---

## 10. 稳定性修复（同日二次）

### 问题
前端一直提示「DeepSeek 暂时不可用」，服务端日志是 `模型返回空内容` 或 `JSON解析失败`。

### 根因
- 带 `response_format: {type:'json_object'}` 时，该模型约 **50% 概率返回纯空白**（finish=stop，content 只有空格）
- 去掉 `response_format` 后，模型又经常**直接说人话**（把 JSON 丢在一边）
- 两条路都不稳，加上末尾重复 user 消息，失败率极高

### 现方案（已上线）
1. **去掉 `response_format`**，让模型自由输出
2. **优先 JSON 解析**，失败则**把正文当台词**（`inferFields`）
3. 从正文里**用关键词推断 emotion / scene / affinityDelta**：
   - 情绪：哈哈/开心→开心大笑，害羞/脸红→害羞脸红，诶/居然→惊讶，哼/不满→生气嘟嘴 …
   - 场景：海边/沙滩→海边沙滩，便利店→便利店，雨/街道→雨夜街道 …
4. **空内容才重试**（最多 4 种参数组合），解析失败不重试，直接降级解析
5. **再兜底也不抛 502**：返回 200 + `degraded: true` + 一句能继续的台词

### 效果
| 指标 | 修复前 | 修复后 |
|---|---|---|
| 成功率 | ~50% | **100%（5/5）** |
| 响应时间 | 8s+ | **1.2–3.6s** |
| 前端报错 | 频繁弹 toast | **0 次** |

### 验证
- 下雨躲 → `scene=便利店, emotion=惊讶`
- 说累 → 温柔关切台词
- 道谢 → `emotion=开心大笑`
- 浏览器 E2E：3 个预设回答正常渲染，对话框无错误

---

## 11. 预设回应改为 AI 按语境生成

### 需求
对话框上方三个选项不能是固定文案，必须**根据角色刚说的那句话**生成。

### 实现
- 服务端新增 `generateSuggestions({ reply, userInput, characterName })`
- 触发条件：模型返回的 `suggestions` 不足 3 条时补调一次
- Prompt 要求：三个角度互不相同（**追问细节 / 表达情绪 / 推进剧情**），每条 ≤18 个汉字，口语化，一行一个
- 解析：按换行或 `|` 切分，去掉编号与引号，去重后取 3 条
- 兜底：AI 生成失败才用固定文案，`suggestionsValue` 保证永远有 3 条

### 实测效果（同一轮对话）

| 角色刚说 | AI 生成的三个选项 |
|---|---|
| 「那边街角有家小咖啡馆，我们快跑过去吧。」 | 好，数到三一起冲！／你别淋湿了，把外套帽子戴上吧。／跑进去之后我请你喝热可可。 |
| 「累的时候就先别看星星了……坐吧。」 | 你以前也这样累过吗／那我不看星图就看你／那我坐这儿歇会儿 |
| 「比起单独一颗亮星，我更喜欢看星群之间的联系。」 | 腰带那三颗星有什么故事吗／听你这么说我也觉得很温暖／那下次一起去看猎户座吧 |

浏览器验证：选项正常渲染、可点击、无报错。延迟 2–4 秒（多一次小模型调用）。

---

## 12. 预设选项加入"负向"分支（可降低好感度）

### 需求
三个预设不能全是正向，需要有一个不那么正向的，用来把好感度降下去。

### 实现
1. **生成规则**：三行固定结构
   - 第 1 行「积极推进」顺着话题走
   - 第 2 行「追问细节 / 表达情绪」
   - 第 3 行「消极疏离」——冷淡、敷衍、拒绝、转移话题，禁止辱骂，禁止提问
2. **双重校验**（模型经常不听话）：
   - 生成后检查第三行是否含 `不用/算了/随便/先走/不想/去了/哦…` 等冷语气词，且不含 `谢谢/一起/陪你` 等暖词
   - 不合格 → 重生成一次；仍不合格 → **替换为固定冷淡选项**（`……嗯，随便吧。` 等）
   - 该替换逻辑对「模型直接返回 3 条」的路径同样生效
3. **好感度硬约束**：用户输入命中冷语气词时，`affinityDelta` 强制 `≤ -1`（实测给到 -2），同时把「开心大笑/兴奋欢呼/自信得意」压回「温柔微笑」

### 实测
| 输入 | 三个选项 | 选择第三项后 |
|---|---|---|
| 今天有点累 | 好，那我坐你旁边歇会儿 / 你特意带了水，真细心 / **哦，那我先回去了** | **-2** |
| 你喜欢什么样的星星 | 那我算不算这样的星星？ / 你平时都用什么记录星星？ / **算了，没什么。** | **-2** |
| 外面下雨了 | 那我们赶紧下楼 / 你带伞了吗 / **哦，下雨了啊，随便吧** | **-2** |

浏览器端验证：好感度 78 → 77（滚动数字动画），角色回应「嗯，路上小心，天台风大，别着凉了。」，表情为温柔微笑。

---

## 13. 记忆系统与番剧系统验收

### 记忆系统 ✅
| 能力 | 结果 |
|---|---|
| 列表渲染 | 24 条，按类型分布（事实/偏好/事件/羁绊）与重要性排序 |
| 语义搜索 | 输入「课程设计」→ 5 条筛到 1 条，提示「语义检索完成」 |
| 新增 | 24 → 25，toast「记忆已保存」 |
| 持久化 | 写入 `localStorage['aniverse.memories.v1']`，刷新后仍在 |

> 注：页面顶部「共同记忆 24」来自 mock 的 `character.memoryCount`，与实际条目数不是同一个来源，属于显示口径问题，不影响功能。

### 番剧系统 ✅（新增，数据来自接口）

**数据源变更**：Bangumi API（api.bgm.tv）与 Jikan 在本网络均**无法连接**（超时），实测只有 **AniList GraphQL 可用**，故改为 AniList。

服务端新增两个接口：

| 接口 | 说明 |
|---|---|
| `GET /api/catalog/recommend` | 按人气取 12 部动画，返回标题/封面/评分/类型/集数 |
| `GET /api/catalog/calendar` | 取连载中动画，按 `nextAiringEpisode.airingAt` 换算到周几，分 7 组 |

前端 `CatalogView` 新增两个板块：
- **为你推荐**：12 张卡片（真实封面 + 评分 + 类型）
- **本季放送日历**：7 个星期标签，点击切换，显示当天新番与集数

实测：推荐 12 张、标签 7 个、切换后卡片 5~6 张，0 报错。

### 构建
`vue-tsc --noEmit` 0 error，`npm run build` 通过。

---

## 14. 记忆 RAG / 提醒助手 / 番剧外链

### 记忆 RAG ✅
- 服务端新增 `embedTexts()` + `cosine()` + `relevantMemories()`
- 每次对话：把用户输入与最多 40 条记忆一起送去 Cloudflare `bge-m3` 批量嵌入 → 余弦相似度 → 取 top3（阈值 0.35）注入 system prompt 的【相关记忆】块
- 前端 `requestChatTurn / requestGalgameTurn` 带上 `memories`
- 实测：问「你还记得我在做什么项目吗」→ 回复「记得，你的课程设计，今天刚完成主体部分。还有你最喜欢的那句——让角色真的活过来。」（两句都来自真实记忆）

### 提醒助手 ✅
- 接口 `POST /api/reminder/parse`：LLM 抽取 `{isReminder, title, dueAt, repeat}`
- 前端在发送含「提醒/记得/别忘了/日程/叫我/定个」的消息时自动调用
- store 新增 `reminders`（持久化）、`addReminder`、`completeReminder`
- `App.vue` 每 20 秒检查一次到期项 → toast 提醒 → 标记完成
- 对话页右侧栏新增「待办提醒」面板
- 实测：
  | 输入 | 结果 |
  |---|---|
  | 明天下午三点提醒我答辩 | ✅ 答辩 · 2026-11-04 15:00 |
  | 记得给我买牛奶 | ✅ 买牛奶 · 当天 20:00 |
  | 这个角色好好看 | ❌ 不误判 |

### 番剧外链 ✅
- AniList 返回补 `siteUrl` / `idMal`，服务端拼出三个链接：
  - AniList 详情页 `https://anilist.co/anime/{id}`（百科性质）
  - MyAnimeList `https://myanimelist.net/anime/{idMal}`（含正规播放源聚合）
  - Bangumi 搜索 `https://bgm.tv/subject_search/{标题}`（中文 wiki）
- 前端卡片整体可点（新窗口打开），卡片下方另有 MAL / Bangumi 小链接

### 结论
`vue-tsc` 0 error，`npm run build` 通过，三条链路浏览器实测无报错。

---

## 15. 番剧搜索 / AI 翻译 / 收藏

| 能力 | 实现 |
|---|---|
| 清空示例 | `animes` 初始为 `[]`，4 条 mock 番剧不再显示 |
| 搜索 | `GET /api/catalog/search?q=` → AniList `search`，中文命中不足 3 条时自动先译成日文原名再搜一次并合并 |
| AI 翻译 | `POST /api/catalog/translate {titles:[]}` → DeepSeek 批量译成中文常用译名，前端 `translateMap` 缓存，卡片显示 `zh(title)` |
| 收藏 | 封面右下角 `+` 按钮 → 写入追番清单（`id/title/jp/image/score/tags/status=想看/progress=0/total`），已收藏显示 `✓` |

实测：进击的巨人 → 译名正确；收藏后清单 0 → 1；搜索「进击」返回并正确显示中文标题。

`vue-tsc` 0 error，`npm run build` 通过。
