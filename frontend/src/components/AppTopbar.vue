<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Search, Bell, Menu, Plus, Sparkles, MessageCircleMore, BrainCircuit, Clock3 , Moon, Sun } from 'lucide-vue-next'
import { useAppStore } from '../stores/app'
import MusicWidget from './MusicWidget.vue'

const store = useAppStore()
const route = useRoute()
const router = useRouter()
const search = ref<HTMLInputElement>()
const notificationsOpen = ref(false)
const panelWrap = ref<HTMLElement>()
const title = computed(() => {
  const name = route.name?.toString() ?? 'hall'
  return ({ hall: '角色大厅', create: '创建角色', chat: '陪伴对话', galgame: '剧情模式', memory: '记忆管理', story: '剧情世界', gallery: '我的图库', catalog: '追番清单', dashboard: '数据仪表盘', reminders: '定时提醒' } as Record<string, string>)[name] ?? '角色宇宙'
})
const isConversationMode = computed(() => route.name === 'chat' || route.name === 'galgame')
const activeMode = computed(() => route.name === 'galgame' ? 'galgame' : 'chat')
const conversationCharacterId = computed(() => String(route.params.characterId ?? store.activeCharacterId))
const switchMode = (mode: 'chat' | 'galgame') => {
  if (mode !== activeMode.value) router.push({ name: mode, params: { characterId: conversationCharacterId.value } })
}

// 通知面板：待办提醒 + 最近写入的共同记忆，全部来自 store（原来是两条写死的假数据）
const NOTICE_META = {
  reminder: { icon: Clock3, className: 'peach' },
  memory: { icon: BrainCircuit, className: 'purple' },
  event: { icon: Sparkles, className: 'green' },
} as const
const formatDue = (iso: string) => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
const notifications = computed(() => {
  const list: { key: string; kind: keyof typeof NOTICE_META; title: string; text: string; time: string }[] = []
  const pending = store.reminders
    .filter(item => !item.done)
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
    .slice(0, 3)
  pending.forEach(item => {
    list.push({
      key: `reminder-${item.id}`,
      kind: 'reminder',
      title: item.title,
      text: `${formatDue(item.dueAt)} · 来自 ${store.characters.find(character => character.id === item.characterId)?.name ?? '角色'}`,
      time: '待提醒',
    })
  })
  const recent = [...store.memories].sort((a, b) => Number(b.id) - Number(a.id)).slice(0, Math.max(0, 4 - list.length))
  recent.forEach(memory => {
    list.push({
      key: `memory-${memory.id}`,
      kind: memory.source === 'story' ? 'event' : 'memory',
      title: memory.source === 'story' ? '剧情事件已回写' : '新的共同记忆',
      text: memory.content.slice(0, 42),
      time: memory.time || memory.date,
    })
  })
  return list
})
const closeOnOutside = (event: PointerEvent) => {
  if (!notificationsOpen.value) return
  const target = event.target as Node | null
  if (target && panelWrap.value?.contains(target)) return
  notificationsOpen.value = false
}
const keyHandler = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); search.value?.focus() }
}
const submitSearch = () => { if (route.path !== '/') router.push('/') }
onMounted(() => {
  window.addEventListener('keydown', keyHandler)
  document.addEventListener('pointerdown', closeOnOutside)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', keyHandler)
  document.removeEventListener('pointerdown', closeOnOutside)
})

</script>

<template>
  <header class="topbar" :class="{ 'conversation-route': isConversationMode }">
    <div class="topbar-left">
      <button class="menu-btn" @click="store.sidebarOpen = true"><Menu :size="21" /></button>
      <div class="route-title">{{ title }}<span>/</span><small>AniVerse</small></div>
    </div>
    <div class="topbar-actions">
      <div v-if="isConversationMode && route.params.characterId === 'orihime'" class="mode-switch" aria-label="对话模式切换">
        <button :class="{ active: activeMode === 'galgame' }" @click="switchMode('galgame')"><Sparkles :size="13" />剧情模式</button>
        <button :class="{ active: activeMode === 'chat' }" @click="switchMode('chat')"><MessageCircleMore :size="13" />对话模式</button>
      </div>
      <div class="input-wrap global-search">
        <Search :size="16" />
        <input ref="search" v-model="store.query" class="input" placeholder="搜索角色、记忆或番剧…" @keyup.enter="submitSearch" />
        <kbd>⌘ K</kbd>
      </div>
      <button class="icon-btn theme-toggle" type="button" :aria-label="store.theme === 'dark' ? '切换到浅色' : '切换到暗色'" @click="store.toggleTheme($event)">
          <Sun v-if="store.theme === 'dark'" :size="17" />
          <Moon v-else :size="17" />
        </button>
        <MusicWidget />
      <div ref="panelWrap" class="notification-wrap">        <button class="icon-btn notification-btn" :aria-expanded="notificationsOpen" aria-label="通知" @click="notificationsOpen = !notificationsOpen"><Bell :size="18" /><i v-if="notifications.length" /></button>
        <Transition name="fade">
          <div v-if="notificationsOpen" class="notification-panel card">
            <div class="notification-title"><strong>通知</strong><span>{{ notifications.length ? `${notifications.length} 条` : '暂无新通知' }}</span></div>
            <div v-for="notice in notifications" :key="notice.key" class="notice">
              <span class="notice-icon" :class="NOTICE_META[notice.kind].className"><component :is="NOTICE_META[notice.kind].icon" :size="16" /></span>
              <div><strong>{{ notice.title }}</strong><p>{{ notice.text }}</p></div>
              <small>{{ notice.time }}</small>
            </div>
            <p v-if="!notifications.length" class="notice-empty">新的共同记忆和待办提醒会出现在这里。</p>
          </div>
        </Transition>
      </div>
      <button class="btn btn-primary top-create" @click="router.push('/create')"><Plus :size="16" /><span>创建角色</span></button>
    </div>
  </header>
