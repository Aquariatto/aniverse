<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{ value: number; size?: number; stroke?: number; color?: string }>(), { size: 52, stroke: 4, color: '#8b76e8' })
const radius = 22
const circumference = 2 * Math.PI * radius
/** 挂载后从 0 补间到目标值，避免环形图一出现就是满的 */
const shown = ref(0)
onMounted(() => { requestAnimationFrame(() => { shown.value = props.value }) })
watch(() => props.value, value => { shown.value = value })
</script>
<template>
  <div class="affinity-ring" :style="{ width: `${size}px`, height: `${size}px` }">
    <svg viewBox="0 0 52 52">
      <circle class="ring-bg" cx="26" cy="26" :r="radius" :stroke-width="stroke" />
      <circle class="ring-value" cx="26" cy="26" :r="radius" :stroke-width="stroke" :stroke="color" :stroke-dasharray="circumference" :stroke-dashoffset="circumference * (1 - shown / 100)" />
    </svg>
    <span>{{ value }}<small>%</small></span>
  </div>
</template>
<style scoped>
.affinity-ring { position: relative; display:grid; place-items:center; flex-shrink:0; }
svg { position:absolute; inset:0; width:100%; height:100%; transform:rotate(-90deg); }
circle { fill:none; }.ring-bg { stroke:rgba(255,255,255,.65); }.ring-value { stroke-linecap:round; transition:stroke-dashoffset 1s var(--ease-soft); }
span { font-size:12px; font-weight:700; color:#4c435d; }small{font-size:7px;font-weight:500;}
</style>
