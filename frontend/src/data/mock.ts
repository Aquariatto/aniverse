import { seiraSystemPrompt } from './seiraPersona'

export interface Character {
  id: string
  name: string
  english: string
  title: string
  avatar: string
  color: string
  affinity: number
  level: string
  emotion: string
  status: 'online' | 'away'
  tags: string[]
  quote: string
  memoryCount: number
  days: number
  favorite: boolean
  personaPrompt?: string
}

export interface Message {
  id: number
  role: 'user' | 'assistant'
  content: string
  time: string
  emotion?: string
  images?: string[]
  /** 本地存储超出配额时，旧图片会被清理，但消息本身保留 */
  imageDropped?: boolean
  mode?: 'chat' | 'galgame'
  scene?: string
}

export interface Memory {
  id: number
  characterId: string
  type: 'fact' | 'preference' | 'event' | 'relationship'
  content: string
  source: 'chat' | 'story' | 'manual'
  importance: number
  time: string
  date: string
}

export interface Asset {
  id: number
  title: string
  image: string
  tags: string[]
  size: string
  favorite: boolean
  source: string
}

export interface WatchlistItem {
  id: number
  title: string
  jp: string
  image: string
  score: number
  tags: string[]
  status: string
  progress: number
  total: number
}

export const characters: Character[] = [
  {
    id: 'orihime', name: '白濑星罗', english: 'Shirase Seira', title: '星象记录者',
    avatar: '/images/seira-keyvisual.webp', color: '#8b76e8', affinity: 78, level: '亲近',
    emotion: '平静', status: 'online', tags: ['温柔', '敏锐', '有点倔强'],
    quote: '今夜的星轨很清楚。若你愿意，我们可以一起把这片天空读完。', memoryCount: 3, days: 18, favorite: true,
    personaPrompt: seiraSystemPrompt,
  },
  {
    id: 'mio', name: '白鸟澪', english: 'Shiratori Mio', title: '海风来信',
    avatar: '/images/mio-portrait.webp', color: '#52a9c6', affinity: 61, level: '亲近',
    emotion: '开心', status: 'online', tags: ['元气', '直率', '好奇'],
    quote: '天气这么好，不出门的话可就浪费啦！', memoryCount: 5, days: 12, favorite: false,
  },
  {
    id: 'nana', name: '橘奈奈', english: 'Tachibana Nana', title: '植物手记',
    avatar: '/images/nana-portrait.webp', color: '#d68b70', affinity: 42, level: '熟悉',
    emotion: '害羞', status: 'away', tags: ['安静', '细腻', '文艺'],
    quote: '我画了一片新叶子，你想第一个看看吗？', memoryCount: 4, days: 7, favorite: true,
  },
]

export const initialMessages: Record<string, Message[]> = {
  orihime: [
    { id: 1, role: 'assistant', content: '欢迎回来。今晚的观测记录显示，你的星座旁边多了一颗很亮的星。', time: '21:08', emotion: '开心' },
    { id: 2, role: 'user', content: '那今晚适合看星星吗？', time: '21:10' },
    { id: 3, role: 'assistant', content: '适合。云层刚好散开，望远镜也调好了。要不要一起看完这一页星图再回去？', time: '21:11', emotion: '温柔' },
    { id: 4, role: 'assistant', content: '对了，桌上那杯热牛奶记得喝，凉了就不好喝了。', time: '21:12', emotion: '温柔' },
  ],
  mio: [
    { id: 1, role: 'assistant', content: '你终于来啦！我刚发现一片超适合散步的海滩，夕阳把云染成橘子汽水了。', time: '18:26', emotion: '开心' },
    { id: 2, role: 'user', content: '那周末一起去看看吧，我带上相机。', time: '18:28' },
    { id: 3, role: 'assistant', content: '一言为定！我会记得带野餐垫。你可不许临时宅在家里哦。', time: '18:28', emotion: '期待' },
  ],
  nana: [
    { id: 1, role: 'assistant', content: '温室里的茉莉今天开了。我把它画在了手记的第 42 页。', time: '16:40', emotion: '平静' },
    { id: 2, role: 'user', content: '一定很漂亮，下次也想看看你的手记。', time: '16:43' },
    { id: 3, role: 'assistant', content: '好呀……只给你一个人看也没关系。', time: '16:44', emotion: '害羞' },
  ],
}