</template>

<style scoped>
.topbar { height: 76px; display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 0 34px; border-bottom: 1px solid rgba(231,229,238,.8); background: rgba(246,246,250,.82); backdrop-filter: blur(18px); position: sticky; top: 0; z-index: 35; }
.topbar-left, .topbar-actions { display: flex; align-items: center; gap: 12px; }
.mode-switch { display: flex; align-items: center; gap: 3px; padding: 3px; border: 1px solid rgba(225,220,235,.8); border-radius: 12px; background: rgba(237,234,245,.75); }
.mode-switch button { display: flex; align-items: center; justify-content: center; gap: 5px; min-height: 33px; padding: 0 10px; border: 0; border-radius: 9px; background: transparent; color: #7c768a; font-size: 10px; white-space: nowrap; transition: color .18s,background .18s,box-shadow .18s; }
.mode-switch button.active { color: #6651c7; background: rgba(255,255,255,.94); box-shadow: 0 3px 10px rgba(52,40,83,.08); }
.route-title { color: #626073; font-size: 12px; font-weight: 600; white-space: nowrap; }
.route-title span { color: #d2cfda; margin: 0 9px; }
.route-title small { color: #aaa7b5; font-size: 11px; font-weight: 400; }
.global-search { width: min(300px, 24vw); }
.global-search .input { border-color: transparent; background: #eeeef3; height: 39px; font-size: 12px; }
.global-search .input:focus { background: white; border-color: #cfc8f1; }
kbd { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); padding: 3px 6px; border: 1px solid #dcd9e5; border-radius: 5px; color: #aaa6b4; background: #f8f7fa; font-size: 9px; font-family: inherit; }
.notification-wrap { position: relative; }
.notification-btn { width: 39px; height: 39px; background: transparent; border-color: transparent; }
.notification-btn i { position: absolute; right: 8px; top: 7px; width: 6px; height: 6px; background: #ee8b78; border: 2px solid #f6f6fa; box-sizing: content-box; border-radius: 50%; }
.notification-panel { position: absolute; right: 0; top: 49px; width: 340px; padding: 18px; box-shadow: 0 20px 60px rgba(40,32,70,.16); }
.notification-title { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.notification-title strong { font-size: 14px; }
.notification-title span { font-size: 10px; color: #8a78df; }
.notice { display: flex; gap: 11px; padding: 13px 0; border-bottom: 1px solid #f0eef4; }
.notice:last-child { border: 0; padding-bottom: 0; }
.notice-icon { width: 33px; height: 33px; display: grid; place-items: center; border-radius: 10px; flex-shrink: 0; }
.notice-icon.purple { background: #efecff; color: #7765df; }.notice-icon.peach { background: #fff0e8; color: #d98b6d; }.notice-icon.green { background: #eaf7f1; color: #5ca98f; }
.notice strong { font-size: 11px; }.notice p { font-size: 10px; color: #888496; margin: 4px 0; line-height: 1.5; }.notice small { font-size: 9px; color: #b3afbc; }
.top-create { min-height: 39px; padding: 0 15px; font-size: 12px; }
.menu-btn { display: none; width: 38px; height: 38px; place-items: center; border: 0; background: transparent; color: #6e6a7c; }
.topbar { height: 72px; background: rgba(250,249,253,.76); border-bottom-color: rgba(227,223,236,.72); box-shadow: 0 4px 22px rgba(46,36,74,.025); }
.global-search .input { border: 1px solid rgba(228,224,237,.7); background: rgba(255,255,255,.58); box-shadow: inset 0 1px 2px rgba(52,42,80,.02); }
.global-search .input:focus { box-shadow: 0 0 0 4px rgba(117,102,232,.07),0 8px 22px rgba(56,43,88,.05); }
.notification-btn:hover { background: rgba(239,235,249,.8); }
.top-create { box-shadow: 0 8px 20px rgba(117,102,232,.2); }
.notification-panel { border-radius: 18px; backdrop-filter: blur(24px); }
@media (max-width: 1180px) { .topbar { padding: 0 24px; } .global-search { width: 220px; } .conversation-route .global-search { display:none; } }
@media (max-width: 820px) { .topbar { height: 65px; padding: 0 16px; } .menu-btn { display: grid; } .route-title span,.route-title small { display:none; } .global-search { width: 190px; } .top-create span { display:none; } .top-create { width:39px; padding:0; } }
@media (max-width: 560px) { .global-search { display:none; } .topbar-actions { gap:6px; } .mode-switch button { min-height:31px; padding:0 7px; font-size:9px; gap:3px; } .mode-switch button svg { display:none; } .notification-panel { position: fixed; left: 16px; right: 16px; top: 61px; width:auto; } }
.notice-empty { margin: 4px 0 0; color: #a9a2b4; font-size: 10px; line-height: 1.7; }
.notice > div { min-width: 0; }
.notice p { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

/* 顶栏：路由切换时面包屑轻微刷新，提示"换页了" */
.topbar-left { animation: topbarIn var(--dur-3) var(--ease-soft) both; }
@keyframes topbarIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
</style>
