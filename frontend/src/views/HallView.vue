<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowDown, ArrowRight, ArrowUpRight, BarChart3, BookOpen, BrainCircuit, ChevronRight, Clapperboard, Clock3, Heart, Images, MessageCircleMore, Orbit, Plus, Sparkles, UsersRound, X , Menu , ImageIcon , ChartColumn , ChevronDown , Check } from 'lucide-vue-next'
import CharacterCard from '../components/CharacterCard.vue'
import UniverseScene from '../components/UniverseScene.vue'
import ConsoleConstellation from '../components/ConsoleConstellation.vue'
import RollingNumber from '../components/RollingNumber.vue'
import { attachHudProjection } from '../scene/hudProjection'
import MusicWidget from '../components/MusicWidget.vue'
import { thumbUrl } from '../data/assets'
import { useAppStore } from '../stores/app'
import type { Memory } from '../data/mock'

const store = useAppStore()
const selectedMemory = ref<Memory | null>(null)
const heroScroll = ref(0)
const heroElement = ref<HTMLElement>()
const activityFeed = computed(() => {
  const colorOf = (type: string) => type === 'event' ? 'purple' : type === 'preference' ? 'blue' : type === 'relationship' ? 'orange' : 'green'
  const textOf = (type: string) => type === 'event' ? '沉淀了一条新记忆'
    : type === 'preference' ? '记下了你的一个偏好'
    : type === 'relationship' ? '更新了你们之间的羁绊'
    : '记住了一件关于你的事'
  return [...store.memories]
    .sort((a, b) => Number(b.id) - Number(a.id))
    .slice(0, 4)
    .map(memory => ({
      key: `m-${memory.id}`,
      name: store.characterById(memory.characterId)?.name?.slice(0, 3) ?? '她',
      text: `${textOf(memory.type)}：${String(memory.content).slice(0, 18)}`,
      time: memory.date || memory.time || '',
      color: colorOf(memory.type),
    }))
})
const menuOpen = ref(false)
const charMenuOpen = ref(false)
const heroCursor = ref<HTMLDivElement>()
const cursorLabel = ref('')
const typeLabels: Record<Memory['type'], string> = { fact: '事实记忆', preference: '偏好记忆', event: '事件记忆', relationship: '羁绊记忆' }
const activeMemories = computed(() => store.memoriesByCharacter(store.activeCharacter.id).slice(0, 7))
const averageAffinity = computed(() => Math.round(store.characters.reduce((sum, character) => sum + character.affinity, 0) / store.characters.length))
const totalMessages = computed(() => Object.values(store.messages).reduce((sum, messages) => sum + messages.length, 0))
const consoleStats = computed(() => [
  { key: 'characters', label: '共鸣角色', value: store.characters.length, pad: 2, trend: '+1 本月', tone: 'purple', icon: UsersRound },
  { key: 'messages', label: '对话消息', value: totalMessages.value, pad: 0, trend: '持续生长', tone: 'blue', icon: MessageCircleMore },
  { key: 'memories', label: '长期记忆', value: store.memories.length, pad: 0, trend: '跨域同步', tone: 'peach', icon: BrainCircuit },
  { key: 'affinity', label: '平均共鸣', value: averageAffinity.value, pad: 0, trend: '关系升温', tone: 'green', icon: Heart },
])
const featureLinks = computed(() => [
  { title: '陪伴对话', en: 'CONVERSATION', description: '延续每一次未完成的对话', path: `/chat/${store.activeCharacter.id}`, icon: MessageCircleMore, color: 'purple' },
  { title: '记忆空间', en: 'MEMORY ARCHIVE', description: '整理共同经历与长期记忆', path: `/memory/${store.activeCharacter.id}`, icon: BrainCircuit, color: 'blue' },
  { title: '剧情世界', en: 'STORY WORLD', description: '让选择推动世界状态变化', path: '/story/seaside', icon: BookOpen, color: 'peach' },
  { title: '我的图库', en: 'VISUAL GALLERY', description: '收藏角色与故事的视觉碎片', path: '/gallery', icon: Images, color: 'green' },
  { title: '追番清单', en: 'ANIME CATALOG', description: '记录每一份热爱与观看进度', path: '/catalog', icon: Clapperboard, color: 'pink' },
  { title: '数据仪表盘', en: 'UNIVERSE DATA', description: '看见记忆与关系的流动轨迹', path: '/dashboard', icon: BarChart3, color: 'violet' },
])
watch(() => store.activeCharacter.id, () => { selectedMemory.value = null })
const selectCharacter = (id: string) => {
  store.setActiveCharacter(id)
  selectedMemory.value = null
}
const handleMemorySelect = (memory: Memory | null) => { selectedMemory.value = memory }
const scrollTop = () => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
let heroScrollFrame = 0
const updateHeroScroll = () => {
  if (heroScrollFrame) return
  heroScrollFrame = requestAnimationFrame(() => {
    heroScrollFrame = 0
    heroScroll.value = Math.min(window.scrollY / Math.max(window.innerHeight * 0.72, 1), 0.82)
  })
}
let cursorFrame = 0
let cursorX = -100
let cursorY = -100
let cursorTargetX = -100
let cursorTargetY = -100
const magneticCleanups: Array<() => void> = []
const onHeroPointerMove = (event: PointerEvent) => {
  const hero = heroElement.value
  if (!hero) return
  const rect = hero.getBoundingClientRect()
  cursorTargetX = event.clientX
  cursorTargetY = event.clientY
  hero.style.setProperty('--mouse-x', ((event.clientX - rect.left) / rect.width - 0.5).toFixed(3))
  hero.style.setProperty('--mouse-y', ((event.clientY - rect.top) / rect.height - 0.5).toFixed(3))
  heroCursor.value?.classList.add('visible')
  const target = event.target as Element
  cursorLabel.value = target.closest('canvas') ? 'DRAG' : target.closest('a,button') ? 'OPEN' : ''
  heroCursor.value?.classList.toggle('active', Boolean(target.closest('a,button,canvas')))
}
const onHeroPointerLeave = () => {
  heroCursor.value?.classList.remove('visible')
  heroElement.value?.style.setProperty('--mouse-x', '0')
  heroElement.value?.style.setProperty('--mouse-y', '0')
}
const animateCursor = () => {
  cursorX += (cursorTargetX - cursorX) * 0.16
  cursorY += (cursorTargetY - cursorY) * 0.16
  if (heroCursor.value) heroCursor.value.style.transform = `translate3d(${cursorX - 18}px,${cursorY - 18}px,0)`
  cursorFrame = requestAnimationFrame(animateCursor)
}
let hudCleanup: (() => void) | undefined
const setupPointerInteractions = () => {
  const hero = heroElement.value
  if (!hero || !window.matchMedia('(pointer:fine)').matches) return
  hero.addEventListener('pointermove', onHeroPointerMove)
  hero.addEventListener('pointerleave', onHeroPointerLeave)
  cursorFrame = requestAnimationFrame(animateCursor)
  const section = document.querySelector<HTMLElement>('#console')
  if (section) {
    hudCleanup = attachHudProjection(
      section,
      [{ group: '.console-stats', item: '.console-stat' }, { group: '.feature-grid', item: '.feature-entry' }],
      { maxTilt: 1.25, maxBulge: 0.024 },
    )
  }
  hero.querySelectorAll<HTMLElement>('.hero-primary,.hero-story,.nav-create,.switcher-list>button').forEach(element => {
    const move = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect()
      const x = (event.clientX - rect.left - rect.width / 2) * 0.12
      const y = (event.clientY - rect.top - rect.height / 2) * 0.16
      element.style.translate = `${x}px ${y}px`
    }
    const leave = () => { element.style.translate = '0 0' }
    element.addEventListener('pointermove', move)
    element.addEventListener('pointerleave', leave)
    magneticCleanups.push(() => {
      element.removeEventListener('pointermove', move)
      element.removeEventListener('pointerleave', leave)
    })
  })
  document.querySelectorAll<HTMLElement>('.feature-entry,.console-stat').forEach(element => {
    const move = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect()
      const localX = event.clientX - rect.left
      const localY = event.clientY - rect.top
      element.style.setProperty('--spot-x', `${localX}px`)
      element.style.setProperty('--spot-y', `${localY}px`)
      element.style.translate = `${(localX - rect.width / 2) * 0.018}px ${(localY - rect.height / 2) * 0.025}px`
    }
    const leave = () => { element.style.translate = '0 0' }
    element.addEventListener('pointermove', move)
    element.addEventListener('pointerleave', leave)
    magneticCleanups.push(() => {
      element.removeEventListener('pointermove', move)
      element.removeEventListener('pointerleave', leave)
    })
  })
}
const revealTimers: number[] = []
let revealFrame = 0
let revealCleanup: (() => void) | undefined
/**
 * 入场揭示。
 * 原本用的是 IntersectionObserver，但它只在"相交状态变化"时回调：
 * 瞬间跳转、锚点直达、浏览器回滚恢复时，被跳过去的元素一次回调都收不到，
 * 就永远停在 opacity:0（页脚曾经整条消失就是这个原因）。
 * 改成滚动扫描 + 一次性清单，跳过去的直接点亮、不留动画。
 */
const setupConsoleAnimations = () => {
  const items = Array.from(document.querySelectorAll<HTMLElement>('.console-heading,.console-stat,.feature-entry,.character-section-head,.character-card,.new-character-card,.flow-card,.activity-card,.home-footer'))
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  items.forEach((item, index) => {
    item.classList.add('reveal-item')
    item.style.transitionDelay = `${(index % 4) * 70}ms`
  })

  const pending = new Set(items)
  const revealItem = (item: HTMLElement, animate: boolean) => {
    pending.delete(item)
    if (!animate) {
      // 这些卡片自己带 transition:all，光去掉 .reveal-item 会变成一次 300ms 淡入；
      // 已经滚出视口的元素不该再表演，直接落地
      item.style.transition = 'none'
      item.classList.remove('reveal-item')
      item.style.transitionDelay = ''
      requestAnimationFrame(() => { item.style.transition = '' })
      return
    }
    item.classList.add('revealed')
    revealTimers.push(window.setTimeout(() => {
      item.classList.remove('reveal-item', 'revealed')
      item.style.transitionDelay = ''
    }, 950))
  }

  const sweep = () => {
    revealFrame = 0
    const limit = window.innerHeight - 12
    pending.forEach((item) => {
      const rect = item.getBoundingClientRect()
      if (rect.bottom < 0) revealItem(item, false)
      else if (rect.top < limit) revealItem(item, true)
    })
    if (!pending.size) {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }
  const onScroll = () => {
    if (revealFrame) return
    revealFrame = requestAnimationFrame(sweep)
  }
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll)
  revealCleanup = () => {
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onScroll)
    cancelAnimationFrame(revealFrame)
  }
  sweep()
}
onMounted(() => {
  window.addEventListener('scroll', updateHeroScroll, { passive: true })
  setupPointerInteractions()
  setupConsoleAnimations()
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', updateHeroScroll)
  cancelAnimationFrame(heroScrollFrame)
  cancelAnimationFrame(cursorFrame)
  heroElement.value?.removeEventListener('pointermove', onHeroPointerMove)
  heroElement.value?.removeEventListener('pointerleave', onHeroPointerLeave)
  magneticCleanups.forEach(cleanup => cleanup())
  hudCleanup?.()
  hudCleanup = undefined
  revealCleanup?.()
  revealCleanup = undefined
  revealTimers.forEach(timer => window.clearTimeout(timer))
})
</script>

