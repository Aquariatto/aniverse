<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowUp } from 'lucide-vue-next'
import AppSidebar from './components/AppSidebar.vue'
import AppTopbar from './components/AppTopbar.vue'
import NoticeGate from './components/NoticeGate.vue'
import UpdateBanner from './components/UpdateBanner.vue'
import ToastStack from './components/ToastStack.vue'
import { useAppStore, persistAssets, persistCharacters, persistMemories, persistMessages, persistReminders, persistWatchlist } from './stores/app'

const route = useRoute()
// 用 location.pathname 做初始值：直接打开 /gallery 时，route.path 会先短暂是 '/'
// 导致 home-mode 先加上再摘掉，整页横向抖一下（实测 CLS 0.16）。
const immersiveHome = ref(window.location.pathname === '/')
watch(() => route.path, path => { immersiveHome.value = path === '/' })
const store = useAppStore()

/* ---------------- 动效增强 ---------------- */

/** 路由进度条：懒加载路由切换时给一点"正在发生"的反馈 */
const progress = ref(0)
let progressTimer = 0
let progressHide = 0
const startProgress = () => {
  window.clearTimeout(progressHide)
  window.clearTimeout(progressTimer)
  progress.value = 10
  progressTimer = window.setTimeout(() => { progress.value = 68 }, 40)
}
const finishProgress = () => {
  window.clearTimeout(progressTimer)
  progress.value = 100
  progressHide = window.setTimeout(() => { progress.value = 0 }, 380)
}

/** 回到顶部按钮：滚过一屏才出现 */
const showBackTop = ref(false)
const onScroll = () => { showBackTop.value = window.scrollY > 240 }
const scrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' })

/**
 * 滚动进场：只劫持「首屏之外」的区块，
 * 首屏元素直接标记 is-in，避免一进来就看不见内容。
 */
let revealObserver: IntersectionObserver | undefined
const setupReveal = async () => {
  await nextTick()
  // 视图根节点下面还有一层包装，直接取它的子元素才拿得到"真正的区块"
  let nodes = Array.from(document.querySelectorAll<HTMLElement>('.page-container > * > *'))
  if (!nodes.length) nodes = Array.from(document.querySelectorAll<HTMLElement>('.page-container > *'))
  nodes.forEach(node => { node.classList.remove('reveal', 'is-in'); node.style.transitionDelay = '' })
  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    nodes.forEach(node => node.classList.add('is-in'))
    return
  }
  revealObserver?.disconnect()
  revealObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      entry.target.classList.add('is-in')
      revealObserver?.unobserve(entry.target)
    }
  }, { threshold: 0.04, rootMargin: '0px 0px -6% 0px' })
  const fold = window.innerHeight * 0.92
  nodes.forEach((node, index) => {
    if (index < 3 || node.getBoundingClientRect().top < fold) { node.classList.add('is-in'); return }
    node.classList.add('reveal')
    node.style.transitionDelay = `${Math.min(index * 45, 220)}ms`
    revealObserver?.observe(node)
  })
}

