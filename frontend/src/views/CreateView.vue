<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, ArrowRight, Check, ChevronRight, Orbit, Sparkles, UserRound, WandSparkles } from 'lucide-vue-next'
import { useAppStore } from '../stores/app'
import { thumbUrl } from '../data/assets'
const store = useAppStore()
const router = useRouter()
const step = ref(1)
const selectedAvatar = ref('/images/seira-keyvisual.webp')
const form = reactive({ name: '清水遥', title: '月光收藏家', origin: '原创角色', description: '安静而敏锐，喜欢收集生活里微小的美好。会在月光下记录别人的故事，也悄悄珍藏自己的心情。', personality: ['温柔', '理性'], tone: '温柔治愈', warmth: 72, energy: 46, humor: 35 })
const avatars = [
  { image: '/images/seira-keyvisual.webp', label: '星海' },
  { image: '/images/mio-portrait.webp', label: '晴空' },
  { image: '/images/nana-portrait.webp', label: '花庭' },
]
const personalities = ['温柔', '理性', '元气', '傲娇', '安静', '幽默', '神秘', '直率']
const canNext = computed(() => form.name.trim().length > 0)
const togglePersonality = (tag: string) => {
  if (form.personality.includes(tag)) form.personality = form.personality.filter(t => t !== tag)
  else if (form.personality.length < 3) form.personality.push(tag)
}
const next = () => { if (canNext.value && step.value < 3) step.value++ }
const finish = () => {
  const id = store.createCharacter({
    name: form.name.trim(),
    title: form.title,
    avatar: selectedAvatar.value,
    tags: form.personality,
    description: form.description,
    tone: form.tone,
  })
  router.push(`/chat/${id}`)
}
</script>
<template>
  <div class="create-page">
    <div class="create-heading"><div><div class="eyebrow">A NEW SOUL IS BORN</div><h1>召唤新的角色</h1><p>赋予她名字、性格与一段可以被延续的故事。</p></div><button class="btn btn-ghost" @click="router.back()"><ArrowLeft :size="16" />返回</button></div>
    <div class="stepper">
      <template v-for="(item, index) in ['基础设定', '性格与语气', '确认相遇']" :key="item">
        <div class="step-item" :class="{ active: step === index + 1, done: step > index + 1 }" @click="step > index + 1 && (step = index + 1)"><span><Check v-if="step > index + 1" :size="14" /><template v-else>0{{ index + 1 }}</template></span><div><strong>{{ item }}</strong><small>{{ ['她的身份与形象', '独一无二的灵魂', '故事从这里开始'][index] }}</small></div></div>
        <ChevronRight v-if="index < 2" :size="16" class="step-arrow" />
      </template>
    </div>

    <div class="create-layout">
      <section class="card form-panel">
        <Transition name="page" mode="out-in">
          <div v-if="step === 1" key="step1" class="form-step">
            <div class="panel-title"><span><UserRound :size="19" /></span><div><h2>她是谁？</h2><p>先从一小段设定开始，之后随时可以修改。</p></div></div>
            <div class="two-fields"><div class="field"><label>角色名字</label><input v-model="form.name" class="input" maxlength="12" placeholder="例如：清水遥" /></div><div class="field"><label>角色称号</label><input v-model="form.title" class="input" placeholder="例如：月光收藏家" /></div></div>
            <div class="field"><label>角色来源</label><select v-model="form.origin" class="select"><option>原创角色</option><option>从番剧导入</option><option>基于模板创建</option></select></div>
            <div class="field"><label>人物小传</label><textarea v-model="form.description" class="textarea" rows="4" maxlength="160" /><span class="field-hint char-count">{{ form.description.length }} / 160</span></div>
            <div class="field avatar-field"><label>选择初始形象 <span>静态素材，可随时在图库替换</span></label><div class="avatar-options"><button v-for="avatar in avatars" :key="avatar.image" :class="{ selected: selectedAvatar === avatar.image }" @click="selectedAvatar = avatar.image"><img :src="thumbUrl(avatar.image)" loading="lazy" decoding="async" /><span>{{ avatar.label }}</span><i><Check :size="12" /></i></button></div></div>
          </div>
          <div v-else-if="step === 2" key="step2" class="form-step">
            <div class="panel-title"><span><WandSparkles :size="19" /></span><div><h2>塑造她的灵魂</h2><p>性格参数会影响对话语气与剧情中的选择。</p></div></div>
            <div class="field"><label>性格标签 <span>最多选择 3 项</span></label><div class="personality-options"><button v-for="tag in personalities" :key="tag" class="chip" :class="{ active: form.personality.includes(tag) }" @click="togglePersonality(tag)">{{ tag }}<Check v-if="form.personality.includes(tag)" :size="12" /></button></div></div>
            <div class="field"><label>对话风格</label><div class="tone-options"><button v-for="tone in ['温柔治愈', '轻松活泼', '冷静理性']" :key="tone" :class="{ active: form.tone === tone }" @click="form.tone = tone">{{ tone }}</button></div></div>
            <div class="sliders">
              <div class="slider-field"><div><label>温柔细腻</label><span>{{ form.warmth }}%</span></div><input v-model="form.warmth" type="range" min="0" max="100" /><p>更愿意倾听，也更善于察觉情绪</p></div>
              <div class="slider-field"><div><label>活力表达</label><span>{{ form.energy }}%</span></div><input v-model="form.energy" type="range" min="0" max="100" /><p>影响回复节奏与主动分享的程度</p></div>
              <div class="slider-field"><div><label>幽默感</label><span>{{ form.humor }}%</span></div><input v-model="form.humor" type="range" min="0" max="100" /><p>偶尔的小玩笑，让相处更轻松</p></div>
            </div>
            <div class="prompt-preview"><div><Sparkles :size="14" />人格提示词预览</div><p>你是{{ form.name }}，一位{{ form.title }}。性格{{ form.personality.join('、') }}，以{{ form.tone }}的方式与人交流。你会珍视共同记忆，并在每一次相遇中保持真实的自己。</p></div>
          </div>
          <div v-else key="step3" class="form-step confirm-step">
            <div class="panel-title"><span><Orbit :size="19" /></span><div><h2>准备好相遇了吗？</h2><p>确认设定后，她就会加入你的角色宇宙。</p></div></div>
            <div class="confirm-quote">“ 很高兴遇见你。我们的故事，<br />会从哪一页开始呢？ ”</div>
            <div class="confirm-list"><div><span>名字与称号</span><strong>{{ form.name }} · {{ form.title }}</strong></div><div><span>角色来源</span><strong>{{ form.origin }}</strong></div><div><span>性格与语气</span><strong>{{ form.personality.join(' / ') }} · {{ form.tone }}</strong></div><div><span>初始记忆池</span><strong>已初始化，等待第一段共同记忆</strong></div></div>
            <div class="confirm-notice"><Sparkles :size="16" /><p>完成创建后将进入陪伴对话。所有对话、记忆和好感度均为本地可交互演示数据。</p></div>
          </div>
        </Transition>
        <div class="form-actions"><button v-if="step > 1" class="btn btn-secondary" @click="step--"><ArrowLeft :size="15" />上一步</button><span v-else /><button v-if="step < 3" class="btn btn-primary" :disabled="!canNext" @click="next">继续<ArrowRight :size="15" /></button><button v-else class="btn btn-primary summon-btn" @click="finish"><Sparkles :size="16" />完成召唤</button></div>
      </section>

      <aside class="preview-panel">
        <div class="preview-label"><span>LIVE PREVIEW</span><i /></div>
        <div class="preview-card" :class="`tone-${form.tone}`">
          <div class="preview-image"><img :src="thumbUrl(selectedAvatar)" decoding="async" /><div class="preview-gradient" /><div class="preview-status"><i />灵魂信号已连接</div><div class="preview-name"><small>{{ form.origin }}</small><h2>{{ form.name || '未命名角色' }}</h2><p>{{ form.title || '新的相遇' }}</p></div></div>
          <div class="preview-body"><div class="preview-tags"><span v-for="tag in form.personality" :key="tag">{{ tag }}</span></div><p>{{ form.description || '为她写下第一段人物小传…' }}</p><div class="preview-affinity"><span>初始好感度</span><div><i /></div><strong>12</strong></div></div>
        </div>
        <p class="preview-hint"><Sparkles :size="13" />人物小传与语气会写入她的人格提示词</p>
      </aside>
    </div>
  </div>
