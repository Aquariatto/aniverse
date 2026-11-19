<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { MousePointer2, Pause, Play, RotateCcw, Sparkles } from 'lucide-vue-next'
import { MemoryUniverse } from '../scene/MemoryUniverse'
import type { Character, Memory } from '../data/mock'

const props = defineProps<{
  character: Character
  memories: Memory[]
  selectedMemoryId?: number | null
}>()
const emit = defineEmits<{
  select: [memory: Memory | null]
  hover: [memory: Memory | null]
  ready: [value: boolean]
}>()

const container = ref<HTMLDivElement>()
const fallback = ref(false)
const ready = ref(false)
const motionEnabled = ref(!window.matchMedia('(prefers-reduced-motion: reduce)').matches)
let universe: MemoryUniverse | null = null
let scrollFrame = 0

const updateScroll = () => {
  if (scrollFrame) return
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0
    const hero = container.value?.closest('.universe-hero')
    if (!hero) return
    const progress = Math.min(Math.max(-hero.getBoundingClientRect().top / Math.max(hero.clientHeight * 0.8, 1), 0), 1)
    universe?.setScrollProgress(progress)
  })
}

onMounted(() => {
  if (!container.value) return
  try {
    universe = new MemoryUniverse(container.value, props.character, props.memories, {
      onSelect: memory => emit('select', memory),
      onHover: memory => emit('hover', memory),
    })
    universe.setMotion(motionEnabled.value)
    universe.setSelected(props.selectedMemoryId ?? null)
    ready.value = true
    emit('ready', true)
  } catch (error) {
    console.warn('Memory universe switched to static fallback.', error)
    fallback.value = true
    emit('ready', false)
  }
  window.addEventListener('scroll', updateScroll, { passive: true })
  updateScroll()
})

/**
 * 场景真正读取的角色字段：id（决定随机种子与配色分支）、color（所有材质/星尘/轨道颜色）、
 * name（canvas 的读屏标签）、avatar（立绘贴图）。
 * 只盯 id 的话，同一角色改配色或换立绘时场景不会重建 —— 这是 V2 遗留的问题。
 * affinity 故意不放进来：它只影响基座那几颗小珠子的位置，重建整个场景不划算。
 */
const sceneSignature = computed(() => {
  const { id, color, name, avatar } = props.character
  return `${id}|${color}|${name}|${avatar}`
})

watch(sceneSignature, () => {
  universe?.setCharacter(props.character, props.memories)
})
watch(() => props.memories.map(memory => `${memory.id}:${memory.content}:${memory.importance}`).join('|'), () => {
  universe?.setMemories(props.memories)
})
watch(() => props.selectedMemoryId, id => universe?.setSelected(id ?? null))
watch(motionEnabled, enabled => universe?.setMotion(enabled))

const resetView = () => universe?.resetView()
const toggleMotion = () => { motionEnabled.value = !motionEnabled.value }

defineExpose({ resetView })
onBeforeUnmount(() => {
  window.removeEventListener('scroll', updateScroll)
  cancelAnimationFrame(scrollFrame)
  universe?.dispose()
  universe = null
})
</script>

<template>
  <div class="universe-shell" :class="{ 'is-ready': ready, 'is-paused': !motionEnabled }">
    <div ref="container" class="universe-scene" />
    <div v-if="fallback" class="scene-fallback">
      <div class="fallback-orbit orbit-a"><i /><i /><i /></div>
      <div class="fallback-orbit orbit-b"><i /><i /></div>
      <div class="fallback-aura" />
      <div class="fallback-portrait"><img :src="character.avatar" :alt="character.name" /></div>
      <span class="fallback-note"><Sparkles :size="12" />静态星轨模式</span>
    </div>

    <div class="scene-topline">
      <span class="scene-live"><i />MEMORY FIELD</span>
      <span class="scene-index">{{ String(memories.length).padStart(2, '0') }} NODES · {{ character.english.toUpperCase() }}</span>
    </div>

    <div class="scene-toolbar">
      <span><MousePointer2 :size="13" />拖动旋转 · 点击记忆</span>
      <div>
        <button type="button" title="重置视角" aria-label="重置三维场景视角" @click="resetView"><RotateCcw :size="14" /></button>
        <button type="button" :title="motionEnabled ? '暂停动态' : '开启动态'" :aria-label="motionEnabled ? '暂停三维动画' : '开启三维动画'" @click="toggleMotion">
          <Pause v-if="motionEnabled" :size="14" /><Play v-else :size="14" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.universe-shell { position: absolute; inset: 0; overflow: hidden; isolation: isolate; }