/** 按钮涟漪：把所有 .btn 的按压变成一圈扩散 */
const onPointerDown = (event: PointerEvent) => {
  const target = (event.target as HTMLElement)?.closest?.('.btn') as HTMLElement | null
  if (!target || target.hasAttribute('disabled') || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const rect = target.getBoundingClientRect()
  const size = Math.max(rect.width, rect.height)
  const dot = document.createElement('span')
  dot.className = 'ripple-dot'
  dot.style.width = dot.style.height = `${size}px`
  dot.style.left = `${event.clientX - rect.left - size / 2}px`
  dot.style.top = `${event.clientY - rect.top - size / 2}px`
  target.appendChild(dot)
  window.setTimeout(() => dot.remove(), 620)
}

let flushTimer = 0
let reminderTimer = 0
let stopSubscribe: (() => void) | undefined

const flush = () => {
  window.clearTimeout(flushTimer)
  flushTimer = 0
  persistMessages(store.messages)
  persistMemories(store.memories)
  persistReminders(store.reminders)
  persistCharacters(store.characters)
  persistAssets(store.assets)
  persistWatchlist(store.watchlist)
}

const onPageHide = () => flush()

/** 路由切换：进度条 + 重新布置滚动进场 */
watch(() => route.fullPath, async () => {
  startProgress()
  await nextTick()
  window.setTimeout(finishProgress, 280)
  void setupReveal()
})

/**
 * 图片兜底（img 的 error 事件不冒泡，用捕获阶段监听）：
 *   第 1 次失败 → 带 retry 参数重试一次（缓存/抖动可能自愈）
 *   第 2 次失败 → 换成内联 SVG 占位（渐变底 + 首字），
 *                宁可显示占位也不出现破图标和溢出的 alt 文字
 */
const placeholderFor = (label: string) => {
  const initial = (label || '·').trim().charAt(0) || '·'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#b9a8e6"/><stop offset="1" stop-color="#8f7ae4"/>
</linearGradient></defs>
<rect width="400" height="400" fill="url(#g)"/>
<text x="50%" y="52%" font-size="150" text-anchor="middle" dominant-baseline="middle"
 fill="rgba(255,255,255,.9)" font-family="system-ui, sans-serif">${initial}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

onMounted(() => {
  document.documentElement.dataset.theme = store.theme
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('pointerdown', onPointerDown, { passive: true })
  onScroll()
  void setupReveal()
  // 懒加载路由的视图可能晚一两帧才挂上，补扫一次
  window.setTimeout(() => void setupReveal(), 220)
  window.setTimeout(() => void setupReveal(), 700)
  document.addEventListener('error', (event) => {
    const target = event.target
    if (!(target instanceof HTMLImageElement)) return
    const url = target.currentSrc || target.src
    if (!url || url.startsWith('data:')) return
    if (!target.dataset.retried) {
      target.dataset.retried = '1'
      target.src = `${url}${url.includes('?') ? '&' : '?'}retry=${Date.now()}`
      return
    }
    if (target.dataset.placeholder) return
    target.dataset.placeholder = '1'
    target.style.color = 'transparent'
    target.src = placeholderFor(target.alt || '')
  }, true)

  // 深监听会被「打字机动画」这种高频 mutation 反复触发（一次回复几十次），
  // 所以：AI 回复期间不落盘，结束后合并成一次，避免同步 JSON.stringify 写入风暴。
  stopSubscribe = store.$subscribe(() => {
    if (flushTimer || store.sending || store.drawingFor) return
    flushTimer = window.setTimeout(flush, 600)
  })
  window.addEventListener('pagehide', onPageHide)
  window.addEventListener('beforeunload', onPageHide)

  reminderTimer = window.setInterval(() => {
    const nowMs = Date.now()
    for (const item of [...store.reminders]) {
      if (item.done || !item.dueAt) continue
      const due = new Date(item.dueAt).getTime()
      if (!Number.isFinite(due) || due > nowMs) continue
      // 每日 / 每周提醒：到点后推到下一次，而不是直接标记成已完成
      if (item.repeat !== 'none' && store.rescheduleReminder(item.id)) {
        const next = new Date(item.dueAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
        store.notify('⏰ 提醒', `${item.title}（下次 ${next}）`, 'info')
        continue
      }
      store.completeReminder(item.id)
      store.notify('⏰ 提醒', item.title, 'info')
    }
  }, 20000)
})

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('pointerdown', onPointerDown)
  revealObserver?.disconnect()

  stopSubscribe?.()
  stopSubscribe = undefined
  window.clearInterval(reminderTimer)
  window.removeEventListener('pagehide', onPageHide)
  window.removeEventListener('beforeunload', onPageHide)
  flush()
})
</script>

<template>
  <div class="app-shell" :class="{ 'home-mode': immersiveHome }">
    <AppSidebar v-if="!immersiveHome" />
    <div class="app-main">
      <AppTopbar v-if="!immersiveHome" />
      <main class="page-container">
        <RouterView v-slot="{ Component }">
          <Transition name="page" mode="out-in">
            <component :is="Component" />
          </Transition>
        </RouterView>
      </main>
    </div>
    <ToastStack />
    <!-- 进度条与回到顶部挂到 body，避免被页面容器的层叠上下文压住 -->
    <Teleport to="body">
      <div class="route-progress" :class="{ active: progress > 0, finishing: progress >= 100 }" :style="{ '--p': progress + '%' }" />
      <button class="back-top" :class="{ show: showBackTop }" type="button" aria-label="回到顶部" @click="scrollTop"><ArrowUp :size="18" /></button>
    </Teleport>
    <NoticeGate />
    <UpdateBanner />
  </div>
</template>
