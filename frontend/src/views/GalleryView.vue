<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { Check, ChevronRight, Download, Heart, ImagePlus, ImageUp, Images, Maximize2, RefreshCcw, Search, Sparkles, Tags, Trash2, UploadCloud, WandSparkles, X } from 'lucide-vue-next'
import { useAppStore } from '../stores/app'
import { compressImage } from '../data/image'
import { assetUrl, thumbUrl } from '../data/assets'
import ImageAnnotator from '../components/ImageAnnotator.vue'
import type { Asset } from '../data/mock'
const store = useAppStore()
const filter = ref('全部资产')
const query = ref('')
const selectedTag = ref('')
const dragging = ref(false)
const fileInput = ref<HTMLInputElement>()
const selected = ref<Asset | null>(null)
const filters = ['全部资产', 'AI 生图', '角色立绘', '场景', '我的收藏']
const categoryOf = (asset: Asset) => asset.source === 'AI 生图' ? 'AI 生图'
  : asset.source === '角色资产' ? '角色立绘'
  : asset.source === '剧情资产' ? '场景'
  : ''
const filtered = computed(() => store.assets.filter(a => {
  const filterMatch = filter.value === '全部资产'
    ? true
    : filter.value === '我的收藏'
      ? a.favorite
      : a.tags.includes(filter.value) || categoryOf(a) === filter.value
  const queryMatch = !query.value || `${a.title}${a.tags.join('')}`.toLowerCase().includes(query.value.toLowerCase())
  const tagMatch = !selectedTag.value || a.tags.includes(selectedTag.value)
  return filterMatch && queryMatch && tagMatch
}))
const allTags = computed(() => [...new Set(store.assets.flatMap(asset => asset.tags))].slice(0, 9))
const assetCount = computed(() => ({
  ai: store.assets.filter(asset => categoryOf(asset) === 'AI 生图').length,
  portrait: store.assets.filter(asset => categoryOf(asset) === '角色立绘').length,
  scene: store.assets.filter(asset => categoryOf(asset) === '场景').length,
  favorite: store.assets.filter(asset => asset.favorite).length,
}))
const upload = (files: FileList | null) => {
  if (!files?.length) return
  Array.from(files).slice(0, 6).forEach(file => {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => store.addAsset({ title: file.name.replace(/\.[^.]+$/, ''), image: reader.result as string, tags: ['上传', '未分类'] })
    reader.readAsDataURL(file)
  })
  dragging.value = false
}
const findSimilar = (asset: Asset) => { selected.value = null; query.value = asset.tags[0]; store.notify('已找到相似资产', `按「${asset.tags[0]}」与画面语义进行匹配`, 'info') }
const removeSelectedAsset = () => {
  if (!selected.value) return
  store.removeAsset(selected.value.id)
  selected.value = null
}

// ---------------- 在线生图工作台 ----------------
const RATIOS = [
  { value: '9:16', label: '竖版 9:16' },
  { value: '16:9', label: '横版 16:9' },
  { value: '1:1', label: '方形 1:1' },
  { value: '3:4', label: '竖幅 3:4' },
  { value: '4:3', label: '横幅 4:3' },
  { value: '21:9', label: '宽银幕 21:9' },
]
interface StudioResult { url: string; original: string; width: number; height: number; prompt: string; cropped: boolean; ratio: string; auto: boolean; remote?: boolean; upscaled?: number }
/** 上游 /v1/models 里实测可用的生图模型；2.6 系列额外支持动图与矢量图 */
// 文档 3.1 / 4.5 / 5.3 / 5.4：
//   GPT Image 系列（2 / 2.5 / 2.6 及别名）才支持 GIF、SVG、Mask、markup
//   *-official 走官方 Key，按 token 计费、原生像素，只出静图
const MODELS = [
  { id: 'gpt-image-2.6-sunburst', label: 'GPT Image 2.6 · Sunburst', group: '标准（按张计费）', vector: true },
  { id: 'gpt-image-2.6-flare', label: 'GPT Image 2.6 · Flare', group: '标准（按张计费）', vector: true },
  { id: 'gpt-image-2.6', label: 'GPT Image 2.6', group: '标准（按张计费）', vector: true },
  { id: 'gpt-image-2.5-sunburst', label: 'GPT Image 2.5 · Sunburst', group: '标准（按张计费）', vector: true },
  { id: 'gpt-image-2.5-flare', label: 'GPT Image 2.5 · Flare', group: '标准（按张计费）', vector: true },
  { id: 'gpt-image-2', label: 'GPT Image 2', group: '标准（按张计费）', vector: true },
  { id: 'gemini-nano-banana-2.1', label: 'Gemini Nano Banana 2.1', group: '标准（按张计费）', vector: false },
  { id: 'grok-imagine-image-2.0', label: 'Grok Imagine 2.0', group: '标准（按张计费）', vector: false },
  { id: 'gpt-image-2.6-sunburst-official', label: '2.6 Sunburst · 官方', group: '高清 · 按量计费', vector: false, official: true },
  { id: 'gpt-image-2.6-flare-official', label: '2.6 Flare · 官方', group: '高清 · 按量计费', vector: false, official: true },
  { id: 'gpt-image-2.5-sunburst-official', label: '2.5 Sunburst · 官方', group: '高清 · 按量计费', vector: false, official: true },
  { id: 'gpt-image-2.5-flare-official', label: '2.5 Flare · 官方', group: '高清 · 按量计费', vector: false, official: true },
]
/** 官方档：比例 × 档位自由组合，实际输出按 16 的倍数对齐并受官方上下限约束 */
const OFFICIAL_RATIOS = [
  { id: '1:1', label: '1:1 方形' },
  { id: '16:9', label: '16:9 横版' },
  { id: '9:16', label: '9:16 竖版' },
  { id: '4:3', label: '4:3 横版' },
  { id: '3:4', label: '3:4 竖版' },
  { id: '3:2', label: '3:2 横版' },
  { id: '2:3', label: '2:3 竖版' },
  { id: '21:9', label: '21:9 宽银幕' },
]
const OFFICIAL_TIERS = [
  { id: '1k', label: '1K · 约 1 MP', pixels: 1_048_576 },
  { id: '15k', label: '1.5K · 约 2.4 MP', pixels: 2_400_000 },
  { id: '2k', label: '2K · 约 4.2 MP', pixels: 4_194_304 },
  { id: '4k', label: '4K · 约 8.3 MP', pixels: 8_294_400 },
]
const studioOpen = ref(false)
const mode = ref<'text' | 'image'>('text')
const generating = ref(false)
const refining = ref(false)
const studioError = ref('')
const results = ref<StudioResult[]>([])
const refInput = ref<HTMLInputElement>()
const form = reactive({
  prompt: '',
  ratio: 'auto',
  customRatio: false,
  customWidth: 7,
  customHeight: 3,
  count: 1,
  quality: 'high',
  style: 'vivid',
  background: 'opaque',
  refImages: [] as string[],
  autoRefine: false,
  model: 'gpt-image-2.6-sunburst',
  officialRatio: '1:1',
  officialTier: '1k',
  upscale: '',
  outputFormat: 'png' as 'png' | 'gif' | 'svg',
  frameCount: 6,
  frameDurationMs: 120,
  mask: '',
  markup: '',
})
const REF_LIMIT = 4
const currentModel = computed(() => MODELS.find(item => item.id === form.model))
const isOfficial = computed(() => Boolean(currentModel.value?.official))
const align16 = (value: number) => Math.max(16, Math.round(value / 16) * 16)
const officialSize = computed(() => {
  const [w, h] = form.officialRatio.split(':').map(Number)
  const tier = OFFICIAL_TIERS.find(item => item.id === form.officialTier) || OFFICIAL_TIERS[0]
  const k = Math.sqrt(tier.pixels / (w * h))
  let width = align16(w * k)
  let height = align16(h * k)
  if (width * height > 8_294_400) {
    const shrink = Math.sqrt(8_294_400 / (width * height))
    width = align16(width * shrink)
    height = align16(height * shrink)
  }
  const longer = Math.max(width, height)
  if (longer > 3840) {
    const shrink = 3840 / longer
    width = align16(width * shrink)
    height = align16(height * shrink)
  }
  return `${width}x${height}`
})
const officialPixels = computed(() => {
  const [w, h] = officialSize.value.split('x').map(Number)
  return w * h
})
const groupedModels = computed(() => {
  const groups = new Map<string, typeof MODELS>()
  for (const item of MODELS) {
    if (!groups.has(item.group)) groups.set(item.group, [])
    groups.get(item.group)!.push(item)
  }
  return [...groups.entries()]
})
/**
 * 官方档按 token 计费，价格估算基于实测三点：
 *   1024² low  → 827 输出 token  → 12.30 积分
 *   1024² high → 1756 输出 token → 25.66 积分
 *   3840×2160 high → 3336 输出 token → 48.53 积分
 * token 随像素是次线性增长（≈ 像素^0.31），线性外推会把 4K 高估 4 倍。
 */
