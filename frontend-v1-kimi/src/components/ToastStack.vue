<script setup lang="ts">
import { CheckCircle2, Info, X } from 'lucide-vue-next'
import { useAppStore } from '../stores/app'
const store = useAppStore()
</script>
<template>
  <div class="toast-stack">
    <TransitionGroup name="toast">
      <div v-for="toast in store.toasts" :key="toast.id" class="toast" :class="toast.type">
        <span class="toast-icon"><CheckCircle2 v-if="toast.type === 'success'" :size="19" /><Info v-else :size="19" /></span>
        <div><strong>{{ toast.title }}</strong><p v-if="toast.message">{{ toast.message }}</p></div>
        <button @click="store.toasts = store.toasts.filter(t => t.id !== toast.id)"><X :size="15" /></button>
      </div>
    </TransitionGroup>
  </div>
</template>
<style scoped>
.toast-stack { position: fixed; right: 24px; bottom: 24px; z-index: 200; display: flex; flex-direction: column; gap: 10px; width: min(360px, calc(100vw - 32px)); }
.toast { display: flex; align-items: flex-start; gap: 11px; padding: 15px; border: 1px solid #e7e4ef; border-radius: 16px; background: rgba(255,255,255,.96); box-shadow: 0 18px 45px rgba(35,30,65,.15); backdrop-filter: blur(12px); }
.toast-icon { color: #62ad94; margin-top: 1px; }.toast.info .toast-icon { color: #7d6dde; }
.toast strong { display: block; font-size: 12px; }.toast p { margin-top: 4px; color: #918d9d; font-size: 10px; line-height: 1.5; }
.toast button { margin-left: auto; padding: 2px; border: 0; background: none; color: #aaa6b3; }
.toast-enter-active,.toast-leave-active { transition: all .25s ease; }.toast-enter-from,.toast-leave-to { opacity:0; transform:translateX(20px); }
@media(max-width:560px){.toast-stack{right:16px;bottom:16px;}}
</style>
