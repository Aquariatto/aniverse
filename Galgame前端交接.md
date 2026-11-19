# AniVerse · Galgame 模式前端交接文档

> 交接给：Kim（前端）
> 目标：在现有 AniVerse 项目里新增一整套 **Galgame 对话模式**，与现有对话系统并存、历史互通、按钮切换。

---

## 一、项目位置

```
C:\Users\shenshen\WorkBuddy AI\2026-11-03-19-48-08\aniverse\frontend
```

- Vue 3 + TypeScript + Vite + Pinia
- 启动：`npm run dev`（注意：5173 可能被占用，Vite 会自动跳到 5174）
- 已有页面：`HallView / ChatView / MemoryView / StoryView / GalleryView / CatalogView / DashboardView / CreateView`
- 状态：`src/stores/app.ts`（Pinia）

---

## 二、素材清单（已生成并标注）

目录：`D:\harness\oc\v2`

| 目录 | 数量 | 规格 | 用途 |
|---|---|---|---|
| `character-transparent/` | 50 | PNG，**真透明底**，941×1672 | 立绘图层 |
| `scene/` | 25 | PNG，16:9 横屏，无人 | 背景图层 |
| `fusion2/` | 49 | PNG，16:9，角色在场景中**做动作** | 剧情 CG |

### 标注文件

`D:\harness\oc\v2\annotations.json`，形如：

```json
{
  "id": "C003",
  "type": "character",          // character | scene | cg
  "emotion": "惊讶",             // 中文情绪
  "pose": "正面站立",
  "tags": ["角色立绘", "透明底PNG", "正面", "全身"],
  "use": "对话头像 / 情绪立绘",
  "file": "D:\\harness\\oc\\v2\\character-transparent\\C003.png"
}
```

`cg` 类型额外带 `location` 与 `action`：

```json
{ "id": "F09-1", "type": "cg", "location": "雨夜街道", "action": "撑透明伞回头", "emotion": "惊讶" }
```

**情绪全集**（立绘立即可用的 10 种）：
`开心大笑 / 害羞脸红 / 惊讶 / 生气嘟嘴 / 难过含泪 / 面无表情 / 困倦打哈欠 / 自信得意 / 兴奋欢呼 / 温柔微笑`

**场景全集**（25 个）：学校教室、现代公寓客厅、便利店、学校天台、图书馆、小咖啡馆、地铁站台、公园长椅、雨夜街道、樱花步道、海边沙滩、学校操场、走廊、黄昏天台、自助洗衣店、夜晚阳台、自习室、超市、人行天桥、河堤、游乐园、车站候车室、书店、宿舍房间、花店。

---

## 三、界面布局（严格按此实现）

```
┌──────────────────────────────────────────────────────────┐
│  [背景图层：scene/*.png，object-fit: cover，z-index 0]    │
│                                                          │
│   ┌───────────────┐                    ┌──────────────┐  │
│   │               │                    │ ① 预设回答 A │  │
│   │   角色立绘     │                    │ ② 预设回答 B │  │
│   │ (透明PNG，左侧) │                    │ ③ 预设回答 C │  │
│   │   bottom-left │                    ├──────────────┤  │
│   └───────────────┘                    │ 输入框  ▶ 发送│  │
│                                        └──────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 对话框（底部横跨）                                    │  │
│  │ 星野织姬：今天的星星很美，要和我一起看看吗？            │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

要点：
1. **立绘在左**，底部对齐，高度约占视口 70-80%，不能被对话框遮挡（对话框压住脚部即可，galgame 常规做法）。
2. **对话框在底部通栏**，半透明深色玻璃 + 圆角，字号 16-18px，行高 1.8。
3. **三个预设回答 + 输入框在对话框上方、偏右**，纵向排列，卡片式。
4. 场景切换用 0.5s 交叉淡入。
5. 立绘切换表情时用 0.25s 淡入 + 轻微上浮，避免硬切。

---

## 四、交互流程（核心）

### 用户提交（点预设 或 输入框回车）

```
1. 前端把用户输入发到后端  POST /api/galgame/turn
2. 后端调 LLM，返回结构化结果：
   {
     "reply": "今天的星星很美，要和我一起看看吗？",
     "emotion": "温柔微笑",
     "scene": "黄昏天台",
     "pose": null,
     "affinityDelta": 2,
     "suggestions": ["好啊，一起看", "我有点累了", "你在想什么？"]
   }