const TOKEN_BASE: Record<string, number> = { low: 827, medium: 1250, high: 1756 }
const estimatePrice = (pixels: number, count = 1) => {
  const base = TOKEN_BASE[form.quality] ?? 1756
  const outputTokens = Math.round(base * Math.pow(pixels / (1024 * 1024), 0.31))
  const credits = (100 * 3840 + outputTokens * 14400) / 1_000_000
  return (credits * 0.01 * count).toFixed(2)
}
/** 第一张作为主参考图（局部编辑 / 标记都作用在它身上） */
const primaryRef = computed(() => form.refImages[0] || '')
const vectorReady = computed(() => Boolean(currentModel.value?.vector))
const upscaleReady = ref(false)
const upscaling = ref(0)
const previewResult = ref<StudioResult | null>(null)
/** 结果缩略图 → 大图预览的共享元素过渡 */
const openPreview = async (item: StudioResult, index: number) => {
  const thumb = document.querySelector<HTMLElement>(`[data-result-thumb="${index}"] img`)
  const start = (document as unknown as { startViewTransition?: (cb: () => Promise<void> | void) => { finished: Promise<void> } }).startViewTransition
  if (!thumb || !start) { previewResult.value = item; return }
  const name = 'result-hero'
  thumb.style.viewTransitionName = name
  const transition = start.call(document, async () => {
    previewResult.value = item
    await nextTick()
    thumb.style.viewTransitionName = ''
    const big = document.querySelector<HTMLElement>('.preview-figure img')
    if (big) big.style.viewTransitionName = name
  })
  await transition.finished.catch(() => {})
  const big = document.querySelector<HTMLElement>('.preview-figure img')
  if (big) big.style.viewTransitionName = ''
}
const annotatorOpen = ref(false)
const annotatorMode = ref<'mask' | 'markup'>('mask')
const openAnnotator = (which: 'mask' | 'markup' = 'mask') => {
  if (!primaryRef.value) { studioError.value = '先上传一张参考图，再做局部编辑'; return }
  studioError.value = ''
  annotatorMode.value = which
  annotatorOpen.value = true
}
/** 两种模式互斥：同一次只会带上一个字段，避免服务端优先生效造成意外 */
const applyAnnotation = (dataUrl: string, used: 'mask' | 'markup' = 'mask') => {
  if (used === 'markup') { form.markup = dataUrl; form.mask = '' }
  else { form.mask = dataUrl; form.markup = '' }
}
// 换模型时，不支持动图/矢量图就退回 PNG
/**
 * AI 超分（腾讯云数据万象）—— 图片走浏览器直传 COS，不经过本站服务器：
 *   1. 本地压成 WebP（长边 2048）→ 2. 向服务端要预签名 URL
 *   3. 浏览器 PUT 到 COS → 4. 浏览器 GET 处理接口拿结果 → 5. 删掉临时对象
 * 这样只经过浏览器和腾讯云，绕开了服务器 5Mbps 上行。
 */
