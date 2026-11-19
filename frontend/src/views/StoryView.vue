<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { BookOpen, BrainCircuit, Check, CheckCircle2, ChevronDown, Clock3, CloudSun, Heart, History, MapPin, PackageOpen, RotateCcw, Save, Send, ShieldCheck, Sparkles, Swords } from 'lucide-vue-next'
import { useAppStore } from '../stores/app'
import { assetUrl } from '../data/assets'
const store = useAppStore()
const SAVE_KEY = 'aniverse.story.slot1.v1'
interface StoryState { location: string; time: string; hp: number; trust: number; distance: number; turn: number; items: string[] }
interface StorySave { at: number; turns: { input: string; narration: string; time: string; patch?: string }[]; state: StoryState }
const input = ref('')
const scrollArea = ref<HTMLDivElement>()
const typed = ref('')
const narrating = ref(false)
const choices = ['握住她的手', '询问第七颗星的秘密', '一起走向灯塔']
const inheritedMemories = computed(() => store.memoriesByCharacter('orihime'))
const readSlot = (): StorySave | null => {
  try { const raw = localStorage.getItem(SAVE_KEY); return raw ? JSON.parse(raw) as StorySave : null } catch { return null }
}
const savedSlot = ref<StorySave | null>(readSlot())
const typeLatest = async () => {
  const text = store.storyTurns.at(-1)?.narration ?? ''
  typed.value = ''; narrating.value = true
  await nextTick(); if (scrollArea.value) scrollArea.value.scrollTop = scrollArea.value.scrollHeight
  for (let i = 0; i <= text.length; i += 2) {
    typed.value = text.slice(0, i)
    if (i % 12 === 0) await new Promise(r => setTimeout(r, 26))
  }
  typed.value = text; narrating.value = false
}
/**
 * 必须先等 store.storyAction 落库，再打字。
 * 原来没 await，typeLatest() 拿到的是「上一回合」的旁白，
 * 而模板里最新一回合渲染的正是 typed —— 于是新回合永远显示旧文本。
 */
