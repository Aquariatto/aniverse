<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ChevronDown, Music2, Pause, Play, Search, SkipBack, SkipForward, X } from 'lucide-vue-next'
import { loadPlaylist, nextTrack, playSong, prevTrack, searchSongs, seekTo, togglePlay, useMusic, type MusicSong } from '../data/music'

defineProps<{ floating?: boolean }>()

const { current, playing, loading, progress, currentTime, duration, error, playlistTitle } = useMusic()
const root = ref<HTMLElement>()
const inputRef = ref<HTMLInputElement>()
const barRef = ref<HTMLElement>()
const open = ref(false)
const searchOpen = ref(false)
/** 首页滚动后：导航行没了，圆钮钉到左上角（之前两轮用过的位置） */
const docked = ref(false)
const onScrollChange = () => { docked.value = window.scrollY > 64 }
const keyword = ref('')
const searching = ref(false)
const results = ref<MusicSong[]>([])
const notice = ref('')
let timer = 0
let dragging = false

const RING_RADIUS = 23
const RING_LENGTH = 2 * Math.PI * RING_RADIUS
const ringOffset = computed(() => RING_LENGTH * (1 - Math.min(100, Math.max(0, progress.value)) / 100))

const mmss = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '0:00'
  const minutes = Math.floor(value / 60)
  const seconds = Math.floor(value % 60)
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
const elapsed = computed(() => mmss(currentTime.value))
const total = computed(() => mmss(duration.value || (current.value?.durationMs || 0) / 1000))

const togglePanel = () => {
  open.value = !open.value
  if (!open.value) searchOpen.value = false
}

const toggleSearch = async () => {
  searchOpen.value = !searchOpen.value
  if (!searchOpen.value) return
  await nextTick()
  inputRef.value?.focus()
}

const runSearch = async () => {
  window.clearTimeout(timer)
  const query = keyword.value.trim()
  if (!query) { results.value = []; return }
  searching.value = true
  notice.value = ''
  try {
    const songs = await searchSongs(query)
    results.value = songs.slice(0, 3)
    if (!songs.length) notice.value = '没找到，换个写法试试（歌名 + 歌手更准）'
  } catch {
    results.value = []
    notice.value = '搜索失败，稍后再试'
  } finally {
    searching.value = false
  }
}

watch(keyword, value => {
  window.clearTimeout(timer)
  if (!value.trim()) { results.value = []; notice.value = ''; return }
  timer = window.setTimeout(runSearch, 350)
})

const pick = async (song: MusicSong) => {
  notice.value = ''
  try {
    await playSong(song)
    searchOpen.value = false
    keyword.value = ''
    results.value = []
  } catch (err) {
    notice.value = err instanceof Error ? err.message : '播放失败'
  }
}

/* 进度条：按下定位，拖动跟随 */
const seekFromPointer = (event: PointerEvent) => {
  const track = barRef.value
  if (!track) return
  const rect = track.getBoundingClientRect()
  seekTo(((event.clientX - rect.left) / Math.max(rect.width, 1)) * 100)
}
const onBarDown = (event: PointerEvent) => {
  dragging = true
  try { (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId) } catch { /* ignore */ }
  seekFromPointer(event)
}
const onBarMove = (event: PointerEvent) => { if (dragging) seekFromPointer(event) }
const onBarUp = (event: PointerEvent) => {
  if (!dragging) return
  dragging = false
  try { (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId) } catch { /* ignore */ }
}

const onDocumentPointer = (event: PointerEvent) => {
  if (!open.value) return
  const target = event.target as Node | null
  if (target && root.value?.contains(target)) return
  open.value = false
  searchOpen.value = false
}

watch(open, value => {
  if (value) document.addEventListener('pointerdown', onDocumentPointer)
  else document.removeEventListener('pointerdown', onDocumentPointer)
})

