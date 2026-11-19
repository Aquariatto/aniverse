<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Bookmark, CalendarDays, Check, ChevronLeft, ChevronRight, Clapperboard, Clock3, Heart, Play, Plus, Search, Sparkles, Star, TrendingUp } from 'lucide-vue-next'
import type { WatchlistItem } from '../data/mock'
import { assetUrl, thumbUrl } from '../data/assets'
import { useAppStore } from '../stores/app'
const store = useAppStore()
const query = ref('')
const activeStatus = ref('全部')
const selectedAnime = ref<WatchlistItem | null>(null)
const statuses = ['全部', '在看', '想看', '看过']
interface RemoteAnime { id: number; title: string; cover: string; score: number | null; genres: string[]; weekday: string | null; airingEpisode: number | null; episodes: number | null; siteUrl: string; malUrl: string; bangumiUrl: string }
const remoteRecommend = ref<RemoteAnime[]>([])
const remoteCalendar = ref<{ label: string; items: RemoteAnime[] }[]>([])
const activeWeekday = ref('')
const remoteToday = ref('')
const remoteTodayDate = ref('')
const remoteLoading = ref(true)
const remoteError = ref('')
const currentWeekdayItems = computed(() => remoteCalendar.value.find(d => d.label === activeWeekday.value)?.items ?? [])
onMounted(async () => {
  try {
    const [rec, cal] = await Promise.all([
      fetch('/api/catalog/recommend').then(r => r.json()),
      fetch('/api/catalog/calendar').then(r => r.json()),
    ])
    remoteRecommend.value = rec.items ?? []
    void translateTitles(remoteRecommend.value)
    remoteCalendar.value = cal.days ?? []
    void translateTitles(remoteCalendar.value.flatMap(d => d.items))
    remoteToday.value = cal.today ?? ''
    remoteTodayDate.value = cal.todayDate ?? ''
    activeWeekday.value = (cal.today && remoteCalendar.value.some(d => d.label === cal.today)) ? cal.today : (remoteCalendar.value[0]?.label ?? '')
    if (rec.error || cal.error) remoteError.value = rec.error || cal.error
  } catch (error) {
    remoteError.value = String(error).slice(0, 80)
  } finally {
    remoteLoading.value = false
  }
})
const aiQuery = ref('')
const aiResults = ref<RemoteAnime[]>([])
const aiReason = ref('')
const aiReply = ref('')
const aiLoading = ref(false)
const askAi = async () => {
  const q = aiQuery.value.trim()
  if (!q || aiLoading.value) return
  aiLoading.value = true
  aiReason.value = ''
  aiReply.value = ''
  try {
    const res = await fetch('/api/catalog/ai-recommend', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q }),
    }).then(r => r.json())
    aiResults.value = res.items ?? []
    aiReason.value = res.reason || ''
    aiReply.value = res.reply || ''
    void translateTitles(aiResults.value)
  } catch { aiResults.value = [] } finally { aiLoading.value = false }
}
const searchQuery = ref('')
const searchResults = ref<RemoteAnime[]>([])
const searchLoading = ref(false)
const translateMap = ref<Record<string, string>>({})
const zh = (title: string) => translateMap.value[title] || title

const translateTitles = async (items: RemoteAnime[]) => {
  const pending = [...new Set(items.map(i => i.title).filter(t => t && !translateMap.value[t]))].slice(0, 30)
  if (!pending.length) return
  try {
    const res = await fetch('/api/catalog/translate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titles: pending }),
    }).then(r => r.json())
    if (res.map) translateMap.value = { ...translateMap.value, ...res.map }
  } catch { /* 翻译失败保留原文 */ }
}

let searchTimer = 0
const onSearch = () => {
  window.clearTimeout(searchTimer)
  const keyword = searchQuery.value.trim()
  if (!keyword) { searchResults.value = []; return }
  searchTimer = window.setTimeout(async () => {
    searchLoading.value = true
    try {
      const res = await fetch(`/api/catalog/search?q=${encodeURIComponent(keyword)}`).then(r => r.json())
      let items: RemoteAnime[] = res.items ?? []
      // 中文关键词直搜命中少时，先译成日文原名再搜一次
      if (items.length < 3 && /[\u4e00-\u9fa5]/.test(keyword)) {
        const tr = await fetch('/api/catalog/translate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ titles: [keyword] }),
        }).then(r => r.json()).catch(() => ({}))
        const jp = tr?.map?.[keyword]
        if (jp && jp !== keyword) {
          const res2 = await fetch(`/api/catalog/search?q=${encodeURIComponent(jp)}`).then(r => r.json())
          const seen = new Set(items.map((i: RemoteAnime) => i.id))
          items = [...items, ...(res2.items ?? [] as RemoteAnime[]).filter((i: RemoteAnime) => !seen.has(i.id))]
        }
      }
      searchResults.value = items
      void translateTitles(searchResults.value)
    } catch { searchResults.value = [] } finally { searchLoading.value = false }
  }, 400)
}

