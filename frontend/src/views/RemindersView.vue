<script setup lang="ts">
import { computed } from 'vue'
import { Bell, Check, Clock3, Trash2 } from 'lucide-vue-next'
import { useAppStore } from '../stores/app'

const store = useAppStore()
const pending = computed(() => store.reminders.filter(item => !item.done))
const finished = computed(() => store.reminders.filter(item => item.done))
const fmt = (iso: string) => {
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const remain = (iso: string) => {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return '已到时间'
  const m = Math.max(1, Math.round(diff / 60000))
  if (m < 60) return `${m} 分钟后`
  if (m < 1440) return `${Math.round(m / 60)} 小时后`
  return `${Math.round(m / 1440)} 天后`
}
const characterName = (id: string) => store.characters.find(c => c.id === id)?.name ?? '未知角色'
</script>

<template>
  <div class="reminders-page">
    <div class="page-heading"><div><div class="eyebrow">REMINDERS</div><h1>定时提醒</h1><p>在对话里说「明天下午三点提醒我答辩」，提醒就会出现在这里。</p></div></div>

    <section class="card reminder-section">
      <h2><Bell :size="16" />待提醒 <span>{{ pending.length }}</span></h2>
      <div v-if="!pending.length" class="empty">还没有待提醒事项，去对话里跟她说一句吧。</div>
      <ul v-else class="stagger-in stagger-tight">
        <li v-for="item in pending" :key="item.id" class="stagger-row">
          <div class="dot" />
          <div class="body">
            <strong>{{ item.title }}</strong>
            <p>{{ fmt(item.dueAt) }} · {{ remain(item.dueAt) }} · 来自 {{ characterName(item.characterId) }} · {{ item.repeat === 'daily' ? '每天' : item.repeat === 'weekly' ? '每周' : '一次' }}</p>
          </div>
          <div class="acts">
            <button type="button" title="标记完成" @click="store.completeReminder(item.id)"><Check :size="15" /></button>
            <button type="button" title="删除" @click="store.removeReminder(item.id)"><Trash2 :size="15" /></button>
          </div>
        </li>
      </ul>
    </section>

    <section class="card reminder-section">
      <h2><Clock3 :size="16" />已完成 <span>{{ finished.length }}</span></h2>
      <ul v-if="finished.length" class="stagger-in stagger-tight">
        <li v-for="item in finished" :key="item.id" class="done stagger-row">
          <div class="dot" />
          <div class="body"><strong>{{ item.title }}</strong><p>{{ fmt(item.dueAt) }} · {{ characterName(item.characterId) }}</p></div>
          <div class="acts"><button type="button" title="删除" @click="store.removeReminder(item.id)"><Trash2 :size="15" /></button></div>
        </li>
      </ul>
      <div v-else class="empty">暂无已完成记录。</div>
    </section>
  </div>
</template>

<style scoped>
.reminders-page{padding:6px 0 40px}
.reminder-section{margin-top:18px;padding:20px 22px}
.reminder-section h2{display:flex;align-items:center;gap:8px;font-size:15px;color:#3a3149}
.reminder-section h2 span{color:#a49bb8;font-size:12px}
.empty{margin-top:12px;color:#9a90b0;font-size:12px}
.reminder-section ul{list-style:none;margin:12px 0 0;padding:0;display:flex;flex-direction:column;gap:8px}
.reminder-section li{display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid #ece7f4;border-radius:12px;background:#fbfafd}
.reminder-section li.done{opacity:.6}
.dot{width:8px;height:8px;border-radius:50%;background:#8b72d7;flex:none}
.body{flex:1;min-width:0}
.body strong{display:block;font-size:13px;color:#3a3149}
.body p{margin-top:4px;font-size:10px;color:#948aa8}
.acts{display:flex;gap:6px}
.acts button{width:28px;height:28px;display:grid;place-items:center;border:1px solid #e6e0f0;border-radius:8px;background:#fff;color:#8b7fa0;cursor:pointer}
.acts button:hover{background:#efe9fb;color:#6f57b8}
</style>
