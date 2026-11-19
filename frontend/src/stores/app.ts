import { defineStore } from 'pinia'
import { characters, initialMessages, initialMemories, initialAssets, animeList, type Character, type Message, type Memory, type Asset, type WatchlistItem } from '../data/mock'
import { requestChatTurn, requestStoryTurn } from '../data/aiApi'
import { levelOf } from '../data/affinity'
import { compressImage } from '../data/image'

interface Toast { id: number; title: string; message?: string; type: 'success' | 'info' }
interface StoryTurn { input: string; narration: string; time: string; patch?: string }

const now = () => new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
/**
 * 单调递增的本地 id。
 * 原来直接 Date.now()，同一毫秒内连续 push 会撞 id（Message.id 是 v-for 的 key），
 * 撞了之后 find(item => item.id === messageId) 会命中错误的那条。
 */
let idSeed = 0
const uid = () => Date.now() * 1000 + (idSeed++ % 1000)

const MESSAGE_KEY = 'aniverse.messages.v1'
const REMINDER_KEY = 'aniverse.reminders.v1'
export interface Reminder { id: number; characterId: string; title: string; dueAt: string; repeat: string; done: boolean }
function loadPersistedReminders(): Reminder[] | null {
  try { const raw = localStorage.getItem(REMINDER_KEY); return raw ? JSON.parse(raw) : null } catch { return null }
}
export function persistReminders(reminders: Reminder[]) {
  try { localStorage.setItem(REMINDER_KEY, JSON.stringify(reminders)) } catch { /* ignore */ }
}
const MEMORY_KEY = 'aniverse.memories.v1'
const COURSEWORK = /课程|作业|智能系统开发/
function purgeCoursework<T>(list: T): T {
  if (!Array.isArray(list)) return list
  return (list as unknown[]).filter(item => {
    const record = item as { content?: string; text?: string } | null
    return !COURSEWORK.test(String(record?.content || record?.text || ''))
  }) as unknown as T
}
function loadPersistedMemories<T>(): T[] | null {
  try {
    const raw = localStorage.getItem(MEMORY_KEY)
    return raw ? purgeCoursework(JSON.parse(raw)) : null
  } catch { return null }
}
export function persistMemories(memories: unknown) {
  try { localStorage.setItem(MEMORY_KEY, JSON.stringify(memories)) } catch { /* 忽略配额错误 */ }
}
function loadPersistedMessages(): Record<string, Message[]> | null {
  try {
    const raw = localStorage.getItem(MESSAGE_KEY)
    return raw ? purgeCoursework(JSON.parse(raw)) : null
  } catch { return null }
}
/**
 * 消息里可能带 base64 图片（生图 / 上传），单张就好几 MB。
 * localStorage 只有约 5 MB：一旦超了，setItem 抛异常 —— 原来被 catch 吞掉，
 * 表现就是「从某一条开始，刷新后消息全没了」。
 * 所以落盘前给图片做一次预算裁剪：新的留着，旧的标记为已清理，消息正文一定保得住。
 */
const IMAGE_BUDGET = 2.4 * 1024 * 1024
export function trimMessageImages(messages: Record<string, Message[]>): Record<string, Message[]> {
  const copy: Record<string, Message[]> = {}
  for (const [key, list] of Object.entries(messages)) copy[key] = list.map(message => ({ ...message }))
  const withImages = Object.values(copy).flat()
    .filter(message => message.images?.length)
    .sort((a, b) => Number(b.id) - Number(a.id))
  let used = 0
  for (const message of withImages) {
    const bytes = (message.images ?? []).reduce((sum, image) => sum + String(image).length, 0)
    if (used + bytes <= IMAGE_BUDGET) { used += bytes; continue }
    message.images = []
    message.imageDropped = true
  }
  return copy
}
export function persistMessages(messages: Record<string, Message[]>) {
  try { localStorage.setItem(MESSAGE_KEY, JSON.stringify(trimMessageImages(messages))) } catch { /* 忽略配额错误 */ }
}

