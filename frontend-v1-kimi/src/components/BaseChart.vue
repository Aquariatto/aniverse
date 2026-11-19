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
let chart: ECharts | undefined
let observer: ResizeObserver | undefined
onMounted(() => {
  if (!el.value) return
  chart = init(el.value)
  chart.setOption(props.option)
  observer = new ResizeObserver(() => chart?.resize())
  observer.observe(el.value)
})
watch(() => props.option, value => chart?.setOption(value, true), { deep: true })
onBeforeUnmount(() => { observer?.disconnect(); chart?.dispose() })
</script>
<template><div ref="el" :style="{ width: '100%', height }" /></template>
