<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowUp, ChevronRight, Heart, MapPin, Sparkles , Smartphone } from 'lucide-vue-next'
import RollingNumber from '../components/RollingNumber.vue'
import { useAppStore } from '../stores/app'
import { assetUrl } from '../data/assets'
import { cgImages, characterImages, characterVariants, defaultEmotion, defaultScene, normalizeEmotion, normalizeScene, sceneImages, type GalgameEmotion } from '../data/galgameAssets'
import { requestGalgameTurn } from '../data/aiApi'

const route = useRoute()
const store = useAppStore()
const input = ref('')
const inputBox = ref<HTMLTextAreaElement>()
const isSending = ref(false)
const currentEmotion = ref<GalgameEmotion>(defaultEmotion)
const currentScene = ref(defaultScene)
const currentReply = ref('今天的星星很美，要和我一起看看吗？')
const suggestions = ref<[string, string, string]>(['好啊，一起看星星', '今天过得怎么样？', '你一直在这里吗？'])
const affinityDelta = ref<number | null>(null)
const dialogueKey = ref(0)
const dialogueSegments = ref<string[]>([])
const dialogueIndex = ref(0)
let affinityTimer = 0

const character = computed(() => store.characterById(String(route.params.characterId ?? 'orihime')))
const backgroundImage = computed(() => assetUrl(sceneImages[currentScene.value] ?? sceneImages[defaultScene]))
const portraitSeed = ref(0)
const displayPortrait = ref('')
const displayScene = ref('')
const activeCg = ref<string | null>(null)
let cgTimer = 0
const imageCache = new Map<string, HTMLImageElement>()
const preloadImage = (url: string) => new Promise<void>((resolve) => {
  if (!url) return resolve()
  const cached = imageCache.get(url)
  if (cached?.complete && cached.naturalWidth > 0) return resolve()
  const img = new Image()
  img.onload = () => { imageCache.set(url, img); resolve() }
  img.onerror = () => resolve()
  img.src = url
  imageCache.set(url, img)
})
const preloadVariants = (emotion: string) => {
  const list = characterVariants[emotion]
  if (list) list.forEach(url => { void preloadImage(url) })
}
const portraitImage = computed(() => {
  if (character.value.id !== 'orihime') return assetUrl(character.value.avatar)
  const variants = characterVariants[currentEmotion.value]
  if (!variants?.length) return assetUrl(characterImages[currentEmotion.value])
  return assetUrl(variants[portraitSeed.value % variants.length])
})
const sceneNumber = computed(() => String(Math.max(1, Object.keys(sceneImages).indexOf(currentScene.value) + 1)).padStart(2, '0'))
const hasPendingDialogue = computed(() => dialogueIndex.value < dialogueSegments.value.length - 1)
const canRespond = computed(() => !isSending.value && dialogueSegments.value.length > 0 && !hasPendingDialogue.value)
const dialogueProgress = computed(() => `${dialogueIndex.value + 1} / ${dialogueSegments.value.length}`)
const timeNow = () => new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

const splitDialogue = (text: string) => {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return ['……']
  const segments: string[] = []
  normalized.split(/(?<=[。！？!?；;])/).map(part => part.trim()).filter(Boolean).forEach(sentence => {
    if (sentence.length <= 46) {
      segments.push(sentence)
      return
    }
    let buffer = ''
    sentence.split(/(?<=[，,：:])/).forEach(sourcePart => {
      let part = sourcePart
      if (buffer && (buffer + part).length > 42) {
        segments.push(buffer)
        buffer = ''
      }
      while (part.length > 46) {
        if (buffer) {
          segments.push(buffer)
          buffer = ''
        }
        segments.push(part.slice(0, 46))
        part = part.slice(46)
      }
      buffer += part
    })
    if (buffer) segments.push(buffer)
  })
  return segments.length ? segments : [normalized]
}

const setDialogue = (text: string) => {
  dialogueSegments.value = splitDialogue(text)
  dialogueIndex.value = 0
  currentReply.value = dialogueSegments.value[0] ?? text
  dialogueKey.value += 1
}

const advanceDialogue = () => {
  if (isSending.value || !hasPendingDialogue.value) return
  dialogueIndex.value += 1
  currentReply.value = dialogueSegments.value[dialogueIndex.value] ?? currentReply.value
  dialogueKey.value += 1
}

