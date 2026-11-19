<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Orbit, LayoutGrid, MessageCircleMore, BrainCircuit, BookOpen, Images, Clapperboard, BarChart3, Plus, Settings, Sparkles, X } from 'lucide-vue-next'
import { useAppStore } from '../stores/app'

const store = useAppStore()
const route = useRoute()
const active = computed(() => store.activeCharacter)
const primaryNav = computed(() => [
  { label: '角色大厅', path: '/', icon: LayoutGrid },
  { label: '陪伴对话', path: `/chat/${active.value.id}`, icon: MessageCircleMore },
  { label: '记忆管理', path: `/memory/${active.value.id}`, icon: BrainCircuit },
  { label: '剧情世界', path: '/story/seaside', icon: BookOpen },
])
const discoveryNav = [
  { label: '我的图库', path: '/gallery', icon: Images },
  { label: '追番清单', path: '/catalog', icon: Clapperboard },
  { label: '数据仪表盘', path: '/dashboard', icon: BarChart3 },
]
const isActive = (path: string) => path === '/' ? route.path === '/' : route.path.startsWith(path.split('/').slice(0, 2).join('/'))
</script>

<template>
  <Transition name="fade"><div v-if="store.sidebarOpen" class="sidebar-mask" @click="store.sidebarOpen = false" /></Transition>
  <aside class="sidebar" :class="{ open: store.sidebarOpen }">
    <div class="brand-row">
      <RouterLink to="/" class="brand" @click="store.sidebarOpen = false">
        <span class="brand-mark"><Orbit :size="25" :stroke-width="1.8" /></span>
        <span><strong>AniVerse</strong><small>角色宇宙</small></span>
      </RouterLink>
      <button class="mobile-close" @click="store.sidebarOpen = false"><X :size="20" /></button>
    </div>

    <button class="create-entry" @click="$router.push('/create'); store.sidebarOpen = false">
      <Plus :size="17" /> 创建新角色
      <span>✦</span>
    </button>

    <nav class="nav-area">
      <div class="nav-label">宇宙空间</div>
      <RouterLink v-for="item in primaryNav" :key="item.label" :to="item.path" class="nav-item" :class="{ active: isActive(item.path) }" @click="store.setActiveCharacter(active.id); store.sidebarOpen = false">
        <component :is="item.icon" :size="18" :stroke-width="1.8" />
        <span>{{ item.label }}</span>
        <i v-if="item.label === '陪伴对话'" class="online-dot" />
      </RouterLink>
      <div class="nav-label second">收藏与发现</div>
      <RouterLink v-for="item in discoveryNav" :key="item.label" :to="item.path" class="nav-item" :class="{ active: isActive(item.path) }" @click="store.sidebarOpen = false">
        <component :is="item.icon" :size="18" :stroke-width="1.8" />
        <span>{{ item.label }}</span>
      </RouterLink>
    </nav>

    <div class="sidebar-bottom">
      <div class="universe-status">
        <div class="status-icon"><Sparkles :size="17" /></div>
        <div><strong>宇宙运转正常</strong><span>本地演示数据已同步</span></div>
        <span class="live-dot" />
      </div>
      <div class="user-card">
        <div class="user-avatar">林<span /></div>
        <div class="user-info"><strong>林间旅人</strong><span>宇宙管理员</span></div>
        <Settings :size="17" />
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar { position: fixed; inset: 0 auto 0 0; width: 242px; z-index: 50; display: flex; flex-direction: column; padding: 26px 18px 18px; background: rgba(252, 252, 254, .94); border-right: 1px solid #e9e8ef; backdrop-filter: blur(20px); }
.brand-row { display: flex; align-items: center; justify-content: space-between; padding: 0 9px; }
.brand { display: flex; align-items: center; gap: 11px; }
.brand-mark { width: 39px; height: 39px; border-radius: 13px; display: grid; place-items: center; color: white; background: linear-gradient(135deg, #8e7df0, #6554d9); box-shadow: 0 8px 18px rgba(117, 102, 232, .25); }
.brand strong { display: block; font-size: 18px; letter-spacing: -.4px; }
.brand small { display: block; margin-top: 1px; color: #9b98aa; font-size: 10px; letter-spacing: 3px; }
.create-entry { margin: 28px 4px 24px; height: 43px; display: flex; align-items: center; gap: 8px; padding: 0 14px; border: 1px solid #e0dcf5; border-radius: 13px; background: #f3f0ff; color: #6858d5; font-size: 13px; font-weight: 600; transition: all .2s; }
.create-entry:hover { background: #ebe6ff; border-color: #cfc6f7; }
.create-entry span { margin-left: auto; }
.nav-area { flex: 1; }
.nav-label { padding: 0 13px; margin: 0 0 9px; color: #aaa7b5; font-size: 10px; font-weight: 600; letter-spacing: 1.2px; }
.nav-label.second { margin-top: 26px; }
.nav-item { position: relative; display: flex; align-items: center; gap: 12px; height: 43px; margin: 3px 0; padding: 0 13px; border-radius: 12px; color: #777487; font-size: 13px; font-weight: 500; transition: all .18s; }
.nav-item:hover { background: #f3f1f8; color: #4d465e; }
.nav-item.active { color: #6554d5; background: #efecfb; font-weight: 600; }
.nav-item.active::before { content: ''; position: absolute; left: -18px; height: 20px; width: 3px; border-radius: 0 4px 4px 0; background: #7968e6; }
.online-dot { margin-left: auto; width: 6px; height: 6px; border-radius: 50%; background: #63bea5; box-shadow: 0 0 0 3px #ddf4ec; }
.sidebar-bottom { margin-top: auto; }
.universe-status { display: flex; align-items: center; gap: 9px; margin: 0 3px 14px; padding: 12px 10px; border-radius: 13px; background: #f6f4fb; }
.status-icon { color: #8a78de; }
.universe-status strong, .universe-status span { display: block; }
.universe-status strong { font-size: 10px; font-weight: 600; }
.universe-status div span { margin-top: 3px; color: #aaa6b5; font-size: 9px; }
.live-dot { margin-left: auto; width: 6px; height: 6px; border-radius: 50%; background: #68bba4; }
.user-card { display: flex; align-items: center; gap: 10px; padding: 13px 7px 2px; border-top: 1px solid #eeecf2; color: #9793a4; }
.user-avatar { position: relative; width: 35px; height: 35px; display: grid; place-items: center; border-radius: 12px; background: linear-gradient(135deg, #e5d5c7, #cab9db); color: #55455f; font-size: 13px; font-weight: 700; }
.user-avatar span { position: absolute; right: -1px; bottom: -1px; width: 9px; height: 9px; border: 2px solid white; border-radius: 50%; background: #65b99f; }
.user-info { flex: 1; }
.user-info strong, .user-info span { display: block; }
.user-info strong { color: #514e5e; font-size: 11px; }
.user-info span { margin-top: 3px; font-size: 9px; }
.mobile-close { display: none; border: 0; background: none; color: #777; }
.sidebar-mask { display: none; }
.sidebar { background: linear-gradient(180deg,rgba(253,252,255,.97),rgba(248,247,252,.96)); border-right-color: rgba(228,224,237,.8); box-shadow: 8px 0 35px rgba(49,38,78,.025); }
.brand-mark { position: relative; overflow: hidden; box-shadow: 0 10px 24px rgba(117,102,232,.28),inset 0 1px 0 rgba(255,255,255,.35); }
.brand-mark::after { content: ''; position: absolute; width: 26px; height: 10px; border: 1px solid rgba(255,255,255,.35); border-radius: 50%; transform: rotate(-28deg); }
.create-entry { background: linear-gradient(135deg,#f0ebff,#f6f2ff); box-shadow: inset 0 1px 0 rgba(255,255,255,.8); }
.create-entry:hover { transform: translateY(-1px); box-shadow: 0 8px 20px rgba(104,88,213,.09); }
.nav-item { border: 1px solid transparent; }
.nav-item.active { border-color: rgba(219,211,241,.55); background: linear-gradient(90deg,#eee9fb,#f3f0fc); box-shadow: 0 5px 15px rgba(79,60,126,.04); }
.nav-item.active::before { height: 22px; box-shadow: 0 0 10px rgba(121,104,230,.25); }
.universe-status { border: 1px solid #ebe6f4; background: linear-gradient(135deg,#f4f0fb,#f8f6fc); }
.user-card { padding-top: 15px; }
@media (max-width: 1180px) { .sidebar { width: 214px; } }
@media (max-width: 820px) {
  .sidebar { width: 250px; transform: translateX(-105%); transition: transform .25s ease; box-shadow: 20px 0 60px rgba(30,25,50,.15); }
  .sidebar.open { transform: translateX(0); }
  .sidebar-mask { display: block; position: fixed; inset: 0; z-index: 45; background: rgba(30,25,50,.3); backdrop-filter: blur(3px); }
  .mobile-close { display: block; }
}
</style>