export const initialMemories: Memory[] = [
  { id: 2, characterId: 'orihime', type: 'preference', content: '你习惯在夜里整理星图，常常一看就是两三个小时。', source: 'chat', importance: 0.82, time: '21:12', date: '今天' },
  { id: 4, characterId: 'orihime', type: 'relationship', content: '在海边剧情中，你选择相信星罗，共同寻找失踪的星图。', source: 'story', importance: 0.95, time: '22:18', date: '10月30日' },
  { id: 5, characterId: 'orihime', type: 'preference', content: '比起热闹的聚会，你更喜欢安静的夜间散步。', source: 'manual', importance: 0.72, time: '19:05', date: '10月28日' },
  { id: 6, characterId: 'mio', type: 'event', content: '你们约好周末去海边散步，并由你带上相机。', source: 'chat', importance: 0.86, time: '18:28', date: '今天' },
  { id: 7, characterId: 'mio', type: 'preference', content: '你喜欢橘子汽水，以及雨后空气的味道。', source: 'chat', importance: 0.68, time: '12:08', date: '昨天' },
  { id: 8, characterId: 'nana', type: 'relationship', content: '奈奈愿意向你展示从未公开的植物手记。', source: 'chat', importance: 0.9, time: '16:44', date: '今天' },
  { id: 9, characterId: 'mio', type: 'fact', content: '你有一台常用的胶片相机，最喜欢记录黄昏和海边。', source: 'chat', importance: 0.76, time: '17:20', date: '昨天' },
  { id: 10, characterId: 'mio', type: 'relationship', content: '澪把你们的周末海边约定标记为“绝对不能取消”的重要日程。', source: 'story', importance: 0.93, time: '18:31', date: '11月1日' },
  { id: 11, characterId: 'mio', type: 'event', content: '你们在暴雨后一起看见了双彩虹，并约定保留那张失焦的照片。', source: 'story', importance: 0.88, time: '15:12', date: '10月29日' },
  { id: 12, characterId: 'nana', type: 'preference', content: '你喜欢茉莉清淡的香气，也喜欢翻纸质书时指尖的触感。', source: 'chat', importance: 0.74, time: '14:26', date: '昨天' },
  { id: 13, characterId: 'nana', type: 'event', content: '你帮奈奈修复了温室的旧喷壶，她把这个下午画进了手记。', source: 'story', importance: 0.86, time: '16:08', date: '11月1日' },
  { id: 14, characterId: 'nana', type: 'fact', content: '你在学习植物插画，已经能认出十二种常见的蕨类植物。', source: 'manual', importance: 0.7, time: '11:42', date: '10月30日' },
]

export const initialAssets: Asset[] = [
  { id: 1, title: '星象记录者 · 星罗', image: '/images/seira-keyvisual.webp', tags: ['角色立绘', '星空', '银发'], size: '1024 × 1536', favorite: true, source: '角色资产' },
  { id: 2, title: '黄昏海岸线', image: '/images/story-seaside.webp', tags: ['场景', '海边', '黄昏'], size: '1200 × 800', favorite: false, source: '剧情资产' },
  { id: 3, title: '海风来信 · 澪', image: '/images/mio-portrait.webp', tags: ['角色立绘', '海边', '蓝发'], size: '1024 × 1536', favorite: true, source: '角色资产' },
  { id: 4, title: '深空观测台', image: '/images/observatory.svg', tags: ['场景', '星空', '夜晚'], size: '1200 × 800', favorite: false, source: '剧情资产' },
  { id: 5, title: '植物手记 · 奈奈', image: '/images/nana-portrait.webp', tags: ['角色立绘', '温室', '暖色'], size: '1024 × 1536', favorite: false, source: '角色资产' },
  { id: 6, title: '午后温室', image: '/images/story-garden.webp', tags: ['场景', '温室', '午后'], size: '1200 × 800', favorite: true, source: '剧情资产' },
  { id: 7, title: '星罗 · 星夜特写', image: '/images/seira-keyvisual.webp', tags: ['表情', '温柔', '星空'], size: '1024 × 1536', favorite: false, source: '角色资产' },
  { id: 8, title: '澪 · 晴空特写', image: '/images/mio-portrait.webp', tags: ['表情', '开心', '海边'], size: '1024 × 1536', favorite: false, source: '角色资产' },
]

export const animeList = [
  { id: 1, title: '葬送的芙莉莲', jp: 'Frieren: Beyond Journey’s End', image: '/images/observatory.svg', score: 9.2, tags: ['奇幻', '治愈', '旅途'], status: '在看', progress: 18, total: 28 },
  { id: 2, title: '跃动青春', jp: 'Skip and Loafer', image: '/images/story-seaside.webp', score: 8.8, tags: ['校园', '青春', '日常'], status: '想看', progress: 0, total: 12 },
  { id: 3, title: '紫罗兰永恒花园', jp: 'Violet Evergarden', image: '/images/story-garden.webp', score: 9.0, tags: ['治愈', '成长', '文艺'], status: '看过', progress: 13, total: 13 },
  { id: 4, title: '孤独摇滚！', jp: 'Bocchi the Rock!', image: '/images/mio-portrait.webp', score: 8.9, tags: ['音乐', '日常', '搞笑'], status: '想看', progress: 0, total: 12 },
]
