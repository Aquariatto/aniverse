import { computed, ref } from 'vue'

export interface MusicSong {
  id: number
  name: string
  artists: string
  album?: string
  durationMs: number
  cover: string
  fee?: number
  score?: number
  /** true 已探测可播 / false 需要会员或无版权 / null 未探测 */
  playable?: boolean | null
  /** 本地音源（内置歌单），有值就不再走接口 */
  src?: string
}

const STORAGE_KEY = 'aniverse.music.v1'

/** 全局单例状态：任意页面的播放器组件共享同一个 audio 元素 */
const current = ref<MusicSong | null>(null)
const playing = ref(false)
const loading = ref(false)
const progress = ref(0)
const currentTime = ref(0)
const duration = ref(0)
const error = ref('')
/** 内置歌单（塞壬唱片精选，随站点分发，点开即播） */
const playlist = ref<MusicSong[]>([])
const playlistTitle = ref('')
const playlistIndex = ref(-1)
let playlistReady = false

let audio: HTMLAudioElement | null = null
/** 音频元数据还没到时用户就拖了进度：记下来，加载完立即补上 */
let pendingSeek: number | null = null

function ensureAudio() {
  if (audio) return audio
  const element = new Audio()
  element.preload = 'metadata'
  element.addEventListener('play', () => { playing.value = true })
  element.addEventListener('pause', () => { playing.value = false })
  element.addEventListener('error', () => {
    playing.value = false
    if (element.getAttribute('src')) error.value = '音源加载失败，换一首试试'
  })
  element.addEventListener('timeupdate', () => {
    currentTime.value = element.currentTime
    if (element.duration && Number.isFinite(element.duration)) duration.value = element.duration
    progress.value = element.duration ? (element.currentTime / element.duration) * 100 : 0
  })
  element.addEventListener('loadedmetadata', () => {
    if (Number.isFinite(element.duration)) duration.value = element.duration
    if (pendingSeek !== null && element.duration) {
      element.currentTime = (pendingSeek / 100) * element.duration
      pendingSeek = null
    }
  })
  element.addEventListener('ended', () => {
    playing.value = false
    progress.value = 100
    if (playlist.value.length) void nextTrack()   // 自动续播下一首
  })
  audio = element
  return element
}

function restore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const saved = JSON.parse(raw) as MusicSong
    if (saved && typeof saved.id === 'number' && saved.name) current.value = saved
  } catch { /* 忽略损坏的存档 */ }
}
restore()

function persist() {
  try {
    if (current.value) localStorage.setItem(STORAGE_KEY, JSON.stringify(current.value))
    else localStorage.removeItem(STORAGE_KEY)
  } catch { /* 忽略配额 */ }
}

/** 本地音源直接挂上，等用户按播放（浏览器不允许自动出声） */
function prepareLocal(song: MusicSong) {
  if (!song?.src) return
  const element = ensureAudio()
  if (element.getAttribute('src') === song.src) return
  element.src = song.src
  element.load()
  currentTime.value = 0
  progress.value = 0
  duration.value = song.durationMs ? song.durationMs / 1000 : 0
}

export async function loadPlaylist() {
  if (playlistReady) return
  playlistReady = true
  try {
    const payload = await fetch('/music/playlist.json').then(r => r.json())
    playlist.value = Array.isArray(payload?.songs) ? payload.songs as MusicSong[] : []
    playlistTitle.value = String(payload?.title || '内置歌单')
  } catch { playlist.value = [] }
  if (!current.value && playlist.value.length) {
    current.value = playlist.value[0]
    playlistIndex.value = 0
    prepareLocal(playlist.value[0])
    persist()
  } else if (current.value?.src) {
    prepareLocal(current.value)
  }
}

export async function searchSongs(keyword: string): Promise<MusicSong[]> {
  const query = keyword.trim()
  if (!query) return []
  const response = await fetch(`/api/music/search?q=${encodeURIComponent(query)}`)
  const payload = await response.json().catch(() => ({}))
  return Array.isArray(payload.songs) ? payload.songs as MusicSong[] : []
}

/** 本地音源 404（仓库不带 mp3）时，回退到后端在线解析 */
async function resolveRemote(song: MusicSong): Promise<string> {
  if (!song?.id) return ''
  try {
    const payload = await fetch(`/api/music/url?id=${song.id}`).then(r => r.json())
    return String(payload?.url || '')
  } catch { return '' }
}

export async function playSong(song: MusicSong) {
  const element = ensureAudio()
  loading.value = true
  error.value = ''
  try {
    let src: string = song.src || ''
      // 仓库不带 mp3：本地音源 404 时清空 src，走下面的在线解析兜底
      if (src) {
        const probe = await fetch(src, { method: 'HEAD' }).catch(() => null)
        if (!probe || !probe.ok) src = ''
      }
    if (!src) {
      const payload = await fetch(`/api/music/url?id=${song.id}`).then(r => r.json())
      if (!payload?.ok || !payload.url) throw new Error(payload?.error || '这首暂时拿不到音源')
      src = String(payload.url)
    }
    element.src = src
    element.load()
    await element.play()
    current.value = song
    playlistIndex.value = playlist.value.findIndex(item => item.id === song.id)
    progress.value = 0
    currentTime.value = 0
    duration.value = song.durationMs ? song.durationMs / 1000 : 0
    persist()
  } catch (err) {
    playing.value = false
    error.value = err instanceof Error ? err.message : '播放失败'
    throw err
  } finally {
    loading.value = false
  }
}

export async function playAt(index: number) {
  const list = playlist.value
  if (!list.length) return
  const normalized = ((index % list.length) + list.length) % list.length
  await playSong(list[normalized]).catch(() => { /* 错误已进 state */ })
}

export async function nextTrack() {
  if (!playlist.value.length) return
  const index = playlistIndex.value < 0 ? 0 : playlistIndex.value + 1
  await playAt(index)
}

export async function prevTrack() {
  if (!playlist.value.length) return
  const index = playlistIndex.value < 0 ? playlist.value.length - 1 : playlistIndex.value - 1
  await playAt(index)
}

export async function togglePlay() {
  if (!current.value) return
  const element = ensureAudio()
  if (!element.getAttribute('src')) { await playSong(current.value).catch(() => { /* 错误已写入 state */ }); return }
  if (element.paused) await element.play().catch(() => { playing.value = false })
  else element.pause()
}

export function seekTo(percent: number) {
  const element = ensureAudio()
  const clamped = Math.min(100, Math.max(0, percent))
  if (!element.duration || !Number.isFinite(element.duration)) { pendingSeek = clamped; return }
  element.currentTime = (clamped / 100) * element.duration
}

export function stopMusic() {
  const element = ensureAudio()
  element.pause()
  element.removeAttribute('src')
  element.load()
  current.value = null
  playing.value = false
  progress.value = 0
  currentTime.value = 0
  duration.value = 0
  error.value = ''
  playlistIndex.value = -1
  persist()
}

export function useMusic() {
  const hasPlaylist = computed(() => playlist.value.length > 0)
  return {
    current, playing, loading, progress, currentTime, duration, error,
    playlist, playlistTitle, playlistIndex, hasPlaylist,
  }
}