.universe-scene { position: absolute; inset: 0; z-index: 1; opacity: 0; transition: opacity .8s ease; }
.is-ready .universe-scene { opacity: 1; }
.universe-scene :deep(.memory-webgl) { position: absolute; inset: 0; display: block; width: 100%; height: 100%; cursor: grab; touch-action: pan-y; outline: none; }
.universe-scene :deep(.memory-webgl.is-hovering) { cursor: pointer; }
.universe-scene :deep(.memory-webgl.is-dragging) { cursor: grabbing; touch-action: none; }
.universe-scene :deep(.memory-label-layer) { position: absolute; inset: 0; z-index: 4; pointer-events: none; overflow: hidden; }
.universe-scene :deep(.memory-node-label) { position: relative; display: block; padding: 0; border: 0; background: transparent; color: #6f6682; pointer-events: auto; cursor: pointer; font-family: inherit; transition: filter .2s ease; }
.universe-scene :deep(.memory-label-title) { display: flex; align-items: center; gap: 5px; padding: 5px 8px; border: 1px solid rgba(255,255,255,.85); border-radius: 20px; background: rgba(255,255,255,.72); box-shadow: 0 5px 18px rgba(67,51,105,.09); backdrop-filter: blur(10px); font-size: 8px; font-weight: 600; letter-spacing: .35px; white-space: nowrap; transition: all .2s ease; }
.universe-scene :deep(.memory-label-title i) { width: 5px; height: 5px; border-radius: 50%; box-shadow: 0 0 0 3px rgba(139,118,232,.09); }
.universe-scene :deep(.memory-label-preview) { position: absolute; left: 50%; bottom: calc(100% + 8px); width: 178px; padding: 10px 12px; border: 1px solid rgba(255,255,255,.9); border-radius: 12px; background: rgba(255,255,255,.92); box-shadow: 0 12px 35px rgba(58,43,94,.14); color: #756c84; font-size: 10px; font-weight: 400; line-height: 1.65; text-align: left; white-space: normal; opacity: 0; visibility: hidden; transform: translate(-50%,5px); transition: all .18s ease; pointer-events: none; }
.universe-scene :deep(.memory-node-label.hovered) { z-index: 8; }
.universe-scene :deep(.memory-node-label.hovered .memory-label-preview),
.universe-scene :deep(.memory-node-label:focus-visible .memory-label-preview) { opacity: 1; visibility: visible; transform: translate(-50%,0); }
.universe-scene :deep(.memory-node-label:hover .memory-label-title),
.universe-scene :deep(.memory-node-label.selected .memory-label-title) { background: rgba(255,255,255,.96); border-color: rgba(158,141,225,.35); color: #5d4cac; box-shadow: 0 7px 22px rgba(93,72,158,.16); transform: translateY(-2px); }
.universe-scene :deep(.memory-node-label.selected .memory-label-title)::after { content: ''; width: 4px; height: 4px; margin-left: 2px; border-radius: 50%; background: #8b76e8; animation: nodePulse 1.6s ease-in-out infinite; }
.scene-topline { position: absolute; z-index: 7; left: 44px; right: 44px; top: 98px; display: flex; align-items: center; justify-content: space-between; gap: 12px; pointer-events: none; }
.scene-live { display: inline-flex; align-items: center; gap: 7px; color: #8275ae; font-size: 8px; font-weight: 700; letter-spacing: 1.5px; }
.scene-live i { width: 6px; height: 6px; border-radius: 50%; background: #7fc3ad; box-shadow: 0 0 0 4px rgba(127,195,173,.12); animation: nodePulse 2.4s ease-in-out infinite; }
.is-paused .scene-live i { animation: none; background: #b7b0c3; box-shadow: none; }
.scene-index { color: #aaa0bb; font-size: 7px; letter-spacing: 1px; white-space: nowrap; }
.scene-toolbar { position: absolute; z-index: 8; left: 72%; bottom: 26px; transform: translateX(-50%); display: flex; align-items: center; gap: 13px; padding: 5px 6px 5px 12px; border: 1px solid rgba(255,255,255,.82); border-radius: 13px; background: rgba(255,255,255,.55); box-shadow: 0 8px 25px rgba(65,48,105,.07); backdrop-filter: blur(14px); white-space: nowrap; }
.scene-toolbar > span { display: flex; align-items: center; gap: 6px; color: #9a90aa; font-size: 8px; }
.scene-toolbar > div { display: flex; gap: 3px; }
.scene-toolbar button { width: 27px; height: 27px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 8px; background: rgba(242,239,250,.8); color: #8a7aba; transition: all .18s ease; }
.scene-toolbar button:hover { background: #e9e3f8; color: #6c57c4; transform: translateY(-1px); }
.scene-fallback { position: absolute; inset: 0; z-index: 1; display: grid; place-items: center; }
.fallback-aura { position: absolute; width: 270px; height: 270px; border-radius: 50%; background: radial-gradient(circle,rgba(255,255,255,.75),rgba(163,142,224,.12) 50%,transparent 72%); }
.fallback-portrait { position: relative; z-index: 2; width: 154px; height: 220px; padding: 6px; border: 1px solid rgba(255,255,255,.9); border-radius: 80px 80px 22px 22px; background: rgba(255,255,255,.45); box-shadow: 0 24px 50px rgba(75,56,117,.15); }
.fallback-portrait img { width: 100%; height: 100%; object-fit: cover; object-position: center 18%; border-radius: 74px 74px 17px 17px; }
.fallback-orbit { position: absolute; width: 330px; height: 180px; border: 1px solid rgba(139,118,232,.2); border-radius: 50%; transform: rotate(-18deg); }
.fallback-orbit.orbit-b { width: 380px; height: 230px; transform: rotate(28deg); border-color: rgba(231,157,133,.18); }
.fallback-orbit i { position: absolute; width: 9px; height: 9px; border: 3px solid rgba(255,255,255,.8); border-radius: 50%; background: #a18ce2; box-shadow: 0 0 15px rgba(139,118,232,.35); }
.fallback-orbit i:nth-child(1) { left: 14%; top: 17%; }.fallback-orbit i:nth-child(2) { right: 4%; top: 54%; background: #e7a48d; }.fallback-orbit i:nth-child(3) { left: 46%; bottom: -5px; background: #75b5c5; }
.fallback-note { position: absolute; bottom: 62px; display: flex; align-items: center; gap: 5px; color: #9a8caf; font-size: 9px; }
@keyframes nodePulse { 50% { opacity: .4; } }
.scene-live { color: #aa94dc; }
.scene-index { color: #716583; }
.scene-toolbar { border-color: rgba(183,158,241,.14); background: rgba(13,11,29,.56); box-shadow: 0 10px 30px rgba(0,0,0,.22),inset 0 1px 0 rgba(255,255,255,.05); }
.scene-toolbar > span { color: #8c80a1; }
.scene-toolbar button { background: rgba(51,39,78,.72); color: #b39ddd; }
.scene-toolbar button:hover { background: rgba(79,58,119,.85); color: #e2d2ff; }
.universe-scene :deep(.memory-node-label) { color: #b9a9cf; }
.universe-scene :deep(.memory-label-title) { padding: 6px 9px; border-color: rgba(193,167,255,.16); background: rgba(14,11,30,.7); box-shadow: 0 6px 22px rgba(0,0,0,.26),inset 0 1px 0 rgba(255,255,255,.05); font-size: 9px; }
.universe-scene :deep(.memory-label-preview) { border-color: rgba(190,163,248,.18); background: rgba(15,12,31,.94); box-shadow: 0 15px 40px rgba(0,0,0,.4); color: #c3b6d3; font-size: 11px; }
.universe-scene :deep(.memory-node-label:hover .memory-label-title),
.universe-scene :deep(.memory-node-label.selected .memory-label-title) { border-color: rgba(177,141,255,.42); background: rgba(41,29,68,.9); color: #ddcaff; box-shadow: 0 8px 28px rgba(0,0,0,.36),0 0 22px rgba(139,92,246,.12); }
.scene-fallback { background: radial-gradient(circle at 50% 45%,#17132c,#050611 65%); }
.fallback-note { color: #9c89b8; }
@media (max-width: 620px) {
  .scene-topline { left: 16px; right: 16px; top: 15px; }
  .scene-index { display: none; }
  .scene-toolbar { left: 50%; bottom: 13px; }
  .universe-scene :deep(.memory-label-title) { padding: 4px 6px; font-size: 7px; }
  .universe-scene :deep(.memory-label-preview) { width: 150px; font-size: 9px; }
}
@media (prefers-reduced-motion: reduce) {
  .universe-scene, .memory-label-title, .memory-label-preview { transition: none; }
  .scene-live i, .universe-scene :deep(.memory-node-label.selected .memory-label-title)::after { animation: none; }
}
</style>
