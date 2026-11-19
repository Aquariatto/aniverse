<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Archive, BrainCircuit, CalendarDays, Check, ChevronRight, Clock3, Edit3, Filter, Heart, MessageCircleMore, MoreHorizontal, Plus, Search, Sparkles, Trash2 } from 'lucide-vue-next'
import { useAppStore } from '../stores/app'
import { thumbUrl } from '../data/assets'
import type { Memory } from '../data/mock'
const store = useAppStore()
const route = useRoute()
const character = computed(() => store.characterById(route.params.characterId as string))
watch(character, c => store.setActiveCharacter(c.id), { immediate: true })
const activeType = ref('全部记忆')
const query = ref('')
const searching = ref(false)
interface SemanticState { query: string; scores: Record<number, number>; source: string }
const semantic = ref<SemanticState | null>(null)
const semanticNote = ref<'' | 'embedding' | 'unavailable' | 'error'>('')
const modalOpen = ref(false)
const editingId = ref<number | null>(null)
const editContent = ref('')
const editType = ref<Memory['type']>('fact')
const deleting = ref<Memory | null>(null)
const types = ['全部记忆', '事实', '偏好', '事件', '羁绊']
const typeMap: Record<string, string> = { fact: '事实', preference: '偏好', event: '事件', relationship: '羁绊' }
const sourceMap: Record<string, string> = { chat: '陪伴对话', story: '剧情事件', manual: '手动记录' }
const typeMatched = computed(() => store.memoriesByCharacter(character.value.id)
  .filter(m => activeType.value === '全部记忆' || typeMap[m.type] === activeType.value))
const keywordMatched = computed(() => typeMatched.value.filter(m => !query.value
  || m.content.toLowerCase().includes(query.value.toLowerCase())
  || typeMap[m.type].includes(query.value)))