const aiUpscale = async (item: StudioResult, magnify: 2 | 4) => {
  if (upscaling.value) return
  const source = item.original || item.url
  if (!source.startsWith('data:')) { studioError.value = '只有本地图片才能超分'; return }
  upscaling.value = magnify
  studioError.value = ''
  let deleteUrl = ''
  try {
    // 直传原图：浏览器 → COS 不受服务器上行带宽和 15 秒抓取限制，保留全部细节。
    // 但腾讯数据万象对「输入」有硬限制：长边 ≤ 1920px（实测 1920 通过、1921 拒绝），
    // 超过就先缩到 1920，否则会报 Input image's width or height exceeded limit。
    const comma = source.indexOf(',')
    const approxBytes = Math.round((source.length - comma - 1) * 3 / 4)
    let ext = (source.slice(5, comma).split('/')[1] || 'png').replace('jpeg', 'jpg')
    const natural = await new Promise<{ w: number; h: number }>(resolve => {
      const probe = new Image()
      probe.onload = () => resolve({ w: probe.naturalWidth, h: probe.naturalHeight })
      probe.onerror = () => resolve({ w: 0, h: 0 })
      probe.src = source
    })
    const longest = Math.max(natural.w, natural.h)
    const shrinking = longest > 1920
    let blob: Blob
    if (shrinking) {
      // 超限：先缩到长边 1920 再送超分（细节由 AI 重绘，不是原图直放大）
      const fitted = await compressImage(source, { maxEdge: 1920, quality: 0.92, mime: 'image/webp' })
      blob = await (await fetch(fitted.url)).blob()
      ext = 'webp'
      store.notify('原图超过超分输入上限', `${natural.w}×${natural.h} → 已缩到 ${fitted.width}×${fitted.height} 再放大`)
    } else if (approxBytes <= 24 * 1024 * 1024) {
      blob = await (await fetch(source)).blob()
    } else {
      const compact = await compressImage(source, { maxEdge: 1920, quality: 0.92, mime: 'image/webp' })
      blob = await (await fetch(compact.url)).blob()
      ext = 'webp'
      store.notify('原图体积过大', '已压缩后上传')
    }
    const ticket = await fetch('/api/cos/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ext }),
    }).then(r => r.json())
    if (!ticket?.ok) { studioError.value = String(ticket?.error || '超分服务不可用'); return }
    deleteUrl = String(ticket.deleteUrl || '')
    const put = await fetch(ticket.putUrl, { method: 'PUT', body: blob })
    if (!put.ok) { studioError.value = `上传失败（${put.status}）`; return }
    upscaling.value = magnify
    const processUrl = magnify === 4 ? ticket.process4x : ticket.process2x
    const result = await fetch(processUrl)
    if (!result.ok) {
      const detail = (await result.text()).replace(/\s+/g, ' ')
      const message = (detail.match(/<Message>([^<]+)<\/Message>/) || [])[1] || `HTTP ${result.status}`
      studioError.value = `超分失败：${message}`
      return
    }
    const out = await result.blob()
    const url = URL.createObjectURL(out)
    results.value.unshift({
      url, original: url, width: 0, height: 0,
      prompt: item.prompt, cropped: false, ratio: item.ratio, auto: false, remote: true, upscaled: magnify,
    })
    store.notify(`已 AI 超分 ${magnify}x`, '结果未写入图库，请直接下载')
  } catch (error) {
    studioError.value = `超分请求失败：${String(error).slice(0, 80)}`
  } finally {
    upscaling.value = 0
    if (deleteUrl) fetch(deleteUrl, { method: 'DELETE' }).catch(() => { /* 清理失败忽略 */ })
  }
}
/** 打开工作台时问一下服务端有没有配超分（腾讯云） */
const probeUpscale = async () => {
  try {
    const res = await fetch('/api/image/models', { cache: 'no-store' }).then(r => r.json())
    upscaleReady.value = Boolean(res?.upscaleReady)
  } catch { upscaleReady.value = false }
}
const syncFormat = () => {
  if (isOfficial.value) form.outputFormat = 'png'
  else if (!vectorReady.value && form.outputFormat !== 'png') form.outputFormat = 'png'
}
const activeRatio = computed(() => {
  if (form.customRatio) {
    const width = Math.min(32, Math.max(1, Math.round(Number(form.customWidth) || 1)))
    const height = Math.min(32, Math.max(1, Math.round(Number(form.customHeight) || 1)))
    return `${width}:${height}`
  }
  return form.ratio
})
const ratioLabel = computed(() => activeRatio.value === 'auto' ? 'AI 自动' : activeRatio.value)
const ratioPreview = computed(() => {
  const [width, height] = activeRatio.value.split(':').map(Number)
  if (!Number.isFinite(width) || !Number.isFinite(height)) return { width: '44px', height: '44px' }
  const scale = Math.max(width, height)
  return { width: `${Math.round((width / scale) * 44)}px`, height: `${Math.round((height / scale) * 44)}px` }
})
const openStudio = () => {
  void probeUpscale()
  studioOpen.value = true
  studioError.value = ''
}
const closeStudio = () => { if (!generating.value) studioOpen.value = false }
// Esc 先关预览，再关工作台
const onPreviewKey = (event: KeyboardEvent) => {
  if (event.key !== 'Escape') return
  if (previewResult.value) { previewResult.value = null; event.stopPropagation() }
}
onMounted(() => window.addEventListener('keydown', onPreviewKey))
onUnmounted(() => window.removeEventListener('keydown', onPreviewKey))
const pickRefImage = () => refInput.value?.click()
const removeRef = (index: number) => { form.refImages.splice(index, 1) }
const onRefFile = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || []).filter(file => file.type.startsWith('image/'))
  input.value = ''
  if (!files.length) return
  studioError.value = ''
  for (const file of files) {
    if (form.refImages.length >= REF_LIMIT) {
      studioError.value = `参考图最多 ${REF_LIMIT} 张，多的已忽略`
      break
    }
    const raw = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('读取文件失败'))
      reader.readAsDataURL(file)
    }).catch(() => '')
    if (!raw) continue
    const compressed = await compressImage(raw, { maxEdge: 1024, quality: 0.9 })
    form.refImages.push(compressed.url)
  }
}
const refinePrompt = async (silent = false) => {
  const source = form.prompt.trim()
  if (!source || refining.value) return ''
  refining.value = true
  studioError.value = ''
  try {
    const res = await fetch('/api/image/refine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: source, styleHint: form.style === 'natural' ? '自然写实' : '鲜明插画' }),
    }).then(r => r.json())
    const text = String(res.prompt || '').trim()
    if (!text) { if (!silent) studioError.value = res.error || '润色失败，稍后再试'; return '' }
    form.prompt = text
    if (!silent) store.notify('提示词已润色', `${text.length} 字，可以直接生成`)
    return text
  } catch {
    if (!silent) studioError.value = '润色请求失败，检查网络后重试'
    return ''
  } finally {
    refining.value = false
  }
}
const generate = async () => {
  const prompt = form.prompt.trim()
  if (!prompt || generating.value) return
  if (mode.value === 'image' && !form.refImages.length) { studioError.value = '图生图需要先上传参考图'; return }
  studioError.value = ''
  generating.value = true
  results.value = []
  try {
    let finalPrompt = prompt
    if (form.autoRefine) finalPrompt = (await refinePrompt(true)) || prompt
    const res = await fetch('/api/image/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: finalPrompt,
        model: form.model,
        resolution: isOfficial.value ? officialSize.value : undefined,
        upscale: !isOfficial.value && ['2k', '4k'].includes(form.upscale) ? form.upscale : undefined,
        outputFormat: form.outputFormat,
        frameCount: form.frameCount,
        frameDurationMs: form.frameDurationMs,
        ratio: activeRatio.value,
        size: activeRatio.value,
        count: form.count,
        quality: form.quality,
        style: form.style,
        background: form.background,
        disableRef: mode.value === 'text',
        refImages: mode.value === 'image' ? form.refImages : undefined,
        mask: form.mask || undefined,
        markup: form.markup || undefined,
      }),
    }).then(r => r.json())
    if (res.error) { studioError.value = String(res.error); return }
    const list: string[] = Array.isArray(res.images) ? res.images : (res.image ? [res.image] : [])
    if (!list.length) { studioError.value = '上游没有返回图片'; return }
    const auto = activeRatio.value === 'auto'
    // 自动模式下，实际比例由服务端请模型挑，回执里的 params.ratio 才是真值
    const chosen = auto ? String(res.params?.ratio || '9:16') : activeRatio.value
    const [ratioWidth, ratioHeight] = chosen.split(':').map(Number)
    if (isOfficial.value) {
      // 官方档出的是原生像素（可达 4K、十几 MB），图库会把它压到 1024 —— 等于白出。
      // 所以高清结果直接展示原图并引导下载，不写入图库。
      for (const raw of list) {
        const size = await new Promise<{ w: number; h: number }>(resolve => {
          const probe = new Image()
          probe.onload = () => resolve({ w: probe.naturalWidth, h: probe.naturalHeight })
          probe.onerror = () => resolve({ w: 0, h: 0 })
          probe.src = raw
        })
        results.value.push({ url: raw, original: raw, width: size.w, height: size.h, prompt: finalPrompt, cropped: false, ratio: chosen, auto, remote: true })
      }
      store.notify('已生成高清图', '原生像素，请直接下载保存（不写入图库）')
      return
    }
    if (res.remote) {
      // 动图 / 矢量图：上游给的是签名外链，体积也大，不写进图库，直接用链接展示和下载
      for (const raw of list) {
        results.value.push({ url: raw, original: raw, width: 0, height: 0, prompt: finalPrompt, cropped: false, ratio: chosen, auto, remote: true })
      }
      store.notify(`已生成 ${form.outputFormat.toUpperCase()}`, '动图 / 矢量图请用「下载」保存，不写入图库')
      return
    }
    for (const raw of list) {
      const saved = await store.saveGeneratedAsset(raw, {
        prompt: finalPrompt,
        keepAlpha: form.background === 'transparent',
        tags: [mode.value === 'image' ? '图生图' : '文生图', ...(auto ? ['AI 定比例'] : [])],
        ratio: { width: ratioWidth, height: ratioHeight },
      })
      results.value.push({
        url: saved.url, original: raw, width: saved.width, height: saved.height,
        prompt: finalPrompt, cropped: saved.cropped, ratio: chosen, auto,
      })
    }
    store.notify('已保存到我的图库', `${list.length} 张 · 可在右侧下载原图`)
  } catch {
    studioError.value = '生成失败，检查网络或稍后再试'
  } finally {
    generating.value = false
  }
}
/**
 * 统一走 blob 下载：先 fetch 成 Blob 再触发 <a download>。
 * 这样远程签名链接、跨域的 COS 地址也能直接存盘，
 * 而不是像 window.open 那样弹一个新标签页（手机端尤其烦）。
 */