watch(character, (value) => {
  store.setActiveCharacter(value.id)
  currentEmotion.value = defaultEmotion
  currentScene.value = defaultScene
  setDialogue(value.id === 'orihime' ? '今天的星星很美，要和我一起看看吗？' : value.quote)
  suggestions.value = ['今天过得怎么样？', '我想听听你的想法', '接下来想去哪里？']
}, { immediate: true })

const showAffinityDelta = (delta: number) => {
  window.clearTimeout(affinityTimer)
  affinityDelta.value = delta
  affinityTimer = window.setTimeout(() => { affinityDelta.value = null }, 1800)
}

const send = async (preset?: string) => {
  const content = (preset ?? input.value).trim()
  if (!content || !canRespond.value) return
  const characterId = character.value.id
  const timestamp = Date.now()
  input.value = ''
  isSending.value = true
  affinityDelta.value = null
  if (!store.messages[characterId]) store.messages[characterId] = []
  store.messages[characterId].push({ id: timestamp, role: 'user', content, time: timeNow() })

  try {
    const history = store.messages[characterId] ?? []
    const turn = await requestGalgameTurn({
      memories: store.memoriesByCharacter(character.value.id).map(m => ({ content: m.content, importance: m.importance })),
      character: character.value,
      history,
      userInput: content,
      currentEmotion: currentEmotion.value,
      currentScene: currentScene.value,
    })
    const emotion = normalizeEmotion(turn.emotion)
    const targetCharacter = store.characterById(characterId)
    store.applyAffinity(characterId, turn.affinityDelta)
    targetCharacter.emotion = emotion
    store.messages[characterId].push({ id: timestamp + 1, role: 'assistant', content: turn.reply, time: timeNow(), emotion })

    if (character.value.id === characterId) {
      currentEmotion.value = emotion
      if (turn.scene) currentScene.value = normalizeScene(turn.scene, currentScene.value)
      setDialogue(turn.reply)
      suggestions.value = turn.suggestions
      portraitSeed.value += 1
      maybeShowCg()
      showAffinityDelta(turn.affinityDelta)
    }
  } catch (error) {
    const fallback = '……（连接好像被星空遮住了，请稍后再试一次。）'
    store.messages[characterId].push({ id: timestamp + 1, role: 'assistant', content: fallback, time: timeNow(), emotion: defaultEmotion })
    if (character.value.id === characterId) {
      currentEmotion.value = defaultEmotion
      setDialogue(fallback)
      suggestions.value = ['再说一次好吗', '没关系，慢慢来', '换个话题吧']
    }
    store.notify('DeepSeek 暂时不可用', error instanceof Error ? error.message : '请检查服务端是否启动', 'info')
  } finally {
    isSending.value = false
    inputBox.value?.focus()
  }
}

onBeforeUnmount(() => window.clearTimeout(affinityTimer))

const enterLandscape = async () => {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen()
    const orientation = (screen as unknown as { orientation?: { lock?: (o: string) => Promise<void> } }).orientation
    await orientation?.lock?.('landscape')
  } catch { /* 不支持时由用户手动横屏 */ }
}

// 预热：情绪/场景变化时后台缓存，下次切换无白屏
// 立绘只预热「当前 + 下一张」两张：5 张全拉要 1.3MB，慢网下得不偿失
watch(currentEmotion, (emotion) => {
  const list = characterVariants[emotion]
  if (!list?.length) return
  const index = portraitSeed.value % list.length
  const nextIndex = (index + 1) % list.length
  new Image().src = list[index]
  if (nextIndex !== index) new Image().src = list[nextIndex]
}, { immediate: true })
watch(backgroundImage, (url) => { if (url) { const img = new Image(); img.src = url } }, { immediate: true })

const cgHold = ref(0)
const maybeShowCg = () => {
  // 已在融合场景：聊够几轮就退出
  if (activeCg.value) {
    cgHold.value -= 1
    if (cgHold.value <= 0) activeCg.value = null
    return
  }
  const list = cgImages[currentScene.value]
  if (!list?.length) return
  if (Math.random() > 0.35) return
  const cg = list[Math.floor(Math.random() * list.length)]
  const img = new Image()
  img.onload = () => {
    activeCg.value = cg
    cgHold.value = 2 + Math.floor(Math.random() * 2)
  }
  img.src = cg
}
</script>