const activeSemantic = computed(() => (semantic.value && semantic.value.query === query.value.trim() ? semantic.value : null))
// 语义搜索有结果时按相关度重排（低分丢掉），与关键词的子串匹配是两套逻辑，不要叠加
const filtered = computed(() => {
  const active = activeSemantic.value
  if (!active) return keywordMatched.value
  return typeMatched.value
    .map(memory => ({ memory, score: active.scores[memory.id] ?? -1 }))
    .filter(item => item.score >= 0.3)
    .sort((a, b) => b.score - a.score)
    .map(item => item.memory)
})
const scoreOf = (id: number) => activeSemantic.value?.scores[id]
const resetFilter = () => { query.value = ''; activeType.value = '全部记忆'; semantic.value = null; semanticNote.value = '' }
const semanticSearch = async () => {
  const keyword = query.value.trim()
  if (!keyword) { semantic.value = null; semanticNote.value = ''; return }
  if (searching.value) return
  searching.value = true
  try {
    const list = store.memoriesByCharacter(character.value.id).map(m => ({ id: m.id, content: m.content }))
    // embedding 服务偶发返回空结果，重试一次再退化成关键词匹配
    let res: { results?: { id: number; score: number }[]; source?: string } = {}
    for (let attempt = 0; attempt < 2; attempt += 1) {
      res = await fetch('/api/memory/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: keyword, memories: list }),
      }).then(r => r.json())
      if (res.source === 'embedding') break
    }
    const results = Array.isArray(res.results) ? res.results : []
    const scores: Record<number, number> = {}
    results.forEach(item => { scores[item.id] = item.score })
    const ok = res.source === 'embedding'
    // 只有真的拿到语义结果才切到语义排序；失败时保留关键词列表，别让页面变空
    semantic.value = ok && results.length ? { query: keyword, scores, source: String(res.source) } : null
    semanticNote.value = ok ? 'embedding' : (res.source === 'error' ? 'error' : 'unavailable')
    store.notify(
      ok ? '语义检索完成' : '语义检索不可用',
      ok ? `bge-m3 按相关度返回 ${results.filter(item => item.score >= 0.3).length} 条记忆` : '已退回关键词匹配，请检查 embedding 配置或稍后再试',
      'info',
    )
  } catch {
    semantic.value = null
    semanticNote.value = 'error'
    store.notify('语义检索失败', '网络异常，已退回关键词匹配', 'info')
  } finally {
    searching.value = false
  }
}
const openAdd = () => { editingId.value = null; editContent.value = ''; editType.value = 'fact'; modalOpen.value = true }
const openEdit = (memory: Memory) => { editingId.value = memory.id; editContent.value = memory.content; editType.value = memory.type; modalOpen.value = true }
const save = () => {
  if (!editContent.value.trim()) return
  if (editingId.value) store.updateMemory(editingId.value, editContent.value)
  else store.addMemory(character.value.id, editContent.value, editType.value)
  modalOpen.value = false
}
const remove = () => { if (deleting.value) store.deleteMemory(deleting.value.id); deleting.value = null }
</script>
<template>
  <div class="memory-page">
    <div class="page-heading"><div><div class="eyebrow">MULTIMODAL MEMORY</div><h1>{{ character.name }}的记忆宫殿</h1><p>每一份共同经历，都在悄悄塑造你们的故事。</p></div><button class="btn btn-primary" @click="openAdd"><Plus :size="16" />添加记忆</button></div>
    <div class="memory-stats stat-grid">
      <div class="card stat-card"><span class="stat-icon"><BrainCircuit :size="20" /></span><div><div class="stat-value">{{ character.memoryCount }}</div><div class="stat-label">共同记忆</div></div><span class="trend">+3 本周</span></div>
      <div class="card stat-card"><span class="stat-icon blue"><MessageCircleMore :size="20" /></span><div><div class="stat-value">{{ store.memoriesByCharacter(character.id).filter(m => m.source === 'chat').length }}</div><div class="stat-label">来自对话</div></div><span class="trend">持续积累</span></div>
      <div class="card stat-card"><span class="stat-icon peach"><Sparkles :size="20" /></span><div><div class="stat-value">{{ store.memoriesByCharacter(character.id).filter(m => m.source === 'story').length }}</div><div class="stat-label">剧情回写</div></div><span class="trend">状态贯通</span></div>
      <div class="card stat-card"><span class="stat-icon green"><Heart :size="20" /></span><div><div class="stat-value">{{ Math.round(store.memoriesByCharacter(character.id).reduce((s, m) => s + m.importance, 0) / Math.max(1, store.memoriesByCharacter(character.id).length) * 100) }}%</div><div class="stat-label">平均重要度</div></div></div>
    </div>

    <div class="memory-layout">
      <section class="memory-main card">
        <div class="memory-toolbar"><div class="tabs"><button v-for="type in types" :key="type" class="tab" :class="{ active: activeType === type }" @click="activeType = type">{{ type }}</button></div><button class="icon-btn"><Filter :size="16" /></button></div>
        <div class="semantic-search"><div class="input-wrap"><Search :size="17" /><input v-model="query" class="input" placeholder="用一句话寻找共同记忆，例如：我们关于海边的约定…" @keyup.enter="semanticSearch" /><button :disabled="searching" @click="semanticSearch"><Sparkles :size="14" />{{ searching ? '检索中…' : '语义搜索' }}</button></div><p v-if="semanticNote"><Check :size="11" />{{ semanticNote === 'embedding' ? '已用 bge-m3 语义相关度重新排序，只保留相关度 ≥ 30% 的记忆' : '语义服务暂不可用，当前为关键词匹配' }}</p></div>
        <div class="timeline">
          <div v-for="memory in filtered" :key="memory.id" class="timeline-item stagger-row">
            <div class="timeline-date"><strong>{{ memory.date }}</strong><span>{{ memory.time }}</span></div>
            <div class="timeline-marker" :class="memory.type"><span /></div>
            <article class="memory-item" :class="memory.type"><div class="memory-item-head"><div><span class="memory-type-pill" :class="memory.type">{{ typeMap[memory.type] }}</span><span class="source-pill">{{ sourceMap[memory.source] }}</span><span v-if="scoreOf(memory.id) !== undefined" class="score-pill">相关度 {{ Math.round((scoreOf(memory.id) ?? 0) * 100) }}%</span></div><div class="memory-actions"><button @click="openEdit(memory)"><Edit3 :size="14" /></button><button @click="deleting = memory"><Trash2 :size="14" /></button></div></div><p>{{ memory.content }}</p><div class="memory-item-foot"><span><CalendarDays :size="11" />{{ memory.date }} · {{ memory.time }}</span><div class="importance"><span>重要度</span><div><i :style="{ width: `${memory.importance * 100}%` }" /></div><strong>{{ memory.importance.toFixed(2) }}</strong></div></div></article>
          </div>
          <div v-if="!filtered.length" class="no-memory"><BrainCircuit :size="35" /><h3>暂时没有相关记忆</h3><p>换个关键词，或添加一条新的共同经历。</p><button class="btn btn-soft" @click="resetFilter">重置筛选</button></div>
        </div>
      </section>

      <aside class="memory-aside">
        <div class="card character-memory-card"><div class="aside-char"><img :src="thumbUrl(character.avatar)" loading="lazy" decoding="async" /><div><strong>{{ character.name }}</strong><span><i />记忆池连接正常</span></div></div><div class="memory-capacity"><div><span>记忆容量</span><strong>{{ character.memoryCount }} / 500</strong></div><div><i :style="{ width: `${character.memoryCount / 5}%` }" /></div><p>重要记忆会被优先注入对话与剧情</p></div></div>
        <div class="card distribution-card"><h3>记忆类型分布</h3><div class="distribution-list"><div v-for="(label, type) in typeMap" :key="type"><span><i :class="type" />{{ label }}</span><strong>{{ store.memoriesByCharacter(character.id).filter(m => m.type === type).length }}</strong><div><i :class="type" :style="{ width: `${store.memoriesByCharacter(character.id).filter(m => m.type === type).length * 18 + 8}%` }" /></div></div></div></div>
        <div class="card memory-tip"><span><Sparkles :size="18" /></span><h3>记忆如何影响故事？</h3><p>当好感度达到 Lv2，事实与羁绊记忆会成为新剧情的背景状态。</p><RouterLink to="/story/seaside">去剧情里验证<ChevronRight :size="13" /></RouterLink></div>
      </aside>
    </div>

    <Teleport to="body"><Transition name="fade"><div v-if="modalOpen" class="modal-backdrop" @click.self="modalOpen = false"><div class="modal"><div class="modal-head"><h2>{{ editingId ? '修正这段记忆' : '添加共同记忆' }}</h2><button class="icon-btn" @click="modalOpen = false">×</button></div><div class="field"><label>记忆类型</label><div class="type-select"><button v-for="(label, type) in typeMap" :key="type" :class="{ active: editType === type }" @click="editType = type as Memory['type']">{{ label }}</button></div></div><div class="field edit-memory-field"><label>记忆内容</label><textarea v-model="editContent" class="textarea" rows="5" placeholder="写下希望她记住的事…" /></div><p class="edit-notice">修改记忆会触发 memory.corrected 事件，并同步到后续对话。</p><div class="modal-actions"><button class="btn btn-secondary" @click="modalOpen = false">取消</button><button class="btn btn-primary" :disabled="!editContent.trim()" @click="save">保存记忆</button></div></div></div></Transition></Teleport>
    <Teleport to="body"><Transition name="fade"><div v-if="deleting" class="modal-backdrop" @click.self="deleting = null"><div class="modal delete-modal"><span class="delete-icon"><Archive :size="24" /></span><h2>让她忘记这段经历？</h2><p>记忆会被归档，不再参与对话检索和剧情继承。此操作仅影响本地演示数据。</p><div class="modal-actions"><button class="btn btn-secondary" @click="deleting = null">保留记忆</button><button class="btn delete-confirm" @click="remove">确认遗忘</button></div></div></div></Transition></Teleport>
  </div>