const saveAs = async (url: string, baseName: string) => {
  const extOf = (type: string) => {
    if (type.includes('gif')) return 'gif'
    if (type.includes('svg')) return 'svg'
    if (type.includes('webp')) return 'webp'
    if (type.includes('jpeg') || type.includes('jpg')) return 'jpg'
    return 'png'
  }
  let href = url
  let name = `${baseName}.png`
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(String(response.status))
    const blob = await response.blob()
    name = `${baseName}.${extOf(blob.type || '')}`
    href = URL.createObjectURL(blob)
  } catch {
    // 拿不到 Blob（极少见：目标站没开 CORS）就退回原地址 + download 属性
    const guess = url.match(/^data:image\/(\w+)/)
    if (guess) name = `${baseName}.${guess[1] === 'jpeg' ? 'jpg' : guess[1]}`
  }
  const link = document.createElement('a')
  link.href = href
  link.download = name
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  if (href !== url) setTimeout(() => URL.revokeObjectURL(href), 10000)
  return name
}

/** 图片加载完成：去掉骨架屏 */
/**
 * 共享元素过渡：从被点的缩略图位置「长」成详情大图。
 * 浏览器支持 View Transitions 时用它，不支持就退回原来的弹层动画。
 */
const openAsset = async (asset: Asset) => {
  const thumb = document.querySelector<HTMLElement>(`[data-asset-thumb="${asset.id}"] img`)
  const start = (document as unknown as { startViewTransition?: (cb: () => Promise<void> | void) => { finished: Promise<void> } }).startViewTransition
  if (!thumb || !start) { selected.value = asset; return }
  const name = 'asset-hero'
  thumb.style.viewTransitionName = name
  const transition = start.call(document, async () => {
    selected.value = asset
    await nextTick()
    thumb.style.viewTransitionName = ''
    const big = document.querySelector<HTMLElement>('.asset-preview img')
    if (big) big.style.viewTransitionName = name
  })
  await transition.finished.catch(() => {})
  const big = document.querySelector<HTMLElement>('.asset-preview img')
  if (big) big.style.viewTransitionName = ''
}