onMounted(() => {
  window.addEventListener('scroll', onScrollChange, { passive: true })
  onScrollChange()
  void loadPlaylist()
})
onBeforeUnmount(() => {
  window.clearTimeout(timer)
  window.removeEventListener('scroll', onScrollChange)
  document.removeEventListener('pointerdown', onDocumentPointer)
})
</script>

<template>
  <div ref="root" class="music-widget" :class="{ 'is-floating': floating, 'is-docked': floating && docked, 'is-open': open, 'is-playing': playing }">
    <button
      class="music-orb"
      type="button"
      :aria-expanded="open"
      :aria-label="open ? '收起播放器' : '打开播放器'"
      @click="togglePanel"
    >
      <svg class="music-ring" viewBox="0 0 52 52" aria-hidden="true">
        <defs>
          <linearGradient id="musicRingGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#a893ef" />
            <stop offset="100%" stop-color="#6a55c8" />
          </linearGradient>
        </defs>
        <circle class="ring-bg" cx="26" cy="26" :r="RING_RADIUS" />
        <circle class="ring-fg" cx="26" cy="26" :r="RING_RADIUS" :style="{ strokeDashoffset: ringOffset }" />
      </svg>
      <span class="music-orb-inner">
        <img v-if="current?.cover" :src="current.cover" alt="" />
        <Music2 v-else :size="19" />
      </span>
    </button>

    <Transition name="music-panel">
      <div v-if="open" class="music-panel" role="dialog" aria-label="播放器">
        <div class="panel-head">
          <span class="panel-cover">
            <img v-if="current?.cover" :src="current.cover" alt="" />
            <Music2 v-else :size="16" />
          </span>
          <div class="panel-meta">
            <strong>{{ current?.name || '内置歌单' }}</strong>
            <span>{{ current?.artists || playlistTitle || '暂无可播放歌曲' }}</span>
          </div>
          <button class="panel-x" type="button" aria-label="收起" @click.stop="open = false"><X :size="14" /></button>
        </div>

        <div class="panel-controls">
          <button class="ctl" type="button" aria-label="上一首" @click.stop="prevTrack"><SkipBack :size="16" /></button>
          <button class="ctl-main" type="button" :aria-label="playing ? '暂停' : '播放'" @click.stop="togglePlay">
            <span v-if="loading" class="music-spin" />
            <Pause v-else-if="playing" :size="18" />
            <Play v-else :size="18" />
          </button>
          <button class="ctl" type="button" aria-label="下一首" @click.stop="nextTrack"><SkipForward :size="16" /></button>
        </div>

        <div class="panel-progress">
          <div
            ref="barRef"
            class="panel-bar"
            role="slider"
            :aria-valuenow="Math.round(progress)"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-label="播放进度"
            @pointerdown="onBarDown"
            @pointermove="onBarMove"
            @pointerup="onBarUp"
            @pointercancel="onBarUp"
          >
            <span class="panel-bar-track"><i :style="{ width: `${progress}%` }" /></span>
          </div>
          <div class="panel-times"><span>{{ elapsed }}</span><span>{{ total }}</span></div>
        </div>

        <button class="panel-acc" type="button" :class="{ 'is-open': searchOpen }" :aria-expanded="searchOpen" @click.stop="toggleSearch">
          <Search :size="14" /><span>搜索歌曲</span><ChevronDown :size="14" class="panel-chev" />
        </button>

        <div class="panel-acc-body" :class="{ 'is-open': searchOpen }">
          <div class="panel-acc-inner">
            <div class="panel-search">
              <input ref="inputRef" v-model="keyword" type="text" placeholder="歌名 / 歌手 / 厂牌" @keyup.enter="runSearch" />
              <button v-if="keyword" type="button" aria-label="清空" @click.stop="keyword = ''"><X :size="12" /></button>
            </div>
            <div v-if="searching" class="panel-hint"><span class="music-spin" />正在搜索…</div>
            <div v-else-if="results.length" class="panel-results">
              <button v-for="song in results" :key="song.id" type="button" class="panel-row" @click.stop="pick(song)">
                <span class="panel-row-cover">
                  <img v-if="song.cover" :src="song.cover" alt="" />
                  <Music2 v-else :size="14" />
                </span>
                <span class="panel-row-text">
                  <strong>{{ song.name }}</strong>
                  <small>{{ song.artists || '未知歌手' }}</small>
                </span>
                <Play :size="12" class="panel-row-play" />
              </button>
            </div>
            <p v-else class="panel-hint">{{ notice || (keyword ? '没有匹配结果' : '输入关键词，回车搜索，点结果直接播放') }}</p>
            <p v-if="error && !playing" class="panel-error">{{ error }}</p>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.music-widget { position: relative; z-index: 46; flex: none; }