</template>
<style scoped>
.stat-icon.blue{background:#eaf6fb;color:#5ba6c1}.stat-icon.peach{background:#fff0e9;color:#d68e72}.stat-icon.green{background:#eaf7f2;color:#5dab91}.memory-layout{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:20px;margin-top:22px}.memory-main{padding:20px 22px;min-height:600px}.memory-toolbar{display:flex;justify-content:space-between;gap:12px}.memory-toolbar .icon-btn{width:36px;height:36px}.semantic-search{margin:18px 0 23px}.semantic-search .input{height:44px;background:#f8f7fb;border-color:#eeebf2;padding-right:112px;font-size:11px}.semantic-search .input-wrap>button{position:absolute;right:6px;top:6px;height:32px;display:flex;align-items:center;gap:5px;padding:0 10px;border:0;border-radius:9px;background:#ece8fb;color:#7c69d1;font-size:9px}.semantic-search>p{display:flex;align-items:center;gap:4px;margin:7px 0 0;color:#8ead9f;font-size:8px}.timeline-item{display:grid;grid-template-columns:62px 20px minmax(0,1fr);gap:10px}.timeline-date{text-align:right;padding-top:15px}.timeline-date strong,.timeline-date span{display:block}.timeline-date strong{color:#928b9b;font-size:8px}.timeline-date span{margin-top:4px;color:#b8b2bd;font-size:7px}.timeline-marker{position:relative;display:flex;justify-content:center}.timeline-marker::after{content:'';position:absolute;top:28px;bottom:0;width:1px;background:#e7e3ec}.timeline-item:last-child .timeline-marker::after{display:none}.timeline-marker>span{position:relative;z-index:1;width:9px;height:9px;margin-top:20px;border:2px solid white;border-radius:50%;background:#9c88df;box-shadow:0 0 0 2px #ded7f3}.timeline-marker.preference>span{background:#d9947f;box-shadow:0 0 0 2px #f3dfd8}.timeline-marker.event>span{background:#68adc2;box-shadow:0 0 0 2px #d9eaf0}.timeline-marker.relationship>span{background:#d183a1;box-shadow:0 0 0 2px #f1dce4}.memory-item{margin-bottom:14px;padding:15px 17px;border:1px solid #ece9f0;border-radius:14px;background:#fdfdfe;transition:all .2s}.memory-item:hover{border-color:#dbd4ef;box-shadow:0 7px 20px rgba(50,40,80,.05)}.memory-item-head,.memory-item-head>div{display:flex;align-items:center;justify-content:space-between;gap:7px}.memory-type-pill{padding:4px 7px;border-radius:6px;background:#eeeafd;color:#846fd2;font-size:8px;font-weight:600}.memory-type-pill.preference{background:#fff0e9;color:#ce856d}.memory-type-pill.event{background:#eaf6fa;color:#5a9eb6}.memory-type-pill.relationship{background:#fbeaf1;color:#c47895}.source-pill{color:#aaa4b0;font-size:8px}.memory-actions{opacity:0;transition:opacity .2s}.memory-item:hover .memory-actions{opacity:1}.memory-actions button{border:0;background:none;color:#aaa3b0;padding:2px}.memory-actions button:hover{color:#7967ce}.memory-item>p{margin:11px 0 13px;color:#625b6c;font-size:11px;line-height:1.8}.memory-item-foot{display:flex;align-items:center;justify-content:space-between;gap:15px;color:#b1abb6;font-size:7px}.memory-item-foot>span{display:flex;align-items:center;gap:4px}.importance{display:flex;align-items:center;gap:6px}.importance>div{width:50px;height:3px;border-radius:3px;background:#eeebf1}.importance i{display:block;height:100%;border-radius:3px;background:#a18fde}.importance strong{color:#94899f;font-size:7px}.no-memory{padding:70px 20px;text-align:center;color:#aaa}.no-memory svg{margin:0 auto 15px;color:#b2a6d8}.no-memory h3{color:#6a6373;font-size:14px}.no-memory p{margin:7px 0 15px;font-size:10px}.memory-aside{display:flex;flex-direction:column;gap:15px}.character-memory-card,.distribution-card{padding:17px}.aside-char{display:flex;align-items:center;gap:10px}.aside-char img{width:42px;height:42px;border-radius:13px;object-fit:cover}.aside-char strong{display:block;font-size:12px}.aside-char span{display:flex;align-items:center;gap:4px;margin-top:5px;color:#8eaa9d;font-size:7px}.aside-char i{width:5px;height:5px;border-radius:50%;background:#65b79b}.memory-capacity{margin-top:17px}.memory-capacity>div:first-child{display:flex;justify-content:space-between;color:#a49eaa;font-size:8px}.memory-capacity strong{color:#8a7bd0}.memory-capacity>div:nth-child(2){height:4px;margin-top:8px;border-radius:4px;background:#eeebf2}.memory-capacity i{display:block;height:100%;border-radius:4px;background:#9a88df}.memory-capacity p{margin-top:8px;color:#b3adb8;font-size:7px;line-height:1.5}.distribution-card h3{font-size:11px}.distribution-list{margin-top:14px}.distribution-list>div{display:grid;grid-template-columns:1fr 20px;align-items:center;margin:11px 0}.distribution-list span{display:flex;align-items:center;gap:6px;color:#8b8494;font-size:9px}.distribution-list span i{width:6px;height:6px;border-radius:2px;background:#9b88df}.distribution-list span i.preference{background:#d99580}.distribution-list span i.event{background:#68adc2}.distribution-list span i.relationship{background:#d183a1}.distribution-list strong{text-align:right;color:#8c8495;font-size:9px}.distribution-list>div>div{grid-column:1/3;height:3px;margin-top:5px;background:#f0edf3;border-radius:3px}.distribution-list>div>div i{display:block;height:100%;border-radius:3px;background:#aa98e3}.distribution-list>div>div i.preference{background:#dfa28f}.distribution-list>div>div i.event{background:#7ab8c9}.distribution-list>div>div i.relationship{background:#d890aa}.memory-tip{padding:20px;background:linear-gradient(145deg,#efebfc,#f8f3f8);border-color:#e5def3}.memory-tip>span{color:#8b77d6}.memory-tip h3{margin-top:10px;font-size:11px;color:#6a5f7b}.memory-tip p{margin-top:8px;color:#968ba3;font-size:9px;line-height:1.7}.memory-tip a{display:flex;align-items:center;gap:4px;margin-top:12px;color:#7e6ac9;font-size:9px}.type-select{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:18px}.type-select button{height:38px;border:1px solid var(--line);border-radius:11px;background:white;color:#9992a1;font-size:11px}.type-select button.active{border-color:#b9abee;background:#f0ecfd;color:#7965cc}.edit-notice{margin-top:9px;color:#aaa3b0;font-size:9px}.delete-modal{text-align:center;max-width:420px}.delete-icon{width:50px;height:50px;display:grid;place-items:center;margin:0 auto 15px;border-radius:16px;background:#fff0eb;color:#d68c76}.delete-modal h2{font-size:18px}.delete-modal>p{margin-top:10px;color:#958e9d;font-size:11px;line-height:1.8}.delete-modal .modal-actions{justify-content:center}.delete-confirm{background:#d98675;color:white}
@media(max-width:1100px){.memory-layout{grid-template-columns:1fr 230px}.memory-main{padding:18px 15px}.timeline-item{grid-template-columns:50px 16px 1fr;gap:7px}}@media(max-width:900px){.memory-layout{grid-template-columns:1fr}.memory-aside{display:grid;grid-template-columns:1fr 1fr}.memory-tip{display:none}}@media(max-width:560px){.memory-main{padding:15px 10px}.memory-toolbar{overflow-x:auto}.memory-toolbar .icon-btn{display:none}.memory-toolbar .tab{padding:7px 10px;white-space:nowrap}.semantic-search .input{padding-right:42px}.semantic-search .input-wrap>button{width:32px;padding:0;justify-content:center;font-size:0}.timeline-item{grid-template-columns:14px 1fr;gap:6px}.timeline-date{display:none}.memory-aside{grid-template-columns:1fr}.memory-item{padding:13px}.memory-item-foot{align-items:flex-start;flex-direction:column}.memory-actions{opacity:1}.memory-stats .stat-label{font-size:9px}}

/* V3: 记忆卡上的编辑/删除按钮原本只有 18×25，padding + 负 margin 把可点区放大到 30×37，布局不变 */
.memory-item-head button { padding: 6px; margin: -6px 0; border: 0; border-radius: 8px; background: none; color: #8b8499; transition: all .18s; }
.memory-item-head button:hover { background: #f2eefc; color: #6c57c4; }
/* 语义搜索结果的相关度标签 */
.score-pill { display: inline-flex; align-items: center; padding: 2px 6px; border-radius: 6px; background: #eaf7f2; color: #4f9c82; font-size: 8px; font-weight: 600; }
.semantic-search .input-wrap>button:disabled { opacity: .6; cursor: default; }
</style>