const CHARACTER_KEY = 'aniverse.characters.v1'

/**
 * 老数据迁移：素材从 PNG 换成 WebP 之后，localStorage 里的角色/素材
 * 还存着 /images/xxx.png 这种老地址，而 PNG 已经移出 public，
 * 请求会落到 SPA fallback 拿回一段 HTML —— 界面表现就是「图片全裂」。
 * 读档时统一改写成 .webp，不用让用户清缓存。
 */
function migrateImageUrl(url: unknown): string {
  if (typeof url !== 'string' || !url) return typeof url === 'string' ? url : ''
  if (!/\.png$/i.test(url)) return url
  if (!url.startsWith('/assets/') && !url.startsWith('/images/')) return url
  return url.replace(/\.png$/i, '.webp')
}

function loadPersistedCharacters(): Character[] | null {
  try {
    const raw = localStorage.getItem(CHARACTER_KEY)
    const list = raw ? JSON.parse(raw) : null
    if (!Array.isArray(list) || !list.length) return null
    return (list as Character[]).map(character => ({ ...character, avatar: migrateImageUrl(character.avatar) }))
  } catch { return null }
}
export function persistCharacters(list: Character[]) {
  try { localStorage.setItem(CHARACTER_KEY, JSON.stringify(list)) } catch { /* ignore */ }
}
/** 关系阶段永远由 affinity 派生；读档时顺手迁移旧数据里写死的 level */
function normalizeCharacters(list: Character[]): Character[] {
  list.forEach(character => { character.level = levelOf(character.affinity).label })
  return list
}

const ASSET_KEY = 'aniverse.assets.v1'
function loadPersistedAssets(): Asset[] | null {
  try {
    const raw = localStorage.getItem(ASSET_KEY)
    const list = raw ? JSON.parse(raw) : null
    if (!Array.isArray(list) || !list.length) return null
    return (list as Asset[]).map(asset => ({ ...asset, image: migrateImageUrl(asset.image) }))
  } catch { return null }
}
/**
 * 图库落盘。
 * 项目内素材是普通路径（很小）；上传/AI 生图是 data URL（单张几百 KB ~ 几 MB）。
 * localStorage 只有约 5 MB，所以本地图按「新的优先」留一个预算，超出的不落盘（刷新后消失，
 * 但不会写出坏图，也不会把消息/记忆一起挤崩）。
 */
const ASSET_IMAGE_BUDGET = 1.2 * 1024 * 1024
export function persistAssets(assets: Asset[]) {
  try {
    let used = 0
    const kept: Asset[] = []
    for (const asset of assets) {
      const image = String(asset.image || '')
      if (!image.startsWith('data:')) { kept.push(asset); continue }
      if (used + image.length > ASSET_IMAGE_BUDGET) continue
      used += image.length
      kept.push(asset)
    }
    localStorage.setItem(ASSET_KEY, JSON.stringify(kept))
  } catch { /* ignore */ }
}

const WATCHLIST_KEY = 'aniverse.watchlist.v1'
function loadPersistedWatchlist(): WatchlistItem[] | null {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY)
    const list = raw ? JSON.parse(raw) : null
    if (!Array.isArray(list)) return null
    return (list as WatchlistItem[]).map(item => ({ ...item, image: migrateImageUrl(item.image) }))
  } catch { return null }
}
export function persistWatchlist(list: WatchlistItem[]) {
  try { localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list)) } catch { /* ignore */ }
}

