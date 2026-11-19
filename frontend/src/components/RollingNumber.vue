<script setup lang="ts">
/**
 * 滚动数字（技法来源：RhineLabUI / rolling-clock.ts）
 *
 * 三条关键行为：
 * 1. 单一曲线：所有位数共用一条 460ms 的曲线，不做逐位错峰，避免"排队的数字"。
 * 2. 中途接续：值在动画途中再次变化时，从**当前正在显示的数值**继续，不倒回、不排队。
 * 3. 入场触发：首次进入视口才开始滚，而不是在挂载时滚完再被看见。
 *
 * 数字实现是机械里程表模型：低位从 9 滚到 0 时，高位才跟着进位半格。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  value: number
  /** 最小位数，补零用；0 表示不补 */
  pad?: number
  /** 单程时长（毫秒） */
  duration?: number
  /** 进入视口后的启动延迟，用于同组数字错开 */
  delay?: number
}>(), { pad: 2, duration: 460, delay: 0 })

const root = ref<HTMLElement>()
/** 当前"显示中"的数值，可以是小数，用来驱动位数条 */
const shown = ref(0)
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

let raf = 0
let armed = false
let observer: IntersectionObserver | undefined

const columns = computed(() => {
  const peak = Math.max(props.value, Math.ceil(shown.value))
  return Math.max(props.pad, String(Math.max(0, Math.round(peak))).length, 1)
})

const places = computed(() => Array.from({ length: columns.value }, (_, index) => 10 ** (columns.value - 1 - index)))

/**
 * 机械里程表位置：
 * 整数部分给出当前位，小数进位只在低位越过 9 时发生（所以静止时永远落在整数格上）。
 */
const positionOf = (value: number, place: number) => {
  if (value <= 0) return 0
  const whole = Math.floor(value / place) % 10
  const carry = place === 1 ? 0 : Math.min(1, Math.max(0, (value % place) - (place - 1)))
  return whole + carry
}

const styleOf = (value: number, place: number) => ({ '--roll': positionOf(value, place).toFixed(3) })

const label = computed(() => String(Math.max(0, Math.round(props.value))).padStart(props.pad, '0'))

const easeOutQuint = (t: number) => 1 - (1 - t) ** 5

const animateTo = (target: number, immediate = false) => {
  cancelAnimationFrame(raf)
  if (reduced || immediate) {
    shown.value = target
    return
  }
  const from = shown.value
  const delta = target - from
  if (Math.abs(delta) < 0.0001) {
    shown.value = target
    return
  }
  const start = performance.now() + props.delay
  const step = (now: number) => {
    const progress = Math.min(1, Math.max(0, (now - start) / props.duration))
    shown.value = from + delta * easeOutQuint(progress)
    if (progress < 1) raf = requestAnimationFrame(step)
    else shown.value = target
  }
  raf = requestAnimationFrame(step)
}

watch(() => props.value, (next, previous) => {
  if (!armed) {
    shown.value = next
    return
  }
  // 中途反向/继续加：从当前显示值接上，不倒回
  animateTo(next, previous === undefined)
})

onMounted(() => {
  if (reduced) {
    armed = true
    shown.value = props.value
    return
  }
  if (!root.value) return
  observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting || armed) return
      armed = true
      observer?.disconnect()
      observer = undefined
      animateTo(props.value)
    })
  }, { threshold: 0.35 })
  observer.observe(root.value)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  observer?.disconnect()
})
</script>

<template>
  <span ref="root" class="roll">
    <span class="roll-visual" aria-hidden="true">
      <span v-for="place in places" :key="place" class="roll-col">
        <span class="roll-strip" :style="styleOf(shown, place)">
          <span v-for="cell in 11" :key="cell" class="roll-cell">{{ (cell - 1) % 10 }}</span>
        </span>
      </span>
    </span>
    <span class="roll-sr">{{ label }}</span>
  </span>
</template>

<style scoped>
.roll {
  display: inline-flex;
  align-items: center;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
  line-height: 1;
}
.roll-visual { display: inline-flex; align-items: center; }
/* 宿主页面的 `.hero-metrics span` 加了 scoped 属性后特异性是 (0,2,1)，
   会压住本组件的 (0,2,0)，把字号/颜色一起改掉。重复一次类名抬到 (0,3,0) 才稳。 */
.roll.roll,
.roll-visual.roll-visual,
.roll-col.roll-col,
.roll-cell.roll-cell { font-size: inherit; color: inherit; line-height: 1; }
.roll-col {
  position: relative;
  display: block;
  width: 1ch;
  height: 1em;
  overflow: hidden;
}
.roll-strip {
  position: absolute;
  inset: 0 0 auto;
  display: flex;
  flex-direction: column;
  transform: translate3d(0, calc(var(--roll, 0) * -1em), 0);
  will-change: transform;
}
.roll-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 1em;
}
/* 视觉上是滚动数字，读屏读真实值 */
.roll-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
