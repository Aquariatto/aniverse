<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { RefreshCw } from 'lucide-vue-next'

/**
 * 部署后旧标签页里跑的还是老 bundle（图片地址可能是老的），
 * 这里定时比对服务端 bundle 名称，发现更新就提示刷新。
 */
const available = ref(false)
let timer = 0

const currentBundle = () => {
  const script = document.querySelector<HTMLScriptElement>('script[type="module"][src*="index-"]')
  const src = script?.getAttribute('src') || ''
  return src.split('/').pop() || ''
}

const check = async () => {
  if (available.value) return
  try {
    const response = await fetch('/api/version', { cache: 'no-store' })
    const payload = await response.json()
    const latest = String(payload?.bundle || '')
    const loaded = currentBundle()
    if (latest && loaded && latest !== loaded) available.value = true
  } catch { /* 网络抖动就跳过这一轮 */ }
}

const reload = () => window.location.reload()

onMounted(() => {
  window.setTimeout(check, 8000)
  timer = window.setInterval(check, 120_000)
})
onBeforeUnmount(() => window.clearInterval(timer))
</script>

<template>
  <Transition name="update-fade">
    <div v-if="available" class="update-banner" role="status">
      <span class="update-dot" />
      <span class="update-text">站点已更新</span>
      <button type="button" @click="reload"><RefreshCw :size="12" />刷新页面</button>
    </div>
  </Transition>
</template>

<style scoped>
.update-banner {
  position: fixed;
  left: 50%;
  bottom: 26px;
  z-index: 90;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 10px 8px 13px;
  transform: translateX(-50%);
  border: 1px solid rgba(228, 223, 240, .95);
  border-radius: 13px;
  background: rgba(255, 255, 255, .96);
  box-shadow: 0 16px 40px rgba(40, 30, 70, .18);
  backdrop-filter: blur(14px);
  font-size: 11px;
  color: #6a6180;
}
.update-dot { width: 6px; height: 6px; border-radius: 50%; background: #6eb99f; box-shadow: 0 0 0 3px rgba(110, 185, 159, .16); }
.update-text { letter-spacing: .2px; }
.update-banner button {
  display: inline-flex; align-items: center; gap: 4px;
  height: 26px; padding: 0 10px;
  border: 0; border-radius: 8px;
  background: linear-gradient(135deg, #8f7ae4, #6a55c8);
  color: #fff; font-size: 10px; cursor: pointer;
  font-family: inherit;
}
.update-banner button:hover { filter: brightness(1.06); }
.update-fade-enter-active, .update-fade-leave-active { transition: opacity .2s ease, transform .2s ease; }
.update-fade-enter-from, .update-fade-leave-to { opacity: 0; transform: translate(-50%, 8px); }
</style>