const collect = (item: RemoteAnime) => {
  const added = store.addToWatchlist({
    id: item.id,
    title: zh(item.title),
    jp: item.title,
    image: item.cover,
    score: item.score ? Number((item.score / 10).toFixed(1)) : 0,
    tags: item.genres.slice(0, 3),
    total: item.episodes ?? 0,
  })
  store.notify(added ? '已加入追番清单' : '已经在追番清单里了', zh(item.title))
}
const isCollected = (id: number) => store.watchlist.some(entry => entry.id === id)

const filtered = computed(() => store.watchlist.filter(anime => (activeStatus.value === '全部' || anime.status === activeStatus.value) && (!query.value || `${anime.title}${anime.jp}${anime.tags.join('')}`.toLowerCase().includes(query.value.toLowerCase()))))
const updateStatus = (anime: WatchlistItem, status: string) => { store.updateWatchlistStatus(anime.id, status); store.notify('追番状态已更新', `${anime.title} · ${status}，偏好标签已同步`) }
const addProgress = (anime: WatchlistItem) => {
  const updated = store.bumpWatchlistProgress(anime.id)
  store.notify('观看进度 +1', `${anime.title} · ${updated?.progress ?? anime.progress}/${anime.total} 话`)
}
</script>
<template>
  <div class="catalog-page">
    <div class="page-heading"><div><div class="eyebrow">ANIME & PREFERENCE</div><h1>追番清单</h1><p>发现喜欢的故事，也让角色更懂你的喜好。</p></div><button class="btn btn-soft" @click="store.notify('人格报告已更新', '本周新增「治愈」偏好权重 +0.12')"><Sparkles :size="16" />生成观番人格报告</button></div>
    <section class="remote-recommend card">
      <div class="remote-head"><div><Sparkles :size="17" /><h2>AI 推荐</h2><span>说你想看什么，比如「治愈系校园日常」</span></div></div>
      <div class="catalog-search"><input v-model="aiQuery" type="text" placeholder="例如：想看点轻松的、有猫的、恋爱喜剧、像《孤独摇滚》那种" @keyup.enter="askAi" /><button type="button" class="ai-go" :disabled="aiLoading" @click="askAi">{{ aiLoading ? '思考中…' : '推荐' }}</button></div>
      <div v-if="aiReply" class="ai-reply"><span class="ai-avatar">🌙</span><div><p>{{ aiReply }}</p><small v-if="aiReason">{{ aiReason }}</small></div></div>
      <div v-if="aiResults.length" class="remote-grid stagger-in">
        <article v-for="item in aiResults" :key="item.id" class="remote-card">
          <a class="remote-link" :href="item.siteUrl" target="_blank" rel="noopener noreferrer">
            <div class="remote-cover"><img :src="item.cover" :alt="zh(item.title)" loading="lazy" /><button type="button" class="collect-btn" :class="{ active: isCollected(item.id) }" @click.prevent.stop="collect(item)">{{ isCollected(item.id) ? '✓' : '+' }}</button></div>
            <strong>{{ zh(item.title) }}</strong>
            <small>{{ item.score ? item.score + ' 分' : '暂无评分' }}<template v-if="item.genres.length"> · {{ item.genres.slice(0, 2).join(' / ') }}</template></small>
          </a>
          <div class="remote-links">
            <a v-if="item.malUrl" :href="item.malUrl" target="_blank" rel="noopener noreferrer">MAL</a>
            <a :href="item.bangumiUrl" target="_blank" rel="noopener noreferrer">Bangumi</a>
          </div>
        </article>
      </div>
      <p v-else-if="aiQuery && !aiLoading" class="remote-loading">没找到合适的，换个说法试试</p>
    </section>

    <section class="remote-recommend card">
      <div class="remote-head"><div><Search :size="17" /><h2>搜索番剧</h2><span>输入中文或原名</span></div></div>
      <div class="catalog-search"><input v-model="searchQuery" type="text" placeholder="例如：进击的巨人 / frieren" @input="onSearch" /><span v-if="searchLoading">搜索中…</span></div>
      <div v-if="searchResults.length" class="remote-grid stagger-in">
        <article v-for="item in searchResults" :key="item.id" class="remote-card">
          <a class="remote-link" :href="item.siteUrl" target="_blank" rel="noopener noreferrer">
            <div class="remote-cover"><img :src="item.cover" :alt="zh(item.title)" loading="lazy" /><button type="button" class="collect-btn" :class="{ active: isCollected(item.id) }" @click.prevent.stop="collect(item)">{{ isCollected(item.id) ? '✓' : '+' }}</button></div>
            <strong>{{ zh(item.title) }}</strong>
            <small>{{ item.score ? item.score + ' 分' : '暂无评分' }}<template v-if="item.episodes"> · {{ item.episodes }} 话</template></small>
          </a>
        </article>
      </div>
      <p v-else-if="searchQuery && !searchLoading" class="remote-loading">没有找到相关番剧</p>
    </section>

    <section class="remote-recommend card">
      <div class="remote-head"><div><Sparkles :size="17" /><h2>为你推荐</h2><span>来自 AniList 实时数据</span></div><RouterLink to="/chat/orihime" class="section-link">让角色更懂你<ChevronRight :size="14" /></RouterLink></div>
      <div v-if="remoteLoading" class="remote-loading">正在从接口获取…</div>
      <div v-else class="remote-grid stagger-in">
        <article v-for="item in remoteRecommend" :key="item.id" class="remote-card">
          <a class="remote-link" :href="item.siteUrl" target="_blank" rel="noopener noreferrer" :title="`在 AniList 查看 ${item.title}`">
            <div class="remote-cover"><img :src="item.cover" :alt="zh(item.title)" loading="lazy" /><button type="button" class="collect-btn" :class="{ active: isCollected(item.id) }" :title="isCollected(item.id) ? '已收藏' : '加入追番清单'" @click.prevent.stop="collect(item)">{{ isCollected(item.id) ? '✓' : '+' }}</button></div>
            <strong>{{ zh(item.title) }}</strong>
            <small>{{ item.score ? item.score + ' 分' : '暂无评分' }}<template v-if="item.genres.length"> · {{ item.genres.join(' / ') }}</template></small>
          </a>
          <div class="remote-links">
            <a v-if="item.malUrl" :href="item.malUrl" target="_blank" rel="noopener noreferrer">MAL</a>
            <a :href="item.bangumiUrl" target="_blank" rel="noopener noreferrer">Bangumi</a>
          </div>
        </article>
      </div>
      <p v-if="remoteError" class="remote-error">接口异常：{{ remoteError }}</p>
    </section>

    <section class="remote-calendar card">
      <div class="remote-head"><div><CalendarDays :size="17" /><h2>本季放送日历</h2><span>{{ remoteTodayDate ? remoteTodayDate + ' · ' + remoteToday + ' · ' : '' }}按星期分组 · AniList</span></div></div>
      <div class="weekday-tabs"><button v-for="d in remoteCalendar" :key="d.label" type="button" :class="{ active: d.label === activeWeekday, today: d.label === remoteToday }" @click="activeWeekday = d.label">{{ d.label }}<small>{{ d.label === remoteToday ? '今天' : d.items.length }}</small></button></div>
      <div class="remote-grid compact">
        <article v-for="item in currentWeekdayItems" :key="item.id" class="remote-card">
          <a class="remote-link" :href="item.siteUrl" target="_blank" rel="noopener noreferrer">
            <div class="remote-cover"><img :src="item.cover" :alt="zh(item.title)" loading="lazy" /><button type="button" class="collect-btn" :class="{ active: isCollected(item.id) }" :title="isCollected(item.id) ? '已收藏' : '加入追番清单'" @click.prevent.stop="collect(item)">{{ isCollected(item.id) ? '✓' : '+' }}</button></div>
            <strong>{{ zh(item.title) }}</strong>
            <small>第 {{ item.airingEpisode ?? '?' }} 集</small>
          </a>
          <div class="remote-links">
            <a v-if="item.malUrl" :href="item.malUrl" target="_blank" rel="noopener noreferrer">MAL</a>
            <a :href="item.bangumiUrl" target="_blank" rel="noopener noreferrer">Bangumi</a>
          </div>
        </article>
      </div>
      <p v-if="!remoteLoading && !currentWeekdayItems.length" class="remote-loading">这一天暂无放送信息</p>
    </section>

    <div class="catalog-layout">
      <section class="anime-section">
        <div class="catalog-toolbar"><div class="tabs"><button v-for="status in statuses" :key="status" class="tab" :class="{ active: activeStatus === status }" @click="activeStatus = status">{{ status }}</button></div><div class="input-wrap anime-search"><Search :size="15" /><input v-model="query" class="input" placeholder="搜索番剧…" /></div></div>
        <div class="anime-grid">
          <article v-for="anime in filtered" :key="anime.id" class="anime-card card">
            <div class="anime-cover" @click="selectedAnime = anime"><img :src="thumbUrl(anime.image)" loading="lazy" decoding="async" /><div class="cover-shade" /><span class="anime-score"><Star :size="11" fill="currentColor" />{{ anime.score }}</span><span class="anime-status">{{ anime.status }}</span><button class="play-btn"><Play :size="18" fill="currentColor" /></button></div>
            <div class="anime-info"><h3>{{ anime.title }}</h3><p>{{ anime.jp }}</p><div class="anime-tags"><span v-for="tag in anime.tags" :key="tag">{{ tag }}</span></div><div v-if="anime.progress" class="watch-progress"><div><span>观看进度</span><strong>{{ anime.progress }} / {{ anime.total }}</strong></div><div><i :style="{ width: `${anime.progress / anime.total * 100}%` }" /></div></div><div class="anime-actions"><select class="select" :value="anime.status" @change="updateStatus(anime, ($event.target as HTMLSelectElement).value)"><option>想看</option><option>在看</option><option>看过</option><option>弃番</option></select><button class="icon-btn" title="看完一集" @click="addProgress(anime)"><Plus :size="15" /></button></div></div>
          </article>
        </div>
        <div v-if="!filtered.length" class="anime-empty card"><Clapperboard :size="34" /><h3>没有找到相关番剧</h3><button class="btn btn-soft" @click="query = ''; activeStatus = '全部'">重置筛选</button></div>
      </section>
      <aside class="catalog-aside">
        <div class="card persona-card"><div class="persona-head"><span><Sparkles :size="18" /></span><div><h3>你的观番人格</h3><p>基于 26 部观看记录</p></div></div><div class="persona-type"><small>ANIME PERSONA</small><h2>静谧旅人</h2><p>偏爱细腻的情绪与缓慢的关系成长，喜欢在故事中寻找生活的回声。</p></div><div class="preference-bars"><div><span>治愈系</span><div><i style="width:88%" /></div><strong>88</strong></div><div><span>成长叙事</span><div><i style="width:76%" /></div><strong>76</strong></div><div><span>轻松日常</span><div><i style="width:64%" /></div><strong>64</strong></div></div></div>
        <div class="card recommend-card"><div class="recommend-head"><h3>为你推荐</h3><TrendingUp :size="15" /></div><div class="recommend-item" v-for="anime in store.watchlist.slice(1, 4)" :key="anime.id" @click="selectedAnime = anime"><img :src="thumbUrl(anime.image)" loading="lazy" decoding="async" /><div><strong>{{ anime.title }}</strong><p>{{ anime.tags.slice(0, 2).join(' · ') }}</p><span><Star :size="9" fill="currentColor" />{{ anime.score }}<small>匹配 {{ 70 + (anime.id % 25) }}%</small></span></div></div></div>
      </aside>
    </div>
    <Teleport to="body"><Transition name="fade"><div v-if="selectedAnime" class="modal-backdrop" @click.self="selectedAnime = null"><div class="anime-modal"><img :src="selectedAnime.image" /><div class="anime-modal-shade" /><button class="modal-close" @click="selectedAnime = null">×</button><div class="anime-modal-content"><span>{{ selectedAnime.tags.join(' · ') }}</span><h2>{{ selectedAnime.title }}</h2><p>{{ selectedAnime.jp }}</p><div><Star :size="15" fill="currentColor" /><strong>{{ selectedAnime.score }}</strong><small> Bangumi 评分</small></div><p class="anime-description">一段关于相遇、成长与告别的故事。那些平凡的日常，在回望时都成为了闪闪发光的瞬间。</p><button class="btn btn-primary" @click="updateStatus(selectedAnime, '想看'); selectedAnime = null"><Bookmark :size="15" />加入追番清单</button></div></div></div></Transition></Teleport>
  </div>
