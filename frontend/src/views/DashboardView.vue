<script setup lang="ts">
import { computed, ref } from 'vue'
import type { EChartsOption } from 'echarts'
import { Activity, ArrowDownRight, ArrowUpRight, BookOpen, BrainCircuit, CalendarDays, CheckCircle2, ChevronRight, Download, Heart, MessageCircleMore, Sparkles, UsersRound } from 'lucide-vue-next'
import BaseChart from '../components/BaseChart.vue'
import RollingNumber from '../components/RollingNumber.vue'
import { useAppStore } from '../stores/app'
const store = useAppStore()
const range = ref('近 7 天')

// ---- 真实统计：全部从 store 里算，不再写死数字 ----
const allMessages = computed(() => Object.values(store.messages).flat())
const totalMessages = computed(() => allMessages.value.length)
const todayMessages = computed(() => {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  return allMessages.value.filter(message => Number(message.id) / 1000 >= start.getTime()).length
})
const storyMemories = computed(() => store.memories.filter(memory => memory.source === 'story').length)
const chatMemories = computed(() => store.memories.filter(memory => memory.source === 'chat').length)
const favoriteCharacters = computed(() => store.characters.filter(character => character.favorite).length)
const averageAffinity = computed(() => store.characters.length
  ? store.characters.reduce((sum, character) => sum + character.affinity, 0) / store.characters.length
  : 0)
