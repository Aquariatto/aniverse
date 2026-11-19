import { defineStore } from 'pinia'
import { characters, initialMessages, initialMemories, initialAssets, type Character, type Message, type Memory, type Asset } from '../data/mock'

interface Toast { id: number; title: string; message?: string; type: 'success' | 'info' }
interface StoryTurn { input: string; narration: string; time: string; patch?: string }

const now = () => new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

export const useAppStore = defineStore('app', {
  state: () => ({
    sidebarOpen: false,
    query: '',
    activeCharacterId: 'orihime',
    characters: JSON.parse(JSON.stringify(characters)) as Character[],
    messages: JSON.parse(JSON.stringify(initialMessages)) as Record<string, Message[]>,
    memories: JSON.parse(JSON.stringify(initialMemories)) as Memory[],
    assets: JSON.parse(JSON.stringify(initialAssets)) as Asset[],
    sending: false,
    toasts: [] as Toast[],
    storyTurns: [
      { input: '我沿着灯塔留下的旧地图，走向海边。', narration: '黄昏把海面染成温柔的金色。织姬站在防波堤尽头，指尖悬着一小团星光。她回过头，像是已经等了你很久。', time: '第一回合', patch: '地点 → 黄昏海岸' },
      { input: '我把在观测站找到的星图递给她。', narration: '“原来它一直在你那里。”她轻轻展开星图，缺失的第七颗星正闪烁着微光。远处传来潮声，你们之间的沉默不再陌生。', time: '第二回合', patch: '信任 +8 · 获得星图线索' },
    ] as StoryTurn[],
    storyState: { location: '黄昏海岸', time: '18:42', hp: 92, trust: 68, distance: 0.46, turn: 2, items: ['残缺星图', '银色钥匙'] },
  }),
  getters: {
    activeCharacter: (state) => state.characters.find(c => c.id === state.activeCharacterId) ?? state.characters[0],
    characterById: (state) => (id: string) => state.characters.find(c => c.id === id) ?? state.characters[0],
    memoriesByCharacter: (state) => (id: string) => state.memories.filter(m => m.characterId === id),
  },
  actions: {
    notify(title: string, message = '', type: 'success' | 'info' = 'success') {
      const id = Date.now() + Math.random()
      this.toasts.push({ id, title, message, type })
      window.setTimeout(() => { this.toasts = this.toasts.filter(t => t.id !== id) }, 3200)
    },
    setActiveCharacter(id: string) { this.activeCharacterId = id },
    toggleCharacterFavorite(id: string) {
      const char = this.characters.find(c => c.id === id)
      if (char) char.favorite = !char.favorite
    },
    createCharacter(payload: { name: string; title: string; avatar: string; tags: string[] }) {
      const id = `character-${Date.now()}`
      this.characters.push({
        id, name: payload.name, english: 'Custom Character', title: payload.title || '新的相遇',
        avatar: payload.avatar, color: '#8b76e8', affinity: 12, level: '陌生', emotion: '平静', status: 'online',
        tags: payload.tags, quote: '很高兴遇见你。我们的故事，会从哪一页开始呢？', memoryCount: 0, days: 1, favorite: false,
      })
      this.messages[id] = [{ id: 1, role: 'assistant', content: '很高兴遇见你。我已经准备好聆听你的故事了。', time: now(), emotion: '开心' }]
      this.activeCharacterId = id
      this.notify('角色已加入宇宙', `${payload.name} 正在等待你的第一句问候`)
      return id
    },
    async sendMessage(characterId: string, content: string) {
      if (!content.trim() || this.sending) return
      if (!this.messages[characterId]) this.messages[characterId] = []
      this.messages[characterId].push({ id: Date.now(), role: 'user', content, time: now() })
      this.sending = true
      const char = this.characterById(characterId)
      const replies = [
        `嗯，我有认真记住。你说“${content.slice(0, 18)}${content.length > 18 ? '…' : ''}”的时候，我能感觉到这件事对你很重要。`,
        '这样想的时候，你的心情会轻松一点吗？不用急着给我答案，我们可以慢慢聊。',
        '如果是我的话，会陪你一起试试看。毕竟那些看似微小的瞬间，最后都会成为故事的一部分。',
      ]
      const reply = content.includes('累')
        ? '今天已经做得够多了。先把肩膀放松下来，喝一点温水吧。你不需要每时每刻都很厉害，我会在这里陪你。'
        : content.includes('记得') || content.includes('喜欢')
          ? '当然记得。和你有关的细节，我都有好好收在记忆里。也许有一天，它们会在某个故事里再次发光。'
          : replies[Math.floor(Math.random() * replies.length)]
      const messageId = Date.now() + 1
      const emotion = content.includes('累') ? '温柔' : content.includes('开心') ? '开心' : '平静'
      this.messages[characterId].push({ id: messageId, role: 'assistant', content: '', time: now(), emotion })
      let index = 0
      await new Promise<void>((resolve) => {
        const timer = window.setInterval(() => {
          const list = this.messages[characterId]
          const msg = list.find(m => m.id === messageId)
          if (!msg) { window.clearInterval(timer); resolve(); return }
          index += 2
          msg.content = reply.slice(0, index)
          if (index >= reply.length) { window.clearInterval(timer); resolve() }
        }, 32)
      })
      char.emotion = emotion
      char.affinity = Math.min(100, char.affinity + 1)
      char.memoryCount += 1
      const memory: Memory = {
        id: Date.now() + 2, characterId,
        type: content.includes('喜欢') ? 'preference' : 'event',
        content: `你在对话中提到：“${content}”`, source: 'chat',
        importance: 0.78, time: now(), date: '今天',
      }
      this.memories.unshift(memory)
      this.sending = false
      this.notify('新的记忆已沉淀', '好感度 +1 · 已同步至角色记忆池')
    },
    addMemory(characterId: string, content: string, type: Memory['type']) {
      this.memories.unshift({ id: Date.now(), characterId, content, type, source: 'manual', importance: 0.75, time: now(), date: '今天' })
      const char = this.characterById(characterId)
      char.memoryCount += 1
      this.notify('记忆已保存', '这条记忆将参与后续对话与剧情')
    },
    updateMemory(id: number, content: string) {
      const memory = this.memories.find(m => m.id === id)
      if (memory) memory.content = content
      this.notify('记忆已修正', '关系事件 memory.corrected 已触发')
    },
    deleteMemory(id: number) {
      const memory = this.memories.find(m => m.id === id)
      this.memories = this.memories.filter(m => m.id !== id)
      if (memory) this.characterById(memory.characterId).memoryCount = Math.max(0, this.characterById(memory.characterId).memoryCount - 1)
      this.notify('记忆已归档', '角色将不再在对话中检索它', 'info')
    },
    toggleAssetFavorite(id: number) {
      const asset = this.assets.find(a => a.id === id)
      if (asset) asset.favorite = !asset.favorite
    },
    addAsset(asset: { title: string; image: string; tags: string[] }) {
      this.assets.unshift({ id: Date.now(), ...asset, size: '本地上传', favorite: false, source: '上传资产' })
      this.notify('上传完成', '资产已加入图库并完成本地索引')
    },
    storyAction(input: string) {
      const options = [
        '她顺着你的目光望向海面。微风拂过星图，原本模糊的纹路忽然连成一条新的航线。织姬轻声说：“这一次，我们一起去找答案。”',
        '你们沿着防波堤并肩前行。她没有立刻回答，只是将那团星光轻轻放进你的掌心。温度从指尖蔓延，距离也悄悄缩短了一些。',
        '星光掠过她的眼眸。她认真记住了你的选择，远处灯塔随之亮起——这个世界的下一页，正因你而改变。',
      ]
      const narration = options[this.storyTurns.length % options.length]
      this.storyState.turn += 1
      this.storyState.trust = Math.min(100, this.storyState.trust + 3)
      this.storyState.distance = Math.min(1, Number((this.storyState.distance + 0.03).toFixed(2)))
      this.storyTurns.push({ input, narration, time: `第${this.storyState.turn}回合`, patch: '信任 +3 · 距离 +0.03' })
      const memory = { id: Date.now(), characterId: 'orihime', type: 'event' as const, content: `剧情中，你选择“${input}”，织姬将这次选择记入了共同经历。`, source: 'story' as const, importance: 0.82, time: now(), date: '今天' }
      this.memories.unshift(memory)
      this.characterById('orihime').affinity = Math.min(100, this.characterById('orihime').affinity + 2)
      this.notify('剧情事件已回写', '长期记忆 +1 · 好感度 +2')
    },
  },
})