<template>
  <div class="galgame-page" :class="{ sending: isSending }">
    <div class="rotate-hint">
      <div class="rotate-hint-inner">
        <Smartphone :size="42" />
        <h3>请横屏使用剧情模式</h3>
        <p>横屏后画面会自动全屏展开，体验更接近真正的 Galgame。</p>
        <button type="button" @click="enterLandscape">立即全屏横屏</button>
      </div>
    </div>

    <Transition name="scene-crossfade">
      <img :key="activeCg || currentScene" class="scene-background" :src="activeCg || backgroundImage" :alt="currentScene" fetchpriority="high" />
    </Transition>
    <div class="scene-shade" />
    <div class="scene-grain" />

    <header class="scene-header">
      <div class="chapter-mark"><span>ANIVERSE / GALGAME</span><strong>星海观测记录 <i /> CHAPTER 01</strong></div>
      <div class="local-badge"><i /> LOCAL STORY <span>离线剧情</span></div>
    </header>

    <div class="scene-location"><MapPin :size="14" /><span>SCENE {{ sceneNumber }}</span><strong>{{ currentScene }}</strong></div>

    <div class="character-stage">
      <Transition name="portrait-change">
        <img v-if="!activeCg" :key="displayPortrait" class="character-portrait" :src="portraitImage" :alt="`${character.name} · ${currentEmotion}`" fetchpriority="high" />
      </Transition>
    </div>

    <Transition name="choice-reveal">
      <section v-if="canRespond" class="choice-panel" aria-label="回应与输入">
      <div class="choice-heading"><div><span>YOUR RESPONSE</span><strong>你的回应</strong></div><small>选择一句，或写下自己的想法</small></div>
      <div class="suggestion-list">
        <button v-for="(suggestion, index) in suggestions" :key="`${dialogueKey}-${index}`" type="button" :disabled="isSending" @click="send(suggestion)">
          <span class="choice-index">0{{ index + 1 }}</span><span>{{ suggestion }}</span><ChevronRight :size="15" />
        </button>
      </div>
      <form class="galgame-composer" @submit.prevent="send()">
        <textarea ref="inputBox" v-model="input" rows="1" :disabled="isSending" :placeholder="`回应 ${character.name}…`" aria-label="输入你的回应" @keydown.enter.exact.prevent="send()" @keydown.shift.enter.exact="input += '\n'" />
        <button type="submit" :disabled="!input.trim() || isSending" aria-label="发送回应"><ArrowUp :size="19" /></button>
        <span class="composer-hint">ENTER 发送 · SHIFT + ENTER 换行</span>
      </form>
      </section>
    </Transition>

    <section class="dialogue-box" :class="{ clickable: hasPendingDialogue }" :role="hasPendingDialogue ? 'button' : undefined" :tabindex="hasPendingDialogue ? 0 : -1" aria-live="polite" :aria-label="hasPendingDialogue ? `继续对白，第 ${dialogueIndex + 1} 段，共 ${dialogueSegments.length} 段` : undefined" @click="advanceDialogue" @keydown.enter.prevent="advanceDialogue" @keydown.space.prevent="advanceDialogue">
      <div class="dialogue-topline">
        <span><Sparkles :size="12" /> CURRENT DIALOGUE</span>
        <div class="affinity-block">
          <div class="affinity-label"><Heart :size="13" /><span>好感度</span><strong><RollingNumber :value="character.affinity" :pad="1" /><small>/100</small></strong></div>
          <div class="affinity-track"><i :style="{ width: `${character.affinity}%` }" /></div>
          <Transition name="delta-pop"><b v-if="affinityDelta !== null" :class="{ negative: affinityDelta < 0 }">{{ affinityDelta > 0 ? '+' : '' }}{{ affinityDelta }}</b></Transition>
        </div>
      </div>
      <div class="dialogue-text">
        <Transition name="dialogue-line" mode="out-in">
          <p :key="dialogueKey"><strong>{{ character.name }}：</strong><span v-if="isSending" class="waiting-dots"><i /><i /><i /></span><template v-else>{{ currentReply }}</template></p>
        </Transition>
      </div>
      <footer class="dialogue-footer"><span>情绪 · {{ currentEmotion }}</span><span v-if="hasPendingDialogue" class="dialogue-next">点击继续 · {{ dialogueProgress }}<ChevronRight :size="12" /></span><span v-else>每一句回应，都会被写进我们的共同历史</span></footer>
    </section>
  </div>
