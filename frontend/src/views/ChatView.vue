<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowUp, BrainCircuit, ChevronRight, Clock3, Heart, ImagePlus, Maximize2, MessageCircleMore, MoreHorizontal, Pencil, RefreshCcw, RotateCcw, SmilePlus, Sparkles, Wifi } from 'lucide-vue-next'
import { useAppStore } from '../stores/app'
import { levelOf } from '../data/affinity'
import { thumbUrl } from '../data/assets'
const store = useAppStore()
const route = useRoute()
const input = ref('')
const scrollArea = ref<HTMLDivElement>()
const character = computed(() => store.characterById(route.params.characterId as string))
const messages = computed(() => store.messages[character.value.id] ?? [])
const memories = computed(() => store.memoriesByCharacter(character.value.id).slice(0, 4))
const quickPrompts = ['今天有点累', '你还记得我吗？', '给我讲个故事吧']
watch(character, c => store.setActiveCharacter(c.id), { immediate: true })
const scrollBottom = () => nextTick(() => { if (scrollArea.value) scrollArea.value.scrollTop = scrollArea.value.scrollHeight })
watch(() => messages.value.at(-1)?.content, scrollBottom)
watch(() => route.params.characterId, scrollBottom)
const attachments = ref<string[]>([])
const fileInput = ref<HTMLInputElement>()
const pickImage = () => fileInput.value?.click()
const readAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => {
    const img = new Image()
    img.onload = () => {
      const max = 1280
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = reject
    img.src = String(reader.result)
  }
  reader.onerror = reject
  reader.readAsDataURL(file)
})
const onFiles = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const files = Array.from(target.files ?? []).slice(0, 3 - attachments.value.length)
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue
    try { attachments.value.push(await readAsDataUrl(file)) } catch { /* 忽略读取失败的图 */ }
  }
  target.value = ''
}
const removeAttachment = (index: number) => { attachments.value.splice(index, 1) }
const IMAGE_INTENT = /^(请|帮我|给我)?\s*(画|绘制|生成)(一张|一幅|个)?(图|图片|插画|画)/
const send = () => {
  const raw = input.value.trim()
  if (raw && IMAGE_INTENT.test(raw) && !store.sending) {
    input.value = ''
    store.appendUserMessage(character.value.id, raw)
    scrollBottom()
    void generateImage(`${character.value.name}，${raw.replace(IMAGE_INTENT, '') || '站在星空下'}，动漫插画，竖版构图，柔和光线`)
    return
  }
  if ((!input.value.trim() && !attachments.value.length) || store.sending) return
  const text = input.value
  const images = [...attachments.value]
  input.value = ''
  attachments.value = []
  store.sendMessage(character.value.id, text, images)
  scrollBottom()
  void detectReminder(text)
}
const usePrompt = (prompt: string) => { input.value = prompt; send() }
const reminders = computed(() => store.reminders.filter(item => !item.done && item.characterId === character.value.id).slice(0, 3))
const detectReminder = async (text: string) => {
  if (!/提醒|记得|别忘了|日程|叫我|定个/.test(text)) return
  try {
    const result = await fetch('/api/reminder/parse', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }).then(r => r.json())
    if (result.isReminder && result.dueAt) {
      store.addReminder({
        id: Date.now(), characterId: character.value.id, title: result.title,
        dueAt: result.dueAt, repeat: result.repeat, done: false,
      })
    }
  } catch { /* 忽略解析失败 */ }
}
const generating = ref(false)
const previewImage = ref<string | null>(null)
const generateImage = async (customPrompt?: string) => {
  if (generating.value) return
  generating.value = true
  try {
    const lastUser = messages.value.filter(m => m.role === 'user').at(-1)?.content ?? ''
    const prompt = customPrompt || `${character.value.name}，${lastUser ? lastUser : '站在星空下'}，动漫插画，竖版构图，柔和光线`
    const res = await fetch('/api/image/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    }).then(r => r.json())
    if (res.image) await store.attachGeneratedImage(character.value.id, res.image, prompt)
    else store.notify('生图失败', res.error || '稍后再试', 'info')
  } catch {
    store.notify('生图失败', '网络异常', 'info')
  } finally { generating.value = false }
}
const startNewTopic = () => {
  if (store.sending) return
  store.startNewTopic(character.value.id)
  scrollBottom()
}
const levelInfo = computed(() => levelOf(character.value.affinity))
// ---- 角色设定编辑抽屉 ----
const profileOpen = ref(false)
const profile = reactive({ name: '', title: '', tags: [] as string[], personaPrompt: '' })
const tagDraft = ref('')
const openProfile = () => {
  const target = character.value
  profile.name = target.name
  profile.title = target.title
  profile.tags = [...target.tags]
  profile.personaPrompt = target.personaPrompt
    || `你是${target.name}，称号“${target.title}”。保持温柔、真诚、连续的伙伴关系，使用自然简洁的中文。`
  tagDraft.value = ''
  profileOpen.value = true
}
const addTag = () => {
  const tag = tagDraft.value.trim().slice(0, 6)
  if (tag && !profile.tags.includes(tag) && profile.tags.length < 5) profile.tags.push(tag)
  tagDraft.value = ''
}
const removeTag = (tag: string) => { profile.tags = profile.tags.filter(item => item !== tag) }
const saveProfile = () => {
  if (!profile.name.trim()) return
  store.updateCharacterProfile(character.value.id, {
    name: profile.name,
    title: profile.title,
    tags: profile.tags,
    personaPrompt: profile.personaPrompt,
  })
  profileOpen.value = false
}
const onProfileKeydown = (event: KeyboardEvent) => { if (event.key === 'Escape') profileOpen.value = false }
watch(profileOpen, open => {
  if (open) window.addEventListener('keydown', onProfileKeydown)
  else window.removeEventListener('keydown', onProfileKeydown)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onProfileKeydown))
</script>
<template>
  <div class="chat-page">
    <div class="chat-layout card">
      <aside class="character-stage">
        <img :key="character.id" :src="thumbUrl(character.avatar)" :alt="character.name" class="stage-bg" />
        <div class="stage-overlay" />
        <div class="stage-top"><span><i />{{ character.status === 'online' ? '正在陪伴' : '暂时离开' }}</span><button><Maximize2 :size="15" /></button></div>
        <div class="stage-emotion"><Sparkles :size="12" />当前情绪 · {{ character.emotion }}</div>
        <div class="stage-info"><small>{{ character.english }}</small><h2>{{ character.name }}</h2><p>{{ character.title }}</p><div class="stage-tags"><span v-for="tag in character.tags" :key="tag">{{ tag }}</span></div></div>
        <div class="stage-affinity"><div><span><Heart :size="13" />好感度</span><strong>{{ character.affinity }}<small>/100</small></strong></div><div class="affinity-track"><i :style="{ width: `${character.affinity}%` }" /></div><p>{{ character.level }} · {{ levelInfo.hint }}</p></div>
      </aside>

      <section class="conversation-panel">
        <header class="chat-header"><div class="mobile-char" title="编辑角色设定" @click="openProfile"><img :src="thumbUrl(character.avatar)" loading="lazy" decoding="async" /></div><div class="chat-header-title"><h2>{{ character.name }}<span>{{ character.level }}</span></h2><p><i />正在聆听 · 记忆池已连接</p></div><div class="chat-header-actions"><button class="icon-btn" title="编辑角色设定" aria-label="编辑角色设定" @click="openProfile"><Pencil :size="16" /></button><button class="icon-btn" title="开启新话题（清除上下文）" aria-label="开启新话题" @click="startNewTopic"><RefreshCcw :size="16" /></button><span class="sse-badge"><Wifi :size="12" />AI 实时回复</span><button class="icon-btn header-more"><MoreHorizontal :size="18" /></button></div></header>
        <div ref="scrollArea" class="messages-scroll">
          <div class="time-divider"><span>今天 · 我们的故事继续</span></div>
          <div v-for="message in messages" :key="message.id" class="message-row" :class="message.role">
            <img v-if="message.role === 'assistant'" :src="thumbUrl(character.avatar)" class="message-avatar" loading="lazy" decoding="async" />
            <div class="message-wrap"><div class="message-bubble"><div v-if="message.images?.length" class="bubble-images"><img v-for="(image, index) in message.images" :key="index" :src="image" alt="对话图片" title="双击放大" @dblclick="previewImage = image" /></div><span v-else-if="message.imageDropped" class="bubble-image-note">图片已清理（超出本地存储上限）</span>{{ message.content }}<span v-if="store.sending && message === messages.at(-1) && message.role === 'assistant'" class="typing-cursor" /></div><div class="message-meta"><span>{{ message.time }}</span><span v-if="message.emotion" class="emotion-label"><Sparkles :size="9" />{{ message.emotion }}</span></div></div>
            <div v-if="message.role === 'user'" class="user-message-avatar">林</div>
          </div>
          <div v-if="store.drawingFor === character.id" class="drawing-status"><Sparkles :size="13" class="spin" /><span>正在调用生图工具…</span><i /><i /></div>
          <div v-if="store.sending && messages.at(-1)?.content === ''" class="thinking"><i /><i /><i />{{ character.name }} 正在组织语言</div>
        </div>
        <div class="chat-composer">
          <div v-if="!store.sending" class="quick-prompts"><button v-for="prompt in quickPrompts" :key="prompt" @click="usePrompt(prompt)">{{ prompt }}</button></div>
          <div v-if="attachments.length" class="attach-strip">
            <div v-for="(image, index) in attachments" :key="index" class="attach-item"><img :src="image" alt="待发送图片" /><button type="button" aria-label="移除图片" @click="removeAttachment(index)">×</button></div>
          </div>
          <div class="composer-box"><textarea v-model="input" rows="2" :placeholder="`和 ${character.name} 说点什么吧…`" @keydown.enter.exact.prevent="send" @keydown.shift.enter.exact="input += '\n'" /><div class="composer-toolbar"><div><button type="button" title="添加图片" @click="pickImage"><ImagePlus :size="18" /></button><button type="button" title="让角色画一张图" :disabled="generating" @click="generateImage()"><Sparkles :size="18" :class="{ spin: generating }" /></button><input ref="fileInput" type="file" accept="image/*" multiple class="file-input" @change="onFiles" /><button title="选择表情"><SmilePlus :size="18" /></button><span>Enter 发送 · Shift + Enter 换行</span></div><button class="send-btn" :disabled="(!input.trim() && !attachments.length) || store.sending" @click="send"><ArrowUp :size="19" /></button></div></div>
        </div>
      </section>

      <aside class="memory-sidebar">
        <div class="memory-side-head"><div><BrainCircuit :size="17" /><h3>共同记忆</h3></div><RouterLink :to="`/memory/${character.id}`"><ChevronRight :size="16" /></RouterLink></div>
        <div class="memory-caption"><span>每一次记得，都让相遇更有意义</span><i>LIVE</i></div>
        <div class="memory-cards">
          <div v-for="memory in memories" :key="memory.id" class="mini-memory" :class="memory.type"><div class="memory-type"><span>{{ ({ fact: '事实', preference: '偏好', event: '事件', relationship: '羁绊' } as Record<string, string>)[memory.type] }}</span><small>重要度 {{ Math.round(memory.importance * 100) }}%</small></div><p>{{ memory.content }}</p><div class="mini-memory-foot"><span>{{ memory.source === 'chat' ? '来自对话' : memory.source === 'story' ? '来自剧情' : '手动记录' }}</span><time>{{ memory.time }}</time></div></div>
        </div>
        <div v-if="!memories.length" class="memory-empty">第一句话，会成为第一条记忆。</div>
        <RouterLink :to="`/memory/${character.id}`" class="all-memory-link">查看全部 {{ character.memoryCount }} 条记忆<ChevronRight :size="13" /></RouterLink>
        <div v-if="reminders.length" class="reminder-box">
          <div class="reminder-head"><Clock3 :size="13" />待办提醒<RouterLink to="/reminders" class="reminder-all">查看全部 ›</RouterLink></div>
          <div v-for="item in reminders" :key="item.id" class="reminder-row"><span>{{ item.title }}</span><small>{{ new Date(item.dueAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }}</small></div>
        </div>
        <div class="state-sync"><span><i /></span><div><strong>世界状态已同步</strong><p>对话 → 记忆 → 剧情</p></div></div>
      </aside>
    </div>
    <Transition name="lightbox">
      <div v-if="previewImage" class="img-lightbox" @click="previewImage = null">
        <img :src="previewImage" alt="预览" />
        <button type="button" aria-label="关闭" @click.stop="previewImage = null">×</button>
      </div>
    </Transition>
    <Teleport to="body">
      <Transition name="drawer">
        <div v-if="profileOpen" class="drawer-mask" @click.self="profileOpen = false">
          <aside class="profile-drawer" role="dialog" aria-modal="true" aria-label="编辑角色设定">
            <header class="drawer-head">
              <div><h2>角色设定</h2><p>保存后，下一句对话就会用新的人格</p></div>
              <button class="drawer-close" type="button" aria-label="关闭" @click="profileOpen = false">×</button>
            </header>
            <div class="drawer-body">
              <label class="drawer-field"><span>名字</span><input v-model="profile.name" class="input" maxlength="12" placeholder="角色名字" /></label>
              <label class="drawer-field"><span>称号</span><input v-model="profile.title" class="input" maxlength="16" placeholder="例如：星象记录者" /></label>
              <div class="drawer-field">
                <span>性格标签<small>{{ profile.tags.length }} / 5</small></span>
                <div class="drawer-tags">
                  <button v-for="tag in profile.tags" :key="tag" type="button" @click="removeTag(tag)">{{ tag }}<i>×</i></button>
                  <input v-model="tagDraft" maxlength="6" placeholder="回车添加" @keyup.enter.prevent="addTag" />
                </div>
              </div>
              <label class="drawer-field"><span>人设与说话方式<small>作为 system prompt 使用</small></span><textarea v-model="profile.personaPrompt" class="textarea" rows="9" placeholder="她是谁、怎么说话、在意什么…" /></label>
            </div>
            <footer class="drawer-foot">
              <button class="btn btn-secondary" type="button" @click="profileOpen = false">取消</button>
              <button class="btn btn-primary" type="button" :disabled="!profile.name.trim()" @click="saveProfile">保存设定</button>
            </footer>
          </aside>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
<style scoped>
.chat-page{height:calc(100vh - 150px);min-height:620px}.chat-layout{height:100%;display:grid;grid-template-columns:240px minmax(360px,1fr) 265px;overflow:hidden}.character-stage{position:relative;overflow:hidden;background:#655477}.stage-bg{position:absolute;width:100%;height:100%;object-fit:cover;object-position:center 15%}.stage-overlay{position:absolute;inset:0;background:linear-gradient(to bottom,rgba(32,25,48,.32),transparent 30%,transparent 52%,rgba(35,25,48,.88) 90%)}.stage-top{position:absolute;left:15px;right:15px;top:15px;display:flex;justify-content:space-between;align-items:center}.stage-top>span{display:flex;align-items:center;gap:5px;padding:5px 8px;border-radius:15px;background:rgba(255,255,255,.2);backdrop-filter:blur(8px);color:white;font-size:8px}.stage-top i{width:5px;height:5px;border-radius:50%;background:#8bf0c9}.stage-top button{border:0;background:none;color:white;opacity:.8}.stage-emotion{position:absolute;top:52px;left:15px;display:flex;align-items:center;gap:4px;color:white;font-size:8px;opacity:.85}.stage-info{position:absolute;left:20px;right:20px;bottom:116px;color:white}.stage-info small{font-size:8px;letter-spacing:1px;opacity:.65}.stage-info h2{margin-top:5px;font-size:23px;letter-spacing:1px}.stage-info p{margin-top:4px;font-size:10px;opacity:.8}.stage-tags{display:flex;gap:5px;margin-top:12px}.stage-tags span{padding:4px 7px;border:1px solid rgba(255,255,255,.25);border-radius:6px;background:rgba(255,255,255,.1);font-size:7px}.stage-affinity{position:absolute;left:20px;right:20px;bottom:20px;padding-top:13px;border-top:1px solid rgba(255,255,255,.2);color:white}.stage-affinity>div:first-child{display:flex;justify-content:space-between;align-items:center}.stage-affinity span{display:flex;align-items:center;gap:5px;font-size:9px;opacity:.85}.stage-affinity strong{font-size:17px}.stage-affinity small{font-size:8px;font-weight:400;opacity:.6}.affinity-track{height:4px;margin-top:8px;border-radius:5px;background:rgba(255,255,255,.2)}.affinity-track i{display:block;height:100%;border-radius:5px;background:linear-gradient(90deg,#e6b4ce,#fff0d6);transition:width .6s}.stage-affinity p{margin-top:7px;font-size:7px;opacity:.55}.conversation-panel{min-width:0;display:flex;flex-direction:column;background:#fdfdfe}.chat-header{height:70px;display:flex;align-items:center;padding:0 20px;border-bottom:1px solid var(--line);background:white}.chat-header h2{font-size:14px}.chat-header h2 span{margin-left:8px;padding:3px 6px;border-radius:6px;background:#f0edfb;color:#8a78d7;font-size:8px;font-weight:500;vertical-align:2px}.chat-header p{display:flex;align-items:center;gap:5px;margin-top:4px;color:#a39eaa;font-size:8px}.chat-header p i{width:5px;height:5px;border-radius:50%;background:#65bba0}.chat-header-actions{display:flex;align-items:center;gap:10px;margin-left:auto}.sse-badge{display:flex;align-items:center;gap:4px;color:#83a294;font-size:8px}.chat-header .icon-btn{width:32px;height:32px;border:0}.mobile-char{display:none}.messages-scroll{flex:1;overflow-y:auto;padding:20px 24px;scroll-behavior:smooth}.time-divider{display:flex;align-items:center;gap:10px;margin:0 0 22px;color:#b4afbb;font-size:8px}.time-divider::before,.time-divider::after{content:'';flex:1;height:1px;background:#eeecf1}.message-row{display:flex;align-items:flex-start;gap:9px;margin-bottom:19px}.message-row.user{justify-content:flex-end}.message-avatar,.user-message-avatar{width:30px;height:30px;border-radius:10px;object-fit:cover;flex-shrink:0}.user-message-avatar{display:grid;place-items:center;background:linear-gradient(135deg,#ddd1c5,#c5b3d5);color:#5a4d64;font-size:10px;font-weight:600}.message-wrap{max-width:77%}.message-bubble{padding:11px 14px;border:1px solid #ebe8f0;border-radius:5px 15px 15px 15px;background:white;color:#615b6b;font-size:11px;line-height:1.85;box-shadow:0 3px 10px rgba(45,35,70,.025);white-space:pre-wrap}.user .message-bubble{border:0;border-radius:15px 5px 15px 15px;background:#7b6bd4;color:white;box-shadow:0 5px 15px rgba(117,102,210,.12)}.message-meta{display:flex;align-items:center;gap:8px;margin-top:5px;color:#b6b1bd;font-size:7px}.user .message-meta{justify-content:flex-end}.emotion-label{display:flex;align-items:center;gap:3px;color:#a394cf}.typing-cursor{display:inline-block;width:1px;height:12px;margin-left:2px;background:#7c6bd4;vertical-align:-2px;animation:pulse .7s infinite}.thinking{display:flex;align-items:center;gap:3px;color:#aaa4b2;font-size:8px}.thinking i{width:4px;height:4px;border-radius:50%;background:#a396d4;animation:pulse 1s infinite}.thinking i:nth-child(2){animation-delay:.2s}.thinking i:nth-child(3){animation-delay:.4s}.thinking i:last-of-type{margin-right:5px}.chat-composer{padding:10px 18px 16px;background:white;border-top:1px solid #f0edf3}.quick-prompts{display:flex;gap:6px;margin-bottom:9px;overflow-x:auto}.quick-prompts button{padding:5px 9px;border:1px solid #ece8f2;border-radius:10px;background:#faf9fc;color:#9b94a5;font-size:8px;white-space:nowrap}.quick-prompts button:hover{color:#7967d0;border-color:#d8d0f2}.composer-box{padding:9px 11px 7px;border:1px solid #e4e0eb;border-radius:15px;background:#fdfdfe;transition:border .2s}.composer-box:focus-within{border-color:#bdb2eb;box-shadow:0 0 0 3px #f3f0fc}.composer-box textarea{width:100%;padding:0 2px;border:0;outline:0;resize:none;background:transparent;color:#5d5767;font-size:11px;line-height:1.7}.composer-box textarea::placeholder{color:#b5afbc}.composer-toolbar{display:flex;align-items:center;justify-content:space-between}.composer-toolbar>div{display:flex;align-items:center;gap:8px}.composer-toolbar button{border:0;background:none;color:#a8a2af;padding:3px}.composer-toolbar span{margin-left:3px;color:#c0bbc4;font-size:7px}.composer-toolbar .send-btn{width:31px;height:31px;display:grid;place-items:center;border-radius:10px;background:#7b69d7;color:white}.composer-toolbar .send-btn:disabled{background:#e7e3ee;color:#b8b1c1}.memory-sidebar{display:flex;flex-direction:column;padding:18px 15px;background:#faf9fc;border-left:1px solid var(--line);overflow:hidden}.memory-side-head{display:flex;align-items:center;justify-content:space-between}.memory-side-head>div{display:flex;align-items:center;gap:7px;color:#7a68ce}.memory-side-head h3{color:#595264;font-size:12px}.memory-side-head>a{color:#aaa4b1}.memory-caption{display:flex;align-items:center;justify-content:space-between;margin-top:7px;color:#b0aab5;font-size:7px}.memory-caption i{color:#77b39e;font-size:6px;font-style:normal;letter-spacing:1px}.memory-cards{margin-top:16px;overflow-y:auto;flex:1}.mini-memory{position:relative;margin-bottom:10px;padding:12px;border:1px solid #ebe7f0;border-radius:13px;background:white;animation:modalIn .3s}.mini-memory::before{content:'';position:absolute;left:0;top:13px;bottom:13px;width:2px;border-radius:2px;background:#a08ee1}.mini-memory.preference::before{background:#dd9b8b}.mini-memory.event::before{background:#6cb3c6}.mini-memory.relationship::before{background:#d486a4}.memory-type{display:flex;justify-content:space-between;align-items:center}.memory-type span{color:#8876d0;font-size:8px;font-weight:600}.memory-type small{color:#b4adb9;font-size:6px}.mini-memory p{margin:8px 0;color:#7a7383;font-size:9px;line-height:1.75;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.mini-memory-foot{display:flex;justify-content:space-between;color:#b6b0bb;font-size:7px}.all-memory-link{display:flex;align-items:center;justify-content:center;gap:4px;margin-top:8px;padding:10px;border:1px solid #e8e3ef;border-radius:11px;color:#8977cf;font-size:8px}.state-sync{display:flex;align-items:center;gap:8px;margin-top:12px;padding:10px;border-radius:11px;background:#f0f6f3}.state-sync>span{width:25px;height:25px;display:grid;place-items:center;border-radius:50%;background:#e1f0e9}.state-sync i{width:6px;height:6px;border-radius:50%;background:#64b397}.state-sync strong{display:block;color:#739386;font-size:8px}.state-sync p{margin-top:3px;color:#9fb0a9;font-size:7px}.memory-empty{padding:40px 10px;text-align:center;color:#b4aebb;font-size:9px;line-height:1.8}
.chat-layout { min-height: 0; border-radius: 24px; border-color: rgba(227,222,236,.9); box-shadow: 0 18px 50px rgba(43,32,72,.07); }
.conversation-panel { min-height: 0; }
.chat-header { flex-shrink: 0; background: rgba(255,255,255,.82); backdrop-filter: blur(16px); border-bottom-color: #efecf3; }
.messages-scroll { min-height: 0; background-image: radial-gradient(circle at 50% 0,rgba(240,236,250,.32),transparent 42%); }
.chat-composer { flex-shrink: 0; }
.message-row { animation: bubbleIn var(--dur-3) var(--ease-soft) both; }
.message-bubble { box-shadow: 0 5px 16px rgba(48,37,75,.035); line-height: 1.8; }
.message-row.user .message-bubble { box-shadow: 0 8px 22px rgba(117,102,232,.14); }
.composer-box { border-color: #e4dfed; box-shadow: 0 8px 26px rgba(49,37,78,.05); transition: border-color .2s,box-shadow .2s; }
.composer-box:focus-within { border-color: #bdb1ed; box-shadow: 0 0 0 4px rgba(117,102,232,.06),0 12px 30px rgba(49,37,78,.06); }
.quick-prompts button { transition: all .18s; }.quick-prompts button:hover { transform: translateY(-1px); border-color: #cfc4ef; color: #7563c5; }
.send-btn { box-shadow: 0 7px 18px rgba(117,102,232,.24); }
.mini-memory { transition: transform .2s,box-shadow .2s; }.mini-memory:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(48,36,75,.05); }
.memory-side-head h3 { letter-spacing: .2px; }
@media(max-width:1300px){.chat-layout{grid-template-columns:210px minmax(330px,1fr) 235px}.memory-sidebar{padding:15px 12px}.messages-scroll{padding:18px}.stage-info{left:16px}.stage-affinity{left:16px;right:16px}}@media(max-width:1050px){.chat-layout{grid-template-columns:minmax(350px,1fr) 250px}.character-stage{display:none}.mobile-char{display:block;margin-right:10px}.mobile-char img{width:36px;height:36px;object-fit:cover;border-radius:11px}}@media(max-width:820px){.chat-page{height:calc(100vh - 125px);min-height:560px}.chat-layout{grid-template-columns:1fr}.memory-sidebar{display:none}.messages-scroll{padding:18px 14px}.chat-header{padding:0 14px}.sse-badge{display:none}}@media(max-width:480px){.message-wrap{max-width:83%}.composer-toolbar span{display:none}.chat-composer{padding:9px 10px 12px}.quick-prompts{max-width:100%}.chat-header{padding:0 12px;gap:8px}.chat-header-actions{gap:6px}.chat-header .icon-btn{display:inline-flex;width:30px;height:30px}.chat-header .icon-btn.header-more{display:none}.chat-header h2{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.chat-header p{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}

/* 头部标题块允许收缩，避免窄屏把右边按钮挤出去 */
.chat-header-title { min-width: 0; overflow: hidden; }

.quick-prompts button { font-size: 11px; min-height: 28px; color: #5f5a70; }

/* 图片上传 */
.file-input { display: none; }
.attach-strip { display: flex; gap: 8px; padding: 0 2px 8px; flex-wrap: wrap; }
.attach-item { position: relative; width: 58px; height: 58px; border-radius: 10px; overflow: hidden; border: 1px solid #e4dfed; box-shadow: 0 4px 12px rgba(49,37,78,.08); }
.attach-item img { width: 100%; height: 100%; object-fit: cover; display: block; }
.attach-item button { position: absolute; top: 2px; right: 2px; width: 16px; height: 16px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 50%; background: rgba(24,18,40,.72); color: #fff; font-size: 11px; line-height: 1; cursor: pointer; }
.attach-item button:hover { background: rgba(24,18,40,.92); }
.bubble-images { display: flex; gap: 6px; margin-bottom: 6px; flex-wrap: wrap; }
.bubble-images img { max-width: 180px; max-height: 140px; border-radius: 9px; object-fit: cover; display: block; }
.reminder-box{margin:10px 0 6px;padding:10px 12px;border:1px solid #e6e0f0;border-radius:12px;background:#faf8fd}
.reminder-head{display:flex;align-items:center;gap:6px;color:#8a76ce;font-size:10px;font-weight:600;margin-bottom:7px}
.reminder-row{display:flex;justify-content:space-between;gap:8px;padding:4px 0;font-size:9px;color:#6c6479}
.reminder-row small{color:#a49dae;white-space:nowrap}
.spin{animation:spin 1.2s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.img-lightbox{position:fixed;inset:0;z-index:90;display:grid;place-items:center;padding:32px;background:rgba(6,5,14,.88);backdrop-filter:blur(10px);cursor:zoom-out}
.img-lightbox img{max-width:92vw;max-height:92vh;border-radius:16px;box-shadow:0 30px 80px rgba(0,0,0,.6);object-fit:contain}
.img-lightbox button{position:absolute;top:22px;right:26px;width:38px;height:38px;border:0;border-radius:50%;background:rgba(255,255,255,.14);color:#fff;font-size:22px;line-height:1;cursor:pointer}
.lightbox-enter-active,.lightbox-leave-active{transition:opacity .2s}
.lightbox-enter-from,.lightbox-leave-to{opacity:0}
.bubble-images img{cursor:zoom-in}
.bubble-image-note{display:inline-block;margin:0 0 4px;padding:2px 7px;border-radius:6px;background:#f3f0f8;color:#9a91ab;font-size:9px}
.drawing-status{display:flex;align-items:center;gap:8px;margin:6px auto 2px;padding:7px 14px;border:1px solid rgba(160,130,240,.35);border-radius:20px;background:rgba(139,114,215,.14);color:#c3b0f5;font-size:11px;width:max-content}
.drawing-status .spin{animation:spin 1.2s linear infinite}
.drawing-status i{width:5px;height:5px;border-radius:50%;background:#a98bf0;animation:pulseDot 1.1s ease-in-out infinite}
.drawing-status i:nth-of-type(2){animation-delay:.2s}
@keyframes pulseDot{0%,100%{opacity:.25}50%{opacity:1}}
.reminder-all{margin-left:auto;color:#8a76ce;font-size:9px;text-decoration:none}

/* 角色设定编辑抽屉 */
.drawer-mask{position:fixed;inset:0;z-index:96;display:flex;justify-content:flex-end;background:rgba(20,16,32,.38);backdrop-filter:blur(2px)}
.profile-drawer{width:min(420px,92vw);height:100%;display:flex;flex-direction:column;background:#fff;box-shadow:-20px 0 60px rgba(40,30,70,.18)}
.drawer-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:22px 22px 14px;border-bottom:1px solid #f0edf4}
.drawer-head h2{font-size:16px;color:#3a3149}
.drawer-head p{margin-top:5px;color:#a49bb8;font-size:10px}
.drawer-close{width:30px;height:30px;border:0;border-radius:9px;background:#f4f1f9;color:#7a7189;font-size:18px;line-height:1;cursor:pointer}
.drawer-close:hover{background:#ece7f7;color:#63558f}
.drawer-body{flex:1;overflow-y:auto;padding:18px 22px;display:flex;flex-direction:column;gap:16px}
.drawer-field{display:flex;flex-direction:column;gap:7px}
.drawer-field>span{display:flex;align-items:center;justify-content:space-between;color:#6b6379;font-size:11px;font-weight:600}
.drawer-field>span small{color:#b0a8bd;font-size:9px;font-weight:400}
.drawer-field .input{font-size:12px}
.drawer-field .textarea{font-size:11px;line-height:1.85;resize:vertical}
.drawer-tags{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.drawer-tags button{display:inline-flex;align-items:center;gap:4px;padding:5px 8px;border:1px solid #e2dbf2;border-radius:8px;background:#f6f3fd;color:#7b68c8;font-size:10px;cursor:pointer}
.drawer-tags button:hover{background:#eee8fb}
.drawer-tags button i{font-style:normal;opacity:.55}
.drawer-tags input{width:96px;padding:5px 8px;border:1px dashed #ded7ea;border-radius:8px;font-size:10px;color:#6b6379;font-family:inherit}
.drawer-foot{display:flex;justify-content:flex-end;gap:9px;padding:14px 22px 20px;border-top:1px solid #f0edf4}
.drawer-enter-active,.drawer-leave-active{transition:opacity .22s}
.drawer-enter-active .profile-drawer,.drawer-leave-active .profile-drawer{transition:transform .26s cubic-bezier(.22,1,.36,1)}
.drawer-enter-from,.drawer-leave-to{opacity:0}
.drawer-enter-from .profile-drawer,.drawer-leave-to .profile-drawer{transform:translateX(100%)}
.mobile-char{cursor:pointer}


/* 动效补充：思考指示器跳动、滚动平滑、图片悬停微放大 */
.messages-scroll { scroll-behavior: smooth; }
.thinking { animation: bubbleIn var(--dur-3) var(--ease-soft) both; }
.thinking i { animation: thinkingBounce 1.25s var(--ease-inout) infinite; }
.thinking i:nth-child(2) { animation-delay: .14s; }
.thinking i:nth-child(3) { animation-delay: .28s; }
@keyframes thinkingBounce {
  0%, 65%, 100% { transform: translateY(0); opacity: .4; }
  32% { transform: translateY(-5px); opacity: 1; }
}
.bubble-images img { transition: transform var(--dur-2) var(--ease-soft); }
.bubble-images img:hover { transform: scale(1.03); }


.stage-bg { animation: stageFade var(--dur-4) var(--ease-soft) both; }
@keyframes stageFade { from { opacity: 0; transform: scale(1.04); } to { opacity: 1; transform: none; } }
</style>
