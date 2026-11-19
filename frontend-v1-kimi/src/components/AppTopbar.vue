<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Search, Bell, Menu, Plus, Sparkles, MessageCircleMore, BrainCircuit, Check } from 'lucide-vue-next'
import { useAppStore } from '../stores/app'

const store = useAppStore()
const route = useRoute()
const router = useRouter()
const search = ref<HTMLInputElement>()
const notificationsOpen = ref(false)
const title = computed(() => {
  const name = route.name?.toString() ?? 'hall'
  return ({ hall: '角色大厅', create: '创建角色', chat: '陪伴对话', memory: '记忆管理', story: '剧情世界', gallery: '我的图库', catalog: '追番清单', dashboard: '数据仪表盘' } as Record<string, string>)[name] ?? '角色宇宙'
})
const keyHandler = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); search.value?.focus() }
}
const submitSearch = () => { if (route.path !== '/') router.push('/') }
onMounted(() => window.addEventListener('keydown', keyHandler))
onBeforeUnmount(() => window.removeEventListener('keydown', keyHandler))
</script>

<template>
  <header class="topbar">
    <div class="topbar-left">
      <button class="menu-btn" @click="store.sidebarOpen = true"><Menu :size="21" /></button>
      <div class="route-title">{{ title }}<span>/</span><small>AniVerse</small></div>
    </div>
    <div class="topbar-actions">
      <div class="input-wrap global-search">
        <Search :size="16" />
        <input ref="search" v-model="store.query" class="input" placeholder="搜索角色、记忆或番剧…" @keyup.enter="submitSearch" />
        <kbd>⌘ K</kbd>
      </div>
      <div class="notification-wrap">
        <button class="icon-btn notification-btn" @click="notificationsOpen = !notificationsOpen"><Bell :size="18" /><i /></button>
        <Transition name="fade">
          <div v-if="notificationsOpen" class="notification-panel card">
            <div class="notification-title"><strong>宇宙动态</strong><span>3 条新消息</span></div>
            <div class="notice"><span class="notice-icon purple"><BrainCircuit :size="16" /></span><div><strong>新的记忆已沉淀</strong><p>织姬记住了你完成课程设计的心情</p><small>刚刚</small></div></div>
            <div class="notice"><span class="notice-icon peach"><MessageCircleMore :size="16" /></span><div><strong>收到一条新问候</strong><p>澪正在海边等你周末的约定</p><small>12 分钟前</small></div></div>
            <div class="notice"><span class="notice-icon green"><Check :size="16" /></span><div><strong>世界状态已同步</strong><p>剧情事件成功回写到长期记忆</p><small>1 小时前</small></div></div>
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
@media (max-width: 1180px) { .topbar { padding: 0 24px; } .global-search { width: 220px; } }
@media (max-width: 820px) { .topbar { height: 65px; padding: 0 16px; } .menu-btn { display: grid; } .route-title span,.route-title small { display:none; } .global-search { width: 190px; } .top-create span { display:none; } .top-create { width:39px; padding:0; } }
@media (max-width: 560px) { .global-search { display:none; } .notification-panel { position: fixed; left: 16px; right: 16px; top: 61px; width:auto; } }
</style>
