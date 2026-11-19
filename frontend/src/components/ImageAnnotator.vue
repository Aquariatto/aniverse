<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { Check, Eraser, X } from 'lucide-vue-next'

/**
 * 画布标注弹窗。
 *   mode = 'mask'   局部重绘蒙版：白底 + 涂抹处挖成透明（上游要求 RGBA 且有透明像素）
 *   mode = 'markup' 标记图层：透明底 + 红色笔迹（叠加在参考图上交给模型）
 * 导出一律是 PNG data URL，尺寸与参考图一致。
 */
const props = defineProps<{ open: boolean; image: string; mode: 'mask' | 'markup'; title?: string }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'apply', value: string, mode: 'mask' | 'markup'): void }>()

const canvasRef = ref<HTMLCanvasElement>()
// 两种模式合并在一个弹窗里，用顶部选项切换
const activeMode = ref<'mask' | 'markup'>(props.mode)
const switchMode = async (mode: 'mask' | 'markup') => {
  if (activeMode.value === mode) return
  activeMode.value = mode
  await nextTick()
  await reset()
}
const overlayRef = ref<HTMLCanvasElement>()
let overlayCtx: CanvasRenderingContext2D | null = null
const brush = ref(20)
const painted = ref(false)
let ctx: CanvasRenderingContext2D | null = null
let drawing = false

const reset = async () => {
  const canvas = canvasRef.value
  if (!canvas || !props.image) return
  const image = new Image()
  image.src = props.image
  await image.decode().catch(() => { /* 解码失败就按原尺寸画 */ })
  const longest = Math.max(image.naturalWidth || 1024, image.naturalHeight || 1024)
  const scale = Math.min(1, 1024 / longest)
  canvas.width = Math.max(64, Math.round((image.naturalWidth || 1024) * scale))
  canvas.height = Math.max(64, Math.round((image.naturalHeight || 1024) * scale))
  ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const overlay = overlayRef.value
  if (overlay) {
    overlay.width = canvas.width
    overlay.height = canvas.height
    overlayCtx = overlay.getContext('2d')
    overlayCtx?.clearRect(0, 0, overlay.width, overlay.height)
  }
  if (activeMode.value === 'mask') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  painted.value = false
}

watch(() => props.open, async open => {
  if (!open) return
  activeMode.value = props.mode
  await nextTick()
  await reset()
})

const point = (event: PointerEvent) => {
  const canvas = canvasRef.value
  if (!canvas) return { x: 0, y: 0 }
  const rect = canvas.getBoundingClientRect()
  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height),
  }
}

const drawTo = (x: number, y: number) => {
  if (!ctx) return
  ctx.lineWidth = brush.value
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (activeMode.value === 'mask') {
    ctx.globalCompositeOperation = 'destination-out'
    ctx.strokeStyle = 'rgba(0, 0, 0, 1)'
  } else {
    ctx.globalCompositeOperation = 'source-over'
    ctx.strokeStyle = 'rgba(255, 66, 66, .85)'
  }
  ctx.lineTo(x, y)
  ctx.stroke()
  // 蒙版模式下白色盖住了参考图，再叠一层红色笔迹做视觉反馈（不参与导出）
  if (activeMode.value === 'mask' && overlayCtx) {
    overlayCtx.globalCompositeOperation = 'source-over'
    overlayCtx.strokeStyle = 'rgba(255, 66, 66, .42)'
    overlayCtx.lineWidth = brush.value
    overlayCtx.lineCap = 'round'
    overlayCtx.lineJoin = 'round'
    overlayCtx.lineTo(x, y)
    overlayCtx.stroke()
  }
  painted.value = true
}

const down = (event: PointerEvent) => {
  if (!ctx) return
  drawing = true
  try { (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId) } catch { /* ignore */ }
  const { x, y } = point(event)
  ctx.beginPath()
  ctx.moveTo(x, y)
  drawTo(x, y)
}
const move = (event: PointerEvent) => {
  if (!drawing) return
  const { x, y } = point(event)
  drawTo(x, y)
}
const up = () => { drawing = false }