const act = async () => {
  if (!input.value.trim() || narrating.value) return
  const value = input.value
  input.value = ''
  typed.value = ''
  narrating.value = true
  try { await store.storyAction(value) } catch { /* store 内部已有兜底台词 */ }
  await typeLatest()
}
const choose = (choice: string) => { input.value = choice; void act() }
const save = () => {
  const slot: StorySave = {
    at: Date.now(),
    turns: JSON.parse(JSON.stringify(store.storyTurns)),
    state: { ...store.storyState, items: [...store.storyState.items] },
  }
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(slot))
    savedSlot.value = slot
  } catch {
    store.notify('存档失败', '本地存储空间不足', 'info')
    return
  }
  store.notify('存档成功', `第 ${slot.state.turn} 回合 · 信任 ${slot.state.trust} · 共 ${slot.turns.length} 段对白`)
}
const load = () => {
  const slot = savedSlot.value
  if (!slot) { store.notify('还没有存档', '先点右上角「保存进度」', 'info'); return }
  narrating.value = false
  store.storyTurns = JSON.parse(JSON.stringify(slot.turns))
  Object.assign(store.storyState, slot.state, { items: [...(slot.state.items ?? [])] })
  typed.value = store.storyTurns.at(-1)?.narration ?? ''
  store.notify('读档完成', `已回到第 ${slot.state.turn} 回合的世界状态`, 'info')
  void nextTick(() => { if (scrollArea.value) scrollArea.value.scrollTop = scrollArea.value.scrollHeight })
}
onMounted(() => { typed.value = store.storyTurns.at(-1)?.narration ?? '' })
</script>
<template>
  <div class="story-page">
    <div class="story-heading"><div><div class="eyebrow">INTERACTIVE NARRATIVE</div><h1>星图与海 <span>Chapter 02</span></h1><p>你的选择会被这个世界记住，也会被她记住。</p></div><div class="story-head-actions"><span v-if="savedSlot" class="save-hint">存档 · 第 {{ savedSlot.state.turn }} 回合</span><button class="btn btn-secondary" @click="load"><History :size="15" />读取存档</button><button class="btn btn-primary" @click="save"><Save :size="15" />保存进度</button></div></div>
    <div class="story-layout">
      <section class="story-main card">
        <div class="scene-banner"><img :src="assetUrl('/images/story-seaside.webp')" alt="黄昏海岸" fetchpriority="high" decoding="async" /><div class="scene-shade" /><div class="scene-top"><span><BookOpen :size="13" />遗失的第七颗星</span><button>自由模式<ChevronDown :size="13" /></button></div><div class="scene-caption"><div><MapPin :size="14" />{{ store.storyState.location }}</div><h2>潮汐带来未完成的星图</h2><p>海风、黄昏，以及一个等待被回答的问题。</p></div><div class="scene-status"><CloudSun :size="15" /><span>黄昏 · 微风</span><i /><Clock3 :size="14" /><span>{{ store.storyState.time }}</span></div></div>
        <div ref="scrollArea" class="narration-scroll">
          <div class="memory-inherited"><span><BrainCircuit :size="16" /></span><div><strong>已继承 {{ inheritedMemories.length }} 条共同记忆</strong><p>{{ inheritedMemories[0]?.content || '还没有共同记忆，先说一句开场吧。' }}</p></div><CheckCircle2 :size="16" /></div>
          <div v-for="(turn, index) in store.storyTurns" :key="`${turn.time}-${index}`" class="story-turn">
            <div class="turn-label"><span>{{ turn.time }}</span><i /></div>
            <div class="user-action"><span>你的选择</span><p>{{ turn.input }}</p></div>
            <div class="narration"><div class="narrator"><img :src="assetUrl('/images/seira-keyvisual-640.webp')" loading="lazy" decoding="async" /><span>白濑星罗</span><small>旁白与演绎</small></div><p>{{ index === store.storyTurns.length - 1 ? typed : turn.narration }}<span v-if="narrating && index === store.storyTurns.length - 1" class="narration-cursor" /></p><div class="state-patch"><Sparkles :size="12" />{{ turn.patch }}<span><Check :size="11" />一致性校验通过</span></div></div>
          </div>
        </div>
        <div class="story-composer"><div v-if="!narrating" class="story-choices"><button v-for="choice in choices" :key="choice" @click="choose(choice)">{{ choice }}</button></div><div class="story-input"><Swords :size="18" /><input v-model="input" placeholder="描述你的行动，让故事继续…" @keyup.enter="act" /><button :disabled="!input.trim() || narrating" @click="act"><Send :size="17" /></button></div><p>自由输入行动 · 应用层负责状态记分与规则校验</p></div>
      </section>

      <aside class="story-sidebar">
        <div class="card world-state"><div class="side-title"><div><Sparkles :size="16" /><h3>世界状态</h3></div><span>LIVE</span></div><div class="state-character"><img :src="assetUrl('/images/seira-keyvisual-640.webp')" loading="lazy" decoding="async" /><div><strong>白濑星罗</strong><p>情绪 · 信任与期待</p></div><span>平静</span></div><div class="state-metrics"><div><span><Heart :size="12" />信任</span><strong>{{ store.storyState.trust }}</strong><div><i :style="{ width: `${store.storyState.trust}%` }" /></div></div><div><span><ShieldCheck :size="12" />状态</span><strong>{{ store.storyState.hp }}</strong><div><i class="hp" :style="{ width: `${store.storyState.hp}%` }" /></div></div><div><span><Sparkles :size="12" />心灵距离</span><strong>{{ store.storyState.distance }}</strong><div><i class="distance" :style="{ width: `${store.storyState.distance * 100}%` }" /></div></div></div><div class="inventory"><h4><PackageOpen :size="13" />持有物品</h4><span v-for="item in store.storyState.items" :key="item">{{ item }}</span></div><div class="state-flags"><div><span>flags.held_star_map</span><strong>true</strong></div><div><span>relations.trust</span><strong>+8</strong></div><div><span>scene.chapter</span><strong>02</strong></div></div></div>
        <div class="card validation-card"><div class="side-title"><div><ShieldCheck :size="16" /><h3>一致性校验</h3></div><span class="passed"><Check :size="11" />通过</span></div><div class="checks"><span><Check :size="11" />location_ok</span><span><Check :size="11" />item_ok</span><span><Check :size="11" />flag_ok</span><span><Check :size="11" />memory_ok</span></div><p>上次校验 · 刚刚</p></div>
        <div class="card story-memory-flow"><BrainCircuit :size="18" /><div><strong>剧情事件已回写</strong><p>story.turn.resolved</p></div><span>+2 好感</span></div>
      </aside>
    </div>
  </div>