</template>
<style scoped>
.create-heading{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:25px}.create-heading h1{font-size:28px}.create-heading p{margin-top:7px;color:var(--muted);font-size:12px}.stepper{display:flex;align-items:center;justify-content:center;gap:25px;margin:0 auto 27px}.step-item{display:flex;align-items:center;gap:10px;color:#aaa5b3;cursor:default}.step-item>span{width:32px;height:32px;display:grid;place-items:center;border:1px solid #dfdce6;border-radius:10px;font-size:10px;font-weight:600}.step-item strong,.step-item small{display:block}.step-item strong{font-size:11px}.step-item small{margin-top:3px;font-size:8px;color:#b2adba}.step-item.active{color:#7361d2}.step-item.active>span{border-color:#8d7ae0;background:#7b69db;color:white;box-shadow:0 6px 15px rgba(117,102,232,.2)}.step-item.done{color:#777183;cursor:pointer}.step-item.done>span{background:#ece8fb;border-color:#ddd6f5;color:#7e6bd6}.step-arrow{color:#d4d0dc}.create-layout{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(280px,.75fr);gap:28px;max-width:1100px;margin:0 auto;align-items:start}.form-panel{padding:28px 30px 20px}.panel-title{display:flex;align-items:center;gap:12px;margin-bottom:25px}.panel-title>span{width:40px;height:40px;display:grid;place-items:center;border-radius:12px;background:#efecff;color:#7d6bda}.panel-title h2{font-size:17px}.panel-title p{margin-top:4px;color:#a19baa;font-size:10px}.form-step{display:flex;flex-direction:column;gap:18px;min-height:450px}.two-fields{display:grid;grid-template-columns:1fr 1fr;gap:14px}.field label span{float:right;color:#b0aab8;font-size:9px;font-weight:400}.char-count{text-align:right;margin-top:-4px}.avatar-options{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.avatar-options button{position:relative;height:120px;padding:0;overflow:hidden;border:2px solid transparent;border-radius:14px;background:#eee}.avatar-options img{width:100%;height:100%;object-fit:cover;object-position:center 20%}.avatar-options button>span{position:absolute;left:8px;bottom:7px;padding:3px 7px;border-radius:6px;background:rgba(255,255,255,.8);color:#6d6579;font-size:9px}.avatar-options button>i{position:absolute;right:7px;top:7px;width:20px;height:20px;display:none;place-items:center;border-radius:50%;background:#7c69dc;color:white}.avatar-options button.selected{border-color:#8b78e0;box-shadow:0 0 0 3px #eeeafd}.avatar-options button.selected>i{display:grid}.personality-options{display:flex;flex-wrap:wrap;gap:8px}.personality-options .chip{display:flex;align-items:center;gap:5px}.tone-options{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.tone-options button{height:42px;border:1px solid var(--line);border-radius:12px;background:white;color:#918b9b;font-size:11px}.tone-options button.active{border-color:#bcb0ee;background:#f1edff;color:#7361ce;font-weight:600}.sliders{display:flex;flex-direction:column;gap:16px}.slider-field>div{display:flex;justify-content:space-between}.slider-field label{font-size:11px;font-weight:600}.slider-field span{font-size:10px;color:#7f6bd5}.slider-field input{width:100%;height:4px;margin:10px 0 5px;accent-color:#806ee0;cursor:pointer}.slider-field p{font-size:9px;color:#aaa4b2}.prompt-preview{padding:14px;border:1px solid #e9e4f7;border-radius:13px;background:#faf8ff}.prompt-preview>div{display:flex;align-items:center;gap:6px;color:#8674d6;font-size:10px;font-weight:600}.prompt-preview p{margin-top:8px;color:#8c849c;font-size:10px;line-height:1.8}.form-actions{display:flex;justify-content:space-between;margin-top:23px;padding-top:18px;border-top:1px solid var(--line)}.summon-btn{min-width:130px}.preview-panel{position:sticky;top:100px;padding-top:10px}.preview-label{display:flex;align-items:center;justify-content:space-between;margin:0 5px 12px;color:#a09aaa;font-size:8px;letter-spacing:1.6px}.preview-label i{width:6px;height:6px;border-radius:50%;background:#67bba1;box-shadow:0 0 0 4px #e4f3ed}.preview-card{overflow:hidden;border-radius:25px;background:white;box-shadow:0 20px 50px rgba(50,38,85,.12);border:1px solid #e8e4ef}.preview-image{position:relative;height:350px;overflow:hidden}.preview-image>img{width:100%;height:100%;object-fit:cover;object-position:center 18%}.preview-gradient{position:absolute;inset:0;background:linear-gradient(to bottom,rgba(30,20,50,.12),transparent 45%,rgba(30,22,45,.75))}.preview-status{position:absolute;top:15px;left:15px;display:flex;align-items:center;gap:5px;padding:5px 9px;border-radius:20px;background:rgba(255,255,255,.75);color:#71687e;font-size:8px;backdrop-filter:blur(8px)}.preview-status i{width:5px;height:5px;border-radius:50%;background:#60b99e}.preview-name{position:absolute;left:22px;bottom:20px;color:white}.preview-name small{font-size:8px;opacity:.75;letter-spacing:1px}.preview-name h2{margin-top:5px;font-size:24px;letter-spacing:1px}.preview-name p{margin-top:4px;font-size:10px;opacity:.8}.preview-body{padding:18px 20px}.preview-tags{display:flex;gap:6px}.preview-tags span{padding:4px 8px;border-radius:7px;background:#f0edfa;color:#8170cf;font-size:8px}.preview-body>p{height:47px;margin-top:12px;color:#918b9b;font-size:9px;line-height:1.8;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.preview-affinity{display:flex;align-items:center;gap:10px;margin-top:16px;font-size:9px;color:#aaa4b2}.preview-affinity>div{flex:1;height:4px;border-radius:5px;background:#efedf3}.preview-affinity i{display:block;width:12%;height:100%;border-radius:5px;background:#8c79df}.preview-affinity strong{color:#7a68ce}.preview-hint{display:flex;align-items:center;justify-content:center;gap:5px;margin-top:14px;color:#aaa4b2;font-size:9px}.confirm-quote{padding:28px;text-align:center;border-radius:16px;background:linear-gradient(135deg,#f1edff,#faf5f7);color:#746783;font-family:serif;font-size:16px;line-height:2}.confirm-list>div{display:flex;justify-content:space-between;gap:20px;padding:13px 2px;border-bottom:1px solid #f0edf3;font-size:10px}.confirm-list span{color:#a39dab}.confirm-list strong{color:#645d70;text-align:right}.confirm-notice{display:flex;gap:9px;padding:13px;border-radius:12px;background:#f3f8f5;color:#68a18d}.confirm-notice p{font-size:9px;line-height:1.7;color:#82988f}
@media(max-width:1000px){.create-layout{grid-template-columns:1fr 300px;gap:20px}.form-panel{padding:24px}.preview-image{height:310px}}@media(max-width:820px){.create-layout{grid-template-columns:1fr}.preview-panel{display:none}.stepper{gap:12px}.step-item small{display:none}.form-step{min-height:auto}}@media(max-width:560px){.stepper{justify-content:space-between}.step-item{gap:6px}.step-item>span{width:28px;height:28px}.step-item strong{font-size:9px}.step-arrow{width:12px}.form-panel{padding:20px 16px}.two-fields{grid-template-columns:1fr}.create-heading .btn{display:none}.avatar-options button{height:100px}.tone-options{grid-template-columns:1fr}.confirm-list>div{flex-direction:column;gap:5px}.confirm-list strong{text-align:left}}
</style>