<template>
  <div class="immersive-hall">
    <section ref="heroElement" class="universe-hero" :style="{ '--active-color': store.activeCharacter.color, '--scroll': heroScroll }">
      <div class="hero-scene">
        <UniverseScene :character="store.activeCharacter" :memories="activeMemories" :selected-memory-id="selectedMemory?.id ?? null" @select="handleMemorySelect" />
      </div>
      <div class="hero-vignette" />
      <div class="hero-grid" />

      <header class="home-nav">
        <RouterLink to="/" class="home-brand" aria-label="AniVerse 角色宇宙首页">
          <span class="home-brand-mark"><Orbit :size="26" :stroke-width="1.6" /></span>
          <span><strong>AniVerse</strong><small>角色宇宙</small></span>
        </RouterLink>
        <nav class="home-nav-links" aria-label="主页导航">
          <a href="#console">宇宙控制台</a>
          <RouterLink to="/gallery">我的图库</RouterLink>
          <RouterLink to="/catalog">追番清单</RouterLink>
          <RouterLink to="/dashboard">数据分析</RouterLink>
        </nav>
        <div class="home-nav-actions">
          <span class="system-status"><i />UNIVERSE ONLINE</span>
          <button type="button" class="mobile-menu-btn" aria-label="打开导航" @click="menuOpen = true"><Menu :size="20" /></button>
          <RouterLink to="/create" class="nav-create"><Plus :size="15" /><span>创建角色</span></RouterLink>
        </div>
      </header>

      <Transition name="drawer">
        <div v-if="menuOpen" class="mobile-drawer" @click.self="menuOpen = false">
          <aside class="mobile-drawer-panel">
            <div class="drawer-head"><span>导航</span><button type="button" aria-label="关闭" @click="menuOpen = false"><X :size="18" /></button></div>
            <nav class="drawer-links">
              <RouterLink to="/" @click="menuOpen = false"><Orbit :size="16" />宇宙控制台</RouterLink>
              <RouterLink to="/gallery" @click="menuOpen = false"><ImageIcon :size="16" />我的图库</RouterLink>
              <RouterLink to="/catalog" @click="menuOpen = false"><Clapperboard :size="16" />追番清单</RouterLink>
              <RouterLink to="/dashboard" @click="menuOpen = false"><ChartColumn :size="16" />数据分析</RouterLink>
              <RouterLink :to="`/chat/${store.activeCharacter.id}`" @click="menuOpen = false"><MessageCircleMore :size="16" />陪伴对话</RouterLink>
              <RouterLink :to="`/memory/${store.activeCharacter.id}`" @click="menuOpen = false"><BrainCircuit :size="16" />记忆管理</RouterLink>
              <RouterLink to="/create" class="drawer-cta" @click="menuOpen = false"><Plus :size="16" />创建角色</RouterLink>
            </nav>
          </aside>
        </div>
      </Transition>
      <div class="hero-content">
        <div class="hero-kicker"><span />THE MEMORY UNIVERSE <i>EST. 2026</i></div>
        <h1>于万千星轨中，<br /><span>遇见另一个灵魂。</span></h1>
        <p>每一次对话都化为星辰，每一段记忆都有迹可循。<br />进入 {{ store.activeCharacter.name }} 的宇宙，让故事继续生长。</p>
        <div class="hero-actions">
          <RouterLink :to="`/chat/${store.activeCharacter.id}`" class="hero-primary"><MessageCircleMore :size="18" /><span>继续陪伴</span><ArrowUpRight :size="17" /></RouterLink>
          <RouterLink to="/catalog" class="hero-story"><Clapperboard :size="17" /><span>追番清单</span></RouterLink>
        </div>
        <div class="hero-secondary">
          <RouterLink to="/create"><Plus :size="14" />召唤新角色</RouterLink>
          <span />
          <RouterLink :to="`/memory/${store.activeCharacter.id}`"><BrainCircuit :size="14" />探索记忆空间</RouterLink>
        </div>

        <div class="mobile-char-select">
          <button type="button" class="mcs-trigger" @click="charMenuOpen = !charMenuOpen">
            <img :src="thumbUrl(store.activeCharacter.avatar)" :alt="store.activeCharacter.name" loading="lazy" decoding="async" />
            <span><small>当前共鸣角色</small><strong>{{ store.activeCharacter.name }}</strong></span>
            <ChevronDown :size="16" :class="{ open: charMenuOpen }" />
          </button>
          <div v-if="charMenuOpen" class="mcs-list">
            <button v-for="c in store.characters" :key="c.id" type="button" :class="{ active: c.id === store.activeCharacter.id }" @click="selectCharacter(c.id); charMenuOpen = false">
              <img :src="thumbUrl(c.avatar)" :alt="c.name" loading="lazy" decoding="async" />
              <span>{{ c.name }}<small>{{ c.title }}</small></span>
              <Check v-if="c.id === store.activeCharacter.id" :size="15" />
            </button>
          </div>
        </div>

        <div class="character-switcher stagger-in stagger-tight">
          <div class="switcher-heading"><span>选择共鸣角色</span><small>SELECT YOUR RESONANCE</small></div>
          <div class="switcher-list">
            <button v-for="character in store.characters" :key="character.id" type="button" :class="{ active: character.id === store.activeCharacter.id }" :aria-pressed="character.id === store.activeCharacter.id" @click="selectCharacter(character.id)">
              <span class="switcher-avatar"><img :src="thumbUrl(character.avatar)" :alt="character.name" loading="lazy" decoding="async" /><i :class="character.status" /></span>
              <span class="switcher-name"><strong>{{ character.name }}</strong><small>{{ character.title }}</small></span>
              <span class="switcher-radio"><i /></span>
            </button>
          </div>
        </div>
      </div>

      <div class="affinity-chip"><span><Heart :size="14" fill="currentColor" /></span><div><small>RESONANCE INDEX</small><strong><RollingNumber :value="store.activeCharacter.affinity" :pad="0" /><i>/100</i></strong></div></div>
      <div class="scene-character-name"><small>CURRENT RESONANCE</small><strong>{{ store.activeCharacter.name }}</strong><span>{{ store.activeCharacter.english }}</span></div>
      <Transition name="detail" mode="out-in">
        <div v-if="selectedMemory" :key="selectedMemory.id" class="memory-detail">
          <div class="memory-detail-head"><span><i :class="selectedMemory.type" />{{ typeLabels[selectedMemory.type] }}</span><button type="button" aria-label="关闭记忆详情" @click="selectedMemory = null"><X :size="14" /></button></div>
          <p>{{ selectedMemory.content }}</p>
          <div class="memory-detail-foot"><span>重要度 {{ Math.round(selectedMemory.importance * 100) }}%</span><span>{{ selectedMemory.date }} · {{ selectedMemory.time }}</span></div>
          <RouterLink :to="`/memory/${store.activeCharacter.id}`">进入记忆空间<ChevronRight :size="13" /></RouterLink>
        </div>
        <div v-else class="visual-quote" key="quote"><span>“</span>{{ store.activeCharacter.quote }}</div>
      </Transition>

      <div class="hero-metrics">
        <div><strong><RollingNumber :value="store.characters.length" /></strong><span>共鸣角色</span></div>
        <i />
        <div><strong><RollingNumber :value="store.memories.length" /></strong><span>记忆星点</span></div>
        <i />
        <div><strong>∞</strong><span>故事可能</span></div>
      </div>
      <a class="hero-scroll" href="#console"><span><ArrowDown :size="14" /></span><div>SCROLL TO EXPLORE<small>向下探索宇宙控制台</small></div></a>
      <div class="hero-coordinate">ANIVERSE SYSTEM · SECTOR 07<br /><span>MEMORY IS THE GRAVITY OF SOULS</span></div>
      <div ref="heroCursor" class="hero-cursor"><i /><span>{{ cursorLabel }}</span></div>
    </section>

    <section id="console" class="console-section">
      <div class="realm-transition" aria-hidden="true"><i /><span>FROM COSMOS TO CONNECTION</span><i /></div>
      <ConsoleConstellation />
      <div class="console-heading">
        <div><div class="eyebrow">UNIVERSE CONSOLE</div><h2>你的宇宙，正在这里生长。</h2><p>从一次对话到一段长期羁绊，所有珍贵的连接都在这里汇聚。</p></div>
        <span class="console-date"><i />本地演示宇宙 · 运行正常</span>
      </div>

      <div class="console-stats">
        <div v-for="(stat, index) in consoleStats" :key="stat.key" class="console-stat">
          <span class="stat-symbol" :class="stat.tone"><component :is="stat.icon" :size="20" /></span>
          <div><small>{{ stat.label }}</small><strong><RollingNumber :value="stat.value" :pad="stat.pad" :delay="index * 70" /></strong></div>
          <span class="stat-trend">{{ stat.trend }}</span>
        </div>
      </div>

      <div class="feature-grid">
        <RouterLink v-for="(feature, index) in featureLinks" :key="feature.title" :to="feature.path" class="feature-entry stagger-row">
          <span class="feature-number">0{{ index + 1 }}</span>
          <span class="feature-icon" :class="feature.color"><component :is="feature.icon" :size="22" :stroke-width="1.6" /></span>
          <div class="feature-copy"><small>{{ feature.en }}</small><h3>{{ feature.title }}</h3><p>{{ feature.description }}</p></div>
          <span class="feature-arrow"><ArrowUpRight :size="17" /></span>
        </RouterLink>
      </div>

      <div class="section-head character-section-head">
        <div><div class="eyebrow">CHARACTER SPECTRUM</div><h2>角色星谱 <span>{{ store.characters.length }}</span></h2><p>每一个灵魂，都有独一无二的轨迹</p></div>
        <RouterLink to="/create" class="section-link">创建新角色<Plus :size="14" /></RouterLink>
      </div>
      <div class="character-grid">
        <CharacterCard v-for="character in store.characters" :key="character.id" :character="character" />
        <RouterLink to="/create" class="new-character-card"><span><Plus :size="24" /></span><strong>召唤新的灵魂</strong><p>从一段设定，开始新的羁绊</p><small>CREATE CHARACTER <ArrowRight :size="12" /></small></RouterLink>
      </div>

      <div class="bottom-grid">
        <section class="card flow-card">
          <div class="card-title"><div><span class="title-icon"><BrainCircuit :size="18" /></span><div><h3>记忆正在流动</h3><p>跨模块状态贯通 · 实时演示</p></div></div><RouterLink to="/dashboard" class="section-link">查看全貌<ChevronRight :size="14" /></RouterLink></div>
          <div class="flow-steps">
            <div class="flow-step"><span class="flow-icon chat"><MessageCircleMore :size="19" /></span><div><strong>陪伴对话</strong><p>“完成了课程设计”</p></div></div>
            <span class="flow-line"><i /></span>
            <div class="flow-step"><span class="flow-icon memory"><BrainCircuit :size="19" /></span><div><strong>长期记忆</strong><p>重要度 0.92</p></div></div>
            <span class="flow-line"><i /></span>
            <div class="flow-step"><span class="flow-icon story"><BookOpen :size="19" /></span><div><strong>剧情继承</strong><p>世界状态已更新</p></div></div>
          </div>
        </section>
        <section class="card activity-card">
          <div class="card-title"><div><span class="title-icon peach"><Clock3 :size="18" /></span><div><h3>最近的宇宙回声</h3><p>那些值得记住的瞬间</p></div></div><span class="activity-live"><i />LIVE</span></div>
          <div class="activity-list">
            <div><span class="activity-dot purple" /><p><strong>星罗</strong> 沉淀了一条新记忆<small>刚刚</small></p></div>
            <div><span class="activity-dot blue" /><p><strong>澪</strong> 与你的好感度提升至 61<small>18:28</small></p></div>
            <div><span class="activity-dot orange" /><p><strong>奈奈</strong> 分享了一页植物手记<small>16:44</small></p></div>
          </div>
        </section>
      </div>

      <footer class="home-footer"><RouterLink to="/" class="footer-brand"><Orbit :size="19" />AniVerse</RouterLink><p>让每一个虚构灵魂，拥有连续的生命。</p><a href="#" @click.prevent="scrollTop">返回宇宙顶部<ArrowUpRight :size="13" /></a></footer>
    </section>
    <!-- 放在页面组件内部：切页面时会跟着整页渐变一起淡出，不会浮在白屏上 -->
    <MusicWidget floating />
  </div>