</template>
<style scoped>
.story-heading{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:22px}.story-heading h1{font-size:27px}.story-heading h1 span{margin-left:9px;padding:5px 8px;border-radius:7px;background:#eae5f8;color:#8c79cf;font-size:8px;vertical-align:5px;letter-spacing:1px}.story-heading p{margin-top:7px;color:var(--muted);font-size:11px}.story-head-actions{display:flex;gap:9px}.story-head-actions .btn{min-height:39px;font-size:11px}.story-layout{display:grid;grid-template-columns:minmax(0,1fr) 270px;gap:20px}.story-main{overflow:hidden}.scene-banner{position:relative;height:245px;overflow:hidden}.scene-banner>img{width:100%;height:100%;object-fit:cover}.scene-shade{position:absolute;inset:0;background:linear-gradient(to bottom,rgba(35,28,50,.32),transparent 40%,rgba(36,26,43,.7))}.scene-top{position:absolute;left:20px;right:20px;top:17px;display:flex;justify-content:space-between;align-items:center}.scene-top>span{display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:10px;background:rgba(38,31,53,.25);backdrop-filter:blur(8px);color:white;font-size:9px}.scene-top button{display:flex;align-items:center;gap:5px;padding:6px 9px;border:1px solid rgba(255,255,255,.3);border-radius:9px;background:rgba(255,255,255,.12);color:white;font-size:8px}.scene-caption{position:absolute;left:25px;bottom:22px;color:white}.scene-caption>div{display:flex;align-items:center;gap:5px;font-size:9px;opacity:.8}.scene-caption h2{margin-top:8px;font-size:23px;letter-spacing:.5px}.scene-caption p{margin-top:5px;font-size:9px;opacity:.75}.scene-status{position:absolute;right:22px;bottom:23px;display:flex;align-items:center;gap:5px;color:white;font-size:8px;opacity:.8}.scene-status i{width:1px;height:11px;margin:0 5px;background:rgba(255,255,255,.4)}.narration-scroll{height:410px;overflow-y:auto;padding:20px 26px;background:#fdfcfe;scroll-behavior:smooth}.memory-inherited{display:flex;align-items:center;gap:10px;padding:12px 14px;border:1px solid #e5e0f2;border-radius:12px;background:#f6f3fc;color:#806fd0}.memory-inherited>span{width:30px;height:30px;display:grid;place-items:center;border-radius:9px;background:#ebe6f9}.memory-inherited>div{flex:1}.memory-inherited strong{display:block;color:#746782;font-size:9px}.memory-inherited p{margin-top:4px;color:#a199ad;font-size:8px;line-height:1.5}.turn-label{display:flex;align-items:center;gap:8px;margin:24px 0 13px;color:#b0a9b5;font-size:8px}.turn-label i{flex:1;height:1px;background:#eeebf1}.user-action{text-align:right}.user-action span{color:#b2acb7;font-size:7px}.user-action p{display:inline-block;max-width:80%;margin-top:5px;padding:8px 12px;border-radius:11px 3px 11px 11px;background:#eeeaf8;color:#756a82;font-size:10px;line-height:1.7}.narration{margin-top:16px}.narrator{display:flex;align-items:center;gap:7px}.narrator img{width:28px;height:28px;border-radius:9px;object-fit:cover}.narrator span{color:#6e6378;font-size:9px;font-weight:600}.narrator small{color:#b4adb9;font-size:7px}.narration>p{margin:10px 0 12px;color:#5e5668;font-family:'Noto Sans SC',sans-serif;font-size:11px;line-height:2.1;letter-spacing:.2px}.narration-cursor{display:inline-block;width:1px;height:12px;margin-left:2px;background:#8d77d5;animation:pulse .7s infinite}.state-patch{display:flex;align-items:center;gap:5px;color:#9b8bd0;font-size:8px}.state-patch>span{display:flex;align-items:center;gap:3px;margin-left:auto;color:#74a995}.story-composer{padding:13px 18px 14px;border-top:1px solid #ebe8ef;background:white}.story-choices{display:flex;gap:6px;margin-bottom:10px;overflow-x:auto}.story-choices button{padding:6px 9px;border:1px solid #e7e1f1;border-radius:9px;background:#faf8fd;color:#8a7b9b;font-size:8px;white-space:nowrap}.story-choices button:hover{border-color:#c6b8ed;color:#745fc6}.story-input{display:flex;align-items:center;gap:9px;padding:6px 7px 6px 12px;border:1px solid #dfd9e9;border-radius:13px;color:#9b8bd0}.story-input input{flex:1;min-width:0;height:32px;border:0;outline:0;color:#645b6f;font-size:12px}.story-input input::placeholder{color:#b1a9b8}.story-input button{width:32px;height:32px;display:grid;place-items:center;border:0;border-radius:9px;background:#7b69d4;color:white}.story-input button:disabled{background:#e6e1ed;color:#b5adbd}.story-composer>p{margin-top:7px;text-align:center;color:#bcb5c0;font-size:7px}.story-sidebar{display:flex;flex-direction:column;gap:14px}.world-state{padding:18px}.side-title,.side-title>div{display:flex;align-items:center;justify-content:space-between;gap:7px}.side-title>div{color:#8572d0}.side-title h3{color:#625a6d;font-size:11px}.side-title>span{color:#78b29e;font-size:7px;letter-spacing:1px}.state-character{display:flex;align-items:center;gap:9px;margin-top:16px;padding:11px;border-radius:12px;background:#f8f5fb}.state-character img{width:36px;height:36px;object-fit:cover;border-radius:11px}.state-character strong{display:block;font-size:10px}.state-character p{margin-top:4px;color:#aaa1b0;font-size:7px}.state-character>span{margin-left:auto;padding:4px 6px;border-radius:6px;background:#ebe5f7;color:#8c79c9;font-size:7px}.state-metrics{margin-top:16px}.state-metrics>div{display:grid;grid-template-columns:1fr auto;align-items:center;margin:13px 0}.state-metrics span{display:flex;align-items:center;gap:5px;color:#9991a1;font-size:8px}.state-metrics strong{color:#7f6cc9;font-size:9px}.state-metrics>div>div{grid-column:1/3;height:4px;margin-top:6px;border-radius:4px;background:#efecf2}.state-metrics i{display:block;height:100%;border-radius:4px;background:#9a87dc}.state-metrics i.hp{background:#6eb79e}.state-metrics i.distance{background:#d790aa}.inventory{padding-top:13px;border-top:1px solid #eeebf1}.inventory h4{display:flex;align-items:center;gap:5px;color:#8c8495;font-size:9px}.inventory span{display:inline-block;margin:9px 5px 0 0;padding:5px 7px;border-radius:7px;background:#f1edf7;color:#8c7e9d;font-size:7px}.state-flags{margin-top:15px;padding:10px;border-radius:9px;background:#f8f7fa;font-family:monospace}.state-flags>div{display:flex;justify-content:space-between;margin:5px 0;font-size:7px}.state-flags span{color:#aaa2af}.state-flags strong{color:#8b78c9}.validation-card{padding:17px}.side-title .passed{display:flex;align-items:center;gap:3px;padding:4px 6px;border-radius:6px;background:#eaf6f0;color:#64a68f}.checks{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:15px}.checks span{display:flex;align-items:center;gap:4px;color:#8f9e98;font-family:monospace;font-size:7px}.checks svg{color:#68af95}.validation-card>p{margin-top:13px;color:#b6afb9;font-size:7px}.story-memory-flow{display:flex;align-items:center;gap:9px;padding:15px;color:#8974d1}.story-memory-flow strong{display:block;color:#796c85;font-size:9px}.story-memory-flow p{margin-top:3px;color:#b1a7b8;font-family:monospace;font-size:7px}.story-memory-flow>span{margin-left:auto;color:#d18a9f;font-size:8px}
@media(max-width:1050px){.story-layout{grid-template-columns:1fr 240px}.narration-scroll{padding:18px}.scene-status{display:none}}@media(max-width:850px){.story-layout{grid-template-columns:1fr}.story-sidebar{display:grid;grid-template-columns:1fr 1fr}.story-memory-flow{display:none}.world-state{grid-row:span 2}.narration-scroll{height:380px}}@media(max-width:580px){.story-heading{align-items:flex-start;flex-direction:column;gap:15px}.story-heading h1{font-size:23px}.story-head-actions{width:100%}.story-head-actions .btn{flex:1}.scene-banner{height:210px}.scene-caption{left:18px;bottom:18px}.scene-caption h2{font-size:18px}.scene-caption p{display:none}.narration-scroll{padding:15px 13px;height:390px}.memory-inherited p{display:none}.story-sidebar{grid-template-columns:1fr}.validation-card{display:none}.story-choices{max-width:100%}.story-composer{padding:12px 10px}}
.save-hint{align-self:center;padding:5px 9px;border:1px dashed #d9d1ef;border-radius:8px;color:#8d7fc0;font-size:9px;white-space:nowrap}
@media(max-width:580px){.save-hint{display:none}}
</style>