3. 前端按 emotion 换立绘、按 scene 换背景（由 AI 判断）、更新好感度
4. 对话框**只显示当轮这一句**，格式固定：`名字：回答`
5. 把这一轮追加进共享历史
```

### 关键规则

- **场景由 AI 自行判断是否切换**。不要求用户明确说"去海边""回教室"：LLM 依据对话内容（话题转移、时间推进、情绪转折、剧情需要）自行决定，返回 `scene` 就切、不返回就保持原样。前端不做任何提示或询问。
- **对话框只输出当轮角色回答**，不显示历史滚动。历史在数据层保留，界面不滚。
- **回复格式必须带名字前缀**：`星野织姬：xxxxx`
- 三个预设回答由 AI **每轮重新生成**，要贴合上一句语境，不能是固定文案。

---

## 五、好感度系统

项目里已有（`src/stores/app.ts` 的 `character.affinity` + `HallView` 的 `AffinityRing`），**复用，不要新建一套**。

- 每轮由后端返回 `affinityDelta`（整数，可正可负）
- 好感度范围 0-100，超出截断
- 界面表现：对话框右上角或立绘下方一个小进度条，变化时数字滚动 + 条动画
- 建议每轮 +1～+3，深度对话 +5，冲突 -5

---

## 六、与现有对话系统的关系

| 项 | 要求 |
|---|---|
| 模式 | **独立**，Galgame 是一个新页面 `/galgame`（或在 ChatView 内切换视图） |
| 历史 | **共享同一份** `conversation.messages`，切换模式后能看到彼此的内容 |
| 切换 | 顶部按钮「剧情模式 / 对话模式」，切换时保持当前角色 |
| 数据 | 消息体建议扩展字段：`mode: 'chat' \| 'galgame'`、`emotion`、`scene` |

切换按钮放顶部栏右侧，用分段控件样式，当前模式高亮。

---

## 七、需要后端提供的东西

Kim 如果只做前端，请按这个契约对接（可先用 mock）：

```
POST /api/galgame/turn
body: { characterId, userInput, history: [...], currentEmotion, currentScene }
resp: {
  reply: string,
  emotion: string,      // 必须是上面 10 种之一，否则前端兜底「温柔微笑」
  scene?: string,      // 省略 = 保持当前场景（AI 自行判断）
  affinityDelta: number,
  suggestions: [string, string, string]
}
```

前端兜底逻辑：
- `emotion` 不在枚举里 → 用「温柔微笑」
- `scene` 传入但查不到资源 → 保持原场景
- 请求失败 → 对话框显示「……（她好像没听清）」，不崩

---

## 八、资源查找建议

在 `src/data/` 下建一个 `galgameAssets.ts`：

```ts
export const characterImages: Record<string, string> = {
  '开心大笑': '/assets/character/C001.png',
  // ...
}
export const sceneImages: Record<string, string> = {
  '学校教室': '/assets/scene/S01.png',
  // ...
}
```

把图片从 `D:\harness\oc\v2` 拷到 `frontend/public/assets/{character,scene,cg}`，路径对应上表 id。

---

## 九、验收标准

- [ ] 进入 `/galgame` 能看到背景 + 左侧立绘 + 底部对话框
- [ ] 三个预设回答由接口返回并渲染，点击即发送
- [ ] 输入框回车可发送，发送后立绘表情变化
- [ ] 对话框只显示当轮，格式 `名字：回答`
- [ ] 好感度随对话变化并有动画
- [ ] 切换按钮能在两种模式间来回，历史不丢
- [ ] 断网/接口失败不白屏

---

## 十、参考

- 设计语言沿用现有首页：深色玻璃、紫色高光、细描边
- 代码规范沿用现有 `views/` 写法（`<script setup lang="ts">` + scoped style）
- 字数与留白参考 galgame 标准：对话框不超过 2 行，避免遮住立绘主体

---

## 十一、角色设定（Default Character）

### 名字

**星野 织姬**（Hoshino Orihime）  
称号：**星海观测者** / The Stellar Observer

取名理由：
- 「星野」= 星之原野，呼应记忆星轨与宇宙设定
- 「织姬」= 织女星（Vega），七夕传说里在银河边等待的人，暗合"长期陪伴"的主题
- 英文 Orihime 在日语语境里就是织女，念起来也有 galgame 女主的味道

### 形象锚点（生成其他素材时必须保留）

| 项 | 描述 |
|---|---|
| 发 | 银白长发，发梢淡蓝渐变，双股细麻花辫，呆毛 |
| 眼 | 蓝瞳，眼睛高光重 |
| 饰 | 星星发夹（青蓝+金）、月牙耳饰、深蓝蝴蝶结发带（已按需求移除，现仅保留星夹与月牙） |
| 衣 | 米白麻花针织开衫（胸口校徽刺绣）、白衬衫、深蓝缎带领结、藏青百褶裙（蕾丝衬裙边） |
| 袜鞋 | 白色蕾丝口及膝袜（袜口小蝴蝶结）、白色厚底运动鞋 |

### 主视觉（Key Visual）

- 文件：`D:\harness\oc\v2\keyvisual\keyvisual-orihime-half.png`（941×1672，竖版半身，2.4MB）
- 构图：**半身、正面朝向观众**，双手轻扣胸前，与镜头对视；长发被星风吹起
- 表情：**温柔而自信的微笑**（不是害羞，是"我知道你会来"的那种）
- 背景：深紫星云 + 右侧带环巨行星 + 流星轨迹 + 悬浮水晶碎片 + 体积光
- 用途：启动页 / 主菜单 / 角色介绍页首屏 / 对话框立绘（半身更适合常驻）

### 表情与动作资源

见 `character-transparent/` 共 50 张（10 情绪 × 5 姿势），透明底可直接叠场景。

情绪枚举：开心大笑 / 害羞脸红 / 惊讶 / 生气嘟嘴 / 难过含泪 / 面无表情 / 困倦打哈欠 / 自信得意 / 兴奋欢呼 / 温柔微笑

### 建议的默认开场

```
背景：黄昏天台（S14）
立绘：温柔微笑（C010 或对应）
好感度：78
台词：
星野织姬：今天的星星很美，要和我一起看看吗？
```

---

## 十二、项目现状（开工前必读）

### 已有路由

```
/                 HallView        角色大厅（含 Three.js 宇宙场景）
/create           CreateView
/chat/:id         ChatView        现有对话系统
/memory/:id       MemoryView
/story/:id        StoryView
/gallery          GalleryView
/catalog          CatalogView
/dashboard        DashboardView
```

**Galgame 模式请新增 `/galgame/:characterId`**，不要去改上面任何一个页面的路由与结构。

### 已有可复用资产（不要重写）

| 文件 | 作用 | 用法 |
|---|---|---|
| `src/stores/app.ts` | Pinia store，已有 `characters / memories / activeCharacter / storyState / toast` | 好感度、消息历史都放这里，**不要新建 store** |
| `src/components/AffinityRing.vue` | 好感度环（20 行） | 直接用 |
| `src/components/RollingNumber.vue` | **滚动数字**（150 行，现成的） | 好感度变化动画直接用它 |
| `src/components/CharacterCard.vue` | 角色卡 | 不需要 |
| `src/data/mock.ts` | 三个角色，**星野织姬 affinity=78** | 直接沿用，别改数值 |

`mock.ts` 里已经有：
```ts
{ id: 'orihime', name: '星野织姬', english: 'Hoshino Orihime',
  title: '星海观测者', avatar: '/images/orihime-portrait.png',
  color: '#8b76e8', affinity: 78, level: '亲近' }