</template>

<style scoped>
.galgame-page{position:relative;height:calc(100vh - 136px);min-height:660px;overflow:hidden;border:1px solid rgba(255,255,255,.14);border-radius:26px;background:#151321;box-shadow:0 24px 70px rgba(25,19,43,.2);isolation:isolate}.scene-background{position:absolute;inset:0;width:100%;height:100%;max-width:none;object-fit:cover;object-position:center;z-index:0}.scene-shade{position:absolute;inset:0;z-index:1;pointer-events:none;background:linear-gradient(90deg,rgba(10,9,20,.18),transparent 45%,rgba(9,8,20,.36)),linear-gradient(0deg,rgba(7,7,16,.9) 0%,rgba(7,7,16,.22) 34%,transparent 62%,rgba(9,8,18,.24) 100%)}.scene-grain{position:absolute;inset:0;z-index:2;pointer-events:none;opacity:.12;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.82' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.34'/%3E%3C/svg%3E");mix-blend-mode:soft-light}.scene-header{position:absolute;z-index:4;left:28px;right:28px;top:24px;display:flex;justify-content:space-between;align-items:flex-start;color:#fff;pointer-events:none}.chapter-mark{display:flex;flex-direction:column;gap:7px;text-shadow:0 2px 15px rgba(0,0,0,.3)}.chapter-mark>span{font-size:9px;letter-spacing:2.4px;opacity:.68}.chapter-mark strong{display:flex;align-items:center;gap:10px;font-size:12px;font-weight:600;letter-spacing:1px}.chapter-mark i{width:24px;height:1px;background:rgba(255,255,255,.5)}.local-badge{display:flex;align-items:center;gap:7px;padding:8px 11px;border:1px solid rgba(255,255,255,.2);border-radius:20px;background:rgba(16,13,30,.22);backdrop-filter:blur(12px);font-size:8px;letter-spacing:1.1px}.local-badge i{width:5px;height:5px;border-radius:50%;background:#a9f0d4;box-shadow:0 0 9px #a9f0d4}.local-badge span{padding-left:5px;border-left:1px solid rgba(255,255,255,.18);letter-spacing:0;opacity:.72}.scene-location{position:absolute;z-index:4;left:29px;top:94px;display:flex;align-items:center;gap:8px;color:rgba(255,255,255,.75);font-size:10px;text-shadow:0 2px 12px rgba(0,0,0,.3)}.scene-location span{font-size:8px;letter-spacing:1.2px;opacity:.7}.scene-location strong{font-weight:500;color:#fff}.character-stage{position:absolute;inset:0;z-index:2;pointer-events:none}.character-portrait{position:absolute;left:2.5%;bottom:10px;height:82%;width:auto;max-width:58%;object-fit:contain;object-position:left bottom;filter:drop-shadow(0 22px 30px rgba(11,8,26,.32));transform-origin:bottom center}.choice-panel{position:absolute;z-index:5;right:28px;bottom:202px;width:min(350px,36%);padding:16px;border:1px solid rgba(255,255,255,.18);border-radius:19px;background:rgba(20,17,34,.46);box-shadow:0 18px 50px rgba(8,6,20,.2);backdrop-filter:blur(18px) saturate(1.15);color:#fff}.choice-heading{display:flex;justify-content:space-between;align-items:flex-end;gap:10px;margin-bottom:11px}.choice-heading>div{display:flex;flex-direction:column;gap:3px}.choice-heading span{font-size:7px;letter-spacing:1.8px;color:#c7bcf4}.choice-heading strong{font-size:13px;letter-spacing:.5px}.choice-heading small{font-size:8px;color:rgba(255,255,255,.52)}.suggestion-list{display:flex;flex-direction:column;gap:7px}.suggestion-list button{display:grid;grid-template-columns:25px 1fr 16px;align-items:center;gap:8px;min-height:42px;padding:8px 11px;border:1px solid rgba(255,255,255,.12);border-radius:11px;background:rgba(255,255,255,.075);color:rgba(255,255,255,.88);text-align:left;font-size:12px;line-height:1.45;transition:transform .2s,border-color .2s,background .2s}.suggestion-list button:hover{transform:translateX(-4px);border-color:rgba(198,184,255,.5);background:rgba(139,118,232,.25)}.suggestion-list button:disabled{opacity:.45;cursor:wait}.suggestion-list svg{opacity:.55}.choice-index{font-size:9px;color:#c5b8f5;font-variant-numeric:tabular-nums}.galgame-composer{position:relative;display:grid;grid-template-columns:1fr 37px;gap:8px;margin-top:12px;padding:8px 8px 24px 12px;border:1px solid rgba(255,255,255,.17);border-radius:12px;background:rgba(6,5,15,.34);transition:border-color .2s,box-shadow .2s}.galgame-composer:focus-within{border-color:rgba(190,174,255,.62);box-shadow:0 0 0 3px rgba(139,118,232,.12)}.galgame-composer textarea{width:100%;min-height:37px;max-height:76px;padding:6px 0;resize:none;border:0;outline:0;background:transparent;color:#fff;font-size:12px;line-height:1.6}.galgame-composer textarea::placeholder{color:rgba(255,255,255,.42)}.galgame-composer button{align-self:start;width:37px;height:37px;display:grid;place-items:center;border:0;border-radius:10px;background:linear-gradient(135deg,#9b87f2,#735fd0);color:#fff;box-shadow:0 6px 18px rgba(91,68,176,.32);transition:transform .18s,opacity .18s}.galgame-composer button:hover:not(:disabled){transform:translateY(-2px)}.galgame-composer button:disabled{opacity:.32;cursor:not-allowed}.composer-hint{position:absolute;left:12px;bottom:7px;font-size:7px;letter-spacing:.7px;color:rgba(255,255,255,.36)}.dialogue-box{position:absolute;z-index:6;left:26px;right:26px;bottom:24px;min-height:156px;padding:19px 24px 14px;border:1px solid rgba(255,255,255,.2);border-radius:19px;background:linear-gradient(115deg,rgba(17,14,31,.84),rgba(27,22,45,.73));box-shadow:0 20px 55px rgba(5,4,13,.34),inset 0 1px rgba(255,255,255,.07);backdrop-filter:blur(22px) saturate(1.2);color:#fff}.dialogue-topline{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}.dialogue-topline>span{display:flex;align-items:center;gap:6px;color:#c8bced;font-size:8px;letter-spacing:1.5px}.affinity-block{position:relative;width:160px;margin-top:-4px}.affinity-label{display:flex;align-items:center;gap:5px;color:rgba(255,255,255,.65);font-size:9px}.affinity-label svg{color:#e6a6c5}.affinity-label strong{margin-left:auto;color:#fff;font-size:16px;line-height:1}.affinity-label small{margin-left:3px;color:rgba(255,255,255,.42);font-size:8px;font-weight:400}.affinity-track{height:3px;margin-top:8px;overflow:hidden;border-radius:3px;background:rgba(255,255,255,.13)}.affinity-track i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#aa91ef,#efb0cc);box-shadow:0 0 8px rgba(216,165,237,.45);transition:width .7s cubic-bezier(.22,1,.36,1)}.affinity-block b{position:absolute;right:0;top:27px;color:#f2b5d2;font-size:11px}.affinity-block b.negative{color:#a9c7ef}.dialogue-text{margin-top:12px;min-height:58px}.dialogue-text p{font-size:17px;line-height:1.8;letter-spacing:.35px;text-shadow:0 2px 8px rgba(0,0,0,.18)}.dialogue-text strong{color:#d4c8ff;font-weight:600;white-space:nowrap}.dialogue-footer{display:flex;justify-content:space-between;gap:20px;margin-top:8px;color:rgba(255,255,255,.42);font-size:8px;letter-spacing:.5px}.waiting-dots{display:inline-flex;align-items:center;gap:5px;height:28px}.waiting-dots i{width:5px;height:5px;border-radius:50%;background:#d7cdf8;animation:waiting 1s infinite ease-in-out}.waiting-dots i:nth-child(2){animation-delay:.15s}.waiting-dots i:nth-child(3){animation-delay:.3s}.scene-crossfade-enter-active,.scene-crossfade-leave-active{transition:opacity .5s ease}.scene-crossfade-enter-from,.scene-crossfade-leave-to{opacity:0}.portrait-change-enter-active{transition:opacity .25s ease,transform .25s ease}.portrait-change-leave-active{transition:opacity .2s ease}.portrait-change-enter-from{opacity:0;transform:translateY(10px)}.portrait-change-leave-to{opacity:0}.dialogue-line-enter-active,.dialogue-line-leave-active{transition:opacity .16s ease,transform .16s ease}.dialogue-line-enter-from{opacity:0;transform:translateY(5px)}.dialogue-line-leave-to{opacity:0;transform:translateY(-3px)}.delta-pop-enter-active,.delta-pop-leave-active{transition:opacity .25s,transform .25s}.delta-pop-enter-from,.delta-pop-leave-to{opacity:0;transform:translateY(5px)}@keyframes waiting{0%,100%{opacity:.3;transform:translateY(0)}50%{opacity:1;transform:translateY(-3px)}}
.dialogue-box.clickable{cursor:pointer;transition:border-color .2s,background .2s}.dialogue-box.clickable:hover{border-color:rgba(205,190,255,.42);background:linear-gradient(115deg,rgba(23,18,40,.9),rgba(32,25,53,.8))}.dialogue-box.clickable:focus-visible{outline:2px solid rgba(197,180,255,.72);outline-offset:3px}.dialogue-next{display:inline-flex;align-items:center;gap:4px;color:#d4c7f6;letter-spacing:.4px}.dialogue-next svg{animation:next-nudge 1.2s infinite ease-in-out}.choice-reveal-enter-active{transition:opacity .28s ease,transform .32s cubic-bezier(.22,1,.36,1)}.choice-reveal-leave-active{transition:opacity .16s ease,transform .16s ease}.choice-reveal-enter-from,.choice-reveal-leave-to{opacity:0;transform:translateY(14px) scale(.98)}@keyframes next-nudge{50%{transform:translateX(3px)}}
@media(max-width:1180px){.choice-panel{right:20px;width:320px;max-width:40%}.character-portrait{left:0;max-width:60%}.dialogue-box{left:20px;right:20px}.choice-heading small{display:none}}
@media(max-width:820px){.galgame-page{height:calc(100vh - 121px);min-height:690px;border-radius:20px}.scene-header{left:18px;right:18px;top:18px}.chapter-mark strong{font-size:10px}.chapter-mark>span{font-size:7px}.local-badge span{display:none}.scene-location{left:19px;top:76px}.character-portrait{height:64%;left:-3%;bottom:210px;max-width:76%}.choice-panel{left:16px;right:16px;bottom:181px;width:auto;max-width:none;padding:12px}.choice-heading{margin-bottom:8px}.choice-heading strong{font-size:11px}.suggestion-list{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.suggestion-list button{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:3px;min-height:53px;padding:7px 8px;font-size:10px}.suggestion-list button:hover{transform:translateY(-2px)}.suggestion-list svg{display:none}.choice-index{font-size:7px}.galgame-composer{margin-top:8px;padding-bottom:8px}.composer-hint{display:none}.dialogue-box{left:14px;right:14px;bottom:14px;min-height:151px;padding:16px 17px 12px}.dialogue-text p{font-size:15px;line-height:1.75}.dialogue-footer span:last-child:not(.dialogue-next){display:none}.affinity-block{width:130px}.scene-shade{background:linear-gradient(0deg,rgba(7,7,16,.94),rgba(7,7,16,.18) 58%,rgba(9,8,18,.2))}}
@media(max-width:480px){.galgame-page{min-height:680px}.local-badge{padding:7px 9px;font-size:7px}.chapter-mark strong i,.chapter-mark strong{font-size:0;gap:0}.chapter-mark strong{font-size:10px}.character-portrait{height:54%;left:-10%;bottom:298px;max-width:92%}.choice-panel{bottom:177px}.suggestion-list button{font-size:9px;min-height:50px}.dialogue-topline>span{font-size:7px}.dialogue-text{margin-top:10px;min-height:57px}.dialogue-text p{font-size:14px}.affinity-label>span{display:none}.dialogue-footer{font-size:7px}}
@media(prefers-reduced-motion:reduce){.scene-crossfade-enter-active,.scene-crossfade-leave-active,.portrait-change-enter-active,.portrait-change-leave-active,.dialogue-line-enter-active,.dialogue-line-leave-active,.choice-reveal-enter-active,.choice-reveal-leave-active{transition-duration:.01ms}.waiting-dots i,.dialogue-next svg{animation:none}}

/* 立绘整体右移，避免贴边 */
@media(min-width:1181px){.character-portrait{left:4.5%}}

/* 移动端：竖屏提示 + 横屏全屏 */
.rotate-hint{display:none}
@media(max-width:900px) and (orientation:portrait){
  .rotate-hint{position:fixed;inset:0;z-index:80;display:grid;place-items:center;padding:28px;background:linear-gradient(160deg,#151221,#0a0818);text-align:center}
}
.rotate-hint-inner{display:flex;flex-direction:column;align-items:center;gap:12px;color:#d8cdf0}
.rotate-hint-inner svg{transform:rotate(90deg);color:#a58df0;animation:rotateNudge 2.4s ease-in-out infinite}
.rotate-hint-inner h3{font-size:17px}
.rotate-hint-inner p{font-size:11px;line-height:1.8;color:#9c90b8;max-width:240px}
.rotate-hint-inner button{margin-top:6px;padding:10px 20px;border:0;border-radius:12px;background:linear-gradient(135deg,#7b63d8,#5a48b0);color:#fff;font-size:12px;font-weight:600;cursor:pointer}
@keyframes rotateNudge{50%{transform:rotate(0deg)}}
@media(max-width:900px) and (orientation:landscape){
  .galgame-page{position:fixed;inset:0;z-index:70;height:100vh;min-height:0;border-radius:0;border:0;overflow:hidden}
  .scene-header{left:12px;right:12px;top:8px;transform:scale(.78);transform-origin:left top}
  .chapter-mark strong{font-size:11px;letter-spacing:1px}
  .chapter-mark>span,.chapter-mark small{font-size:8px}
  .local-badge{padding:4px 8px;font-size:8px}
  .character-portrait{left:16%;bottom:0;height:82vh;max-width:40%;object-fit:contain}
  .choice-panel{right:8px;top:8px;bottom:auto;width:210px;max-width:none;max-height:calc(100% - 150px);padding:10px;overflow-y:auto;transform:none}
  .choice-heading{margin-bottom:6px}
  .choice-heading strong,.choice-heading h3{font-size:11px}
  .choice-heading small,.choice-heading span{font-size:7px}
  .choice-panel button,.choice-panel li{font-size:11px;padding:7px 9px;border-radius:9px}
  .choice-panel svg{width:12px;height:12px}
  .dialogue-box{left:8px;right:8px;bottom:8px;min-height:0;padding:10px 14px 8px;border-radius:14px}
  .dialogue-topline>span{font-size:7px;letter-spacing:1px}
  .dialogue-box p,.dialogue-box .dialogue-text{font-size:15px;line-height:1.5}
  .dialogue-box .dialogue-meta,.dialogue-box .dialogue-footer{display:none}
  .affinity-block{width:120px}
  .affinity-label{font-size:8px}
}
.cg-layer{position:absolute;inset:0;z-index:9;display:grid;place-items:center;background:rgba(8,6,18,.72);backdrop-filter:blur(4px);cursor:pointer}
.cg-layer img{max-width:90%;max-height:78%;border-radius:16px;box-shadow:0 30px 80px rgba(0,0,0,.6);object-fit:contain;border:1px solid rgba(255,255,255,.18)}
.cg-enter-active,.cg-leave-active{transition:opacity .35s}
.cg-enter-from,.cg-leave-to{opacity:0}


.scene-background { animation: sceneFade var(--dur-4) var(--ease-soft) both; }
@keyframes sceneFade { from { opacity: 0; transform: scale(1.03); } to { opacity: 1; transform: none; } }

/* 对话推进：文本与选项分批淡入，读起来更有节奏 */
.dialogue-box .dialogue-text, .dialogue-box p, .dialogue-box .line { animation: dialogueIn var(--dur-3) var(--ease-soft) both; }
@keyframes dialogueIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.dialogue-choices button, .suggestions button { animation: riseIn var(--dur-3) var(--ease-soft) both; }
.dialogue-choices button:nth-child(2), .suggestions button:nth-child(2) { animation-delay: 50ms; }
.dialogue-choices button:nth-child(3), .suggestions button:nth-child(3) { animation-delay: 100ms; }
.dialogue-choices button:nth-child(4), .suggestions button:nth-child(4) { animation-delay: 150ms; }
</style>