/* 首页沉浸式布局：未滚动时圆钮嵌进导航行（与导航文字同一水平线，UNIVERSE ONLINE 左边） */
.music-widget.is-floating { position: fixed; top: 21px; right: 270px; left: auto; bottom: auto; z-index: 60; }
/* 滚下去、导航行消失后：钉回左上角（之前两轮用过的位置） */
.music-widget.is-floating.is-docked { top: 92px; left: 40px; right: auto; }
/* 注意权重：必须压过后面的 .is-floating .music-panel{right:0}，否则面板会从左边弹出去被裁掉 */
.music-widget.is-floating.is-docked .music-panel { left: 0; right: auto; transform-origin: top left; }

/* ---------- 圆形按钮 + 环形进度 ---------- */
.music-orb { position: relative; width: 52px; height: 52px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 50%; background: transparent; cursor: pointer; }
.music-ring { position: absolute; inset: 0; width: 100%; height: 100%; transform: rotate(-90deg); }
.ring-bg { fill: none; stroke: rgba(120, 100, 180, .16); stroke-width: 2.5; }
.ring-fg {
  fill: none;
  stroke: url(#musicRingGrad);
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-dasharray: 144.51;
  transition: stroke-dashoffset .25s linear;
}
.music-orb-inner {
  position: relative;
  width: 40px; height: 40px;
  display: grid; place-items: center;
  overflow: hidden;
  border-radius: 50%;
  background: rgba(255, 255, 255, .92);
  border: 1px solid rgba(226, 221, 238, .95);
  color: #8d7fc4;
  box-shadow: 0 6px 16px rgba(48, 36, 80, .1);
  transition: transform .2s ease, box-shadow .2s ease;
}
.music-orb:hover .music-orb-inner { transform: scale(1.06); box-shadow: 0 8px 20px rgba(70, 50, 120, .16); }
.music-orb-inner img { width: 100%; height: 100%; object-fit: cover; display: block; }
.is-playing .music-orb-inner { box-shadow: 0 6px 20px rgba(122, 102, 200, .3); }
.is-floating .music-orb-inner { background: rgba(20, 16, 34, .72); border-color: rgba(180, 160, 240, .28); color: #cfc0f0; }
.is-floating .ring-bg { stroke: rgba(255, 255, 255, .16); }

/* ---------- 弹出面板 ---------- */
.music-panel {
  position: absolute;
  top: calc(100% + 12px);
  right: 0;
  width: 276px;
  padding: 14px 14px 8px;
  border: 1px solid rgba(228, 223, 240, .95);
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 26px 64px rgba(40, 30, 70, .22);
  transform-origin: top right;
}
.is-floating .music-panel { left: auto; right: 0; transform-origin: top right; background: #171325; border-color: rgba(150, 130, 210, .3); box-shadow: 0 26px 64px rgba(0, 0, 0, .52); }

.panel-head { display: flex; align-items: center; gap: 10px; }
.panel-cover { width: 42px; height: 42px; flex: none; display: grid; place-items: center; overflow: hidden; border-radius: 11px; background: #f2edfb; color: #9a8ac9; }
.panel-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.panel-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.panel-meta strong { font-size: 12px; color: #443d56; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.panel-meta span { font-size: 10px; color: #9d95ab; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.panel-x { width: 24px; height: 24px; flex: none; display: grid; place-items: center; border: 0; border-radius: 8px; background: transparent; color: #b0a8bd; cursor: pointer; }
.panel-x:hover { background: #f6f2fb; color: #8a7fa3; }
.is-floating .panel-meta strong { color: #e7ddfb; }
.is-floating .panel-meta span { color: #a89cc4; }
.is-floating .panel-cover { background: rgba(255, 255, 255, .09); }
.is-floating .panel-x { color: #a79bc8; }
.is-floating .panel-x:hover { background: rgba(255, 255, 255, .1); color: #ece2ff; }

.panel-controls { display: flex; align-items: center; justify-content: center; gap: 16px; margin: 14px 0 4px; }
.ctl { width: 32px; height: 32px; display: grid; place-items: center; border: 0; border-radius: 50%; background: transparent; color: #8d84a0; cursor: pointer; transition: background .16s, color .16s; }
.ctl:hover { background: #f4f0fd; color: #6a55c8; }
.ctl-main { width: 44px; height: 44px; display: grid; place-items: center; border: 0; border-radius: 50%; background: linear-gradient(135deg, #8f7ae4, #6a55c8); color: #fff; cursor: pointer; box-shadow: 0 8px 20px rgba(110, 88, 200, .34); transition: transform .16s ease, box-shadow .16s ease; }
.ctl-main:hover { transform: translateY(-1px) scale(1.03); box-shadow: 0 10px 24px rgba(110, 88, 200, .42); }
.is-floating .ctl { color: #b3a6d4; }
.is-floating .ctl:hover { background: rgba(255, 255, 255, .1); color: #ece2ff; }

.panel-progress { margin: 8px 2px 2px; }
.panel-bar { height: 18px; display: flex; align-items: center; cursor: pointer; touch-action: none; }
.panel-bar-track { flex: 1; height: 4px; border-radius: 3px; background: rgba(120, 100, 180, .16); overflow: hidden; }
.panel-bar-track i { display: block; height: 100%; border-radius: 3px; background: linear-gradient(90deg, #8f7ae4, #6a55c8); }
.panel-bar:hover .panel-bar-track { background: rgba(120, 100, 180, .24); }
.is-floating .panel-bar-track { background: rgba(255, 255, 255, .18); }
.is-floating .panel-bar:hover .panel-bar-track { background: rgba(255, 255, 255, .26); }
.panel-times { display: flex; justify-content: space-between; margin-top: -2px; color: #aaa2b7; font-size: 9px; font-variant-numeric: tabular-nums; }
.is-floating .panel-times { color: #9a8fbb; }

/* ---------- 二级折叠：搜索 ---------- */
.panel-acc {
  display: flex; align-items: center; gap: 7px;
  width: 100%; margin-top: 10px; padding: 9px 4px;
  border: 0; border-top: 1px solid #f2eef8;
  background: transparent; color: #7b7190; font-size: 11px; cursor: pointer;
}
.panel-acc:hover { color: #6a55c8; }
.panel-acc span { flex: 1; text-align: left; }
.panel-chev { transition: transform .24s cubic-bezier(.22, 1, .36, 1); }
.panel-acc.is-open .panel-chev { transform: rotate(180deg); }
.is-floating .panel-acc { border-top-color: rgba(150, 130, 210, .2); color: #a99ecb; }
.is-floating .panel-acc:hover { color: #e6dcff; }

.panel-acc-body { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .28s cubic-bezier(.22, 1, .36, 1); }
.panel-acc-body.is-open { grid-template-rows: 1fr; }
.panel-acc-inner { overflow: hidden; min-height: 0; }

.panel-search { display: flex; align-items: center; gap: 8px; height: 34px; margin: 2px 0 8px; padding: 0 10px; border: 1px solid #ece7f5; border-radius: 10px; background: #fbf9fe; }
.panel-search input { flex: 1; min-width: 0; border: 0; outline: none; background: transparent; color: #4b4358; font-size: 11px; font-family: inherit; }
.panel-search input::placeholder { color: #b6aec4; }
.panel-search button { width: 20px; height: 20px; display: grid; place-items: center; border: 0; border-radius: 6px; background: #efeaf8; color: #8d82a8; cursor: pointer; }
.is-floating .panel-search { background: rgba(255, 255, 255, .07); border-color: rgba(160, 140, 220, .22); }
.is-floating .panel-search input { color: #e6ddf8; }
.is-floating .panel-search input::placeholder { color: #8b7fa8; }

.panel-results { display: flex; flex-direction: column; gap: 3px; padding-bottom: 6px; }
.panel-row { display: flex; align-items: center; gap: 9px; padding: 6px 6px; border: 0; border-radius: 9px; background: transparent; text-align: left; cursor: pointer; }
.panel-row:hover { background: #f6f2fd; }
.panel-row-cover { width: 30px; height: 30px; flex: none; display: grid; place-items: center; overflow: hidden; border-radius: 7px; background: #f0ebfa; color: #9a8ac9; }
.panel-row-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.panel-row-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.panel-row-text strong { font-size: 11px; color: #47405a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.panel-row-text small { font-size: 9px; color: #a29ab4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.panel-row-play { color: #b3a8d6; flex: none; }
.panel-row:hover .panel-row-play { color: #6a55c8; }
.is-floating .panel-row:hover { background: rgba(255, 255, 255, .07); }
.is-floating .panel-row-cover { background: rgba(255, 255, 255, .09); }
.is-floating .panel-row-text strong { color: #e2d8f6; }
.is-floating .panel-row-text small { color: #9d92bb; }

.panel-hint { display: flex; align-items: center; gap: 6px; margin: 4px 2px 10px; color: #a79fb8; font-size: 10px; line-height: 1.6; }
.is-floating .panel-hint { color: #9a8fc0; }
.panel-error { margin: 0 2px 10px; color: #c05c5c; font-size: 10px; }
.music-spin { width: 13px; height: 13px; flex: none; border: 1.5px solid #ded7f2; border-top-color: #7b66c8; border-radius: 50%; animation: musicSpin .8s linear infinite; }
@keyframes musicSpin { to { transform: rotate(360deg); } }

/* ---------- 动效 ---------- */
.music-panel-enter-active { transition: opacity .2s ease, transform .26s cubic-bezier(.22, 1, .36, 1); }
.music-panel-leave-active { transition: opacity .14s ease, transform .16s ease; }
.music-panel-enter-from, .music-panel-leave-to { opacity: 0; transform: translateY(-10px) scale(.94); }

@media (max-width: 560px) {
  .music-orb { width: 46px; height: 46px; }
  .music-orb-inner { width: 36px; height: 36px; }
  /* 手机上导航行被 logo/菜单占满，圆钮放在导航下方；滚动后再收到右上角 */
  .music-widget.is-floating { top: 72px; left: auto; right: 12px; }
  .music-widget.is-floating.is-docked { top: 12px; left: auto; right: 12px; }
  .music-panel { position: fixed; left: 12px; right: 12px; top: 62px; width: auto; transform-origin: top center; }
  .is-floating .music-panel { left: 12px; right: 12px; top: 122px; transform-origin: top center; }
}
/* 播放时：光环呼吸 + 封面轻微起伏，提示"正在响" */
.is-playing .music-ring { animation: breathe 2.8s var(--ease-inout) infinite; }
.is-playing .music-orb-inner { animation: breathe 3.4s var(--ease-inout) infinite; }
@media (prefers-reduced-motion: reduce) { .is-playing .music-ring, .is-playing .music-orb-inner { animation: none; } }
</style>