```

### 代码规范

- `<script setup lang="ts">` + `<style scoped>`
- 样式用紧凑写法（现有文件都是单行 CSS 规则）
- 不引新依赖，用现有的 `lucide-vue-next` 图标
- 提交前跑 `npm run build` 必须过（含 `vue-tsc` 类型检查）

---

## 十三、工作边界（重要，额度有限）

### 你只做这些

1. 新增 `src/views/GalgameView.vue`（页面本体）
2. 新增 `src/data/galgameAssets.ts`（情绪/场景 → 图片路径映射）
3. 新增 `src/data/galgameMock.ts`（**前端 mock 数据**，见下）
4. 在 `main.ts` 加一条路由
5. 在 `AppTopbar.vue` 加模式切换按钮
6. 图片拷到 `public/assets/{character,scene,cg}`

### 你**不要**做这些

- ❌ 不要改 `HallView / ChatView / MemoryView` 等现有页面
- ❌ 不要改 `UniverseScene.vue` / `ConsoleConstellation.vue`（Three.js 部分风险高）
- ❌ 不要写后端接口、不要接 LLM（**接口由我负责，你完成后我接**）
- ❌ 不要新建第二套消息历史或好感度数据结构

### 接口策略：先 mock，后替换

**第一版完全不联网**，用 `galgameMock.ts` 返回固定结构：

```ts
export function mockTurn(input: string): GalgameTurn {
  return {
    reply: '嗯……我明白你的意思。',
    emotion: '温柔微笑',
    scene: null,
    affinityDelta: 2,
    suggestions: ['继续这个话题', '换个话题', '我想问个问题'],
  }
}
```

页面里调 mock，用 `// TODO: 替换为 POST /api/galgame/turn` 标注。
**这样你只写 UI 逻辑，我不返工。**

---

## 十四、交付清单

完成时应存在：

```
src/views/GalgameView.vue          页面（背景层 + 立绘层 + 对话框 + 建议卡 + 输入框）
src/data/galgameAssets.ts          资源映射表
src/data/galgameMock.ts            mock 返回值
public/assets/character/*.png      透明立绘（至少 10 张，每种情绪一张）
public/assets/scene/*.png          背景（至少 10 张）
src/main.ts                        新增路由
src/components/AppTopbar.vue       新增切换按钮
```

---

## 十五、已知坑

1. **端口**：`npm run dev` 时 5173 常被占用，Vite 会跳到 **5174**，看控制台实际输出，别死等 5173。
2. **图片格式**：立绘是**真透明 PNG**，`<img>` 直接叠背景即可，**不要**加白色底或 `mix-blend-mode`。
3. **尺寸**：立绘 941×1672，场景 16:9，CG 16:9。立绘用 `height: 80vh; width: auto; object-fit: contain`，别拉伸。
4. **构建**：`npm run build` 会先跑 `vue-tsc`，类型写错会直接失败。
5. **字体**：项目用系统字体栈，不要引入外部字体。

---

## 十六、验收时我会看

- 只动了上面「你只做这些」里的文件（`git status` 能对上）
- `npm run build` 通过
- galgame 页面在无网络情况下完整可玩（全 mock）
- 切换按钮能在 `/chat/:id` 和 `/galgame/:id` 之间来回，历史不丢