const markMediaLoaded = (event: Event) => {
  const img = event.target as HTMLImageElement
  img.parentElement?.classList.add('is-loaded')
}
const downloadResult = async (item: StudioResult, index: number) => {
  const name = await saveAs(item.original || item.url, `aniverse-studio-${Date.now()}-${index + 1}`)
  store.notify('已开始下载', name)
}
const download = async (asset: Asset) => {
  const name = await saveAs(asset.image, asset.title)
  store.notify('已开始下载', name)
}
</script>
<template>
  <div class="gallery-page">
    <div class="page-heading"><div><div class="eyebrow">MULTIMODAL ASSETS</div><h1>我的图库 <span class="asset-count">{{ store.assets.length }}</span></h1><p>收藏每一个画面，让角色与故事拥有更丰富的表达。</p></div><div class="heading-actions"><button class="btn btn-soft" @click="fileInput?.click()"><UploadCloud :size="16" />上传图片</button><button class="btn btn-primary" @click="openStudio"><WandSparkles :size="16" />在线生图</button></div></div>
    <input ref="fileInput" type="file" accept="image/*" multiple hidden @change="upload(($event.target as HTMLInputElement).files)" />
    <div class="gallery-top">
      <div class="gallery-search input-wrap"><Search :size="17" /><input v-model="query" class="input" placeholder="搜索画面、标签或一句话描述…" /><span><Sparkles :size="12" />语义检索</span></div>
      <div class="gallery-stat"><Images :size="16" /><span>AI 生图 <strong>{{ assetCount.ai }}</strong></span><i /><span>角色立绘 <strong>{{ assetCount.portrait }}</strong></span><i /><span>剧情场景 <strong>{{ assetCount.scene }}</strong></span><i /><span>收藏 <strong>{{ assetCount.favorite }}</strong></span></div>
    </div>
    <div class="upload-zone" :class="{ dragging }" @dragover.prevent="dragging = true" @dragleave.prevent="dragging = false" @drop.prevent="upload($event.dataTransfer?.files ?? null)" @click="fileInput?.click()"><span><ImagePlus :size="21" /></span><div><strong>拖拽图片到这里，或点击上传</strong><p>支持 JPG、PNG、WebP · 上传的图和 AI 生图都会进这里</p></div><button class="btn btn-secondary">选择文件</button></div>
    <div class="gallery-toolbar"><div class="tabs"><button v-for="f in filters" :key="f" class="tab" :class="{ active: filter === f }" @click="filter = f">{{ f }}</button></div><div class="tag-filter"><Tags :size="14" /><button v-for="tag in allTags" :key="tag" :class="{ active: selectedTag === tag }" @click="selectedTag = selectedTag === tag ? '' : tag">{{ tag }}</button></div></div>
    <div v-if="filtered.length" :key="`${filter}|${selectedTag}|${query}`" class="asset-grid stagger-in">
      <article v-for="(asset, index) in filtered" :key="asset.id" class="asset-card card" :class="{ landscape: asset.image.includes('story-') || asset.image.includes('.svg') }">
        <div class="asset-image media-frame" :data-asset-thumb="asset.id" @click="openAsset(asset)"><img :src="thumbUrl(asset.image)" :alt="asset.title" loading="lazy" decoding="async" @load="markMediaLoaded" :style="{ objectPosition: asset.image.includes('portrait') && index % 2 ? 'center 15%' : 'center 25%' }" /><div class="asset-overlay"><span><Maximize2 :size="17" /></span></div><button class="asset-fav" :class="{ active: asset.favorite }" @click.stop="store.toggleAssetFavorite(asset.id)"><Heart :size="15" :fill="asset.favorite ? 'currentColor' : 'none'" /></button><span class="asset-source">{{ asset.source }}</span></div>
        <div class="asset-info"><h3>{{ asset.title }}</h3><div class="asset-tags"><span v-for="tag in asset.tags.slice(0, 3)" :key="tag"># {{ tag }}</span></div><div class="asset-foot"><span>{{ asset.size }}</span><button @click="selected = asset">详情<ChevronRight :size="12" /></button></div></div>
      </article>
    </div>
    <div v-else class="gallery-empty card"><Images :size="36" /><h3>没有找到相关画面</h3><p>试试其他标签，或上传一张新图片。</p><button class="btn btn-soft" @click="query = ''; selectedTag = ''; filter = '全部资产'">查看全部资产</button></div>

    <Teleport to="body"><Transition name="fade"><div v-if="selected" class="modal-backdrop" @click.self="selected = null"><div class="asset-modal"><button class="asset-close" @click="selected = null"><X :size="20" /></button><div class="asset-preview"><img :src="assetUrl(selected.image)" :alt="selected.title" /></div><div class="asset-detail"><span class="pill pill-purple">{{ selected.source }}</span><h2>{{ selected.title }}</h2><p>这份资产已与角色宇宙建立关联，可用于角色形象、表情绑定与剧情场景。</p><div class="detail-tags"><span v-for="tag in selected.tags" :key="tag"><Check :size="11" />{{ tag }}</span></div><div class="detail-list"><div><span>画面尺寸</span><strong>{{ selected.size }}</strong></div><div><span>资产编号</span><strong>AST-{{ String(selected.id).padStart(4, '0') }}</strong></div><div><span>索引状态</span><strong class="indexed"><Check :size="11" />本地索引完成</strong></div></div><div class="asset-detail-actions"><button class="btn btn-secondary" @click="download(selected)"><Download :size="15" />下载</button><button class="btn btn-primary" @click="findSimilar(selected)"><Sparkles :size="15" />寻找相似画面</button><button class="btn btn-ghost asset-delete" @click="removeSelectedAsset"><Trash2 :size="15" />移除</button></div></div></div></div></Transition></Teleport>

    <Teleport to="body">
      <Transition name="fade">
        <div v-if="studioOpen" class="studio-mask" @click.self="closeStudio">
          <div class="studio" role="dialog" aria-modal="true" aria-label="在线生图">
            <header class="studio-head">
              <div><h2>在线生图</h2><p>文生图 / 图生图 · 参数自己调，出图自动进图库</p></div>
              <button class="studio-close" type="button" aria-label="关闭" @click="closeStudio">×</button>
            </header>
            <div class="studio-body">
              <section class="studio-form">
                <div class="studio-tabs">
                  <button type="button" :class="{ active: mode === 'text' }" @click="mode = 'text'">文生图</button>
                  <button type="button" :class="{ active: mode === 'image' }" @click="mode = 'image'; form.outputFormat === 'svg' && (form.outputFormat = 'png')">图生图</button>
                </div>

                <label class="studio-field">
                  <span>提示词<small>{{ form.prompt.length }}/500</small></span>
                  <textarea v-model="form.prompt" maxlength="500" rows="5" class="textarea" placeholder="写下想要的画面：主体、动作、场景、光线。例如「银发少女站在雨后的天台，逆光，蓝紫色调」" />
                </label>
                <div class="studio-inline">
                  <button class="btn btn-soft" type="button" :disabled="refining || !form.prompt.trim()" @click="refinePrompt()">
                    <Sparkles :size="14" />{{ refining ? '润色中…' : 'AI 润色' }}
                  </button>
                  <label class="studio-check"><input v-model="form.autoRefine" type="checkbox" />生成前自动润色</label>
                </div>

                <div v-if="mode === 'image'" class="studio-field">
                  <span>参考图<small>这张图会作为画面的起点</small></span>
                  <div class="studio-ref-multi" :class="{ multi: form.refImages.length > 1 }">
                    <div v-for="(image, index) in form.refImages" :key="index" class="studio-ref">
                      <img :src="image" alt="参考图" />
                      <span v-if="index === 0 && form.refImages.length > 1" class="studio-ref-tag">主图</span>
                      <button class="studio-ref-clear" type="button" aria-label="移除这张参考图" @click.stop="removeRef(index)">×</button>
                    </div>
                    <div v-if="form.refImages.length < REF_LIMIT" class="studio-ref studio-ref-add" @click="pickRefImage">
                      <div class="studio-ref-empty">
                        <ImagePlus :size="18" />
                        <span>{{ form.refImages.length ? `再加一张（${form.refImages.length}/${REF_LIMIT}）` : `点击上传参考图（最多 ${REF_LIMIT} 张）` }}</span>
                      </div>
                    </div>
                  </div>
                  <input ref="refInput" type="file" accept="image/*" multiple hidden @change="onRefFile" />
                  <div class="studio-inline studio-annotate">
                    <button v-if="!isOfficial" class="btn btn-soft" type="button" :disabled="!primaryRef" @click="openAnnotator()">
                      <WandSparkles :size="13" />局部编辑
                      <small>蒙版 / 标记</small>
                    </button>
                    <span v-if="form.mask" class="studio-chip">蒙版已就绪<button type="button" aria-label="清除蒙版" @click="form.mask = ''">×</button></span>
                    <small v-if="form.mask && form.refImages.length > 1" class="studio-tip">蒙版会同时套用到全部 {{ form.refImages.length }} 张参考图</small>
                    <span v-if="form.markup" class="studio-chip">标记已就绪<button type="button" aria-label="清除标记" @click="form.markup = ''">×</button></span>
                  </div>
                </div>

                <div v-if="!isOfficial" class="studio-field">
                  <span>画面比例<small class="studio-ratio-value">{{ ratioLabel }}</small></span>
                  <div class="studio-ratios">
                    <button type="button" :class="{ active: !form.customRatio && form.ratio === 'auto' }" @click="form.ratio = 'auto'; form.customRatio = false">AI 自动</button>
                    <button v-for="ratio in RATIOS" :key="ratio.value" type="button" :class="{ active: !form.customRatio && form.ratio === ratio.value }" @click="form.ratio = ratio.value; form.customRatio = false">{{ ratio.label }}</button>
                    <button type="button" :class="{ active: form.customRatio }" @click="form.customRatio = true">自定义</button>
                  </div>
                  <div v-if="form.customRatio" class="studio-custom">
                    <div class="studio-custom-frame"><i :style="ratioPreview" /></div>
                    <input v-model.number="form.customWidth" type="number" min="1" max="32" aria-label="宽" />
                    <span>:</span>
                    <input v-model.number="form.customHeight" type="number" min="1" max="32" aria-label="高" />
                    <small>宽 : 高，各 1~32</small>
                  </div>
                </div>

                <div class="studio-field">
                  <span>模型<small>{{ vectorReady ? '该模型支持动图与矢量图' : '仅支持静图' }}</small></span>
                  <select v-model="form.model" class="select" @change="syncFormat">
                    <optgroup v-for="[group, list] in groupedModels" :key="group" :label="group">
                      <option v-for="item in list" :key="item.id" :value="item.id">{{ item.label }}</option>
                    </optgroup>
                  </select>
                  <div v-if="isOfficial" class="studio-res">
                    <div class="studio-grid">
                      <label class="studio-field"><span>比例</span><select v-model="form.officialRatio" class="select"><option v-for="item in OFFICIAL_RATIOS" :key="item.id" :value="item.id">{{ item.label }}</option></select></label>
                      <label class="studio-field"><span>清晰度档位</span><select v-model="form.officialTier" class="select"><option v-for="item in OFFICIAL_TIERS" :key="item.id" :value="item.id">{{ item.label }}</option></select></label>
                    </div>
                    <small>实际输出 {{ officialSize }} · 约 {{ estimatePrice(officialPixels, form.count) }} 元 · 按 token 计费，失败退回预扣</small>
                  </div>
                  <div class="studio-ratios studio-formats">
                    <button type="button" :class="{ active: form.outputFormat === 'png' }" @click="form.outputFormat = 'png'">PNG 静图</button>
                    <template v-if="!isOfficial">
                      <button type="button" :disabled="!vectorReady" :class="{ active: form.outputFormat === 'gif' }" @click="form.outputFormat = 'gif'">GIF 动图</button>
                      <button v-if="mode === 'text'" type="button" :disabled="!vectorReady" :class="{ active: form.outputFormat === 'svg' }" @click="form.outputFormat = 'svg'">SVG 矢量</button>
                    </template>
                  </div>
                  <div v-if="form.outputFormat === 'gif'" class="studio-custom studio-gif">
                    <input v-model.number="form.frameCount" type="number" min="2" max="16" aria-label="帧数" /><span>帧</span>
                    <input v-model.number="form.frameDurationMs" type="number" min="20" max="1000" step="10" aria-label="每帧毫秒" /><span>ms/帧</span>
                    <small>帧数 2~16，间隔 ≥20ms</small>
                  </div>
                  <small v-else-if="mode === 'image' && vectorReady" class="studio-tip">矢量图（SVG）只能文生图；GIF 动图会自动带上参考图</small>
                </div>

                <div class="studio-grid">
                  <label v-if="form.outputFormat !== 'svg'" class="studio-field"><span>张数</span><select v-model.number="form.count" class="select"><option :value="1">1 张</option><option :value="2">2 张</option><option :value="3">3 张</option><option :value="4">4 张</option></select></label>
                  <label v-else class="studio-field"><span>张数</span><div class="studio-fixed">1 张<small>SVG 只能单张</small></div></label>
                  <label class="studio-field"><span>画质</span><select v-model="form.quality" class="select"><option value="high">精致</option><option value="medium">标准</option><option value="low">快速</option></select></label>
                  <label class="studio-field"><span>风格</span><select v-model="form.style" class="select"><option value="vivid">鲜明</option><option value="natural">自然</option></select></label>
                  <label class="studio-field"><span>背景</span><select v-model="form.background" class="select"><option value="opaque">实心</option><option value="transparent">透明</option></select></label>
                  <label v-if="!isOfficial" class="studio-field"><span>放大<small>插值不补细节，AI 超分会重绘细节</small></span><select v-model="form.upscale" class="select">
                      <option value="">原尺寸</option>
                      <option value="2k">2K · 插值放大</option>
                      <option value="4k">4K · 插值放大</option>
                    </select></label>
                </div>

                <button class="btn btn-primary studio-go" type="button" :disabled="generating || !form.prompt.trim()" @click="generate">
                  {{ generating ? '生成中…' : `开始生成${form.count > 1 ? `（${form.count} 张）` : ''}` }}
                </button>
                <p v-if="generating" class="studio-hint">一张大约 20~60 秒，张数越多越久，先别关页面。</p>
                <p v-if="studioError" class="studio-error">{{ studioError }}</p>
              </section>

              <section class="studio-result">
                <div v-if="generating" class="studio-loading"><i class="studio-spinner" /><span>正在绘制…</span></div>
                <div v-else-if="results.length" class="studio-results">
                  <article v-for="(item, index) in results" :key="index" class="studio-result-card">
                    <button class="studio-result-zoom" type="button" title="点击放大查看" :data-result-thumb="index" @click="openPreview(item, index)">
                      <img :src="item.url" :alt="`生成结果 ${index + 1}`" />
                      <span class="studio-zoom-hint"><Maximize2 :size="13" />点击放大</span>
                    </button>
                    <div class="studio-result-meta">
                      <span v-if="item.upscaled">已放大 {{ item.upscaled }}x · 点下载保存</span><span v-else-if="item.remote">{{ item.width }} × {{ item.height }} · {{ form.outputFormat.toUpperCase() }} · 点下载保存</span><span v-else>{{ item.width }} × {{ item.height }} · {{ Math.round(item.url.length / 1024) }} KB<template v-if="item.cropped"> · 已按 {{ item.ratio }} 裁切</template><template v-else-if="item.auto"> · AI 选了 {{ item.ratio }}</template></span>
                      <div>
                        <button type="button" @click="downloadResult(item, index)"><Download :size="13" />下载原图</button>
                        <template v-if="upscaleReady && (item.original || '').startsWith('data:')">
                          <button type="button" :disabled="Boolean(upscaling)" @click="aiUpscale(item, 2)">
                            <ImageUp :size="13" />{{ upscaling === 2 ? '超分中…' : 'AI 超分 2x' }}
                          </button>
                          <button type="button" :disabled="Boolean(upscaling)" @click="aiUpscale(item, 4)">
                            <ImageUp :size="13" />{{ upscaling === 4 ? '超分中…' : 'AI 超分 4x' }}
                          </button>
                        </template>
                        <button type="button" :disabled="generating" @click="generate"><RefreshCcw :size="13" />再来一张</button>
                      </div>
                    </div>
                  </article>
                </div>
                <div v-else class="studio-empty">
                  <WandSparkles :size="26" />
                  <h3>还没有生成结果</h3>
                  <p>写一句画面想法，或者先点「AI 润色」把大白话扩写成可用的提示词。</p>
                </div>
              </section>
            </div>
          </div>
          <Teleport to="body">
            <Transition name="fade">
              <div v-if="previewResult" class="preview-backdrop" @click.self="previewResult = null">
                <button type="button" class="preview-close" aria-label="关闭" @click="previewResult = null"><X :size="20" /></button>
                <figure class="preview-figure">
                  <img :src="previewResult.url" alt="生成结果预览" />
                  <figcaption>
                    <span>{{ previewResult.prompt?.slice(0, 60) }}<template v-if="(previewResult.prompt || '').length > 60">…</template></span>
                    <button type="button" @click="downloadResult(previewResult, 0)"><Download :size="13" />下载原图</button>
                  </figcaption>
                </figure>
              </div>
            </Transition>
          </Teleport>
        </div>
      </Transition>
    </Teleport>
  </div>
  <ImageAnnotator
    :open="annotatorOpen"
    :image="primaryRef"
    :mode="annotatorMode"
    @close="annotatorOpen = false"
    @apply="applyAnnotation"
  />