const closestCharacter = computed(() => [...store.characters].sort((a, b) => b.affinity - a.affinity)[0]?.name ?? '她')
// 消息 id 是本地毫秒时间戳生成的，可以反推每天的消息数；没有可用的新数据时退回示例曲线
const trend = computed(() => {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const dayIndex = (ms: number) => 6 - Math.floor((start.getTime() - ms) / 86400000)
  const messages = new Array(7).fill(0)
  const memories = new Array(7).fill(0)
  allMessages.value.forEach(message => {
    const ms = Number(message.id) / 1000
    if (!Number.isFinite(ms) || ms < 1e12) return
    const index = dayIndex(ms)
    if (index >= 0 && index < 7) messages[index] += 1
  })
  store.memories.forEach(memory => {
    const ms = Number(memory.id) / 1000
    if (!Number.isFinite(ms) || ms < 1e12) return
    const index = dayIndex(ms)
    if (index >= 0 && index < 7) memories[index] += 1
  })
  const hasData = messages.some(Boolean) || memories.some(Boolean)
  return hasData
    ? { messages, memories, sample: false }
    : { messages: [18, 26, 22, 38, 31, 45, 52], memories: [3, 5, 4, 8, 6, 9, 11], sample: true }
})
const trendLabels = computed(() => Array.from({ length: 7 }, (_, index) => {
  const date = new Date(Date.now() - (6 - index) * 86400000)
  return index === 6 ? '今天' : `${date.getMonth() + 1}/${date.getDate()}`
}))
// 情绪光谱直接用对话里记录到的情绪，没有记录时退回示例分布
const EMOTION_COLORS = ['#8e7bdd', '#73b5c8', '#e2a18c', '#d98fa9', '#c3bdcc']
const emotionSpectrum = computed(() => {
  const counts = new Map<string, number>()
  allMessages.value.forEach(message => {
    const emotion = String(message.emotion || '').trim()
    if (!emotion) return
    counts.set(emotion, (counts.get(emotion) || 0) + 1)
  })
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  if (!rows.length) {
    return { data: [38, 27, 20, 10, 5].map((value, index) => ({ value, name: ['开心', '平静', '温柔', '害羞', '难过'][index], itemStyle: { color: EMOTION_COLORS[index] } })), total: 0, sample: true }
  }
  const total = rows.reduce((sum, row) => sum + row[1], 0)
  return {
    data: rows.map(([name, value], index) => ({ name, value, itemStyle: { color: EMOTION_COLORS[index % EMOTION_COLORS.length] } })),
    total,
    sample: false,
  }
})
const activityOption = computed<EChartsOption>(() => ({
  tooltip: { trigger: 'axis', backgroundColor: 'rgba(255,255,255,.95)', borderColor: '#ece8f2', textStyle: { color: '#655d70', fontSize: 11 } },
  legend: { data: ['对话消息', '新增记忆'], top: 0, right: 0, itemWidth: 8, itemHeight: 8, textStyle: { color: '#9c95a5', fontSize: 10 } },
  grid: { left: 10, right: 15, top: 40, bottom: 5, containLabel: true },
  xAxis: { type: 'category', boundaryGap: false, data: range.value === '近 7 天' ? trendLabels.value : ['第1周', '第2周', '第3周', '第4周'], axisLine: { lineStyle: { color: '#eeeaf1' } }, axisTick: { show: false }, axisLabel: { color: '#aaa3b0', fontSize: 9 } },
  yAxis: { type: 'value', splitLine: { lineStyle: { color: '#f0edf3', type: 'dashed' } }, axisLabel: { color: '#b4adb8', fontSize: 9 } },
  series: [
    { name: '对话消息', type: 'line', smooth: true, symbol: 'circle', symbolSize: 6, data: range.value === '近 7 天' ? trend.value.messages : [112, 156, 148, 231], lineStyle: { color: '#8773dc', width: 3 }, itemStyle: { color: '#8773dc', borderColor: 'white', borderWidth: 2 }, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(135,115,220,.22)' }, { offset: 1, color: 'rgba(135,115,220,0)' }] } } },
    { name: '新增记忆', type: 'line', smooth: true, symbol: 'circle', symbolSize: 5, data: range.value === '近 7 天' ? trend.value.memories : [18, 28, 24, 46], lineStyle: { color: '#e1a087', width: 2 }, itemStyle: { color: '#e1a087', borderColor: 'white', borderWidth: 2 } },
  ],
}))
const emotionOption = computed<EChartsOption>(() => ({
  tooltip: { trigger: 'item', backgroundColor: 'white', borderColor: '#eee9f2', textStyle: { color: '#655d70', fontSize: 10 } },
  legend: { bottom: 0, icon: 'circle', itemWidth: 7, itemHeight: 7, textStyle: { color: '#948c9d', fontSize: 9 } },
  series: [{ type: 'pie', radius: ['57%', '77%'], center: ['50%', '43%'], avoidLabelOverlap: true, itemStyle: { borderRadius: 6, borderColor: 'white', borderWidth: 3 }, label: { show: false }, data: emotionSpectrum.value.data }],
}))
const flowOption: EChartsOption = {
  tooltip: { trigger: 'item', triggerOn: 'mousemove', backgroundColor: 'white', borderColor: '#eee9f2', textStyle: { color: '#655d70', fontSize: 10 } },
  series: [{ type: 'sankey', left: 20, right: 65, top: 15, bottom: 15, nodeWidth: 13, nodeGap: 16, emphasis: { focus: 'adjacency' }, data: [{ name: '陪伴对话', itemStyle: { color: '#72b4c8' } }, { name: '长期记忆', itemStyle: { color: '#8e7bdc' } }, { name: '剧情引擎', itemStyle: { color: '#e0a087' } }, { name: '记忆回写', itemStyle: { color: '#aa96e3' } }, { name: '好感度', itemStyle: { color: '#d88fa8' } }, { name: '图库资产', itemStyle: { color: '#72b29e' } }], links: [{ source: '陪伴对话', target: '长期记忆', value: 32 }, { source: '长期记忆', target: '剧情引擎', value: 18 }, { source: '剧情引擎', target: '记忆回写', value: 12 }, { source: '陪伴对话', target: '好感度', value: 24 }, { source: '剧情引擎', target: '好感度', value: 9 }, { source: '记忆回写', target: '图库资产', value: 6 }], lineStyle: { color: 'gradient', curveness: .5, opacity: .28 }, label: { color: '#756d7f', fontSize: 10 } }],
}
const events = [
  { icon: MessageCircleMore, name: 'chat.message.saved', from: '对话域', to: '记忆域 / 关系域', time: '刚刚', color: 'blue' },
  { icon: BrainCircuit, name: 'chat.memory.created', from: '记忆域', to: '关系域', time: '刚刚', color: 'purple' },
  { icon: BookOpen, name: 'story.turn.resolved', from: '叙事域', to: '记忆域 / 关系域', time: '8 分钟前', color: 'peach' },
  { icon: CheckCircle2, name: 'story.session.started', from: '叙事域', to: '记忆域', time: '12 分钟前', color: 'green' },
]
</script>
<template>
  <div class="dashboard-page">
    <div class="page-heading"><div><div class="eyebrow">UNIVERSE ANALYTICS</div><h1>数据仪表盘</h1><p>看见每一次相遇，如何成为角色宇宙的一部分。</p></div><div class="dashboard-actions"><div class="tabs"><button v-for="r in ['近 7 天', '近 30 天']" :key="r" class="tab" :class="{ active: range === r }" @click="range = r">{{ r }}</button></div><button class="icon-btn" @click="store.notify('报表已准备', '演示数据已导出为当前视图快照')"><Download :size="16" /></button></div></div>
    <div class="stat-grid dashboard-stats stagger-in stagger-tight">
      <div class="card stat-card"><span class="stat-icon"><UsersRound :size="20" /></span><div><div class="stat-value"><RollingNumber :value="store.characters.length" :pad="0" /></div><div class="stat-label">宇宙角色</div></div><span class="trend">{{ favoriteCharacters }} 位已收藏</span></div>
      <div class="card stat-card"><span class="stat-icon blue"><MessageCircleMore :size="20" /></span><div><div class="stat-value"><RollingNumber :value="totalMessages" :pad="0" :delay="80" /></div><div class="stat-label">对话消息</div></div><span class="trend">今天 {{ todayMessages }} 条</span></div>
      <div class="card stat-card"><span class="stat-icon peach"><BrainCircuit :size="20" /></span><div><div class="stat-value"><RollingNumber :value="store.memories.length" :pad="0" :delay="160" /></div><div class="stat-label">长期记忆</div></div><span class="trend">{{ storyMemories }} 条来自剧情</span></div>
      <div class="card stat-card"><span class="stat-icon green"><Heart :size="20" /></span><div><div class="stat-value">{{ averageAffinity.toFixed(1) }}</div><div class="stat-label">平均好感度</div></div><span class="trend">{{ closestCharacter }} 最亲近</span></div>
    </div>
    <div class="chart-grid stagger-in stagger-tight"><section class="card chart-card activity-chart"><div class="chart-head"><div><h2>宇宙活跃趋势</h2><p>对话与记忆的每日变化</p></div><span class="pill pill-green"><Activity :size="11" />{{ range === '近 7 天' ? (trend.sample ? '示例趋势' : '实时统计') : '示例趋势' }}</span></div><BaseChart :option="activityOption" height="275px" /></section><section class="card chart-card emotion-chart"><div class="chart-head"><div><h2>情绪光谱</h2><p>互动中的情绪分布</p></div><button class="icon-btn"><ChevronRight :size="15" /></button></div><div class="emotion-total"><strong>{{ emotionSpectrum.total || '—' }}</strong><span>{{ emotionSpectrum.sample ? '示例分布' : '次情绪记录' }}</span></div><BaseChart :option="emotionOption" height="275px" /></section></div>
    <div class="lower-grid"><section class="card chart-card flow-chart"><div class="chart-head"><div><h2>跨模块状态流动</h2><p>同一份记忆与世界状态，驱动不同模块协同</p></div><span class="pill pill-purple"><Sparkles :size="11" />核心架构</span></div><BaseChart :option="flowOption" height="280px" /></section><section class="card event-card"><div class="chart-head"><div><h2>领域事件流</h2><p>EventBus · 示例事件</p></div><span class="event-live"><i />DEMO</span></div><div class="event-list"><div v-for="event in events" :key="event.name" class="event-item"><span class="event-icon" :class="event.color"><component :is="event.icon" :size="15" /></span><div><strong>{{ event.name }}</strong><p>{{ event.from }}<ChevronRight :size="9" />{{ event.to }}</p></div><time>{{ event.time }}</time></div></div><button class="event-log-btn" @click="store.notify('事件日志', '领域事件流为架构示意，真实回写见记忆页', 'info')">查看全部事件日志<ChevronRight :size="13" /></button></section></div>
    <section class="card insight-card"><span class="insight-icon"><Sparkles :size="22" /></span><div><h3>本周宇宙洞察</h3><p>当前共有 <strong>{{ store.memories.length }}</strong> 条长期记忆，其中 {{ storyMemories }} 条由剧情回写、{{ chatMemories }} 条来自对话，{{ store.memories.filter(m => m.source === 'manual').length }} 条由你手动记录。{{ closestCharacter }} 是现在与你关系最近的角色。</p></div><RouterLink to="/memory/orihime" class="btn btn-soft">查看记忆详情<ChevronRight :size="14" /></RouterLink></section>
  </div>
</template>
<style scoped>
.dashboard-actions{display:flex;align-items:center;gap:9px}.stat-icon.blue{background:#eaf6fb;color:#5ba6c1}.stat-icon.peach{background:#fff0e9;color:#d68e72}.stat-icon.green{background:#eaf7f2;color:#5dab91}.dashboard-stats .trend{display:flex;align-items:center;gap:2px}.chart-grid{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(280px,.8fr);gap:18px;margin-top:20px}.chart-card{padding:21px 22px}.chart-head{display:flex;align-items:flex-start;justify-content:space-between;gap:15px}.chart-head h2{font-size:14px}.chart-head p{margin-top:5px;color:#aaa3b0;font-size:9px}.chart-head .icon-btn{width:30px;height:30px}.emotion-chart{position:relative}.emotion-total{position:absolute;left:50%;top:47%;transform:translate(-50%,-50%);text-align:center;pointer-events:none}.emotion-total strong,.emotion-total span{display:block}.emotion-total strong{color:#62566f;font-size:21px}.emotion-total span{margin-top:4px;color:#aaa1af;font-size:7px}.lower-grid{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(320px,1fr);gap:18px;margin-top:18px}.event-card{padding:21px 22px}.event-live{display:flex;align-items:center;gap:4px;color:#70ad97;font-size:7px;letter-spacing:1px}.event-live i{width:5px;height:5px;border-radius:50%;background:#69b398;box-shadow:0 0 0 3px #e3f2ec}.event-list{margin-top:16px}.event-item{display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid #f0edf2}.event-icon{width:32px;height:32px;display:grid;place-items:center;border-radius:10px;flex-shrink:0}.event-icon.blue{background:#eaf6fa;color:#65a9bf}.event-icon.purple{background:#efebfb;color:#8b78d4}.event-icon.peach{background:#fff0e9;color:#d99076}.event-icon.green{background:#eaf6f1;color:#67ab92}.event-item>div{flex:1;min-width:0}.event-item strong{display:block;color:#756b7f;font-family:monospace;font-size:9px}.event-item p{display:flex;align-items:center;gap:4px;margin-top:5px;color:#ada5b2;font-size:7px}.event-item time{color:#b4acb8;font-size:7px}.event-log-btn{width:100%;display:flex;align-items:center;justify-content:center;gap:4px;margin-top:14px;padding:9px;border:0;border-radius:9px;background:#f6f3fa;color:#8c78c9;font-size:8px}.insight-card{display:flex;align-items:center;gap:15px;margin-top:18px;padding:18px 22px;background:linear-gradient(110deg,#f0ecfb,#faf6fa)}.insight-icon{width:43px;height:43px;display:grid;place-items:center;border-radius:13px;background:rgba(255,255,255,.7);color:#8b76d1;flex-shrink:0}.insight-card>div{flex:1}.insight-card h3{color:#6d617b;font-size:12px}.insight-card p{margin-top:6px;color:#93879f;font-size:9px;line-height:1.7}.insight-card p strong{color:#816ec5}.insight-card .btn{font-size:9px;min-height:35px}
.dashboard-stats .stat-card { position: relative; overflow: hidden; transition: transform .2s,box-shadow .2s; }
.dashboard-stats .stat-card::after { content: ''; position: absolute; right: -22px; bottom: -32px; width: 90px; height: 90px; border-radius: 50%; background: radial-gradient(circle,rgba(139,118,232,.07),transparent 68%); }
.dashboard-stats .stat-card:hover { transform: translateY(-3px); box-shadow: 0 16px 36px rgba(44,34,72,.07); }
.chart-card,.event-card { border-radius: 20px; }
.chart-head h2 { font-size: 15px; }.chart-head p { font-size: 10px; }
.event-item { transition: background .18s; }.event-item:hover { background: #fbfaff; }
.insight-card { background: linear-gradient(110deg,#f4f0ff,#faf8fd 60%,#fff7f2); border-color: #e8e0f3; }
@media(max-width:1100px){.chart-grid{grid-template-columns:1fr 300px}.lower-grid{grid-template-columns:1fr}.event-list{display:grid;grid-template-columns:1fr 1fr;gap:0 18px}}@media(max-width:850px){.chart-grid{grid-template-columns:1fr}.emotion-chart{min-height:340px}.emotion-total{top:48%}}@media(max-width:600px){.dashboard-actions .icon-btn{display:none}.chart-card,.event-card{padding:18px 12px}.event-list{grid-template-columns:1fr}.insight-card{align-items:flex-start;flex-wrap:wrap;padding:17px}.insight-card .btn{margin-left:58px}.chart-head .pill{display:none}}
</style>