const apply = () => {
  const canvas = canvasRef.value
  if (!canvas) return
  if (activeMode.value === 'mask' && !painted.value) return
  emit('apply', canvas.toDataURL('image/png'), activeMode.value)
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="annotate-backdrop" @click.self="emit('close')">
        <section class="annotate">
          <header class="annotate-head">
            <div>
              <strong>{{ activeMode === 'mask' ? '涂抹要重绘的区域' : '在图上做标记' }}</strong>
              <small>{{ activeMode === 'mask' ? '涂抹处重新生成，其余保持原样（像素级保留）' : '圈出要改的地方，模型按标记理解意图' }}</small>
            </div>
            <div class="annotate-modes">
              <button type="button" :class="{ active: activeMode === 'mask' }" @click="switchMode('mask')">蒙版重绘</button>
              <button type="button" :class="{ active: activeMode === 'markup' }" @click="switchMode('markup')">标记编辑</button>
            </div>
            <button type="button" class="annotate-x" aria-label="关闭" @click="emit('close')"><X :size="16" /></button>
          </header>

          <div class="annotate-stage" :class="mode">
            <img v-if="image" :src="image" alt="" class="annotate-bg" />
            <canvas
              ref="canvasRef"
              class="annotate-canvas"
              @pointerdown="down"
              @pointermove="move"
              @pointerup="up"
              @pointercancel="up"
            />
            <canvas ref="overlayRef" class="annotate-overlay" :class="{ on: activeMode === 'mask' }" />
          </div>

          <footer class="annotate-foot">
            <label class="annotate-brush">
              笔刷
              <input v-model.number="brush" type="range" min="6" max="64" step="2" />
              <span>{{ brush }}px</span>
            </label>
            <div class="annotate-actions">
              <button type="button" class="annotate-btn" @click="reset"><Eraser :size="13" />重画</button>
              <button type="button" class="annotate-btn annotate-ok" :disabled="activeMode === 'mask' && !painted" @click="apply">
                <Check :size="13" />{{ activeMode === 'mask' ? '确认蒙版' : '确认标记' }}
              </button>
            </div>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.annotate-backdrop { position: fixed; inset: 0; z-index: 120; display: grid; place-items: center; padding: 20px; background: rgba(18, 14, 30, .62); backdrop-filter: blur(6px); }
.annotate { width: min(760px, 94vw); max-height: 92vh; display: flex; flex-direction: column; border-radius: 18px; background: #fff; box-shadow: 0 30px 70px rgba(20, 12, 40, .35); overflow: hidden; }
.annotate-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 16px 18px 12px; border-bottom: 1px solid #f1edf8; }
.annotate-modes { display: flex; gap: 4px; padding: 3px; border-radius: 10px; background: #f4f0fb; }
.annotate-modes button { height: 26px; padding: 0 12px; border: 0; border-radius: 8px; background: transparent; color: #7d739a; font-size: 11px; cursor: pointer; font-family: inherit; }
.annotate-modes button.active { background: #fff; color: #5a49b0; box-shadow: 0 2px 8px rgba(70, 50, 120, .12); }
.annotate-head strong { display: block; font-size: 13px; color: #3d354e; }
.annotate-head small { display: block; margin-top: 3px; color: #9a92ad; font-size: 10px; }
.annotate-x { width: 26px; height: 26px; display: grid; place-items: center; border: 0; border-radius: 8px; background: #f5f1fb; color: #8c80a5; cursor: pointer; }
.annotate-stage { position: relative; margin: 14px 18px; border-radius: 12px; overflow: hidden; background: #f3f0f9; display: grid; place-items: center; }
.annotate-bg { display: block; max-width: 100%; max-height: 62vh; object-fit: contain; }
.annotate-canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; cursor: crosshair; }
.annotate-stage.mask .annotate-canvas { opacity: .5; }
.annotate-overlay { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; display: none; }
.annotate-overlay.on { display: block; }
.annotate-foot { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 0 18px 16px; flex-wrap: wrap; }
.annotate-brush { display: flex; align-items: center; gap: 8px; color: #7d7390; font-size: 10px; }
.annotate-brush input { width: 120px; accent-color: #7a63cf; }
.annotate-actions { display: flex; gap: 8px; }
.annotate-btn { display: inline-flex; align-items: center; gap: 5px; height: 32px; padding: 0 14px; border: 1px solid #e8e2f3; border-radius: 10px; background: #fff; color: #6f6584; font-size: 11px; cursor: pointer; font-family: inherit; }
.annotate-btn:hover { border-color: #d2c6ee; color: #5a49b0; }
.annotate-ok { border: 0; background: linear-gradient(135deg, #8f7ae4, #6a55c8); color: #fff; }
.annotate-ok:disabled { opacity: .45; cursor: not-allowed; }
.fade-enter-active, .fade-leave-active { transition: opacity .18s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