</template>
<style scoped>
.asset-count{display:inline-grid;place-items:center;width:25px;height:25px;margin-left:5px;border-radius:8px;background:#eae6f7;color:#8774d1;font-size:11px;vertical-align:3px}.gallery-top{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:15px}.gallery-search{width:min(480px,50%)}.gallery-search .input{padding-right:95px;background:white}.gallery-search>span{position:absolute;right:12px;top:50%;transform:translateY(-50%);display:flex;align-items:center;gap:4px;color:#9a87d7;font-size:8px}.gallery-stat{display:flex;align-items:center;gap:12px;color:#9a94a3;font-size:9px}.gallery-stat>svg{color:#9380d4}.gallery-stat span{white-space:nowrap}.gallery-stat strong{color:#6f667a}.gallery-stat i{width:1px;height:12px;background:#ddd8e4}.upload-zone{display:flex;align-items:center;gap:13px;padding:15px 18px;border:1px dashed #d8d1e8;border-radius:16px;background:rgba(255,255,255,.45);cursor:pointer;transition:all .2s}.upload-zone:hover,.upload-zone.dragging{border-color:#9c87df;background:#f2eefc}.upload-zone>span{width:37px;height:37px;display:grid;place-items:center;border-radius:11px;background:#ece8f8;color:#8d79d5}.upload-zone strong{display:block;color:#7c7287;font-size:10px}.upload-zone p{margin-top:4px;color:#b0a8b6;font-size:8px}.upload-zone .btn{margin-left:auto;min-height:34px;font-size:9px}.gallery-toolbar{display:flex;align-items:center;justify-content:space-between;gap:15px;margin:22px 0 17px}.tag-filter{display:flex;align-items:center;gap:6px;color:#aaa3b0}.tag-filter button{padding:4px 7px;border:0;border-radius:6px;background:transparent;color:#aaa3b0;font-size:8px}.tag-filter button.active{background:#ebe6f8;color:#806ccd}.asset-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:17px}.asset-card{overflow:hidden;transition:all .25s}.asset-card:hover{transform:translateY(-4px);box-shadow:0 18px 40px rgba(45,35,75,.1)}.asset-image{position:relative;height:265px;overflow:hidden;cursor:zoom-in;background:#eee}.asset-card.landscape .asset-image{height:190px}.asset-image>img{width:100%;height:100%;object-fit:cover;transition:transform .5s}.asset-card:hover .asset-image>img{transform:scale(1.04)}.asset-overlay{position:absolute;inset:0;display:grid;place-items:center;background:rgba(40,30,60,.25);opacity:0;transition:opacity .2s}.asset-overlay span{width:42px;height:42px;display:grid;place-items:center;border-radius:50%;background:rgba(255,255,255,.8);color:#70627f;transform:scale(.8);transition:transform .2s}.asset-card:hover .asset-overlay{opacity:1}.asset-card:hover .asset-overlay span{transform:scale(1)}.asset-fav{position:absolute;right:11px;top:11px;width:30px;height:30px;display:grid;place-items:center;border:0;border-radius:50%;background:rgba(255,255,255,.82);color:#766c80;backdrop-filter:blur(8px)}.asset-fav.active{color:#de7e94}.asset-source{position:absolute;left:11px;bottom:10px;padding:4px 7px;border-radius:6px;background:rgba(35,28,50,.42);backdrop-filter:blur(6px);color:white;font-size:7px}.asset-info{padding:14px 15px}.asset-info h3{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.asset-tags{display:flex;gap:6px;margin-top:8px;color:#9d92aa;font-size:8px}.asset-foot{display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding-top:10px;border-top:1px solid #f0edf3;color:#b2abb7;font-size:7px}.asset-foot button{display:flex;align-items:center;border:0;background:none;color:#9a87d0;font-size:8px}.gallery-empty{padding:70px;text-align:center;color:#a99dc0}.gallery-empty svg{margin:0 auto 14px}.gallery-empty h3{color:#675e72;font-size:15px}.gallery-empty p{margin:7px 0 16px;color:#aaa2b0;font-size:10px}.asset-modal{position:relative;width:min(850px,100%);max-height:90vh;display:grid;grid-template-columns:1.3fr 1fr;overflow:hidden;border-radius:24px;background:white;box-shadow:0 30px 80px rgba(30,25,50,.25)}.asset-close{position:absolute;right:13px;top:13px;z-index:2;width:34px;height:34px;display:grid;place-items:center;border:0;border-radius:50%;background:rgba(255,255,255,.85);color:#756c7f}.asset-preview{min-height:450px;background:#f0edf4}.asset-preview img{width:100%;height:100%;max-height:75vh;object-fit:cover}.asset-detail{padding:38px 28px 28px}.asset-detail h2{margin-top:14px;font-size:21px}.asset-detail>p{margin-top:12px;color:#958d9d;font-size:10px;line-height:1.8}.detail-tags{display:flex;flex-wrap:wrap;gap:7px;margin-top:18px}.detail-tags span{display:flex;align-items:center;gap:4px;padding:5px 8px;border-radius:7px;background:#f0ecf9;color:#8875c9;font-size:8px}.detail-list{margin-top:22px}.detail-list>div{display:flex;justify-content:space-between;padding:11px 0;border-bottom:1px solid #efecf2;font-size:9px}.detail-list span{color:#aaa2b0}.detail-list strong{color:#746b7e}.detail-list .indexed{display:flex;align-items:center;gap:4px;color:#67a48e}.asset-detail-actions{display:flex;gap:9px;margin-top:25px}.asset-detail-actions .btn{flex:1;padding:0 10px;font-size:10px}
@media(max-width:1300px){.asset-grid{grid-template-columns:repeat(3,1fr)}}@media(max-width:1000px){.gallery-toolbar{align-items:flex-start;flex-direction:column}.gallery-stat{display:none}.gallery-search{width:100%}.asset-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:600px){.upload-zone .btn{display:none}.upload-zone{padding:13px}.asset-grid{grid-template-columns:1fr}.asset-image,.asset-card.landscape .asset-image{height:330px}.gallery-toolbar .tabs{width:100%}.gallery-toolbar .tab{flex:1;padding:8px 6px;white-space:nowrap}.tag-filter{max-width:100%;overflow-x:auto}.asset-modal{grid-template-columns:1fr;overflow-y:auto}.asset-preview{min-height:280px;height:38vh}.asset-detail{padding:24px}.asset-detail h2{font-size:18px}}

/* V3: 标签筛选按钮原本是 8px 字 / 30×18 的可点区，既难点也难读 */
.tag-filter button { font-size: 10px; padding: 6px 9px; color: #6e6a7e; }
.tag-filter button.active { background: #ebe6f8; color: #6650bd; }

/* ---------- 页头两个按钮 ---------- */
.heading-actions { display: flex; align-items: center; gap: 9px; }
.asset-delete { color: #b4777a; }
.asset-delete:hover { background: #fdf0f0; color: #c2535a; }

/* ---------- 在线生图工作台 ---------- */
.studio-mask { position: fixed; inset: 0; z-index: 97; display: grid; place-items: center; padding: 24px; background: rgba(20,16,32,.5); backdrop-filter: blur(4px); }
.studio { animation: sheetIn var(--dur-3) var(--ease-spring) both; width: min(1000px,100%); max-height: 92vh; display: flex; flex-direction: column; overflow: hidden; border-radius: 22px; background: #fff; box-shadow: 0 40px 100px rgba(30,22,50,.35); }
.studio-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 20px 24px 14px; border-bottom: 1px solid #f0edf4; }
.studio-head h2 { font-size: 17px; color: #3a3149; }
.studio-head p { margin-top: 5px; color: #a49bb8; font-size: 10px; }
.studio-close { width: 30px; height: 30px; border: 0; border-radius: 9px; background: #f4f1f9; color: #7a7189; font-size: 18px; line-height: 1; cursor: pointer; }
.studio-close:hover { background: #ece7f7; color: #63558f; }
.studio-body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); }
.studio-form { display: flex; flex-direction: column; gap: 13px; padding: 18px 22px 22px; overflow-y: auto; border-right: 1px solid #f3f0f8; }
.studio-result { display: flex; flex-direction: column; padding: 18px 22px 22px; overflow-y: auto; background: #fbfafd; }
.studio-tabs { display: flex; gap: 4px; padding: 3px; border: 1px solid #e9e4f2; border-radius: 11px; background: #f7f5fb; }
.studio-tabs button { flex: 1; min-height: 32px; border: 0; border-radius: 8px; background: transparent; color: #8a8298; font-size: 12px; font-weight: 600; cursor: pointer; transition: all .18s; }
.studio-tabs button.active { background: #fff; color: #6a55c8; box-shadow: 0 3px 10px rgba(70,50,120,.09); }
.studio-field { display: flex; flex-direction: column; gap: 6px; }
.studio-field > span { display: flex; align-items: center; justify-content: space-between; color: #6b6379; font-size: 11px; font-weight: 600; }
.studio-field > span small { color: #b0a8bd; font-size: 9px; font-weight: 400; }
.studio-field .textarea { font-size: 11px; line-height: 1.8; resize: vertical; }
.studio-field .select { font-size: 11px; }
.studio-inline { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.studio-inline .btn { min-height: 32px; font-size: 11px; }
.studio-check { display: inline-flex; align-items: center; gap: 6px; color: #8a8298; font-size: 10px; cursor: pointer; }
.studio-check input { width: 13px; height: 13px; accent-color: #7b66c8; }
.studio-ref-multi { display: grid; gap: 8px; grid-template-columns: 1fr; }
.studio-ref-multi.multi { grid-template-columns: repeat(2, 1fr); }
.studio-ref-multi.multi .studio-ref { height: 146px; }
.studio-ref-tag { position: absolute; left: 6px; top: 6px; padding: 1px 6px; border-radius: 6px; background: rgba(30, 22, 50, .62); color: #fff; font-size: 9px; }
.studio-ref-add { cursor: pointer; }
.studio-ref { position: relative; display: grid; place-items: center; height: 224px; border: 1px dashed #ddd6ea; border-radius: 12px; background: #faf8fd; cursor: pointer; overflow: hidden; }
.studio-ref:hover { border-color: #b7a6e6; background: #f5f1fd; }
.studio-ref img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; display: block; padding: 6px; }
.studio-ref-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; color: #a79fb8; font-size: 10px; }
.studio-ref-clear { position: absolute; top: 6px; right: 6px; width: 20px; height: 20px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 50%; background: rgba(30,22,50,.62); color: #fff; font-size: 12px; line-height: 1; cursor: pointer; }
.studio-ratios { display: flex; flex-wrap: wrap; gap: 6px; }
.studio-ratios button { padding: 6px 9px; border: 1px solid #e7e2f1; border-radius: 8px; background: #fff; color: #7d7690; font-size: 10px; cursor: pointer; transition: all .16s; }
.studio-ratios button:hover { border-color: #c9bcf0; color: #6a55c8; }
.studio-ratios button.active { border-color: #8f7ae4; background: #f1ecfd; color: #6045c4; font-weight: 600; }
.studio-custom { display: flex; align-items: center; gap: 7px; margin-top: 6px; }
.studio-custom input { width: 56px; padding: 6px 8px; border: 1px solid #e2dcf1; border-radius: 8px; font-size: 11px; color: #5f5873; font-family: inherit; }
.studio-custom span { color: #a49bb8; font-size: 12px; }
.studio-custom small { color: #b0a8bd; font-size: 9px; }
.studio-custom-frame { width: 46px; height: 46px; display: grid; place-items: center; border: 1px dashed #d7cdea; border-radius: 8px; background: #faf8fd; }
.studio-custom-frame i { display: block; border-radius: 3px; background: linear-gradient(135deg,#a893ef,#7b66c8); }
.studio-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.studio-formats button:disabled { opacity: .4; cursor: not-allowed; }
.studio-gif { align-items: center; gap: 6px; font-size: 11px; color: #6b6379; }
.studio-gif input { width: 56px; font-size: 11px; }
.studio-gif span { font-size: 10px; color: #8d84a0; }
.studio-gif small { font-size: 9px; color: #b0a8bd; }
.studio-tip { display: block; margin-top: 6px; color: #a79fb8; font-size: 10px; }
.studio-res { margin-top: 8px; display: flex; flex-direction: column; gap: 5px; }
.studio-res small { color: #a79fb8; font-size: 9px; }
.studio-fixed { display: flex; align-items: center; gap: 6px; height: 34px; padding: 0 10px; border: 1px dashed #e2dcf1; border-radius: 9px; color: #6b6379; font-size: 11px; }
.studio-fixed small { color: #b0a8bd; font-size: 9px; }
.studio-annotate { flex-wrap: wrap; }
.studio-chip { display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 4px 0 9px; border-radius: 8px; background: #f1ecfb; color: #6a55c8; font-size: 10px; }
.studio-chip button { width: 18px; height: 18px; border: 0; border-radius: 6px; background: transparent; color: #8b7cc0; cursor: pointer; }
.studio-go { margin-top: 4px; min-height: 40px; font-size: 12px; }
.studio-hint { margin: -4px 0 0; color: #a49bb8; font-size: 10px; }
.studio-error { margin: -4px 0 0; padding: 8px 10px; border-radius: 9px; background: #fdf1f1; color: #c05c5c; font-size: 10px; line-height: 1.6; }
.studio-loading { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: #8a7fb0; font-size: 11px; }
.studio-spinner { width: 26px; height: 26px; border: 2px solid #ded7f2; border-top-color: #7b66c8; border-radius: 50%; animation: studioSpin .9s linear infinite; }
@keyframes studioSpin { to { transform: rotate(360deg); } }
.studio-results { display: flex; flex-direction: column; gap: 12px; }
.studio-result-card { overflow: hidden; border: 1px solid #ece7f4; border-radius: 14px; background: #fff; box-shadow: 0 8px 24px rgba(50,38,80,.05); }
.studio-result-zoom { position: relative; display: block; width: 100%; padding: 0; border: 0; background: transparent; cursor: zoom-in; }
.studio-zoom-hint { position: absolute; right: 8px; bottom: 8px; display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 999px; background: rgba(28, 22, 44, .66); color: #fff; font-size: 10px; opacity: 0; transition: opacity .16s; }
.studio-result-zoom:hover .studio-zoom-hint { opacity: 1; }
.preview-backdrop { position: fixed; inset: 0; z-index: 260; display: grid; place-items: center; padding: 28px; background: rgba(18, 14, 30, .88); backdrop-filter: blur(6px); }
.preview-figure { display: flex; flex-direction: column; gap: 10px; margin: 0; max-width: min(96vw, 1600px); max-height: 94vh; }
.preview-figure img { max-width: 100%; max-height: 82vh; object-fit: contain; border-radius: 10px; background: repeating-conic-gradient(#2a2438 0% 25%, #332c44 0% 50%) 50% / 18px 18px; }
.preview-figure figcaption { display: flex; align-items: center; justify-content: space-between; gap: 14px; color: #ded7ee; font-size: 12px; }
.preview-figure figcaption button { display: inline-flex; align-items: center; gap: 5px; padding: 6px 12px; border: 1px solid rgba(255,255,255,.22); border-radius: 999px; background: rgba(255,255,255,.1); color: #fff; font-size: 11px; cursor: pointer; }
.preview-figure figcaption button:hover { background: rgba(255,255,255,.2); }
.preview-close { position: absolute; top: 18px; right: 20px; display: grid; place-items: center; width: 36px; height: 36px; border: 0; border-radius: 50%; background: rgba(255,255,255,.12); color: #fff; cursor: pointer; }
.preview-close:hover { background: rgba(255,255,255,.24); }
.studio-result-card img { display: block; width: 100%; max-height: 420px; object-fit: contain; background: repeating-conic-gradient(#f4f1f9 0% 25%, #fff 0% 50%) 50% / 16px 16px; }
.studio-result-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 9px 11px; border-top: 1px solid #f2eef8; color: #a49bb8; font-size: 9px; }
.studio-result-meta > div { display: flex; gap: 6px; }
.studio-result-meta button { display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; border: 1px solid #e5dff2; border-radius: 7px; background: #fff; color: #7566a8; font-size: 9px; cursor: pointer; }
.studio-result-meta button:hover { background: #f4f0fd; color: #5c45b5; }
.studio-result-meta button:disabled { opacity: .5; cursor: default; }
.studio-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; text-align: center; color: #a49bb8; }
.studio-empty h3 { color: #6b6279; font-size: 13px; }
.studio-empty p { max-width: 240px; font-size: 10px; line-height: 1.8; }
.studio-empty svg { color: #b7a6e6; }
@media(max-width:900px) {
  .studio-mask { padding: 0; }
  .studio { width: 100%; max-height: 100vh; height: 100%; border-radius: 0; }
  .studio-body { grid-template-columns: 1fr; overflow-y: auto; }
  .studio-form { border-right: 0; border-bottom: 1px solid #f3f0f8; overflow: visible; }
  .studio-result { min-height: 320px; }
}
</style>