export const useAppStore = defineStore('app', {
  state: () => ({
    sidebarOpen: false,
    query: '',
    activeCharacterId: 'orihime',
    characters: normalizeCharacters((loadPersistedCharacters() ?? JSON.parse(JSON.stringify(characters))) as Character[]),
    messages: (loadPersistedMessages() ?? JSON.parse(JSON.stringify(initialMessages))) as Record<string, Message[]>,
    memories: (loadPersistedMemories<Memory>() ?? JSON.parse(JSON.stringify(initialMemories))) as Memory[],
    assets: (loadPersistedAssets() ?? JSON.parse(JSON.stringify(initialAssets))) as Asset[],
    reminders: (loadPersistedReminders() ?? []) as Reminder[],
    watchlist: (loadPersistedWatchlist() ?? JSON.parse(JSON.stringify(animeList))) as WatchlistItem[],
    sending: false,
    drawingFor: null as string | null,
    /** 主题：light / dark，存 localStorage */
    theme: (localStorage.getItem('aniverse.theme.v1') === 'dark' ? 'dark' : 'light') as 'light' | 'dark',
    toasts: [] as Toast[],
    storyTurns: [
      { input: '我沿着灯塔留下的旧地图，走向海边。', narration: '黄昏把海面染成温柔的金色。星罗站在防波堤尽头，指尖悬着一小团星光。她回过头，像是已经等了你很久。', time: '第一回合', patch: '地点 → 黄昏海岸' },
      { input: '我把在观测站找到的星图递给她。', narration: '“原来它一直在你那里。”她轻轻展开星图，缺失的第七颗星正闪烁着微光。远处传来潮声，你们之间的沉默不再陌生。', time: '第二回合', patch: '信任 +8 · 获得星图线索' },
    ] as StoryTurn[],
    storyState: { location: '黄昏海岸', time: '18:42', hp: 92, trust: 68, distance: 0.46, turn: 2, items: ['残缺星图', '银色钥匙'] },
  }),
  getters: {
    activeCharacter: (state) => state.characters.find(c => c.id === state.activeCharacterId) ?? state.characters[0],
    characterById: (state) => (id: string) => state.characters.find(c => c.id === id) ?? state.characters[0],
    memoriesByCharacter: (state) => (id: string) => state.memories.filter(m => m.characterId === id),
  },
  actions: {
    /** 只改状态 + 落盘，DOM 的实际切换交给调用方（要配合 View Transition） */
    setTheme(next: 'light' | 'dark') {
      this.theme = next
      document.documentElement.dataset.theme = next
      try { localStorage.setItem('aniverse.theme.v1', next) } catch { /* 隐私模式忽略 */ }
    },
    /** 圆形扩散切主题：从点击位置往外扩 */
    toggleTheme(event?: MouseEvent) {
      const next = this.theme === 'dark' ? 'light' : 'dark'
      const start = (document as unknown as { startViewTransition?: (cb: () => void) => { ready: Promise<void> } }).startViewTransition
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (!start || reduce) { this.setTheme(next); return }
      const x = event?.clientX ?? window.innerWidth - 90
      const y = event?.clientY ?? 36
      const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
      document.documentElement.classList.add('theme-toggling')
      const transition = start.call(document, () => this.setTheme(next))
      transition.ready.then(() => {
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { duration: 520, easing: 'cubic-bezier(.22,1,.36,1)', pseudoElement: '::view-transition-new(root)' },
        )
      }).finally(() => {
        window.setTimeout(() => document.documentElement.classList.remove('theme-toggling'), 620)
      })
    },
    notify(title: string, message = '', type: 'success' | 'info' = 'success') {
      const id = Date.now() + Math.random()
      this.toasts.push({ id, title, message, type })
      window.setTimeout(() => { this.toasts = this.toasts.filter(t => t.id !== id) }, 3200)
    },
    setActiveCharacter(id: string) { this.activeCharacterId = id },
  addReminder(reminder: Reminder) { this.reminders.unshift(reminder); persistReminders(this.reminders) },
  removeReminder(id: number) {
    this.reminders = this.reminders.filter(item => item.id !== id)
    persistReminders(this.reminders)
  },
  completeReminder(id: number) {
    const target = this.reminders.find(item => item.id === id)
    if (target) target.done = true
    persistReminders(this.reminders)
  },
  /** 循环提醒（daily / weekly）到点后不是标完成，而是把 dueAt 推到下一次 */
  rescheduleReminder(id: number) {
    const item = this.reminders.find(entry => entry.id === id)
    if (!item) return false
    const step = item.repeat === 'daily' ? 86400000 : item.repeat === 'weekly' ? 7 * 86400000 : 0
    if (!step) return false
    const base = new Date(item.dueAt).getTime()
    if (!Number.isFinite(base)) return false
    let next = base + step
    const nowMs = Date.now()
    while (next <= nowMs) next += step
    item.dueAt = new Date(next).toISOString()
    item.done = false
    persistReminders(this.reminders)
    return true
  },
  appendUserMessage(characterId: string, content: string) {
    if (!this.messages[characterId]) this.messages[characterId] = []
    this.messages[characterId].push({ id: uid(), role: 'user', content, time: now(), mode: 'chat' } as Message)
    persistMessages(this.messages)
  },
  /** 好感度唯一入口：钳制范围、派生关系阶段、阶段变化时给提示 */
  applyAffinity(characterId: string, delta: number) {
    const character = this.characters.find(item => item.id === characterId)
    if (!character) return null
    const before = levelOf(character.affinity)
    const step = Number(delta)
    character.affinity = Math.min(100, Math.max(0, character.affinity + (Number.isFinite(step) ? step : 0)))
    const after = levelOf(character.affinity)
    character.level = after.label
    persistCharacters(this.characters)
    if (after.label !== before.label) {
      const upgraded = after.min > before.min
      this.notify(upgraded ? '关系升温' : '关系降温', `${before.label} → ${after.label} · ${after.hint}`, upgraded ? 'success' : 'info')
    }
    return character
  },
  /** 角色设定编辑：改完立即写盘，下一轮对话即用新人格 */
  /** 删除角色：连同对话、记忆、提醒一起清掉；至少保留一个 */
  removeCharacter(id: string) {
    if (this.characters.length <= 1) {
      this.notify('至少保留一个角色', '宇宙里总得有个人陪着你')
      return false
    }
    const target = this.characters.find(item => item.id === id)
    if (!target) return false
    this.characters = this.characters.filter(item => item.id !== id)
    if (this.messages && id in this.messages) delete this.messages[id]
    this.memories = this.memories.filter(item => item.characterId !== id)
    this.reminders = this.reminders.filter(item => item.characterId !== id)
    if (this.activeCharacterId === id) this.activeCharacterId = this.characters[0].id
    persistCharacters(this.characters)
    persistMessages(this.messages)
    persistMemories(this.memories)
    persistReminders(this.reminders)
    this.notify('角色已移除', `${target.name} 的对话与记忆一起离开了宇宙`)
    return true
  },
  updateCharacterProfile(id: string, payload: { name?: string; title?: string; tags?: string[]; personaPrompt?: string }) {
    const character = this.characters.find(item => item.id === id)
    if (!character) return
    const name = (payload.name ?? '').trim()
    const title = (payload.title ?? '').trim()
    const persona = (payload.personaPrompt ?? '').trim()
    if (name) character.name = name
    if (title) character.title = title
    if (Array.isArray(payload.tags)) character.tags = payload.tags.map(tag => String(tag).trim()).filter(Boolean).slice(0, 5)
    if (persona) character.personaPrompt = persona
    persistCharacters(this.characters)
    this.notify('角色设定已更新', `${character.name} 从下一句开始会用新的人格回应`)
  },
  /** 把一张 AI 图存进图库：对话里的生图和图库工作台都走这里 */
  async saveGeneratedAsset(rawImage: string, options: { prompt?: string; title?: string; tags?: string[]; keepAlpha?: boolean; ratio?: { width: number; height: number } } = {}) {
    const { url, width, height, cropped } = await compressImage(rawImage, {
      ...(options.keepAlpha ? { mime: 'image/webp' as const } : {}),
      ...(options.ratio ? { ratio: options.ratio } : {}),
    })
    let title = (options.title || '').trim()
    if (!title) {
      const caption = String(options.prompt || '').replace(/[，,、\s]+/g, ' ').trim()
      title = caption ? caption.slice(0, 18) : 'AI 生图'
    }
    this.assets.unshift({
      id: uid(),
      title,
      image: url,
      tags: ['AI 生图', ...(options.tags || [])],
      size: width ? `${width} × ${height}` : 'AI 生成',
      favorite: false,
      source: 'AI 生图',
    })
    persistAssets(this.assets)
    return { url, title, width, height, cropped: Boolean(cropped) }
  },
  removeAsset(id: number) {
    const target = this.assets.find(asset => asset.id === id)
    this.assets = this.assets.filter(asset => asset.id !== id)
    persistAssets(this.assets)
    if (target) this.notify('已从图库移除', target.title, 'info')
  },
  /** AI 生图结果：压缩 → 进对话 → 同时进「我的图库」 */
  async attachGeneratedImage(characterId: string, rawImage: string, prompt = '') {
    const character = this.characterById(characterId)
    const name = character?.name ?? '角色'
    // 标题只留画面内容：去掉重复的角色名前缀和固定风格后缀
    let caption = String(prompt || '').trim()
    if (name && caption.startsWith(name)) caption = caption.slice(name.length).replace(/^[，,、\s]+/, '')
    caption = caption.replace(/动漫插画|竖版构图|柔和光线|竖版/g, '').replace(/[，,、]+/g, ' ').replace(/\s+/g, ' ').trim()
    const title = caption ? `${name} · ${caption.slice(0, 14)}` : `${name} · AI 生图`
    const saved = await this.saveGeneratedAsset(rawImage, { title, tags: [name] })
    if (!this.messages[characterId]) this.messages[characterId] = []
    this.messages[characterId].push({
      id: uid(), role: 'assistant', content: '给你画好了，看看喜欢吗？', time: now(), images: [saved.url], mode: 'chat',
    } as Message)
    persistMessages(this.messages)
    this.notify('已保存到我的图库', saved.title)
    return saved.url
  },
  startNewTopic(characterId: string) {
    const character = this.characters.find(item => item.id === characterId)
    this.messages[characterId] = [{
      id: uid(),
      role: 'assistant',
      content: `我们换个新话题吧。${character ? character.name : '我'}在这里，想聊什么都可以。`,
      time: now(),
      mode: 'chat',
    } as Message]
    persistMessages(this.messages)
  },
    toggleCharacterFavorite(id: string) {
      const char = this.characters.find(c => c.id === id)
      if (char) char.favorite = !char.favorite
      persistCharacters(this.characters)
    },
    createCharacter(payload: { name: string; title: string; avatar: string; tags: string[]; description?: string; tone?: string }) {
      const id = `character-${Date.now()}`
      const name = payload.name.trim() || '未命名角色'
      const title = (payload.title || '').trim() || '新的相遇'
      const tone = (payload.tone || '温柔治愈').trim()
      const description = (payload.description || '').trim()
      // 把创建页填的内容真正拼进人格提示词，服务端 characterPrompt() 会原样使用
      const personaPrompt = [
        `你是${name}，称号“${title}”。`,
        description ? `${description}` : '',
        payload.tags.length ? `性格${payload.tags.join('、')}，` : '',
        `以${tone}的方式与人交流，说话自然、简洁、有具体细节，不要像客服模板。`,
        '你会珍视与对方共同积累的记忆，并在每一次相遇中保持一致的人格与语言习惯。',
      ].filter(Boolean).join('')
      this.characters.push({
        id, name, english: 'Custom Character', title,
        avatar: payload.avatar, color: '#8b76e8', affinity: 12, level: '陌生', emotion: '平静', status: 'online',
        tags: payload.tags, quote: '很高兴遇见你。我们的故事，会从哪一页开始呢？', memoryCount: 0, days: 1, favorite: false,
        personaPrompt,
      })
      this.messages[id] = [{ id: uid(), role: 'assistant', content: '很高兴遇见你。我已经准备好聆听你的故事了。', time: now(), emotion: '开心' }]
      this.activeCharacterId = id
      persistCharacters(this.characters)
      this.notify('角色已加入宇宙', `${name} 正在等待你的第一句问候`)
      return id
    },
    async sendMessage(characterId: string, content: string, images: string[] = []) {
      const userInput = content.trim()
      if ((!userInput && !images.length) || this.sending) return
      if (!this.messages[characterId]) this.messages[characterId] = []
      const history = [...this.messages[characterId]]
      const char = this.characterById(characterId)
      const userMessageId = uid()
      const messageId = uid()
      this.messages[characterId].push({ id: userMessageId, role: 'user', content: userInput, images: images.length ? images : undefined, mode: 'chat', time: now() })
      this.messages[characterId].push({ id: messageId, role: 'assistant', content: '', time: now(), mode: 'chat' })
      this.sending = true

      try {
        const result = await requestChatTurn({
        character: char,
        history,
        userInput,
        images,
        memories: this.memoriesByCharacter(characterId).map(memory => ({ content: memory.content, importance: memory.importance })),
      })
        const reply = result.reply || '我在认真听。愿意再多告诉我一点吗？'
        const message = this.messages[characterId].find(item => item.id === messageId)
        if (message) message.emotion = result.emotion
        let index = 0
        await new Promise<void>((resolve) => {
          const timer = window.setInterval(() => {
            const current = this.messages[characterId]?.find(item => item.id === messageId)
            if (!current) { window.clearInterval(timer); resolve(); return }
            index += 2
            current.content = reply.slice(0, index)
            if (index >= reply.length) { window.clearInterval(timer); resolve() }
          }, 24)
        })
        char.emotion = result.emotion || '平静'
        this.applyAffinity(characterId, result.affinityDelta)
        persistCharacters(this.characters)
        if (result.drawPrompt) {
          this.drawingFor = characterId
          void (async () => {
            try {
              const gen = await fetch('/api/image/generate', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: `${char.name}，${result.drawPrompt}，动漫插画，竖版构图，柔和光线` }),
              }).then(r => r.json())
              if (gen.image) await this.attachGeneratedImage(characterId, gen.image, String(result.drawPrompt || ''))
            } catch { /* 生图失败静默 */ }
            finally { if (this.drawingFor === characterId) this.drawingFor = null }
          })()
        }
        if (result.memory) {
          this.memories.unshift({
            id: uid(), characterId, type: 'event', content: result.memory,
            source: 'chat', importance: 0.82, time: now(), date: '今天',
          })
          char.memoryCount += 1
          persistCharacters(this.characters)
        }
        const delta = `${result.affinityDelta >= 0 ? '+' : ''}${result.affinityDelta}`
        this.notify(result.memory ? '新的记忆已沉淀' : 'AI 回应已完成', `好感度 ${delta}${result.memory ? ' · 已同步至角色记忆池' : ''}`)
      } catch (error) {
        const message = this.messages[characterId]?.find(item => item.id === messageId)
        if (message) message.content = '……（连接好像被星云遮住了，请稍后再试一次。）'
        this.notify('DeepSeek 暂时不可用', error instanceof Error ? error.message : '请检查服务端与网络连接', 'info')
      } finally {
        this.sending = false
      }
    },
    addMemory(characterId: string, content: string, type: Memory['type']) {
      this.memories.unshift({ id: uid(), characterId, content, type, source: 'manual', importance: 0.75, time: now(), date: '今天' })
      const char = this.characterById(characterId)
      char.memoryCount += 1
      persistCharacters(this.characters)
      this.notify('记忆已保存', '这条记忆将参与后续对话与剧情')
    },
    updateMemory(id: number, content: string) {
      const memory = this.memories.find(m => m.id === id)
      if (memory) memory.content = content
      this.notify('记忆已修正', '关系事件 memory.corrected 已触发')
    },
    deleteMemory(id: number) {
      const memory = this.memories.find(m => m.id === id)
      this.memories = this.memories.filter(m => m.id !== id)
      if (memory) this.characterById(memory.characterId).memoryCount = Math.max(0, this.characterById(memory.characterId).memoryCount - 1)
      persistCharacters(this.characters)
      this.notify('记忆已归档', '角色将不再在对话中检索它', 'info')
    },
    toggleAssetFavorite(id: number) {
      const asset = this.assets.find(a => a.id === id)
      if (asset) asset.favorite = !asset.favorite
      persistAssets(this.assets)
    },
    addAsset(asset: { title: string; image: string; tags: string[]; size?: string; source?: string }) {
      this.assets.unshift({
        id: uid(), ...asset,
        size: asset.size ?? '本地上传',
        favorite: false,
        source: asset.source ?? '上传资产',
      })
      persistAssets(this.assets)
      this.notify('上传完成', '资产已加入图库并完成本地索引')
    },
    addToWatchlist(item: Omit<WatchlistItem, 'status' | 'progress' | 'total'> & { total?: number }) {
      if (this.watchlist.some(entry => entry.id === item.id)) return false
      this.watchlist.unshift({ ...item, status: '想看', progress: 0, total: item.total ?? 0 })
      persistWatchlist(this.watchlist)
      return true
    },
    updateWatchlistStatus(id: number, status: string) {
      const item = this.watchlist.find(entry => entry.id === id)
      if (!item) return
      item.status = status
      if (status === '看过') item.progress = item.total
      persistWatchlist(this.watchlist)
    },
    bumpWatchlistProgress(id: number) {
      const item = this.watchlist.find(entry => entry.id === id)
      if (!item) return
      item.progress = Math.min(item.total, item.progress + 1)
      if (item.progress === item.total && item.total > 0) item.status = '看过'
      persistWatchlist(this.watchlist)
      return item
    },
    async storyAction(input: string) {
      const userInput = input.trim()
      if (!userInput) return null
      const character = this.characterById('orihime')
      const result = await requestStoryTurn({
        character,
        history: this.storyTurns.map(turn => ({ input: turn.input, narration: turn.narration })),
        userInput,
        currentState: { ...this.storyState },
      }).catch((error) => {
        this.notify('DeepSeek 剧情暂时不可用', error instanceof Error ? error.message : '本回合使用本地兜底', 'info')
        return {
          narration: '星罗轻轻抚平星图被风吹起的边角。远处的灯塔亮起，她回头等你一起决定故事的方向。',
          location: this.storyState.location, time: this.storyState.time,
          trustDelta: 1, affinityDelta: 1, distanceDelta: 0.01,
          patch: '信任 +1 · 距离 +0.01', memory: null,
        }
      })
      this.storyState.turn += 1
      this.storyState.location = result.location
      this.storyState.time = result.time
      this.storyState.trust = Math.min(100, Math.max(0, this.storyState.trust + result.trustDelta))
      this.storyState.distance = Math.min(1, Math.max(0, Number((this.storyState.distance + result.distanceDelta).toFixed(2))))
      this.storyTurns.push({ input: userInput, narration: result.narration, time: `第${this.storyState.turn}回合`, patch: result.patch })
      const memoryContent = result.memory || `剧情中，你选择“${userInput}”，星罗将这次选择记入了共同经历。`
      this.memories.unshift({ id: uid(), characterId: character.id, type: 'event', content: memoryContent, source: 'story', importance: 0.84, time: now(), date: '今天' })
      character.memoryCount += 1
      this.applyAffinity(character.id, result.affinityDelta)
      persistCharacters(this.characters)
      this.notify('剧情事件已回写', `长期记忆 +1 · 好感度 ${result.affinityDelta >= 0 ? '+' : ''}${result.affinityDelta}`)
      return result
    },
  },
})