</template>

<style scoped>
.immersive-hall{min-height:100vh;overflow:hidden;background:#f7f6fb}.universe-hero{position:relative;height:100svh;min-height:760px;overflow:hidden;background:radial-gradient(circle at 74% 42%,rgba(255,255,255,.9),transparent 33%),linear-gradient(125deg,#f4f1f9 0%,#eeeaf6 48%,#e5e1f1 100%);}.hero-scene{position:absolute;inset:0;z-index:1;}.hero-vignette{position:absolute;inset:0;z-index:2;pointer-events:none;background:linear-gradient(90deg,rgba(245,242,249,.96) 0%,rgba(245,242,249,.76) 25%,rgba(245,242,249,.12) 51%,transparent 70%),linear-gradient(0deg,rgba(232,227,242,.45),transparent 25%);}.hero-grid{position:absolute;inset:0;z-index:2;pointer-events:none;opacity:.22;background-image:linear-gradient(rgba(139,118,190,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(139,118,190,.12) 1px,transparent 1px);background-size:72px 72px;mask-image:linear-gradient(90deg,rgba(0,0,0,.35),transparent 48%);}
.home-nav{position:absolute;z-index:15;top:0;left:0;right:0;height:94px;display:flex;align-items:center;justify-content:space-between;gap:28px;padding:0 3.2vw;border-bottom:1px solid rgba(143,127,177,.12);}.home-brand{display:flex;align-items:center;gap:11px;}.home-brand-mark{position:relative;width:42px;height:42px;display:grid;place-items:center;border:1px solid rgba(139,118,232,.25);border-radius:14px;background:rgba(255,255,255,.48);color:#7b67d4;box-shadow:0 8px 22px rgba(80,60,130,.08);backdrop-filter:blur(12px);}.home-brand strong,.home-brand small{display:block;}.home-brand strong{color:#393044;font-size:19px;letter-spacing:-.5px;}.home-brand small{margin-top:1px;color:#9a8fa6;font-size:8px;letter-spacing:3px;}.home-nav-links{display:flex;align-items:center;gap:32px;}.home-nav-links a{position:relative;color:#81768e;font-size:11px;font-weight:500;transition:color .2s;}.home-nav-links a::after{content:'';position:absolute;left:0;right:100%;bottom:-8px;height:1px;background:#806bd2;transition:right .25s;}.home-nav-links a:hover{color:#6652b7;}.home-nav-links a:hover::after{right:0;}.home-nav-actions{display:flex;align-items:center;gap:20px;}.system-status{display:flex;align-items:center;gap:7px;color:#998da7;font-size:7px;letter-spacing:1.1px;}.system-status i{width:5px;height:5px;border-radius:50%;background:#6eb99f;box-shadow:0 0 0 4px rgba(110,185,159,.1);}.nav-create{display:flex;align-items:center;gap:7px;height:38px;padding:0 15px;border:1px solid rgba(139,118,190,.2);border-radius:12px;background:rgba(255,255,255,.5);color:#7461b8;font-size:10px;font-weight:600;backdrop-filter:blur(12px);transition:all .2s;}.nav-create:hover{background:rgba(255,255,255,.85);transform:translateY(-1px);box-shadow:0 8px 22px rgba(80,60,125,.08);}
.hero-content{position:relative;z-index:6;width:580px;margin-left:6.5vw;padding-top:23vh;pointer-events:none;opacity:calc(1 - var(--scroll,0) * 1.35);transform:translate3d(calc(var(--mouse-x,0) * -10px),calc(var(--scroll,0) * -52px + var(--mouse-y,0) * -7px),0);will-change:transform,opacity;}.hero-content a,.hero-content button{pointer-events:auto;}.hero-kicker{display:flex;align-items:center;gap:9px;color:#8170b0;font-size:8px;font-weight:600;letter-spacing:2px;}.hero-kicker>span{width:26px;height:1px;background:#9a85d2;}.hero-kicker i{margin-left:6px;padding-left:13px;border-left:1px solid #d4cbe0;color:#aca0b7;font-size:7px;font-style:normal;font-weight:400;letter-spacing:1px;}.hero-content h1{margin-top:23px;color:#332b41;font-size:clamp(48px,4.25vw,72px);font-weight:600;line-height:1.26;letter-spacing:-3px;}.hero-content h1 span{color:var(--active-color);transition:color .45s;}.hero-content>p{margin-top:21px;color:#877b94;font-size:13px;line-height:2;}.hero-actions{display:flex;align-items:center;gap:12px;margin-top:29px;}.hero-primary,.hero-story{height:49px;display:inline-flex;align-items:center;justify-content:center;gap:10px;padding:0 21px;border-radius:15px;font-size:12px;font-weight:600;transition:all .25s;}.hero-primary{min-width:160px;background:linear-gradient(135deg,var(--active-color),#6a58d2);color:white;box-shadow:0 13px 30px color-mix(in srgb,var(--active-color) 25%,transparent);}.hero-primary svg:last-child{margin-left:auto;}.hero-primary:hover{transform:translateY(-3px);box-shadow:0 18px 38px color-mix(in srgb,var(--active-color) 32%,transparent);}.hero-story{border:1px solid rgba(255,255,255,.8);background:rgba(255,255,255,.43);color:#71647f;backdrop-filter:blur(14px);}.hero-story:hover{background:rgba(255,255,255,.78);transform:translateY(-3px);}.hero-secondary{display:flex;align-items:center;gap:16px;margin-top:17px;}.hero-secondary>a{display:flex;align-items:center;gap:6px;color:#988ba5;font-size:10px;transition:color .2s;}.hero-secondary>a:hover{color:#715cba;}.hero-secondary>span{width:1px;height:11px;background:#d8cfdf;}
.character-switcher{width:460px;margin-top:34px;pointer-events:auto;}.switcher-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}.switcher-heading>span{color:#8f819c;font-size:9px;}.switcher-heading small{color:#b1a6ba;font-size:6px;letter-spacing:1.2px;}.switcher-list{display:flex;gap:7px;}.switcher-list>button{position:relative;display:flex;align-items:center;gap:8px;min-width:0;flex:1;padding:7px 8px;border:1px solid rgba(255,255,255,.42);border-radius:14px;background:rgba(255,255,255,.25);color:#8a7d95;text-align:left;backdrop-filter:blur(10px);transition:all .25s;}.switcher-list>button:hover{background:rgba(255,255,255,.62);transform:translateY(-2px);}.switcher-list>button.active{border-color:rgba(255,255,255,.9);background:rgba(255,255,255,.72);box-shadow:0 10px 26px rgba(68,50,106,.09);color:#5e506a;}.switcher-avatar{position:relative;flex-shrink:0;}.switcher-avatar img{width:34px;height:34px;object-fit:cover;object-position:center 18%;border-radius:10px;}.switcher-avatar>i{position:absolute;right:-2px;bottom:-2px;width:7px;height:7px;border:2px solid white;border-radius:50%;background:#d6a361;}.switcher-avatar>i.online{background:#64bba1;}.switcher-name{display:block;min-width:0;}.switcher-name strong,.switcher-name small{display:block;white-space:nowrap;}.switcher-name strong{font-size:10px;font-weight:600;}.switcher-name small{margin-top:3px;color:#aa9db2;font-size:7px;}.switcher-radio{display:none;position:absolute;right:7px;top:7px;width:8px;height:8px;border:1px solid #b6a8cc;border-radius:50%;}.switcher-list>button.active .switcher-radio{display:block;}.switcher-radio i{position:absolute;inset:2px;border-radius:50%;background:var(--active-color);}
.affinity-chip{position:absolute;z-index:7;left:44%;top:112px;display:flex;align-items:center;gap:9px;padding:10px 13px;border:1px solid rgba(255,255,255,.64);border-radius:14px;background:rgba(255,255,255,.32);backdrop-filter:blur(12px);pointer-events:none;}.affinity-chip>span{color:#d789a0;}.affinity-chip small,.affinity-chip strong{display:block;}.affinity-chip small{font-size:6px;color:#a093ad;letter-spacing:1px;}.affinity-chip strong{margin-top:2px;color:#675873;font-size:16px;}.affinity-chip i{margin-left:3px;color:#aaa0b2;font-size:8px;font-style:normal;font-weight:400;}.scene-character-name{position:absolute;z-index:7;right:3.3vw;top:128px;text-align:right;pointer-events:none;}.scene-character-name small,.scene-character-name strong,.scene-character-name span{display:block;}.scene-character-name small{color:#afa4bd;font-size:6px;letter-spacing:1.3px;}.scene-character-name strong{margin-top:5px;color:#776986;font-size:14px;letter-spacing:1px;}.scene-character-name span{margin-top:3px;color:#aa9db6;font-size:7px;letter-spacing:.6px;}.visual-quote{position:absolute;z-index:7;right:3.4vw;bottom:112px;max-width:215px;padding:13px 15px;border:1px solid rgba(255,255,255,.52);border-radius:15px;background:rgba(255,255,255,.3);color:#8b7d9a;font-size:10px;line-height:1.8;backdrop-filter:blur(10px);pointer-events:none;}.visual-quote>span{margin-right:3px;color:var(--active-color);font-family:serif;font-size:20px;line-height:0;vertical-align:-5px;}.memory-detail{position:absolute;z-index:12;right:3.3vw;bottom:106px;width:270px;padding:16px 17px 14px;border:1px solid rgba(255,255,255,.85);border-radius:18px;background:rgba(255,255,255,.78);box-shadow:0 20px 50px rgba(57,41,91,.14);backdrop-filter:blur(20px);}.memory-detail-head{display:flex;align-items:center;justify-content:space-between;}.memory-detail-head>span{display:flex;align-items:center;gap:6px;color:#7a6a91;font-size:9px;font-weight:600;}.memory-detail-head i{width:6px;height:6px;border-radius:50%;background:#8b76e8;}.memory-detail-head i.preference{background:#e99a7e;}.memory-detail-head i.event{background:#65a9c6;}.memory-detail-head i.relationship{background:#d681a5;}.memory-detail-head button{display:grid;place-items:center;width:24px;height:24px;padding:0;border:0;border-radius:7px;background:#f3f0f8;color:#9b90a8;}.memory-detail>p{margin-top:11px;color:#655c72;font-size:11px;line-height:1.8;}.memory-detail-foot{display:flex;justify-content:space-between;margin-top:11px;color:#aaa0b1;font-size:8px;}.memory-detail>a{display:flex;align-items:center;justify-content:flex-end;gap:4px;margin-top:11px;padding-top:10px;border-top:1px solid #eee9f3;color:#826fd0;font-size:9px;font-weight:600;}.detail-enter-active,.detail-leave-active{transition:all .22s ease;}.detail-enter-from,.detail-leave-to{opacity:0;transform:translateY(8px) scale(.98);}
.hero-metrics{position:absolute;z-index:7;left:3.3vw;bottom:35px;display:flex;align-items:center;gap:20px;}.hero-metrics>div{display:flex;align-items:baseline;gap:7px;}.hero-metrics strong{color:#71617f;font-size:17px;font-weight:500;}.hero-metrics span{color:#a395ae;font-size:8px;}.hero-metrics>i{width:1px;height:17px;background:#d4c9dd;}.hero-scroll{position:absolute;z-index:8;left:50%;bottom:26px;transform:translateX(-50%);display:flex;align-items:center;gap:10px;color:#9485a4;}.hero-scroll>span{width:30px;height:30px;display:grid;place-items:center;border:1px solid rgba(136,115,174,.2);border-radius:50%;animation:scrollBob 2.4s ease-in-out infinite;}.hero-scroll>div{font-size:6px;letter-spacing:1.5px;}.hero-scroll small{display:block;margin-top:4px;color:#aa9bb5;font-size:7px;letter-spacing:.3px;}.hero-coordinate{position:absolute;z-index:7;right:3.3vw;bottom:33px;color:#a193af;font-size:6px;letter-spacing:1.2px;line-height:1.8;text-align:right;pointer-events:none;}.hero-coordinate span{font-size:5px;color:#b4a8be;}@keyframes scrollBob{50%{transform:translateY(5px)}}
.hero-cursor{display:none !important;position:fixed;z-index:30;left:0;top:0;width:36px;height:36px;border:1px solid rgba(198,177,255,.5);border-radius:50%;background:rgba(120,88,210,.06);box-shadow:0 0 24px rgba(145,108,237,.12),inset 0 0 15px rgba(181,150,255,.06);backdrop-filter:blur(3px);pointer-events:none;opacity:0;scale:1;transition:opacity .2s,scale .25s,background .25s;will-change:transform;}.hero-cursor.visible{opacity:1}.hero-cursor.active{scale:1.4;background:rgba(147,111,240,.12)}.hero-cursor>i{position:absolute;left:50%;top:50%;width:4px;height:4px;margin:-2px;border-radius:50%;background:#d7c5ff;box-shadow:0 0 10px #b693ff}.hero-cursor>span{position:absolute;left:47px;top:11px;color:#b9a4e4;font-size:6px;letter-spacing:1.5px;white-space:nowrap}.realm-transition{position:absolute;z-index:0;top:-200px;left:0;right:0;height:330px;margin:0;display:flex;align-items:flex-end;justify-content:center;gap:14px;padding-bottom:38px;background:linear-gradient(180deg,transparent 0%,rgba(8,7,24,.28) 14%,#3d3659 32%,#746a91 50%,#a79bbb 70%,#c8c0dc 100%);pointer-events:none}.realm-transition>span{color:#6f657e;font-size:7px;letter-spacing:2.4px}.realm-transition>i{width:54px;height:1px;margin-bottom:3px;background:linear-gradient(90deg,transparent,#9a8dab)}.realm-transition>i:last-child{transform:scaleX(-1)}
.console-section{position:relative;padding:90px max(4vw,32px) 0;background:radial-gradient(ellipse at 85% 4%,rgba(172,137,218,.38),transparent 26%),radial-gradient(ellipse at 4% 36%,rgba(219,174,207,.34),transparent 30%),radial-gradient(ellipse at 92% 68%,rgba(147,177,216,.3),transparent 32%),linear-gradient(180deg,#c8c0dc 0%,#d4cce2 18%,#c7d4e6 42%,#d8c9dd 66%,#b8a9c9 100%);background-size:100% 100%;}.console-section::before{display:none;}.console-heading,.console-stats,.feature-grid,.character-section-head,.character-grid,.bottom-grid,.home-footer{position:relative;z-index:1;max-width:1440px;margin-left:auto;margin-right:auto;}.console-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:30px;}.console-heading h2{font-size:36px;letter-spacing:-1.2px;color:#332d42;}.console-heading p{margin-top:12px;color:#92889e;font-size:13px;line-height:1.8;}.console-date{display:flex;align-items:center;gap:7px;padding:8px 12px;border:1px solid #e5dfeb;border-radius:20px;color:#9c91a8;font-size:9px;}.console-date i{width:5px;height:5px;border-radius:50%;background:#6fb79e;box-shadow:0 0 0 4px #e8f2ee;}.console-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:15px;margin-top:42px;}.console-stat{position:relative;display:flex;align-items:center;gap:14px;padding:23px 22px;overflow:hidden;border:1px solid rgba(228,222,237,.85);border-radius:19px;background:rgba(255,255,255,.72);box-shadow:0 8px 28px rgba(46,35,74,.035);transition:all .25s;}.console-stat::after{content:'';position:absolute;right:-25px;bottom:-40px;width:110px;height:110px;border-radius:50%;background:radial-gradient(circle,rgba(139,118,232,.08),transparent 68%);}.console-stat:hover{transform:translateY(-4px);box-shadow:0 16px 38px rgba(46,35,74,.07);}.stat-symbol{width:44px;height:44px;display:grid;place-items:center;flex-shrink:0;border-radius:14px;}.stat-symbol.purple{background:#efebfb;color:#8772d7}.stat-symbol.blue{background:#eaf5f8;color:#65a6bb}.stat-symbol.peach{background:#fff0e8;color:#d88f72}.stat-symbol.green{background:#eaf6f0;color:#66a98f}.console-stat small,.console-stat strong{display:block;}.console-stat small{color:#a197aa;font-size:9px;}.console-stat strong{margin-top:4px;color:#51465e;font-size:25px;font-weight:600;letter-spacing:-.6px;}.stat-trend{margin-left:auto;align-self:flex-start;color:#9a8faa;font-size:8px;white-space:nowrap;}
.feature-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:15px;margin-top:52px;}.feature-entry{position:relative;min-height:190px;display:flex;align-items:center;gap:18px;padding:30px 25px;overflow:hidden;border:1px solid rgba(228,222,237,.8);border-radius:22px;background:rgba(255,255,255,.64);transition:all .3s cubic-bezier(.2,.7,.2,1);}.feature-entry::before{content:'';position:absolute;inset:0;background:linear-gradient(125deg,rgba(255,255,255,.6),transparent 55%);opacity:0;transition:opacity .3s;}.feature-entry:hover{transform:translateY(-6px);border-color:#d4c9e9;background:rgba(255,255,255,.92);box-shadow:0 22px 48px rgba(49,36,78,.09);}.feature-entry:hover::before{opacity:1;}.feature-number{position:absolute;top:16px;right:18px;color:#c3b9cc;font-size:8px;letter-spacing:1px;}.feature-icon{position:relative;width:52px;height:52px;display:grid;place-items:center;flex-shrink:0;border-radius:17px;transition:transform .3s;}.feature-entry:hover .feature-icon{transform:rotate(-5deg) scale(1.08);}.feature-icon.purple{background:#efebfb;color:#8772d7}.feature-icon.blue{background:#eaf5f8;color:#65a6bb}.feature-icon.peach{background:#fff0e8;color:#d88f72}.feature-icon.green{background:#eaf6f0;color:#66a98f}.feature-icon.pink{background:#faeef3;color:#c987a1}.feature-icon.violet{background:#f0edfa;color:#7568bf}.feature-copy{position:relative;}.feature-copy small{color:#b0a4b9;font-size:6px;letter-spacing:1.3px;}.feature-copy h3{margin-top:5px;color:#55495f;font-size:17px;}.feature-copy p{margin-top:8px;color:#a093aa;font-size:10px;line-height:1.6;}.feature-arrow{position:absolute;right:19px;bottom:17px;width:29px;height:29px;display:grid;place-items:center;border:1px solid #e6dfeC;border-radius:9px;color:#aa9bb6;transition:all .25s;}.feature-entry:hover .feature-arrow{background:#806bd1;border-color:#806bd1;color:white;transform:rotate(45deg);}
.character-section-head{margin-top:85px;margin-bottom:20px;}.character-section-head h2{font-size:26px;}.character-section-head h2 span{display:inline-grid;place-items:center;width:24px;height:24px;margin-left:6px;border-radius:8px;background:#ece7f6;color:#8c7ed0;font-size:10px;vertical-align:3px;}.character-section-head p{font-size:12px;}.character-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;}.new-character-card{min-height:420px;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px dashed #d8d1e8;border-radius:var(--radius);background:rgba(255,255,255,.34);color:#9690a6;transition:all .25s;}.new-character-card:hover{border-color:#ab9ce8;background:#f3f0fc;transform:translateY(-5px);box-shadow:0 18px 40px rgba(70,52,110,.07);}.new-character-card>span{width:52px;height:52px;display:grid;place-items:center;margin-bottom:16px;border:1px solid #ded8f0;border-radius:17px;background:#f2eefb;color:#9a89df;transform:rotate(-4deg);transition:transform .25s;}.new-character-card:hover>span{transform:rotate(4deg) scale(1.05);}.new-character-card strong{font-size:14px;color:#766d87;}.new-character-card p{margin-top:7px;font-size:10px;color:#aaa4b4;}.new-character-card small{display:flex;align-items:center;gap:5px;margin-top:24px;color:#b1a8bd;font-size:7px;letter-spacing:1.2px;}
.bottom-grid{display:grid;grid-template-columns:1.5fr 1fr;gap:18px;margin-top:60px;}.flow-card,.activity-card{padding:24px;}.card-title,.card-title>div{display:flex;align-items:center;justify-content:space-between;gap:11px;}.title-icon{width:38px;height:38px;display:grid;place-items:center;border-radius:12px;background:#efecff;color:#806fdf;}.title-icon.peach{background:#fff0e9;color:#d68e72;}.card-title h3{font-size:14px;}.card-title p{margin-top:4px;font-size:10px;color:#aaa5b2;}.activity-live{display:flex;align-items:center;gap:5px;color:#75aa98;font-size:7px;letter-spacing:1px;}.activity-live i{width:5px;height:5px;border-radius:50%;background:#72b49c;box-shadow:0 0 0 3px #e4f2ed;}.flow-steps{display:flex;align-items:center;justify-content:space-between;margin-top:27px;}.flow-step{display:flex;align-items:center;gap:10px;min-width:125px;}.flow-icon{width:40px;height:40px;display:grid;place-items:center;border-radius:13px;}.flow-icon.chat{background:#eaf6fb;color:#5b9eb9;}.flow-icon.memory{background:#f0ecff;color:#8875df;}.flow-icon.story{background:#fff0e9;color:#d78f73;}.flow-step strong{font-size:12px;}.flow-step p{margin-top:4px;color:#a29dac;font-size:9px;}.flow-line{position:relative;flex:1;height:1px;margin:0 12px;background:#e3dfeb;}.flow-line i{position:absolute;width:5px;height:5px;top:-2px;border-radius:50%;background:#a596e2;box-shadow:0 0 8px #b6a8ed;animation:flowMove 3s linear infinite;}@keyframes flowMove{from{left:0}to{left:100%}}.activity-list{margin-top:15px;}.activity-list>div{display:flex;align-items:center;gap:10px;padding:9px 0;}.activity-dot{width:7px;height:7px;border-radius:50%;box-shadow:0 0 0 4px #f5f2f9;}.activity-dot.purple{background:#9986e2;}.activity-dot.blue{background:#71b5cc;}.activity-dot.orange{background:#dfa086;}.activity-list p{flex:1;font-size:11px;color:#898394;}.activity-list strong{color:#5d566b;}.activity-list small{float:right;color:#b3adbb;font-size:8px;}.home-footer{display:flex;align-items:center;gap:25px;margin-top:75px;padding:28px 0 32px;border-top:1px solid #e5dfeb;color:#a194ab;}.footer-brand{display:flex;align-items:center;gap:7px;color:#7663a7;font-size:14px;font-weight:600;}.home-footer p{font-size:10px;}.home-footer>a{display:flex;align-items:center;gap:5px;margin-left:auto;font-size:9px;}.home-footer>a:hover{color:#7663c2;}
.immersive-hall{background:#03040c}.universe-hero{background:radial-gradient(circle at 72% 38%,rgba(80,54,143,.3),transparent 32%),radial-gradient(circle at 40% 80%,rgba(32,70,111,.2),transparent 36%),linear-gradient(125deg,#03040b 0%,#070816 48%,#0b0920 100%)}
.hero-vignette{background:linear-gradient(90deg,rgba(3,4,12,.98) 0%,rgba(4,5,15,.82) 25%,rgba(4,5,15,.15) 51%,transparent 70%),linear-gradient(0deg,rgba(3,4,12,.82),transparent 30%)}
.hero-grid{opacity:.2;background-image:linear-gradient(rgba(154,137,222,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(154,137,222,.12) 1px,transparent 1px)}
.home-nav{border-bottom-color:rgba(190,176,235,.1)}.home-brand strong{color:#f1edfb}.home-brand small{color:#827b9a}.home-brand-mark{border-color:rgba(166,142,255,.24);background:rgba(17,14,35,.56);color:#aa94ff;box-shadow:0 8px 26px rgba(0,0,0,.24),inset 0 1px 0 rgba(255,255,255,.08)}
.home-nav-links a{color:#9e96b3}.home-nav-links a:hover{color:#f1eaff}.home-nav-links a::after{background:#a88cff}.system-status{color:#756e8c}.nav-create{border-color:rgba(174,151,255,.2);background:rgba(19,16,38,.5);color:#c1afff;box-shadow:inset 0 1px 0 rgba(255,255,255,.05)}.nav-create:hover{background:rgba(42,32,72,.78);box-shadow:0 8px 26px rgba(0,0,0,.24)}
.hero-kicker{color:#a38cd8}.hero-kicker>span{background:#9b7ce5}.hero-kicker i{border-left-color:#342b4b;color:#6f6587}.hero-content h1{color:#f5f1fc;text-shadow:0 8px 35px rgba(0,0,0,.28)}.hero-content h1 span{color:color-mix(in srgb,var(--active-color) 82%,#d8c6ff);text-shadow:0 0 38px color-mix(in srgb,var(--active-color) 22%,transparent)}.hero-content>p{color:#b3abc4}
.hero-primary{box-shadow:0 13px 36px color-mix(in srgb,var(--active-color) 36%,transparent),inset 0 1px 0 rgba(255,255,255,.22)}.hero-story{border-color:rgba(191,174,235,.15);background:rgba(18,15,36,.48);color:#c0b6d2;box-shadow:inset 0 1px 0 rgba(255,255,255,.05)}.hero-story:hover{background:rgba(41,32,66,.72)}.hero-secondary>a{color:#8f85a5}.hero-secondary>a:hover{color:#c4b0ff}.hero-secondary>span{background:#342c47}
.switcher-heading>span{color:#9488aa}.switcher-heading small{color:#5f5675}.switcher-list>button{border-color:rgba(172,151,223,.1);background:rgba(14,12,30,.42);color:#9489aa;box-shadow:inset 0 1px 0 rgba(255,255,255,.025)}.switcher-list>button:hover{background:rgba(38,29,62,.68)}.switcher-list>button.active{border-color:color-mix(in srgb,var(--active-color) 36%,transparent);background:rgba(32,24,54,.82);box-shadow:0 10px 30px rgba(0,0,0,.28),0 0 24px color-mix(in srgb,var(--active-color) 9%,transparent);color:#e2d9f1}.switcher-name small{color:#756a89}.switcher-avatar img{box-shadow:0 0 0 1px rgba(255,255,255,.12)}
.affinity-chip{border-color:rgba(186,164,255,.14);background:rgba(14,11,31,.42);box-shadow:0 10px 30px rgba(0,0,0,.16)}.affinity-chip small{color:#766b8d}.affinity-chip strong{color:#e8ddf5}.affinity-chip i{color:#756a87}.scene-character-name small{color:#685e7e}.scene-character-name strong{color:#d9cdea}.scene-character-name span{color:#6e6383}
.visual-quote{border-color:rgba(180,157,235,.12);background:rgba(14,11,29,.42);color:#a397b7;box-shadow:0 12px 35px rgba(0,0,0,.16)}.memory-detail{border-color:rgba(184,160,245,.18);background:rgba(13,11,28,.82);box-shadow:0 22px 60px rgba(0,0,0,.42),inset 0 1px 0 rgba(255,255,255,.06)}.memory-detail-head>span{color:#c0addf}.memory-detail-head button{background:#251d38;color:#9b89b4}.memory-detail>p{color:#c0b5ce}.memory-detail-foot{color:#756a88}.memory-detail>a{border-top-color:#2c2340;color:#b298f1}
.hero-metrics strong{color:#c9bddb}.hero-metrics span{color:#716782}.hero-metrics>i{background:#312941}.hero-scroll{color:#887a9e}.hero-scroll>span{border-color:rgba(166,142,218,.25)}.hero-scroll small{color:#665b78}.hero-coordinate{color:#5c526e}.hero-coordinate span{color:#4e455f}
#console{scroll-margin-top:120px}.console-stat{background:rgba(250,248,253,.62);border-color:rgba(214,205,226,.78)}.feature-entry{background:rgba(249,247,252,.55);border-color:rgba(215,206,227,.76)}.feature-entry:hover{background:rgba(250,248,253,.88)}.bottom-grid .card{background:rgba(249,247,252,.66);border-color:rgba(216,208,226,.82)}.new-character-card{background:rgba(249,247,252,.38)}
.reveal-item{opacity:0;transform:translateY(34px) scale(.985);transition:opacity .72s ease,transform .82s cubic-bezier(.16,1,.3,1)}.reveal-item.revealed{opacity:1;transform:translateY(0) scale(1)}.feature-entry::after{content:'';position:absolute;inset:0;z-index:0;border-radius:inherit;background:radial-gradient(circle 190px at var(--spot-x,50%) var(--spot-y,50%),rgba(255,255,255,.38),transparent 72%);opacity:0;transition:opacity .3s;pointer-events:none}.feature-entry:hover::after{opacity:1}
@media(max-width:1200px){.home-nav-links{gap:20px}.system-status{display:none}.hero-content{width:500px;margin-left:5vw}.hero-content h1{font-size:52px}.character-switcher{width:420px}.hero-metrics{gap:12px}.console-stats{grid-template-columns:repeat(2,1fr)}.character-grid{grid-template-columns:repeat(2,1fr)}.feature-grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:900px){.home-nav{height:80px;padding:0 24px}.home-nav-links{display:none}.hero-content{width:430px;padding-top:21vh;margin-left:32px}.hero-content h1{font-size:45px;letter-spacing:-2px}.hero-content>p{font-size:12px}.character-switcher{width:390px}.switcher-name small{display:none}.hero-metrics{display:none}.affinity-chip{left:auto;right:25px;top:105px}.scene-character-name{display:none}.hero-coordinate{display:none}.visual-quote{right:24px;bottom:102px}.memory-detail{right:24px}.console-section{padding-top:80px}.console-heading h2{font-size:30px}.bottom-grid{grid-template-columns:1fr}}
@media(max-width:700px){.universe-hero{height:100svh;min-height:960px}.home-nav{height:72px;padding:0 20px}.home-brand-mark{width:37px;height:37px;border-radius:12px}.home-brand strong{font-size:17px}.home-brand small{font-size:7px}.nav-create{height:35px;padding:0 11px}.hero-vignette{background:linear-gradient(180deg,rgba(3,4,12,.96) 0%,rgba(4,5,15,.78) 35%,rgba(4,5,15,.06) 58%,transparent 75%),linear-gradient(0deg,rgba(3,4,12,.72),transparent 25%)}.hero-grid{background-size:52px 52px;mask-image:linear-gradient(rgba(0,0,0,.25),transparent 50%)}.hero-content{width:auto;margin:0;padding:116px 24px 0}.hero-content h1{margin-top:17px;font-size:42px;line-height:1.3;letter-spacing:-2px}.hero-content>p{margin-top:15px;font-size:11px;line-height:1.85}.hero-content>p br{display:none}.hero-kicker{font-size:7px}.hero-kicker i{display:none}.hero-actions{margin-top:21px}.hero-primary,.hero-story{height:45px;padding:0 16px;font-size:11px;border-radius:13px}.hero-primary{min-width:145px}.hero-secondary{margin-top:13px}.character-switcher{width:100%;max-width:440px;margin-top:24px}.switcher-heading small{display:none}.switcher-list>button{justify-content:center;padding:6px}.switcher-avatar img{width:30px;height:30px}.hero-scene{top:410px}.affinity-chip{display:none}.visual-quote{left:22px;right:auto;bottom:86px;max-width:195px;font-size:9px}.memory-detail{left:20px;right:20px;bottom:80px;width:auto}.hero-scroll{display:none}.realm-transition{top:-105px;height:260px;margin:0;padding-bottom:26px}.realm-transition>span{font-size:6px;letter-spacing:1.6px}.realm-transition>i{width:28px}.hero-cursor{display:none}.console-section{padding:70px 18px 0}.console-heading{align-items:flex-start;flex-direction:column}.console-heading h2{font-size:28px}.console-heading p{font-size:11px}.console-date{display:none}.console-stats{gap:10px;margin-top:30px}.console-stat{padding:17px 14px;gap:10px}.stat-symbol{width:37px;height:37px;border-radius:12px}.console-stat strong{font-size:21px}.stat-trend{display:none}.feature-grid{grid-template-columns:1fr;gap:11px;margin-top:40px}.feature-entry{min-height:140px;padding:24px 20px}.character-section-head{margin-top:60px}.character-grid{grid-template-columns:1fr}.new-character-card{min-height:180px}.bottom-grid{margin-top:45px}.home-footer{flex-wrap:wrap;gap:12px 20px;margin-top:55px}.home-footer p{order:3;width:100%}.home-footer>a{margin-left:auto}}
@media(max-width:420px){.universe-hero{min-height:930px}.hero-content{padding:105px 20px 0}.hero-content h1{font-size:37px}.hero-content>p{max-width:340px}.hero-secondary{gap:11px}.hero-secondary>a{font-size:9px}.character-switcher{margin-top:21px}.switcher-name strong{font-size:9px}.switcher-list{gap:5px}.switcher-list>button{gap:6px}.hero-scene{top:400px}.console-stats{grid-template-columns:1fr 1fr}.console-stat{padding:15px 11px}.stat-symbol{width:34px;height:34px}.console-stat small{font-size:8px}.console-stat strong{font-size:19px}.flow-steps{align-items:flex-start;flex-direction:column;gap:15px}.flow-line{width:1px;height:15px;flex:none;margin:0 0 0 20px}.flow-line i{display:none}.flow-card,.activity-card{padding:20px}}
@media(max-height:800px) and (min-width:701px){.hero-content{padding-top:19vh}.hero-content h1{font-size:48px;margin-top:17px}.hero-content>p{margin-top:15px}.hero-actions{margin-top:21px}.character-switcher{margin-top:24px}.hero-metrics{bottom:25px}}
@media(prefers-reduced-motion:reduce){.hero-scroll>span,.flow-line i{animation:none}.detail-enter-active,.detail-leave-active{transition:none}}
@media(max-width:700px){.hero-content{box-sizing:border-box}.hero-content>p{max-width:100%;overflow-wrap:anywhere}.character-switcher{padding:10px;border:1px solid rgba(186,160,242,.14);border-radius:16px;background:rgba(6,6,18,.5);backdrop-filter:blur(12px)}}

/* ============ V3: 下拉区改为暗色玻璃，承接宇宙 ============ */
.console-section{
  background:
    radial-gradient(ellipse at 82% 6%,rgba(126,84,214,.34),transparent 34%),
    radial-gradient(ellipse at 8% 42%,rgba(196,110,168,.22),transparent 34%),
    radial-gradient(ellipse at 60% 96%,rgba(58,96,168,.26),transparent 42%),
    linear-gradient(180deg,#0a0818 0%,#0b0a1e 34%,#0d0b24 64%,#080714 100%);
}
.console-section::after{content:'';position:absolute;inset:0;pointer-events:none;z-index:0;background-image:linear-gradient(rgba(150,120,235,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(150,120,235,.05) 1px,transparent 1px);background-size:78px 78px;mask-image:radial-gradient(ellipse at 50% 30%,rgba(0,0,0,.5),transparent 72%)}
.realm-transition{background:linear-gradient(180deg,transparent 0%,rgba(10,8,24,.35) 16%,#0a0818 38%,#0a0818 100%)}
.realm-transition>span{color:#6f6390}
.realm-transition>i{background:linear-gradient(90deg,transparent,#6f5aa8)}

.console-heading h2{color:#f2edfb;text-shadow:0 6px 30px rgba(0,0,0,.4)}
.console-heading p{color:#9a90b4}
.console-date{border-color:rgba(170,148,225,.18);background:rgba(20,16,40,.5);color:#9d92b8;backdrop-filter:blur(10px)}
.console-date i{background:#6ed0ae;box-shadow:0 0 0 4px rgba(110,208,174,.12)}

.console-stat{
  border:1px solid rgba(176,150,240,.14);
  background:linear-gradient(150deg,rgba(38,30,66,.72),rgba(18,15,36,.6));
  box-shadow:0 18px 46px rgba(0,0,0,.34),inset 0 1px 0 rgba(255,255,255,.06);
  backdrop-filter:blur(18px);
}
.console-stat::after{background:radial-gradient(circle,rgba(150,120,235,.18),transparent 68%)}
.console-stat:hover{border-color:rgba(186,158,255,.34);box-shadow:0 24px 60px rgba(0,0,0,.44),0 0 34px rgba(139,110,235,.14),inset 0 1px 0 rgba(255,255,255,.08)}
.console-stat small{color:#8d82a8}
.console-stat strong{color:#f4eefc}
.stat-trend{color:#7d7398}
.stat-symbol.purple{background:rgba(139,114,215,.16);color:#bda6ff}
.stat-symbol.blue{background:rgba(101,166,187,.16);color:#8fd0e6}
.stat-symbol.peach{background:rgba(216,143,114,.16);color:#f0a98c}
.stat-symbol.green{background:rgba(102,169,143,.16);color:#8ee0bd}

.feature-entry{
  border:1px solid rgba(176,150,240,.13);
  background:linear-gradient(155deg,rgba(34,27,60,.62),rgba(15,13,32,.52));
  box-shadow:0 16px 42px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.05);
  backdrop-filter:blur(16px);
}
.feature-entry::before{background:linear-gradient(125deg,rgba(168,142,255,.14),transparent 58%)}
.feature-entry:hover{border-color:rgba(186,158,255,.4);background:linear-gradient(155deg,rgba(54,42,92,.8),rgba(24,20,48,.7));box-shadow:0 26px 60px rgba(0,0,0,.45),0 0 40px rgba(139,110,235,.16)}
.feature-number{color:#5f5680}
.feature-copy small{color:#756a94}
.feature-copy h3{color:#ece5f8}
.feature-copy p{color:#9890b0}
.feature-arrow{border-color:rgba(176,150,240,.2);color:#9b8ec0}
.feature-entry:hover .feature-arrow{background:#7b62d8;border-color:#7b62d8;color:#fff}
.feature-icon.purple{background:rgba(139,114,215,.16);color:#bda6ff}
.feature-icon.blue{background:rgba(101,166,187,.16);color:#8fd0e6}
.feature-icon.peach{background:rgba(216,143,114,.16);color:#f0a98c}
.feature-icon.green{background:rgba(102,169,143,.16);color:#8ee0bd}
.feature-icon.pink{background:rgba(201,135,161,.16);color:#eda8c2}
.feature-icon.violet{background:rgba(117,104,191,.16);color:#a99cf0}

.section-head h2,.character-section-head h2{color:#f2edfb}
.section-head h2 span{background:rgba(139,114,215,.2);color:#c3aaff}
.character-section-head p{color:#8d82a8}
.eyebrow{color:#8f7fc4}
.section-link{color:#a892e8}
.section-link:hover{color:#cbb6ff}

.new-character-card{border-color:rgba(176,150,240,.18);background:rgba(20,17,38,.44);backdrop-filter:blur(14px)}
.new-character-card:hover{border-color:rgba(186,158,255,.4);background:rgba(34,27,60,.6)}
.new-character-card>span{background:rgba(139,114,215,.16);color:#bda6ff}
.new-character-card strong{color:#e8e0f7}
.new-character-card p{color:#8b82a4}
.new-character-card small{color:#6f6590}

.bottom-grid .card,.flow-card,.activity-card{border-color:rgba(176,150,240,.13);background:linear-gradient(155deg,rgba(34,27,60,.6),rgba(15,13,32,.5));box-shadow:0 16px 42px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.05);backdrop-filter:blur(16px)}
.card-title h3{color:#ece5f8}
.card-title p{color:#8b82a4}
.title-icon{background:rgba(139,114,215,.16);color:#bda6ff}
.title-icon.peach{background:rgba(216,143,114,.16);color:#f0a98c}
.flow-step strong{color:#dcd3ee}
.flow-step p{color:#877ea2}
.flow-line i{background:rgba(150,120,235,.28)}
.activity-list strong{color:#dcd3ee}
.activity-list p{color:#9a90b4}
.activity-list small{color:#6f6590}
.activity-live{color:#8ee0bd}

.home-footer{border-top-color:rgba(176,150,240,.12)}
.home-footer p{color:#877ea2}
.home-footer a{color:#a892e8}
.footer-brand{color:#e8e0f7}

/* 角色卡在暗色下的立体感 */
.character-grid :deep(.character-card){border:1px solid rgba(176,150,240,.16);box-shadow:0 20px 50px rgba(0,0,0,.42),0 0 0 1px rgba(0,0,0,.2);transition:transform .35s cubic-bezier(.2,.7,.2,1),box-shadow .35s}
.character-grid :deep(.character-card:hover){transform:translateY(-8px);box-shadow:0 32px 70px rgba(0,0,0,.55),0 0 42px rgba(139,110,235,.18)}

/* ============ V4: 下拉区紫→白渐变，内容回到浅色 ============ */
.universe-hero::after{
  content:'';position:absolute;left:0;right:0;bottom:0;height:30%;z-index:3;pointer-events:none;
  background:linear-gradient(180deg,rgba(10,8,24,0) 0%,rgba(15,11,34,.5) 42%,rgba(23,16,52,.86) 76%,#171034 100%);
}
.console-section{
  padding-top:168px;
  background:
    radial-gradient(ellipse at 76% 96px,rgba(126,84,214,.45),transparent 52%),
    radial-gradient(ellipse at 18% 140px,rgba(196,110,168,.22),transparent 46%),
    linear-gradient(180deg,#171034 0px,#1d1440 54px,#2c2158 120px,#453674 196px,#665394 274px,#8f7fb8 350px,#bdb2d9 424px,#e2dcee 496px,#f8f6fc 560px,#ffffff 100%);
}
.console-section::after{opacity:.35}
.realm-transition{background:none;top:-30px;height:150px}
.realm-transition>span{color:#8b7fb0}
.realm-transition>i{background:linear-gradient(90deg,transparent,#6f5aa8)}

.console-heading h2{color:#2a2338;text-shadow:none}
.console-heading p{color:#6f6684}
.console-date{border-color:rgba(151,136,190,.22);background:rgba(255,255,255,.72);color:#7d7398;backdrop-filter:blur(10px)}
.console-date i{background:#57b894;box-shadow:0 0 0 4px rgba(87,184,148,.14)}

.console-stat{
  border:1px solid rgba(224,217,238,.9);
  background:rgba(255,255,255,.82);
  box-shadow:0 10px 30px rgba(52,38,92,.07),inset 0 1px 0 rgba(255,255,255,.9);
  backdrop-filter:blur(14px);
}
.console-stat::after{background:radial-gradient(circle,rgba(139,118,232,.1),transparent 68%)}
.console-stat:hover{border-color:rgba(160,138,225,.45);box-shadow:0 18px 44px rgba(52,38,92,.12)}
.console-stat small{color:#8f86a4}
.console-stat strong{color:#332b45}
.stat-trend{color:#9a90ad}
.stat-symbol.purple{background:#efebfb;color:#8772d7}
.stat-symbol.blue{background:#eaf5f8;color:#65a6bb}
.stat-symbol.peach{background:#fff0e8;color:#d88f72}
.stat-symbol.green{background:#eaf6f0;color:#66a98f}

.feature-entry{
  border:1px solid rgba(224,217,238,.9);
  background:rgba(255,255,255,.8);
  box-shadow:0 10px 30px rgba(52,38,92,.06);
  backdrop-filter:blur(14px);
}
.feature-entry::before{background:linear-gradient(125deg,rgba(255,255,255,.9),transparent 58%)}
.feature-entry:hover{border-color:rgba(160,138,225,.5);background:#fff;box-shadow:0 22px 48px rgba(52,38,92,.12)}
.feature-number{color:#c3b9cc}
.feature-copy small{color:#a99fbb}
.feature-copy h3{color:#3a3149}
.feature-copy p{color:#8b82a0}
.feature-arrow{border-color:#e6dfec;color:#a99bb6}
.feature-entry:hover .feature-arrow{background:#806bd1;border-color:#806bd1;color:#fff}
.feature-icon.purple{background:#efebfb;color:#8772d7}
.feature-icon.blue{background:#eaf5f8;color:#65a6bb}
.feature-icon.peach{background:#fff0e8;color:#d88f72}
.feature-icon.green{background:#eaf6f0;color:#66a98f}
.feature-icon.pink{background:#faeef3;color:#c987a1}
.feature-icon.violet{background:#f0edfa;color:#7568bf}

.section-head h2,.character-section-head h2{color:#2a2338}
.section-head h2 span{background:#eae5f8;color:#8c79cf}
.character-section-head p{color:#8b82a4}
.eyebrow{color:#8673ce}
.section-link{color:#7b66c8}
.section-link:hover{color:#5f4bb0}

.new-character-card{border-color:#e2dbef;background:rgba(255,255,255,.55)}
.new-character-card:hover{border-color:#c9bcea;background:rgba(255,255,255,.85)}
.new-character-card>span{background:#efebfb;color:#8772d7}
.new-character-card strong{color:#3a3149}
.new-character-card p{color:#8b82a4}
.new-character-card small{color:#a99fbb}

.bottom-grid .card,.flow-card,.activity-card{border-color:rgba(224,217,238,.9);background:rgba(255,255,255,.82);box-shadow:0 10px 30px rgba(52,38,92,.06);backdrop-filter:blur(14px)}
.card-title h3{color:#3a3149}
.card-title p{color:#8b82a4}
.title-icon{background:#efebfb;color:#8772d7}
.title-icon.peach{background:#fff0e8;color:#d88f72}
.flow-step strong{color:#4a4058}
.flow-step p{color:#948aa8}
.flow-line i{background:#e2dbef}
.activity-list strong{color:#4a4058}
.activity-list p{color:#8b82a4}
.activity-list small{color:#a99fbb}
.activity-live{color:#4fae8c}

.home-footer{border-top-color:#e8e2f1}
.home-footer p{color:#8b82a4}
.home-footer a{color:#7b66c8}
.footer-brand{color:#3a3149}

.character-grid :deep(.character-card){border:1px solid #ece7f4;box-shadow:0 14px 38px rgba(46,35,74,.09)}
.character-grid :deep(.character-card:hover){transform:translateY(-8px);box-shadow:0 26px 60px rgba(46,35,74,.16)}
/* V5 最终覆盖：消除首屏与下拉区的接缝 */
.console-section{padding-top:206px;background:
  radial-gradient(circle 460px at 76% 120px,rgba(126,84,214,.34),transparent 100%),
  radial-gradient(circle 380px at 14% 150px,rgba(196,110,168,.16),transparent 100%),
  linear-gradient(180deg,#171034 0px,#171034 40px,#1b1240 84px,#2a1f52 130px,#463773 186px,#6b589c 246px,#a294c8 312px,#d6cfe8 380px,#f3f0f9 440px,#ffffff 500px);}

/* ============ V6 ============ */

/* 1. 宇宙→现实：不再用一条 300px 的紫→白渐变去"化开"
      ————大面积渐变的色阶断层一眼就能看见（紫色里那几条横纹）；
           而且原来暗带顶部压了两个径向光晕，会在首屏底边顶出一条硬接缝。
           现在改成「一块纯色暗带 + 一条地平线」：
           暗带顶端取首屏收尾的同一个颜色 #171034，接缝因此不可见；
           亮线 + 一点向下溢出的辉光说明"这里是一道边"，而不是"这里糊了一片雾"。 */
.console-section{
  --console-band: 300px;
  /* 内容从地平线再往下让 30px，别贴着线放字 */
  padding-top: calc(var(--console-band) + 30px);
  background:
    /* 白区三团极淡的星云，延续首屏色相，免得整页死白 */
    radial-gradient(circle 700px at 78% 760px,rgba(140,112,216,.13),transparent 100%),
    radial-gradient(circle 620px at 10% 1220px,rgba(198,110,168,.10),transparent 100%),
    radial-gradient(circle 760px at 90% 1660px,rgba(96,160,190,.10),transparent 100%),
    #ffffff;
}
.console-section::before{
  content:'';display:block;position:absolute;top:0;left:0;right:0;z-index:0;
  height: var(--console-band);
  pointer-events:none;
  background:
    /* 两团低处辉光：半径收在带子下半部，最上面 78px 完全不参与，顶端始终是纯 #171034 */
    radial-gradient(ellipse 62% 52% at 50% 78%,rgba(122,86,208,.36),transparent 100%),
    radial-gradient(ellipse 34% 46% at 13% 84%,rgba(196,110,168,.18),transparent 100%),
    #171034;
  border-bottom:1px solid rgba(186,158,255,.32);
  box-shadow:0 22px 54px -16px rgba(120,86,200,.30);
}
@media (max-width:900px){ .console-section{--console-band:200px} }
@media (max-width:700px){ .console-section{--console-band:140px} }

/* 过渡文字留在带子上半段的深处（浅色字），别掉进偏白的下沿 */
.realm-transition{top:-24px;height:150px;padding-bottom:34px}
.realm-transition>span{color:#ab9dd2}
.realm-transition>i{background:linear-gradient(90deg,transparent,#8f7fc4)}

/* 2. 玻璃卡里的微光要跟着指针走，否则在浅色卡上完全看不见 */
.console-stat::after{
  right:auto;bottom:auto;inset:0;width:auto;height:auto;border-radius:inherit;
  background:radial-gradient(circle 245px at var(--spot-x,64%) var(--spot-y,58%),rgba(133,108,214,.21),transparent 72%);
  opacity:0;transition:opacity .35s ease;pointer-events:none;
}
.console-stat:hover::after{opacity:1}
.feature-entry::after{
  background:radial-gradient(circle 210px at var(--spot-x,50%) var(--spot-y,50%),rgba(139,114,215,.14),transparent 72%);
}
.feature-entry::before{background:linear-gradient(125deg,rgba(168,142,255,.11),transparent 58%)}
.console-stat,.feature-entry{box-shadow:0 10px 30px rgba(52,38,92,.07),inset 0 1px 0 rgba(255,255,255,.9)}
.console-stat:hover{box-shadow:0 18px 44px rgba(52,38,92,.12),inset 0 1px 0 rgba(255,255,255,.95)}
.feature-entry:hover{box-shadow:0 22px 48px rgba(52,38,92,.12),inset 0 1px 0 rgba(255,255,255,.95)}
/* 卡片留白收一点，六宫格不再像六块空地 */
.feature-entry{min-height:172px}

/* 3. 记忆详情：对角线遮罩擦除（技法来源 RhineLabUI / decryption.ts）
      ————之前 .detail-enter-active 只被引用、从未定义，所以点记忆是硬弹出来的 */
.detail-enter-active{transition:clip-path .4s cubic-bezier(.16,1,.3,1),opacity .26s ease,translate .4s cubic-bezier(.16,1,.3,1)}
.detail-leave-active{transition:clip-path .16s cubic-bezier(.55,0,.85,.3),opacity .12s ease}
.detail-enter-from,.detail-leave-to{clip-path:polygon(0 0,0 0,0 0,0 0);opacity:0;translate:0 6px}
.detail-enter-to,.detail-leave-from{clip-path:polygon(0 0,100% 0,100% 100%,0 100%);opacity:1;translate:0 0}
.memory-detail,.visual-quote{overflow:hidden}
/* 揭开时扫过一条亮边，提示"解密完成" */
.detail-enter-active::after{
  content:'';position:absolute;inset:0;z-index:3;pointer-events:none;border-radius:inherit;
  background:linear-gradient(118deg,transparent 36%,rgba(178,152,241,.5) 50%,transparent 64%);
  animation:decryptSweep .56s cubic-bezier(.16,1,.3,1) both;
}
@keyframes decryptSweep{
  0%{opacity:0;translate:-75% 0}
  22%{opacity:1}
  100%{opacity:0;translate:75% 0}
}

/* 页面末尾给页脚留出空间：之前 padding-bottom 是 0，页脚正好贴着文档末端，
   滚到底也顶不到观察器的触发线 —— 现在多 56px 余量。 */
.console-section{padding-bottom:56px}

/* 4. 点击区补足：这几处纯文字链接的可点高度原本只有 14–15px
      用 padding + 等量负 margin，布局一点不动，只是手能点准了 */
.home-nav-links a{padding-block:11px}
.home-nav-links a::after{bottom:3px}
.hero-secondary>a{padding-block:9px;margin-block:-9px}
.home-footer>a{padding-block:10px;margin-block:-10px}

@media (prefers-reduced-motion: reduce){
  .detail-enter-active,.detail-leave-active{transition:none}
  .detail-enter-active::after{display:none}
  .detail-enter-from,.detail-leave-to{clip-path:none;opacity:0;translate:none}
}


/* section-link 的可点高度只有 17px（纯文字链接），padding + 负 margin 补到 33px */
.section-link{padding-block:8px;margin-block:-8px}

.anime-banner{position:relative;display:flex;align-items:center;justify-content:space-between;gap:24px;margin-top:26px;padding:26px 30px;overflow:hidden;border-radius:22px;border:1px solid rgba(176,150,240,.2);background:linear-gradient(120deg,rgba(88,52,150,.92),rgba(52,38,104,.92) 46%,rgba(30,24,64,.94));color:#fff;text-decoration:none;transition:transform .25s,box-shadow .25s}
.anime-banner:hover{transform:translateY(-4px);box-shadow:0 26px 60px rgba(58,34,120,.45)}
.anime-banner-glow{position:absolute;inset:-40% -10% auto auto;width:420px;height:420px;background:radial-gradient(circle,rgba(168,132,255,.5),transparent 62%);pointer-events:none}
.anime-banner-copy{position:relative;z-index:1}
.anime-banner-kicker{display:inline-flex;align-items:center;gap:6px;font-size:9px;letter-spacing:1.6px;color:#cdbcff;text-transform:uppercase}
.anime-banner-copy h3{margin-top:10px;font-size:24px;letter-spacing:-.5px}
.anime-banner-copy p{margin-top:8px;max-width:520px;color:#c8bce6;font-size:12px;line-height:1.7}
.anime-banner-action{position:relative;z-index:1;display:flex;align-items:center;gap:8px;padding:12px 20px;border-radius:14px;background:rgba(255,255,255,.14);font-size:12px;font-weight:600;white-space:nowrap;backdrop-filter:blur(8px)}
.anime-banner:hover .anime-banner-action{background:rgba(255,255,255,.24)}
@media(max-width:820px){.anime-banner{flex-direction:column;align-items:flex-start;padding:22px}.anime-banner-copy h3{font-size:20px}}

.mobile-menu-btn{display:none;width:38px;height:38px;place-items:center;border:1px solid rgba(190,165,255,.18);border-radius:12px;background:rgba(20,16,38,.55);color:#d6c8f5;cursor:pointer}
.mobile-drawer{position:fixed;inset:0;z-index:60;background:rgba(6,5,16,.62);backdrop-filter:blur(6px)}
.mobile-drawer-panel{width:76%;max-width:300px;height:100%;padding:20px 18px;background:linear-gradient(180deg,#141026,#0b0918);border-right:1px solid rgba(176,150,240,.16);display:flex;flex-direction:column;gap:6px}
.drawer-head{display:flex;align-items:center;justify-content:space-between;color:#cfc2ea;font-size:13px;font-weight:600;padding-bottom:14px;border-bottom:1px solid rgba(176,150,240,.12)}
.drawer-head button{border:0;background:none;color:#9c8fbd}
.drawer-links{display:flex;flex-direction:column;gap:4px;margin-top:10px}
.drawer-links a{display:flex;align-items:center;gap:10px;padding:12px 10px;border-radius:11px;color:#c3b6dd;font-size:13px;text-decoration:none}
.drawer-links a:hover{background:rgba(139,114,215,.16);color:#e7dcff}
.drawer-cta{margin-top:8px;background:linear-gradient(135deg,#7b63d8,#5a48b0);color:#fff !important;justify-content:center}
.drawer-enter-active,.drawer-leave-active{transition:opacity .22s}
.drawer-enter-from,.drawer-leave-to{opacity:0}
@media(max-width:900px){.mobile-menu-btn{display:grid}}
@media(max-width:700px){.switcher-list{overflow-x:auto;padding-bottom:4px}.switcher-list>button{flex:0 0 auto;min-width:140px}}

/* 移动端：角色下拉选择 */
.mobile-char-select{display:none;position:relative;margin-top:16px;width:100%;max-width:420px}
.mcs-trigger{display:flex;align-items:center;gap:10px;width:100%;padding:9px 12px;border:1px solid rgba(190,165,255,.18);border-radius:14px;background:rgba(20,16,38,.62);backdrop-filter:blur(10px);color:#e6ddf7;cursor:pointer;text-align:left}
.mcs-trigger img{width:34px;height:34px;border-radius:10px;object-fit:cover;object-position:center 20%}
.mcs-trigger span{flex:1;min-width:0}
.mcs-trigger small{display:block;font-size:8px;color:#9a8fb5;letter-spacing:.6px}
.mcs-trigger strong{display:block;margin-top:2px;font-size:13px;color:#f0e9fb}
.mcs-trigger svg{color:#a48fd6;transition:transform .2s}
.mcs-trigger svg.open{transform:rotate(180deg)}
.mcs-list{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:20;padding:6px;border:1px solid rgba(190,165,255,.18);border-radius:14px;background:rgba(16,13,32,.96);backdrop-filter:blur(14px);box-shadow:0 18px 40px rgba(0,0,0,.45)}
.mcs-list button{display:flex;align-items:center;gap:10px;width:100%;padding:8px;border:0;border-radius:10px;background:transparent;color:#c9bde3;font-size:12px;cursor:pointer}
.mcs-list button.active,.mcs-list button:hover{background:rgba(139,114,215,.2);color:#f1e9ff}
.mcs-list img{width:28px;height:28px;border-radius:8px;object-fit:cover;object-position:center 20%}
.mcs-list span{flex:1;text-align:left}
.mcs-list small{display:block;font-size:8px;color:#8f85a8;margin-top:1px}
@media(max-width:700px){.mobile-char-select{display:block}.character-switcher{display:none}}

/* 多层视差：背景、网格、光晕以不同速率上移，制造纵深 */
.hero-scene { transform: translate3d(0, calc(var(--scroll, 0) * 46px), 0) scale(calc(1 + var(--scroll, 0) * 0.05)); transition: transform .08s linear; will-change: transform; }
.hero-grid { transform: translate3d(0, calc(var(--scroll, 0) * 96px), 0); opacity: calc(.22 - var(--scroll, 0) * .14); }
.hero-vignette { opacity: calc(1 - var(--scroll, 0) * .55); }
.home-nav { transform: translate3d(0, calc(var(--scroll, 0) * -34px), 0); opacity: calc(1 - var(--scroll, 0) * 1.1); }
</style>