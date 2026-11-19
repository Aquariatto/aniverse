<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { init, use } from 'echarts/core'
import type { ECharts } from 'echarts/core'
import type { EChartsOption } from 'echarts'
import { LineChart, PieChart, SankeyChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

use([LineChart, PieChart, SankeyChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])
const props = withDefaults(defineProps<{ option: EChartsOption; height?: string }>(), { height: '280px' })
const el = ref<HTMLDivElement>()
/** 首次渲染完成前显示骨架屏 */
const ready = ref(false)
let chart: ECharts | undefined
let observer: ResizeObserver | undefined
onMounted(() => {
  if (!el.value) return
  chart = init(el.value)
  // 入场时让曲线自己长出来，比"啪"地出现舒服
  chart.setOption({
    animation: true,
    animationDuration: 900,
    animationEasing: 'cubicOut',
    animationDurationUpdate: 480,
    animationEasingUpdate: 'cubicOut',
    ...props.option,
  })
  observer = new ResizeObserver(() => chart?.resize())
  observer.observe(el.value)
  requestAnimationFrame(() => { ready.value = true })
})
watch(() => props.option, value => chart?.setOption(value, true), { deep: true })
onBeforeUnmount(() => { observer?.disconnect(); chart?.dispose() })
</script>
<template>
  <div class="chart-wrap">
    <div ref="el" class="chart-canvas" :style="{ width: '100%', height }" />
    <div class="chart-skeleton" :class="{ 'is-gone': ready }" :style="{ height }" />
  </div>
</template>
<style scoped>
.chart-canvas { animation: popIn var(--dur-4) var(--ease-soft) both; }
</style>
