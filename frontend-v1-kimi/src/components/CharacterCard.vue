<script setup lang="ts">
import { Heart, MessageCircleMore, MoreHorizontal, Sparkles } from 'lucide-vue-next'
import type { Character } from '../data/mock'
import AffinityRing from './AffinityRing.vue'
import { useAppStore } from '../stores/app'
const props = defineProps<{ character: Character }>()
const store = useAppStore()
const openChat = () => { store.setActiveCharacter(props.character.id) }
</script>
<template>
  <article class="character-card card">
    <div class="portrait" :style="{ '--char-color': character.color }">
      <img :src="character.avatar" :alt="character.name" />
      <div class="portrait-shade" />
      <span class="status-badge"><i :class="character.status" />{{ character.status === 'online' ? '在线' : '暂离' }}</span>
      <button class="favorite-btn" :class="{ active: character.favorite }" @click.stop="store.toggleCharacterFavorite(character.id)"><Heart :size="16" :fill="character.favorite ? 'currentColor' : 'none'" /></button>
      <div class="affinity-badge"><AffinityRing :value="character.affinity" :color="character.color" :size="49" :stroke="3" /></div>
      <div class="hover-actions">
        <RouterLink :to="`/chat/${character.id}`" class="btn btn-primary" @click="openChat"><MessageCircleMore :size="16" />继续陪伴</RouterLink>
        <RouterLink :to="`/memory/${character.id}`" class="icon-btn" @click="openChat"><Sparkles :size="16" /></RouterLink>
      </div>
    </div>
    <div class="character-info">
      <div class="name-row"><div><h3>{{ character.name }}</h3><p>{{ character.title }}</p></div><button class="more-btn"><MoreHorizontal :size="18" /></button></div>
      <div class="tag-row"><span v-for="tag in character.tags.slice(0, 3)" :key="tag">{{ tag }}</span></div>
      <div class="card-footer"><span>{{ character.memoryCount }} 条共同记忆</span><span>相伴 {{ character.days }} 天</span></div>
    </div>
  </article>
</template>
<style scoped>
.character-card { overflow:hidden; transition:transform .25s ease, box-shadow .25s ease; }
.character-card:hover { transform:translateY(-5px); box-shadow:0 20px 45px rgba(45,35,75,.12); }
.portrait { position:relative; height:248px; overflow:hidden; background:var(--char-color); }
.portrait img { width:100%; height:100%; object-fit:cover; object-position:center 20%; transition:transform .5s ease; }
.character-card:hover .portrait img { transform:scale(1.035); }
.portrait-shade { position:absolute; inset:0; background:linear-gradient(to bottom,rgba(30,25,50,.12),transparent 35%,transparent 68%,rgba(35,25,50,.22)); }
.status-badge { position:absolute; top:13px; left:13px; display:flex; align-items:center; gap:5px; padding:5px 9px; border-radius:20px; background:rgba(255,255,255,.85); backdrop-filter:blur(10px); color:#615b6d; font-size:9px; font-weight:600; }
.status-badge i { width:5px; height:5px; border-radius:50%; background:#aaa; }.status-badge i.online{background:#59b99b;}.status-badge i.away{background:#d6a361;}
.favorite-btn { position:absolute; top:12px; right:12px; width:31px; height:31px; display:grid; place-items:center; border:0; border-radius:50%; color:#6f687b; background:rgba(255,255,255,.85); backdrop-filter:blur(10px); }.favorite-btn.active{color:#e68091;}
.affinity-badge { position:absolute; right:13px; bottom:12px; padding:2px; border-radius:50%; background:rgba(255,255,255,.55); backdrop-filter:blur(10px); }
.hover-actions { position:absolute; left:13px; bottom:15px; display:flex; gap:7px; opacity:0; transform:translateY(8px); transition:all .25s; }
.character-card:hover .hover-actions { opacity:1; transform:translateY(0); }
.hover-actions .btn { min-height:36px; padding:0 13px; font-size:11px; }.hover-actions .icon-btn{width:36px;height:36px;}
.character-info { padding:17px 17px 14px; }
.name-row { display:flex; align-items:flex-start; justify-content:space-between; }.name-row h3{font-size:16px;letter-spacing:-.2px;}.name-row p{font-size:10px;color:#9a96a6;margin-top:4px;}.more-btn{border:0;background:none;color:#aaa6b3;padding:0;}
.tag-row { display:flex; gap:5px; margin:13px 0 15px; }.tag-row span{padding:4px 8px;border-radius:7px;background:#f4f2f8;color:#817c8e;font-size:9px;}
.card-footer { display:flex; justify-content:space-between; padding-top:12px; border-top:1px solid #f0eef3; color:#aaa6b2; font-size:9px; }
.character-card { border-radius: 22px; border-color: rgba(230,226,238,.85); box-shadow: 0 8px 28px rgba(43,33,72,.045); }
.character-card:hover { transform: translateY(-7px); box-shadow: 0 24px 50px rgba(45,35,75,.13); }
.portrait { height: 260px; }
.portrait::after { content: ''; position: absolute; inset: 0; background: linear-gradient(120deg,rgba(255,255,255,.12),transparent 40%); pointer-events: none; }
.portrait img { transition: transform .65s cubic-bezier(.2,.75,.2,1),filter .4s; }
.character-card:hover .portrait img { transform: scale(1.055); filter: saturate(1.04); }
.status-badge,.favorite-btn { box-shadow: 0 5px 16px rgba(39,30,60,.08); }
.character-info { padding: 18px 18px 15px; }
.name-row h3 { font-size: 17px; }.name-row p { font-size: 11px; }
.tag-row span { padding: 5px 9px; font-size: 10px; background: #f5f3f9; }
.card-footer { font-size: 10px; }
.hover-actions .btn { box-shadow: 0 8px 20px rgba(72,54,125,.18); }
@media(max-width:560px){.portrait{height:230px}.hover-actions{opacity:1;transform:none}.hover-actions .btn{background:rgba(117,102,232,.9)}}
</style>