</template>
<style scoped>
.calendar-card{padding:20px 23px;margin-bottom:24px}.calendar-head,.calendar-head>div{display:flex;align-items:center;justify-content:space-between;gap:9px}.calendar-head>div:first-child{color:#8673ce}.calendar-head h2{color:#5c5468;font-size:13px}.calendar-head span{margin-left:8px;color:#aaa3b0;font-size:8px}.calendar-head .icon-btn{width:30px;height:30px}.calendar-days{display:grid;grid-template-columns:repeat(7,1fr);gap:8px;margin-top:17px}.calendar-days button{position:relative;height:58px;border:1px solid transparent;border-radius:12px;background:#f8f7fa;color:#a49daa}.calendar-days span,.calendar-days strong{display:block}.calendar-days span{font-size:8px}.calendar-days strong{margin-top:5px;font-size:14px}.calendar-days i{position:absolute;left:50%;bottom:5px;width:3px;height:3px;border-radius:50%;background:#a08cda}.calendar-days small{position:absolute;right:4px;top:4px;color:#8e7bd0;font-size:6px}.calendar-days button.active{border-color:#cfc4ef;background:#eee9fa;color:#7b66c8;box-shadow:0 5px 15px rgba(120,100,190,.08)}.calendar-show{display:flex;align-items:center;gap:12px;margin-top:15px;padding:10px 13px;border-radius:12px;background:#faf8fd}.show-time{color:#8a76ce;font-size:11px;font-weight:600}.calendar-show>img{width:50px;height:31px;border-radius:8px;object-fit:cover}.calendar-show>div:nth-child(3){flex:1}.calendar-show strong{font-size:9px}.calendar-show p{margin-top:4px;color:#a9a1af;font-size:8px}.calendar-show .btn{min-height:30px;padding:0 10px;font-size:8px}.catalog-layout{display:grid;grid-template-columns:minmax(0,1fr) 270px;gap:21px}.catalog-toolbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}.anime-search{width:190px}.anime-search .input{height:36px;font-size:10px}.anime-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.anime-card{overflow:hidden;transition:all .2s}.anime-card:hover{transform:translateY(-3px);box-shadow:0 15px 35px rgba(45,35,70,.1)}.anime-cover{position:relative;height:150px;overflow:hidden;cursor:pointer}.anime-cover>img{width:100%;height:100%;object-fit:cover;transition:transform .4s}.anime-card:hover .anime-cover>img{transform:scale(1.04)}.cover-shade{position:absolute;inset:0;background:linear-gradient(to bottom,rgba(30,25,45,.15),transparent 50%,rgba(30,25,45,.35))}.anime-score{position:absolute;left:10px;top:10px;display:flex;align-items:center;gap:4px;padding:4px 7px;border-radius:7px;background:rgba(255,255,255,.85);color:#d29456;font-size:8px;font-weight:600}.anime-status{position:absolute;right:10px;top:10px;padding:4px 7px;border-radius:7px;background:rgba(50,40,70,.35);backdrop-filter:blur(6px);color:white;font-size:7px}.play-btn{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:40px;height:40px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.5);border-radius:50%;background:rgba(255,255,255,.25);backdrop-filter:blur(6px);color:white;opacity:0;transition:opacity .2s}.anime-cover:hover .play-btn{opacity:1}.anime-info{padding:14px}.anime-info h3{font-size:12px}.anime-info>p{margin-top:4px;color:#b0a8b5;font-size:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.anime-tags{display:flex;gap:5px;margin-top:9px}.anime-tags span{padding:3px 6px;border-radius:5px;background:#f3f0f7;color:#958b9f;font-size:7px}.watch-progress{margin-top:12px}.watch-progress>div:first-child{display:flex;justify-content:space-between;color:#aaa2af;font-size:7px}.watch-progress strong{color:#8b78cc}.watch-progress>div:last-child{height:3px;margin-top:5px;border-radius:3px;background:#eeebf1}.watch-progress i{display:block;height:100%;border-radius:3px;background:#9884d8}.anime-actions{display:flex;gap:7px;margin-top:12px}.anime-actions .select{height:32px;font-size:8px;border-radius:9px}.anime-actions .icon-btn{width:32px;height:32px;border-radius:9px}.catalog-aside{display:flex;flex-direction:column;gap:15px}.persona-card{padding:19px;background:linear-gradient(150deg,#f1edfb,#faf6fa);border-color:#e4def1}.persona-head{display:flex;align-items:center;gap:9px}.persona-head>span{width:34px;height:34px;display:grid;place-items:center;border-radius:11px;background:rgba(255,255,255,.65);color:#8c77d1}.persona-head h3{font-size:11px}.persona-head p{margin-top:4px;color:#aaa0b2;font-size:7px}.persona-type{margin-top:18px}.persona-type small{color:#a093c1;font-size:6px;letter-spacing:1.5px}.persona-type h2{margin-top:5px;color:#6f5d87;font-size:23px;letter-spacing:2px}.persona-type p{margin-top:8px;color:#94879f;font-size:8px;line-height:1.8}.preference-bars{margin-top:17px}.preference-bars>div{display:grid;grid-template-columns:54px 1fr 20px;align-items:center;gap:6px;margin:10px 0;color:#9a8fa4;font-size:7px}.preference-bars>div>div{height:3px;background:rgba(255,255,255,.8);border-radius:3px}.preference-bars i{display:block;height:100%;border-radius:3px;background:#9b87d7}.preference-bars strong{font-size:7px;color:#8b78c5}.recommend-card{padding:17px}.recommend-head{display:flex;justify-content:space-between;color:#8d79ce}.recommend-head h3{color:#62596c;font-size:11px}.recommend-item{display:flex;gap:9px;margin-top:13px;cursor:pointer}.recommend-item>img{width:52px;height:59px;border-radius:9px;object-fit:cover}.recommend-item>div{flex:1;padding-top:3px}.recommend-item strong{font-size:9px}.recommend-item p{margin-top:4px;color:#aaa2af;font-size:7px}.recommend-item span{display:flex;align-items:center;gap:3px;margin-top:8px;color:#d39b62;font-size:7px}.recommend-item small{margin-left:auto;color:#75a592}.anime-empty{padding:60px;text-align:center;color:#b0a4c6}.anime-empty svg{margin:0 auto 12px}.anime-empty h3{margin-bottom:15px;color:#6b6275;font-size:13px}.anime-modal{position:relative;width:min(600px,100%);height:470px;overflow:hidden;border-radius:24px;box-shadow:0 30px 80px rgba(30,25,50,.3)}.anime-modal>img{width:100%;height:100%;object-fit:cover}.anime-modal-shade{position:absolute;inset:0;background:linear-gradient(to bottom,rgba(25,20,40,.1),rgba(28,20,42,.85))}.modal-close{position:absolute;right:15px;top:12px;border:0;background:none;color:white;font-size:27px}.anime-modal-content{position:absolute;left:30px;right:30px;bottom:28px;color:white}.anime-modal-content>span{font-size:9px;opacity:.75}.anime-modal-content h2{margin-top:8px;font-size:28px}.anime-modal-content>p{margin-top:5px;font-size:10px;opacity:.65}.anime-modal-content>div{display:flex;align-items:center;gap:5px;margin-top:12px;color:#f0bd75}.anime-modal-content>div small{color:white;opacity:.6}.anime-modal-content .anime-description{font-size:10px;line-height:1.8;opacity:.8;margin:15px 0}.anime-modal-content .btn{font-size:10px}
@media(max-width:1300px){.anime-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:1000px){.catalog-layout{grid-template-columns:1fr}.catalog-aside{display:grid;grid-template-columns:1fr 1fr}.anime-grid{grid-template-columns:repeat(3,1fr)}}@media(max-width:850px){.anime-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:600px){.calendar-card{padding:16px 10px}.calendar-head span{display:none}.calendar-days{gap:3px}.calendar-days button{height:52px}.calendar-show .pill{display:none}.calendar-show .btn{font-size:0;width:30px;padding:0}.calendar-show .btn svg{margin:0}.catalog-toolbar{gap:10px}.anime-search{width:140px}.anime-grid{grid-template-columns:1fr}.anime-cover{height:200px}.catalog-aside{grid-template-columns:1fr}.recommend-card{display:none}.page-heading .btn{font-size:10px}}

.remote-recommend,.remote-calendar{margin-bottom:20px;padding:18px 20px}
.remote-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
.remote-head>div{display:flex;align-items:center;gap:8px;color:#8673ce}
.remote-head h2{font-size:14px;color:#4a4058}
.remote-head span{color:#aaa3b0;font-size:9px}
.remote-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px}
.remote-grid.compact{grid-template-columns:repeat(6,minmax(0,1fr))}
.remote-card{display:flex;flex-direction:column;gap:6px;min-width:0}
.remote-cover{position:relative;width:100%;aspect-ratio:3/4;border-radius:10px;overflow:hidden;background:#eee}
.remote-cover img{width:100%;height:100%;object-fit:cover;display:block}
.remote-card strong{font-size:10px;color:#4a4058;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.remote-card small{font-size:8px;color:#a49dae}
.weekday-tabs{display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap}
.weekday-tabs button{display:flex;align-items:center;gap:5px;padding:5px 10px;border:1px solid #e6e0f0;border-radius:9px;background:#faf8fd;color:#8a7fa0;font-size:9px;cursor:pointer}
.weekday-tabs button.active{background:#efe9fb;border-color:#cfc0ef;color:#6f57b8}
.weekday-tabs small{color:#b3a9c2;font-size:8px}
.remote-loading{color:#a49dae;font-size:10px;padding:12px 0}
.remote-error{color:#c98181;font-size:9px;margin-top:8px}
@media(max-width:1100px){.remote-grid,.remote-grid.compact{grid-template-columns:repeat(4,minmax(0,1fr))}}
@media(max-width:700px){.remote-grid,.remote-grid.compact{grid-template-columns:repeat(3,minmax(0,1fr))}}
.remote-link{display:flex;flex-direction:column;gap:6px;color:inherit;text-decoration:none;transition:transform .2s}
.remote-link:hover{transform:translateY(-3px)}
.remote-links{display:flex;gap:6px;margin-top:2px}
.remote-links a{font-size:8px;padding:2px 6px;border-radius:6px;background:#f1ecfa;color:#7b66c8;text-decoration:none}
.remote-links a:hover{background:#e4dbf7}
.catalog-search{position:relative;margin-bottom:14px}
.catalog-search input{width:100%;height:38px;padding:0 14px;border:1px solid #e4dfed;border-radius:11px;background:#faf8fd;color:#4a4058;font-size:12px;outline:none}
.catalog-search input:focus{border-color:#bdb1ed;background:#fff}
.catalog-search>span{position:absolute;right:12px;top:11px;font-size:9px;color:#a49dae}
.collect-btn{position:absolute;right:6px;bottom:6px;width:24px;height:24px;display:grid;place-items:center;padding:0;border:0;border-radius:50%;background:rgba(20,16,38,.62);color:#fff;font-size:13px;line-height:1;cursor:pointer;backdrop-filter:blur(4px);transition:all .18s}
.collect-btn:hover{background:rgba(120,90,220,.9);transform:scale(1.1)}
.collect-btn.active{background:#7b66c8}
.weekday-tabs button.today{border-color:#b9a6ef;box-shadow:0 0 0 2px rgba(139,114,215,.18)}
.ai-go{padding:6px 14px;border:0;border-radius:9px;background:linear-gradient(135deg,#7b63d8,#5a48b0);color:#fff;font-size:11px;font-weight:600;cursor:pointer}
.ai-go:disabled{opacity:.6;cursor:default}
.ai-reason{margin:-6px 0 12px;color:#8c7fb0;font-size:10px;line-height:1.7}
.catalog-search{display:flex;gap:8px;align-items:center}
.catalog-search input{flex:1}
.ai-reply{display:flex;gap:10px;align-items:flex-start;margin:4px 0 16px;padding:12px 14px;border:1px solid rgba(160,130,240,.22);border-radius:14px;background:linear-gradient(120deg,rgba(139,114,215,.14),rgba(139,114,215,.05))}
.ai-avatar{width:28px;height:28px;display:grid;place-items:center;border-radius:50%;background:rgba(139,114,215,.2);font-size:14px}
.ai-reply p{color:#4a4058;font-size:13px;line-height:1.6}
.ai-reply small{display:block;margin-top:4px;color:#9a90b0;font-size:10px}
</style>
