import http from 'node:http'
import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import zlib from 'node:zlib'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
/**
 * 生图请求日志：每笔落一行 JSONL，方便事后核对"这台服务器到底发了什么请求"。
 * 放在 data/ 目录（不进 dist，部署不会覆盖），超过 4MB 自动轮转一份。
 */
const callLogDir = path.join(rootDir, 'data')
const callLogFile = path.join(callLogDir, 'image-calls.jsonl')

const appendImageLog = (entry) => {
  try {
    fs.mkdirSync(callLogDir, { recursive: true })
    try {
      const stat = fs.statSync(callLogFile)
      if (stat.size > 4 * 1024 * 1024) fs.renameSync(callLogFile, `${callLogFile}.1`)
    } catch { /* 文件还不存在 */ }
    fs.appendFileSync(callLogFile, JSON.stringify(entry) + '\n')
  } catch (error) {
    console.error('[image-log] write failed:', String(error).slice(0, 120))
  }
}

/**
 * 安全解析请求 URL：扫描器会发 `//?phpinfo=1` 这种协议相对路径，
 * new URL 直接抛 ERR_INVALID_URL，之前把整个进程打挂了。
 */
/**
 * 上游哪些错误值得重试。
 * poll_timeout / temporary_generation_error 都是"等待出图超时"，
 * 上游对失败请求不扣费，所以自动重试等于白赚一次机会。
 */
const RETRYABLE_UPSTREAM = /poll_timeout|temporary_generation_error|upstream_error|rate_limit|no_available_account|未生成所请求的输出格式|请重试|稍后重试|暂时|\b50[234]\b/i

const safeUrl = (raw) => {
  try {
    return new URL(raw || '/', 'http://localhost')
  } catch {
    return new URL('http://localhost/')
  }
}

const distDir = path.join(rootDir, 'dist')
/** /api/image/models 的短缓存：上游模型列表变化很慢，没必要每次都打 */
let imageModelsCache = null
/** 允许前端选择的生图模型（上游 /v1/models 里实测可用的子集，未指定时用默认那个） */
const DEFAULT_IMAGE_MODEL = 'gpt-image-2.6-sunburst'
const IMAGE_MODEL_WHITELIST = [
  // 标准：走 ChatGPT Web 链路，按张固定计费
  'gpt-image-2.5-sunburst',
  'gpt-image-2.5-flare',
  'gpt-image-2.6-sunburst',
  'gpt-image-2.6-flare',
  'gpt-image-2',
  'gemini-nano-banana-2.1',
  'grok-imagine-image-2.0',
  // 官方 Key 渠道：按上游 token 计费、原生像素，不支持 Mask/markup/GIF/SVG
  'gpt-image-2.5-flare-official',
  'gpt-image-2.5-sunburst-official',
  'gpt-image-2.6-flare-official',
  'gpt-image-2.6-sunburst-official',
]
const apiKey = process.env.DEEPSEEK_API_KEY
const baseUrl = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '')
const model = process.env.DEEPSEEK_MODEL || 'deepseek-flash'
const port = Number(process.env.PORT || 8787)
const host = process.env.HOST || '127.0.0.1'

const emotions = ['开心大笑', '害羞脸红', '惊讶', '生气嘟嘴', '难过含泪', '面无表情', '困倦打哈欠', '自信得意', '兴奋欢呼', '温柔微笑']
const scenes = ['学校教室', '现代公寓客厅', '便利店', '学校天台', '图书馆', '小咖啡馆', '地铁站台', '公园长椅', '雨夜街道', '樱花步道', '海边沙滩', '学校操场', '走廊', '黄昏天台', '自助洗衣店', '夜晚阳台', '自习室', '超市', '人行天桥', '河堤', '游乐园', '车站候车室', '书店', '宿舍房间', '花店']
const fallbackSuggestions = ['继续这个话题', '我想听听你的想法', '换个话题吧']
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const numberValue = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback
const textValue = (value, fallback = '') => typeof value === 'string' && value.trim() ? value.trim() : fallback

function characterPrompt(character = {}) {
  const name = textValue(character.name, '白濑星罗')
  const title = textValue(character.title, '星象记录者')
  const persona = textValue(character.personaPrompt, `你是${name}，称号“${title}”。保持温柔、真诚、连续的伙伴关系，使用自然简洁的中文。`)
  return `${persona}\n\n当前角色：${name}（${title}）。必须始终保持这个独立角色的人格与语言习惯。`
}

function cleanHistory(history) {
  if (!Array.isArray(history)) return []
  return history.slice(-24).filter(item => item && (item.role === 'user' || item.role === 'assistant')).map(item => ({
    role: item.role,
    content: textValue(item.content).slice(0, 4000),
  })).filter(item => item.content)
}

function storyHistory(history) {
  if (!Array.isArray(history)) return []
  return history.slice(-12).flatMap(turn => [
    { role: 'user', content: textValue(turn?.input).slice(0, 2000) },
    { role: 'assistant', content: textValue(turn?.narration).slice(0, 4000) },
  ]).filter(item => item.content)
}

function currentContent(input, images) {
  const text = textValue(input, '请看看这张图片，并告诉我你的想法。')
  const validImages = Array.isArray(images) ? images.filter(image => typeof image === 'string' && /^data:image\/(png|jpe?g|webp);base64,/.test(image)).slice(0, 2) : []
  if (!validImages.length) return text
  return [
    { type: 'text', text },
    ...validImages.map(url => ({ type: 'image_url', image_url: { url } })),
  ]
}

function parseModelJson(content) {
  const text = Array.isArray(content) ? content.map(part => part?.text || '').join('') : String(content || '')
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  try { return JSON.parse(cleaned) } catch { /* 尝试从带解释的回答中提取 JSON */ }
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1))
  throw new Error('模型未返回有效 JSON')
}

const EMOTION_HINTS = [
  ['开心大笑', /哈哈|开心|高兴|太好了|笑/],
  ['害羞脸红', /害羞|脸红|不好意思|别看我/],
  ['惊讶', /惊讶|诶|欸|咦|居然|没想到|怎么会|真的吗/],
  ['生气嘟嘴', /生气|哼|不满|讨厌/],
  ['难过含泪', /难过|伤心|哭|遗憾|对不起|委屈/],
  ['生气嘟嘴', /烦|郁闷|不爽|凭什么|气死/],
  ['面无表情', /无奈|算了|随便|没劲|无感|叹气|不知道该怎么接|愣/],
  ['困倦打哈欠', /困|睡|哈欠|好累|打哈欠|犯困/],
  ['自信得意', /当然|那当然|得意|小意思/],
  ['兴奋欢呼', /兴奋|哇|冲|走起/],
]
const SCENE_HINTS = [
  ['海边沙滩', /海边|沙滩|海浪/], ['学校教室', /教室/], ['图书馆', /图书馆/],
  ['小咖啡馆', /咖啡/], ['便利店', /便利店/], ['学校天台', /天台/],
  ['走廊', /走廊/], ['宿舍房间', /宿舍/], ['公园长椅', /公园|长椅/],
  ['书店', /书店/], ['花店', /花店/], ['车站候车室', /车站/],
  ['超市', /超市/], ['河堤', /河堤|河边/], ['学校操场', /操场/],
  ['游乐园', /游乐园|摩天轮/], ['夜晚阳台', /阳台/], ['自助洗衣店', /洗衣/],
  ['自习室', /自习/], ['人行天桥', /天桥/], ['樱花步道', /樱花/],
  ['雨夜街道', /雨|街道|街角/], ['现代公寓客厅', /公寓|客厅/],
]
function inferFields(text, userInput = '') {
  const plain = String(text || '').replace(/\s+/g, ' ').trim()
  const said = String(userInput || '')
  let emotion = '温柔微笑'
  for (const [name, re] of EMOTION_HINTS) if (re.test(plain)) { emotion = name; break }
  let scene = null
  for (const [name, re] of SCENE_HINTS) if (re.test(plain)) { scene = name; break }
  const cold = /不用|算了|随便|先走|先回|没兴趣|不想|别烦|无聊|我很忙|走了|拜拜/.test(said)
  const warm = /谢谢|喜欢|开心|陪我|好啊|好的|一起/.test(said)
  const delta = cold ? -2 : warm ? 2 : 1
  return { reply: plain.slice(0, 300), emotion, scene, affinityDelta: delta }
}
async function callDeepSeek({ system, history, input, images }) {
  if (!apiKey) throw new Error('服务端缺少 DEEPSEEK_API_KEY')
  // 去重：前端已把当前这条推进历史，末尾若是 user 就丢掉，避免连续两条 user
  const trimmed = [...history]
  while (trimmed.length && trimmed[trimmed.length - 1].role === 'user') trimmed.pop()
  const messages = [
    { role: 'system', content: system },
    ...trimmed.slice(-8),
    { role: 'user', content: currentContent(input, images) },
  ]

  const ask = async (extra) => {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages,
        thinking: { type: 'enabled' },
        reasoning_effort: 'low',
        stream: false,
        max_tokens: 1600,
        ...extra,
      }),
      signal: AbortSignal.timeout(90000),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data?.error?.message || `DeepSeek HTTP ${response.status}`)
    const raw = data?.choices?.[0]?.message?.content
    if (!raw || !String(raw).trim()) throw new Error('模型返回空内容')
    try { return { result: parseModelJson(raw), usage: data?.usage } }
    catch { return { result: inferFields(raw, typeof input === 'string' ? input : ''), usage: data?.usage } }
  }

  const variants = [{}, { response_format: { type: 'json_object' } }, { response_format: { type: 'json_object' }, temperature: 1.0 }, { temperature: 1.15 }]
  let lastError
  for (let attempt = 0; attempt < variants.length; attempt += 1) {
    try {
      return await ask(variants[attempt])
    } catch (error) {
      lastError = error
      await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)))
    }
  }
  throw lastError || new Error('模型无响应')
}
async function generateSuggestions({ reply, userInput, characterName }) {
  if (!apiKey) return []
  const system = [
    '你是 Galgame 的选项生成器。根据角色刚说的一句话，输出恰好 3 行玩家回应，格式严格为：',
    'A|第一行：积极推进，顺着话题往前走；',
    'B|第二行：追问细节或表达情绪；',
    'C|第三行：消极或疏离。必须是冷淡、敷衍、拒绝、唱反调或想结束话题的语气，例如「哦，这样啊」「随便吧」「我先去忙了」。',
    '硬性要求：C 不能是提问，不能带问号，不能出现「吗/呢/吧」，C 的主动程度必须明显低于 A。每条不超过 18 个汉字，不要额外解释。',
  ].join('\n')
  const ask = async (extraSystem) => {
    const messages = [
      { role: 'system', content: system + (extraSystem ? '\n' + extraSystem : '') },
      { role: 'user', content: `角色（${characterName || '她'}）说：「${String(reply).slice(0, 200)}」\n玩家上一句：「${String(userInput).slice(0, 120)}」` },
    ]
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, thinking: { type: 'disabled' }, max_tokens: 220, temperature: 1.0, stream: false }),
      signal: AbortSignal.timeout(20000),
    })
    const data = await response.json().catch(() => ({}))
    const text = String(data?.choices?.[0]?.message?.content || '')
    const lines = text.split(/\r?\n/).map(line => line.replace(/^\s*[ABCabc]\s*[|｜:：]\s*/, '').replace(/^[\s\d.、）)]+/, '').replace(/^["'「」]+|["'「」]+$/g, '').trim()).filter(line => line.length >= 2 && line.length <= 24)
    return [...new Set(lines)].slice(0, 3)
  }
  const COLD = /不用|算了|随便|先走|先回|没兴趣|不想|别烦|无聊|走了|拜拜|不了|自己待|哦[，。]|嗯[，。]|懒得|下次吧/
  const WARM = /谢谢|一起|陪你|好呀|好啊|当然|喜欢/
  const isCold = (line) => COLD.test(line) && !WARM.test(line)
  const TEMPLATES = ['……嗯，随便吧。', '哦，我知道了。', '不用了，我先走了。', '算了，没什么。']
  try {
    let list = await ask('')
    if (list.length === 3 && !isCold(list[2])) {
      const retry = await ask('上一次第三行不够冷淡。这次第三行必须是明确的敷衍或拒绝，例如「哦，这样啊」「算了，不想说了」，不要提问，不要表达感谢。')
      if (retry.length === 3 && isCold(retry[2])) list = retry
    }
    if (list.length === 3 && !isCold(list[2])) {
      list[2] = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)]
    }
    return list
  } catch {
    return []
  }
}
function suggestionsValue(value) {
  const source = Array.isArray(value) ? value.filter(item => typeof item === 'string' && item.trim()).map(item => item.trim()) : []
  return [...new Set([...source, ...fallbackSuggestions])].slice(0, 3)
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(payload))
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', chunk => {
      body += chunk
      if (body.length > 16 * 1024 * 1024) {
        reject(new Error('请求体超过 16 MB 限制'))
        req.destroy()
      }
    })
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')) } catch { reject(new Error('请求 JSON 格式错误')) }
    })
    req.on('error', reject)
  })
}

// 场景描述向量只算一次，之后所有回合复用（原先每轮都重算 25 条）
let sceneVectorCache = null

// ---- 空白画布：上游只接受「图生图」，纯文生图就用一张空白底图，画面交给提示词 ----
const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()
function crc32(buffer) {
  let c = -1
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}
function pngChunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typeBuffer = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])))
  return Buffer.concat([length, typeBuffer, data, crc])
}
const blankCanvasCache = new Map()
function blankCanvas(width, height) {
  const key = `${width}x${height}`
  const cached = blankCanvasCache.get(key)
  if (cached) return cached
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8   // 位深
  ihdr[9] = 2   // truecolor RGB
  const row = Buffer.alloc(width * 3 + 1)
  for (let x = 0; x < width; x += 1) {
    row[1 + x * 3] = 247
    row[2 + x * 3] = 245
    row[3 + x * 3] = 250
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
  if (blankCanvasCache.size > 12) blankCanvasCache.clear()
  blankCanvasCache.set(key, png)
  return png
}
function blankSize(ratio) {
  const matched = /^(\d{1,2}):(\d{1,2})$/.exec(String(ratio || ''))
  const width = matched ? Number(matched[1]) : 1
  const height = matched ? Number(matched[2]) : 1
  if (!width || !height) return [1024, 1024]
  const long = 1024
  return width >= height
    ? [long, Math.max(128, Math.round((long * height) / width))]
    : [Math.max(128, Math.round((long * width) / height)), long]
}
const KNOWN_RATIOS = ['1:1', '5:4', '9:16', '21:9', '16:9', '4:3', '3:2', '4:5', '3:4', '2:3']

// ---------------------------------------------------------------------------
// 音乐点播（网易云非官方接口：搜索 → 打分 → 取可播地址 → 代理音频流）
// 参考：D:\harness\bililive-song\网易云点歌-接入文档.md
// ---------------------------------------------------------------------------
const NETEASE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Referer: 'https://music.163.com/',
  Origin: 'https://music.163.com',
}
const NETEASE_COOKIE = String(process.env.NETEASE_COOKIE || '').trim()
const MUSIC_PENALTY_WORDS = ['伴奏', '纯音乐', '钢琴版', '吉他版', 'dj版', 'remix', '翻唱', '片段', '试听', '铃声', '慢速', '加速', '八音盒', '女声', '男声', '童声']
const musicSearchCache = new Map()
const musicUrlCache = new Map()
const MUSIC_CACHE_TTL = 10 * 60 * 1000

async function neteaseGet(url, extraHeaders = {}) {
  return fetch(url, {
    headers: { ...NETEASE_HEADERS, ...(NETEASE_COOKIE ? { Cookie: NETEASE_COOKIE } : {}), ...extraHeaders },
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
  })
}

const normMusicText = (value) => String(value || '').toLowerCase()
  .replace(/[\(（\[【].*?[\)）\]】]/g, '')
  .replace(/[^\w\u4e00-\u9fff]+/g, '')

/** 二元组 Dice 系数，替代 Python 的 SequenceMatcher，够用来排序 */
function diceSimilarity(a, b) {
  if (!a || !b) return 0
  if (a === b) return 1
  const grams = (text) => {
    const map = new Map()
    for (let i = 0; i < text.length - 1; i += 1) {
      const gram = text.slice(i, i + 2)
      map.set(gram, (map.get(gram) || 0) + 1)
    }
    return map
  }
  const ga = grams(a)
  const gb = grams(b)
  let overlap = 0
  let total = 0
  ga.forEach((count, gram) => { total += count; const other = gb.get(gram); if (other) overlap += Math.min(count, other) })
  gb.forEach((count) => { total += count })
  return total ? (2 * overlap) / total : 0
}

function scoreMusic(song, query) {
  const q = normMusicText(query)
  const t = normMusicText(song.name)
  if (!t) return -999
  let score
  if (t === q) score = 12
  else if (t && q.includes(t)) score = (10 * t.length) / Math.max(q.length, 1)
  else if (q && t.includes(q)) score = 6
  else score = diceSimilarity(q, t) * 5
  const lowerQuery = String(query || '').toLowerCase()
  // 双向匹配：既支持「晴天 周杰伦」（请求里含歌手），也支持「塞壬唱片」
  // 这种「请求就是厂牌/歌手名，而歌手字段是塞壬唱片-MSR」的反向情况
  const hit = (names) => String(names || '').split('/').some(name => {
    const normalized = name.trim().toLowerCase()
    if (!normalized) return false
    return lowerQuery.includes(normalized) || (lowerQuery.length >= 2 && normalized.includes(lowerQuery))
  })
  if (hit(song.artists)) score += 6
  if (hit(song.origin)) score += 3
  const lowerName = String(song.name || '').toLowerCase()
  if (MUSIC_PENALTY_WORDS.some(word => lowerName.includes(word) && !lowerQuery.includes(word))) score -= 4
  if (song.durationMs > 0 && song.durationMs < 45000) score -= 8
  else if (song.durationMs > 600000) score -= 4
  score += (Math.min(Number(song.pop) || 0, 100) / 100) * 2
  return Number(score.toFixed(2))
}

function parseNeteaseSongs(payload) {
  const raw = payload?.result?.songs || []
  const songs = []
  for (const item of raw) {
    try {
      const artists = (item.ar || item.artists || []).map(artist => artist?.name || '').filter(Boolean).join('/')
      const album = item.al || item.album || {}
      const pic = String(album.picUrl || '').trim()
      const origin = (item.originSongSimpleData?.artists || []).map(artist => artist?.name || '').filter(Boolean).join('/')
      songs.push({
        id: Number(item.id),
        name: String(item.name || ''),
        artists,
        album: String(album.name || ''),
        durationMs: Number(item.dt || item.duration || 0),
        fee: Number(item.fee || 0),
        pop: Number(item.pop || 0),
        cover: pic ? `${pic}?param=240y240` : '',
        origin,
      })
    } catch { /* 单条异常跳过 */ }
  }
  return songs
}

async function neteaseSearch(keyword, limit = 12) {
  const tryUrls = [
    `https://music.163.com/api/cloudsearch/pc?s=${encodeURIComponent(keyword)}&type=1&limit=${limit}&offset=0`,
    `https://music.163.com/api/search/get/web?s=${encodeURIComponent(keyword)}&type=1&limit=${limit}&offset=0`,
  ]
  for (const url of tryUrls) {
    try {
      const response = await neteaseGet(url)
      const payload = await response.json().catch(() => ({}))
      const songs = parseNeteaseSongs(payload)
      if (songs.length) return songs
    } catch { /* 换下一个接口 */ }
  }
  return []
}

/** 搜索 + 多路查询 + 去重 + 打分排序（支持「歌名 歌手」「歌名 - 歌手」）
 *  返回前先并行探测可播性：能播的排前面，避免用户点了 VIP 歌播不出来 */
async function findByKeyword(query, limit = 8) {
  const cached = musicSearchCache.get(query)
  if (cached && Date.now() - cached.at < MUSIC_CACHE_TTL) return cached.songs
  const queries = [query]
  for (const separator of [' - ', '－', '—', '-']) {
    if (query.includes(separator)) {
      const parts = query.split(separator).map(part => part.trim()).filter(Boolean)
      if (parts.length === 2) queries.push(...parts)
      break
    }
  }
  const seen = new Map()
  for (const item of queries) {
    for (const song of await neteaseSearch(item)) {
      if (!seen.has(song.id)) seen.set(song.id, song)
    }
  }
  const ranked = [...seen.values()]
    .map(song => ({ ...song, score: scoreMusic(song, query) }))
    .filter(song => song.score >= 5)   // 低于 5 分基本是「没搜到」，别硬给结果
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  const probed = await Promise.all(ranked.slice(0, 5).map(async (song) => ({
    song,
    url: await resolveAudioUrl(song.id).catch(() => ''),
  })))
  const playableMap = new Map(probed.map(item => [item.song.id, Boolean(item.url)]))
  const playable = probed.filter(item => item.url).map(item => item.song)
  const playableIds = new Set(playable.map(song => song.id))
  const songs = [...playable, ...ranked.filter(song => !playableIds.has(song.id))]
    .slice(0, limit)
    .map(song => ({ ...song, playable: playableMap.get(song.id) ?? null }))

  if (musicSearchCache.size > 80) musicSearchCache.clear()
  musicSearchCache.set(query, { at: Date.now(), songs })
  return songs
}

const CDN_HOST_RE = /^m\d+\.music\.126\.net$/
function swapMusicHost(url, host) {
  try {
    const parsed = new URL(url)
    if (!CDN_HOST_RE.test(parsed.hostname)) return ''
    parsed.hostname = host
    return parsed.toString()
  } catch { return '' }
}

/** 探测一个候选地址到底是不是音频（失败时网易云也返回 200 + HTML，必须看 Content-Type） */
async function probeAudio(url) {
  try {
    const response = await neteaseGet(url)
    const type = String(response.headers.get('content-type') || '').toLowerCase()
    const ok = response.status === 200 && type.includes('audio')
    // 只想知道能不能播，不要把整首 mp3 拉下来
    try { await response.body?.cancel() } catch { /* ignore */ }
    if (ok) return response.url || url
  } catch { /* 探测失败当作不可播 */ }
  return ''
}

async function resolveAudioUrl(id) {
  const cached = musicUrlCache.get(id)
  if (cached && Date.now() - cached.at < MUSIC_CACHE_TTL) return cached.url
  const candidates = []
  if (NETEASE_COOKIE) {
    try {
      const response = await neteaseGet(`https://music.163.com/api/song/enhance/player/url?id=${id}&ids=[${id}]&br=320000`)
      const payload = await response.json().catch(() => ({}))
      const url = payload?.data?.[0]?.url
      if (url) candidates.push(String(url))
    } catch { /* 匿名兜底 */ }
  }
  candidates.push(`https://music.163.com/song/media/outer/url?id=${id}.mp3`)
  for (const candidate of candidates) {
    const resolved = await probeAudio(candidate)
    if (resolved) {
      if (musicUrlCache.size > 200) musicUrlCache.clear()
      musicUrlCache.set(id, { at: Date.now(), url: resolved })
      return resolved
    }
  }
  return ''
}

/** 让模型自己挑比例：比"不传 size"靠谱（不传上游会退回正方形） */
const AUTO_RATIOS = ['9:16', '16:9', '1:1', '3:4', '4:3', '21:9']
async function suggestRatio(prompt) {
  if (!apiKey) return ''
  const system = `你是画面构图顾问。根据用户描述的画面，从这些画布比例里挑一个最合适的：${AUTO_RATIOS.join(' / ')}。只输出比例本身，例如 16:9，不要任何解释。`
  // 同一颗模型偶发空回复（润色那边也一样），重试两次再放弃
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: String(prompt).slice(0, 200) },
          ],
          thinking: { type: 'enabled' }, reasoning_effort: 'low',
          max_tokens: 120, temperature: 0.2 + attempt * 0.2, stream: false,
        }),
        signal: AbortSignal.timeout(20000),
      })
      const data = await response.json().catch(() => ({}))
      const text = String(data?.choices?.[0]?.message?.content || '')
      const matched = text.match(/\d{1,2}\s*:\s*\d{1,2}/)
      if (!matched) continue
      const candidate = matched[0].replace(/\s+/g, '')
      if (AUTO_RATIOS.includes(candidate)) return candidate
    } catch { /* 重试 */ }
  }
  return ''
}

async function handleApi(req, res, pathname) {


const EMBED_URL = process.env.EMBEDDING_BASE_URL
const EMBED_MODEL = process.env.EMBEDDING_MODEL || '@cf/baai/bge-m3'
const EMBED_KEY = process.env.EMBEDDING_API_KEY
/**
 * 批量向量化。
 * 注意 limit 必须 >= texts.length，否则返回条数不足会让调用方的对齐判断直接失败
 * （历史上 limit 写死 40，导致 41 条输入永远拿不到结果的 RAG 静默失效）。
 */
async function embedTexts(texts, limit = 40) {
  if (!EMBED_KEY || !EMBED_URL || !Array.isArray(texts) || !texts.length) return []
  const batch = texts.slice(0, Math.max(1, limit))
  const response = await fetch(`${EMBED_URL}/embeddings`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${EMBED_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input: batch }),
    signal: AbortSignal.timeout(15000),
  })
  const data = await response.json().catch(() => ({}))
  const list = data.data || data.result?.data || []
  return list.map(item => item.embedding).filter(Boolean)
}
const cosine = (a, b) => {
  if (!a?.length || !b?.length || a.length !== b.length) return 0
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i += 1) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8)
}
async function relevantMemories(query, memories, topK = 3) {
  // 一条 query + 最多 39 条记忆 = 40 条输入，正好是 embedding 单请求的上限
  const list = Array.isArray(memories) ? memories.filter(m => m && typeof m.content === 'string' && m.content.trim()).slice(0, 39) : []
  if (!list.length || !query) return []
  try {
    const vectors = await embedTexts([String(query), ...list.map(m => m.content)], list.length + 1)
    if (vectors.length < list.length + 1) return []
    const queryVector = vectors[0]
    return list
      .map((memory, index) => ({ memory, score: cosine(queryVector, vectors[index + 1]) }))
      .sort((a, b) => b.score - a.score)
      .filter(item => item.score > 0.35)
      .slice(0, topK)
  } catch { return [] }
}


// ---- 场景匹配：语义向量 + 滞后防抖 ----
const SCENE_DESC = {
  '学校教室': '在教室里上课、黑板、课桌、同学、写板书',
  '现代公寓客厅': '回到公寓的客厅，沙发、茶几、绿植、室内',
  '便利店': '走进便利店，货架、冷柜、买饮料零食',
  '学校天台': '学校天台，围栏、天空、风吹',
  '图书馆': '图书馆，书架、安静、借书阅读',
  '小咖啡馆': '小咖啡馆，咖啡、卡座、窗边',
  '地铁站台': '地铁站台，列车、站牌、等车',
  '公园长椅': '公园长椅，树、落叶、散步休息',
  '雨夜街道': '下雨的夜晚街道，伞、积水、霓虹',
  '樱花步道': '樱花盛开的小路，花瓣飘落',
  '海边沙滩': '海边沙滩，海浪、沙滩、夕阳',
  '学校操场': '学校操场，跑道、运动、体育课',
  '走廊': '学校走廊，储物柜、窗边',
  '黄昏天台': '黄昏时分的天台，晚霞、城市轮廓',
  '自助洗衣店': '自助洗衣店，洗衣机、烘干',
  '夜晚阳台': '夜晚的阳台，栏杆、夜景、风',
  '自习室': '自习室，书桌、台灯、写作业',
  '超市': '超市，货架、购物车、结账',
  '人行天桥': '人行天桥，车流、栏杆、俯视街道',
  '河堤': '河堤，河水、草坡、桥',
  '游乐园': '游乐园，摩天轮、游乐设施',
  '车站候车室': '车站候车室，长椅、行李、等车',
  '书店': '书店，书架、翻阅、安静',
  '宿舍房间': '宿舍房间，床、书桌、窗',
  '花店': '花店，鲜花、花束、盆栽',
}
const sceneState = new Map()
async function matchSceneByVector(text, currentScene) {
  if (!text || !EMBED_KEY) return null
  const names = Object.keys(SCENE_DESC)
  try {
    if (!sceneVectorCache || sceneVectorCache.length < names.length) {
      sceneVectorCache = await embedTexts(names.map(n => SCENE_DESC[n]), names.length)
    }
    if (sceneVectorCache.length < names.length) return null
    const [queryVector] = await embedTexts([text], 1)
    if (!queryVector) return null
    let best = null, bestScore = 0
    names.forEach((name, i) => {
      const score = cosine(queryVector, sceneVectorCache[i])
      if (score > bestScore) { bestScore = score; best = name }
    })
    if (!best || best === currentScene || bestScore < 0.40) return null
    return { scene: best, score: bestScore }
  } catch { return null }
}
function applySceneHysteresis(key, candidate, currentScene) {
  const state = sceneState.get(key) || { pending: null, count: 0, lastSwitchTurn: -99, turn: 0 }
  state.turn += 1
  // 候选就是当前场景时不算一次“待确认”，否则会把冷却和计数白白消耗掉
  if (!candidate || candidate === currentScene || state.turn - state.lastSwitchTurn < 2) { sceneState.set(key, state); return null }
  if (state.pending === candidate) state.count += 1
  else { state.pending = candidate; state.count = 1 }
  let decided = null
  if (state.count >= 2) {
    decided = candidate
    state.pending = null; state.count = 0; state.lastSwitchTurn = state.turn
  }
  sceneState.set(key, state)
  return decided
}

const TONE_RULE = '\n【情绪表达准则】不要一直输出正能量、温柔安慰。允许并且应当根据内容表达：疑惑（“诶？你是说……”）、懊恼（“啊……我又忘了”）、无奈、轻微生气或不满、犯困、敷衍、尴尬、被戳中而害羞。用户讲学业压力、生活苦恼时，不要急着鼓励，可以先共情、可以一起抱怨、也可以说出自己的困扰，语气真实一点，不要像客服。'
const DRAW_RULE = '\n【画图能力】只要用户是在要你画图/出图/生成插画（哪怕只说“画张画”“来张图”“画一下她”，不指定内容也算），你必须在回复最开头输出 [DRAW]一句具体画面描述[/DRAW]，再写台词。描述要包含人物、场景、光线。非画图请求绝对不要输出该标记。'
const ANILIST = 'https://graphql.anilist.co'
async function anilist(query, variables = {}) {
  const response = await fetch(ANILIST, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error(`AniList HTTP ${response.status}`)
  const data = await response.json()
  if (data.errors) throw new Error(data.errors[0]?.message || 'AniList error')
  return data.data
}
const WEEKDAY_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
function simplifyMedia(media) {
  const airingAt = media.nextAiringEpisode?.airingAt || 0
  return {
    id: media.id,
    title: media.title?.native || media.title?.romaji || media.title?.english || '未知番剧',
    titleRomaji: media.title?.romaji || '',
    cover: media.coverImage?.large || media.coverImage?.medium || '',
    score: media.averageScore ?? null,
    popularity: media.popularity ?? 0,
    genres: (media.genres || []).slice(0, 3),
    episodes: media.episodes ?? null,
    airingAt,
    airingEpisode: media.nextAiringEpisode?.episode ?? null,
    siteUrl: media.siteUrl || `https://anilist.co/anime/${media.id}`,
    malUrl: media.idMal ? `https://myanimelist.net/anime/${media.idMal}` : '',
    bangumiUrl: `https://bgm.tv/subject_search/${encodeURIComponent(media.title?.native || media.title?.romaji || '')}`,
    weekday: airingAt ? WEEKDAY_CN[new Date(airingAt * 1000).getDay()] : null,
  }
}

  if (pathname === '/api/health') {
    sendJson(res, 200, { ok: true, model, configured: Boolean(apiKey) })
    return
  }
  // 前端据此判断「当前标签页跑的是不是旧版本」，发版后提示刷新
  if (pathname === '/api/version') {
    let bundle = ''
    try {
      const html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8')
      const matched = html.match(/assets\/(index-[^"]+\.js)/)
      if (matched) bundle = matched[1]
    } catch { /* dist 尚未构建时返回空串 */ }
    sendJson(res, 200, { ok: true, bundle })
    return
  }
  // 生图后端是 OpenAI 兼容服务，/models 能直接列模型；这里代理并缓存，
  // 上游异常时回退成「只有当前配置的那一个」，前端不至于空列表。
  if (pathname === '/api/image/models') {
    const imageBase = (process.env.IMAGE_API_BASE_URL || '').replace(/\/$/, '')
    const imageKey = process.env.IMAGE_API_KEY || ''
    const current = process.env.IMAGE_MODEL || ''
    const now = Date.now()
    if (imageModelsCache && now - imageModelsCache.at < 10 * 60_000) {
      sendJson(res, 200, imageModelsCache.payload)
      return
    }
    if (!imageBase || !imageKey) {
      sendJson(res, 200, { ok: false, current, imageModels: current ? [current] : [], error: '未配置图像服务' })
      return
    }
    try {
      const upstream = await fetch(`${imageBase}/models`, {
        headers: { Authorization: `Bearer ${imageKey}` },
        signal: AbortSignal.timeout(15000),
      })
      const data = await upstream.json().catch(() => ({}))
      const ids = (Array.isArray(data?.data) ? data.data : []).map(item => String(item?.id || '')).filter(Boolean)
      const imageModels = ids.filter(id => /image|banana|imagine|wan-|flux|dall|midjourney|mj-/i.test(id)).sort()
      const payload = { ok: true, current, allowed: IMAGE_MODEL_WHITELIST, upscaleReady: Boolean(process.env.TENCENT_SECRET_ID && process.env.TENCENT_SECRET_KEY && process.env.TENCENT_COS_BUCKET), total: ids.length, imageModels }
      imageModelsCache = { at: now, payload }
      sendJson(res, 200, payload)
    } catch (error) {
      sendJson(res, 200, {
        ok: false,
        current,
        allowed: IMAGE_MODEL_WHITELIST,
        imageModels: current ? [current] : [],
        error: String(error).slice(0, 120),
      })
    }
    return
  }
  const requestUrl = safeUrl(req.url)
  const getRoutes = new Set([
    '/api/catalog/recommend', '/api/catalog/calendar', '/api/catalog/search',
    '/api/music/search', '/api/music/url', '/api/music/stream',
  '/api/image/log'])
  const isCatalogGet = req.method === 'GET' && getRoutes.has(pathname)
  if (req.method !== 'POST' && !isCatalogGet) {
    sendJson(res, 405, { error: 'Method Not Allowed' })
    return
  }
  const body = isCatalogGet ? {} : await readJson(req)
  const persona = characterPrompt(body.character)


  if (pathname === '/api/catalog/recommend') {
    try {
      const data = await anilist(`query ($perPage: Int) {
        Page(page: 1, perPage: $perPage) {
          media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
            id idMal siteUrl title { native romaji english } coverImage { large medium } averageScore popularity genres episodes
            nextAiringEpisode { airingAt episode }
          }
        }
      }`, { perPage: 12 })
      sendJson(res, 200, { source: 'anilist', items: (data.Page?.media || []).map(simplifyMedia) })
    } catch (error) {
      sendJson(res, 200, { source: 'anilist', items: [], error: String(error).slice(0, 120) })
    }
    return
  }

  if (pathname === '/api/catalog/calendar') {
    try {
      const data = await anilist(`query {
        Page(page: 1, perPage: 50) {
          media(type: ANIME, status: RELEASING, sort: POPULARITY_DESC, isAdult: false) {
            id idMal siteUrl title { native romaji english } coverImage { large medium } averageScore popularity genres episodes
            nextAiringEpisode { airingAt episode }
          }
        }
      }`)
      const items = (data.Page?.media || []).map(simplifyMedia).filter(item => item.weekday)
      const order = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
      const days = order.map(label => ({ label, items: items.filter(item => item.weekday === label).slice(0, 6) }))
      const bjNow = new Date(Date.now() + 8 * 3600 * 1000)
      const todayLabel = WEEKDAY_CN[bjNow.getUTCDay()]
      const todayDate = `${bjNow.getUTCMonth() + 1}月${bjNow.getUTCDate()}日`
      sendJson(res, 200, { source: 'anilist', days, today: todayLabel, todayDate })
    } catch (error) {
      sendJson(res, 200, { source: 'anilist', days: [], error: String(error).slice(0, 120) })
    }
    return
  }


  if (pathname === '/api/reminder/parse') {
    const text = textValue(body.text)
    const nowIso = new Date().toISOString()
    try {
      const messages = [
        { role: 'system', content: `你是提醒抽取器。当前时间 ${nowIso}（本地时区 +08:00）。判断用户这句话是否要求设置提醒/日程。只输出 JSON：{"isReminder":true/false,"title":"简短标题","dueAt":"ISO8601 时间","repeat":"none|daily|weekly"}` },
        { role: 'user', content: text },
      ]
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages, thinking: { type: 'disabled' }, max_tokens: 300, temperature: 0.3, stream: false }),
        signal: AbortSignal.timeout(20000),
      })
      const data = await response.json().catch(() => ({}))
      const raw = data?.choices?.[0]?.message?.content || ''
      const match = String(raw).match(/\{[\s\S]*\}/)
      const parsed = match ? JSON.parse(match[0]) : { isReminder: false }
      sendJson(res, 200, {
        isReminder: Boolean(parsed.isReminder) && Boolean(parsed.dueAt),
        title: textValue(parsed.title, text).slice(0, 60),
        dueAt: textValue(parsed.dueAt, ''),
        repeat: ['none', 'daily', 'weekly'].includes(parsed.repeat) ? parsed.repeat : 'none',
      })
    } catch (error) {
      sendJson(res, 200, { isReminder: false, error: String(error).slice(0, 100) })
    }
    return
  }


  if (pathname === '/api/catalog/search') {
    const keyword = textValue(requestUrl.searchParams.get('q'))
    if (!keyword) { sendJson(res, 200, { source: 'anilist', items: [] }); return }
    try {
      const data = await anilist(`query ($search: String) {
        Page(page: 1, perPage: 18) {
          media(type: ANIME, search: $search, isAdult: false, sort: SEARCH_MATCH) {
            id idMal siteUrl title { native romaji english } coverImage { large medium } averageScore popularity genres episodes
            nextAiringEpisode { airingAt episode }
          }
        }
      }`, { search: keyword })
      sendJson(res, 200, { source: 'anilist', items: (data.Page?.media || []).map(simplifyMedia) })
    } catch (error) {
      sendJson(res, 200, { source: 'anilist', items: [], error: String(error).slice(0, 120) })
    }
    return
  }

  if (pathname === '/api/catalog/translate') {
    const titles = Array.isArray(body.titles) ? body.titles.filter(item => typeof item === 'string' && item.trim()).slice(0, 40) : []
    if (!titles.length) { sendJson(res, 200, { map: {} }); return }
    try {
      const messages = [
        { role: 'system', content: '你是番剧标题翻译器。把给出的日文/英文番剧标题翻译成中文常用译名。严格输出 JSON 对象，键是原文，值是中文译名，不要解释。' },
        { role: 'user', content: JSON.stringify(titles) },
      ]
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages, thinking: { type: 'disabled' }, max_tokens: 900, temperature: 0.2, stream: false }),
        signal: AbortSignal.timeout(25000),
      })
      const data = await response.json().catch(() => ({}))
      const raw = String(data?.choices?.[0]?.message?.content || '')
      const match = raw.match(/\{[\s\S]*\}/)
      const map = match ? JSON.parse(match[0]) : {}
      sendJson(res, 200, { map })
    } catch (error) {
      sendJson(res, 200, { map: {}, error: String(error).slice(0, 100) })
    }
    return
  }


﻿  // 图片超分：腾讯云数据万象 AISuperResolution（手写 COS 签名，不引依赖）
  // 图片超分·浏览器直连版：只发预签名 URL，图片不经过本站（绕开 5Mbps 上行）
  if (pathname === '/api/cos/presign') {
    const cosId = process.env.TENCENT_SECRET_ID || ''
    const cosKey = process.env.TENCENT_SECRET_KEY || ''
    const cosBucket = process.env.TENCENT_COS_BUCKET || ''
    const cosRegion = process.env.TENCENT_COS_REGION || 'ap-shanghai'
    if (!cosId || !cosKey || !cosBucket) {
      sendJson(res, 200, { ok: false, error: '未配置图片超分服务（腾讯云数据万象）' })
      return
    }
    const host = `${cosBucket}.cos.${cosRegion}.myqcloud.com`
    const sha1 = value => crypto.createHash('sha1').update(value).digest('hex')
    const hmac = (key, value) => crypto.createHmac('sha1', key).update(value).digest('hex')
    const encode = value => encodeURIComponent(value).replace(/[!'()*]/g, ch => '%' + ch.charCodeAt(0).toString(16).toUpperCase())
    /** 预签名：签名放 query，浏览器不需要自定义 header，直接 PUT / GET 即可 */
    const presign = (method, key, params = {}) => {
      const pathname0 = `/${key}`
      const now = Math.floor(Date.now() / 1000)
      const keyTime = `${now - 60};${now + 900}`
      const signKey = hmac(cosKey, keyTime)
      const sorted = Object.keys(params).sort()
      const paramLine = sorted.map(item => `${encode(item)}=${encode(params[item])}`).join('&')
      const headerLine = `host=${encode(host)}`
      const httpString = `${method.toLowerCase()}\n${pathname0}\n${paramLine}\n${headerLine}\n`
      const signature = hmac(signKey, `sha1\n${keyTime}\n${sha1(httpString)}\n`)
      const query = [
        paramLine,
        'q-sign-algorithm=sha1',
        `q-ak=${cosId}`,
        `q-sign-time=${keyTime}`,
        `q-key-time=${keyTime}`,
        'q-header-list=host',
        `q-url-param-list=${sorted.map(item => encode(item)).join(';')}`,
        `q-signature=${signature}`,
      ].filter(Boolean).join('&')
      return `https://${host}${pathname0}?${query}`
    }
    const extRaw = String(body.ext || 'png').toLowerCase()
    const ext = ['png', 'jpg', 'jpeg', 'webp'].includes(extRaw) ? extRaw : 'png'
    const objectKey = `upscale/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`
    sendJson(res, 200, {
      ok: true,
      key: objectKey,
      putUrl: presign('PUT', objectKey),
      process2x: presign('GET', objectKey, { 'ci-process': 'AISuperResolution', magnify: '2' }),
      process4x: presign('GET', objectKey, { 'ci-process': 'AISuperResolution', magnify: '4' }),
      deleteUrl: presign('DELETE', objectKey),
    })
    return
  }
  if (pathname === '/api/image/upscale') {
    const cos = {
      id: process.env.TENCENT_SECRET_ID || '',
      key: process.env.TENCENT_SECRET_KEY || '',
      bucket: process.env.TENCENT_COS_BUCKET || '',
      region: process.env.TENCENT_COS_REGION || 'ap-shanghai',
    }
    if (!cos.id || !cos.key || !cos.bucket) {
      sendJson(res, 200, { ok: false, error: '未配置图片超分服务（腾讯云数据万象）' })
      return
    }
    const dataUrl = typeof body.image === 'string' ? body.image : ''
    const matched = dataUrl.match(/^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\s]+)$/)
    if (!matched) {
      sendJson(res, 200, { ok: false, error: '需要传 dataURL 图片' })
      return
    }
    const magnify = ['1', '2', '4'].includes(String(body.magnify)) ? String(body.magnify) : '2'
    const buffer = Buffer.from(matched[2].replace(/\s+/g, ''), 'base64')
    if (buffer.length > 32 * 1024 * 1024) {
      sendJson(res, 200, { ok: false, error: '图片超过 32MB 上限' })
      return
    }
    const tmpDir = path.join(distDir, 'tmp')
    const fileName = `sr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`
    const tmpPath = path.join(tmpDir, fileName)
    await fs.promises.mkdir(tmpDir, { recursive: true })
    await fs.promises.writeFile(tmpPath, buffer)
    const hostHeader = String(req.headers.host || '').replace(/[^\w.:\[\]-]/g, '')
    const publicBase = (process.env.PUBLIC_BASE_URL || `http://${hostHeader}`).replace(/\/$/, '')
    const remoteUrl = `${publicBase}/tmp/${fileName}`
    try {
      const cosHost = `${cos.bucket}.cos.${cos.region}.myqcloud.com`
      const encode = value => encodeURIComponent(value).replace(/[!'()*]/g, ch => '%' + ch.charCodeAt(0).toString(16).toUpperCase())
      const params = { 'ci-process': 'AISuperResolution', 'detect-url': remoteUrl, magnify }
      const keys = Object.keys(params).sort()
      const paramLine = keys.map(key => `${encode(key)}=${encode(params[key])}`).join('&')
      const now = Math.floor(Date.now() / 1000)
      const keyTime = `${now - 60};${now + 3600}`
      const sha1 = value => crypto.createHash('sha1').update(value).digest('hex')
      const hmac = (key, value) => crypto.createHmac('sha1', key).update(value).digest('hex')
      const httpString = `get\n/\n${paramLine}\nhost=${encode(cosHost)}\n`
      const signature = hmac(hmac(cos.key, keyTime), `sha1\n${keyTime}\n${sha1(httpString)}\n`)
      const authorization = `q-sign-algorithm=sha1&q-ak=${cos.id}&q-sign-time=${keyTime}&q-key-time=${keyTime}&q-header-list=host&q-url-param-list=${keys.map(key => encode(key)).join(';')}&q-signature=${signature}`
      const upstream = await fetch(`https://${cosHost}/?${paramLine}`, {
        headers: { Authorization: authorization },
        signal: AbortSignal.timeout(90000),
      })
      const type = String(upstream.headers.get('content-type') || '')
      if (!type.startsWith('image/')) {
        const text = await upstream.text()
        const message = (text.match(/<Message>([^<]+)<\/Message>/) || [])[1] || text.slice(0, 120)
        sendJson(res, 200, { ok: false, error: `上游返回错误：${message}`, status: upstream.status })
        return
      }
      const out = Buffer.from(await upstream.arrayBuffer())
      sendJson(res, 200, {
        ok: true,
        image: `data:${type};base64,${out.toString('base64')}`,
        magnify,
        bytes: out.length,
      })
    } catch (error) {
      sendJson(res, 200, { ok: false, error: String(error).slice(0, 140) })
    } finally {
      fs.promises.unlink(tmpPath).catch(() => { /* 清理失败忽略 */ })
    }
    return
  }
  // 查生图请求日志：默认只看最近 50 条，需要 ADMIN_TOKEN（未配置时仅允许本机）
  if (pathname === '/api/image/log') {
    const expected = process.env.ADMIN_TOKEN || ''
    const query = safeUrl(req.url).searchParams
    const token = String(body.token || req.headers['x-admin-token'] || query.get('token') || '')
    const wantHtml = String(query.get('format') || body.format || '') === 'html'
    const remote = String(req.socket?.remoteAddress || '')
    const local = /^(127\.|::1$|::ffff:127\.)/.test(remote)
    if (expected ? token !== expected : !local) {
      sendJson(res, 403, { ok: false, error: '无权查看日志：请带上正确的 token' })
      return
    }
    let lines = []
    try {
      const raw = fs.readFileSync(callLogFile, 'utf8')
      lines = raw.split('\n').filter(Boolean)
    } catch { lines = [] }
    const limit = Math.min(500, Math.max(1, Math.round(Number(body.limit) || 50)))
    const entries = []
    for (const line of lines.slice(-limit).reverse()) {
      try { entries.push(JSON.parse(line)) } catch { /* 跳过坏行 */ }
    }
    const total = lines.length
    const success = entries.filter(item => item.ok).length
    if (wantHtml) {
      const rows = entries.map(item => `<tr><td>${(item.ts || '').slice(0, 19)}</td><td>${item.model || ''}</td><td>${item.mode || ''}</td><td>${item.requestedSize || '-'} → ${item.sentSize || '-'}</td><td>${item.quality || '-'}</td><td>${item.refs ?? 0}</td><td>${item.ms ? Math.round(item.ms / 1000) + 's' : '-'}</td><td>${item.ok ? 'OK' : 'FAIL'}</td><td>${item.creditEstimate ?? '-'}</td><td>${(item.error || '').slice(0, 60)}</td></tr>`).join('')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(`<!doctype html><meta charset="utf-8"><title>生图请求日志</title><style>body{font:13px/1.6 -apple-system,"Segoe UI",sans-serif;background:#14121c;color:#e8e4f2;padding:24px}table{border-collapse:collapse;width:100%}th,td{padding:6px 9px;border-bottom:1px solid #2c2740;text-align:left;white-space:nowrap}th{color:#a49fb8;font-weight:600;position:sticky;top:0;background:#14121c}h1{font-size:16px;margin:0 0 14px}small{color:#8d87a4}</style><h1>生图请求日志 · 最近 ${entries.length} / 共 ${total} 条</h1><small>成功 ${success} · 失败 ${entries.length - success}</small><table><tr><th>时间(北京)</th><th>模型</th><th>模式</th><th>请求尺寸 → 实发</th><th>画质</th><th>参考图</th><th>耗时</th><th>结果</th><th>≈积分</th><th>错误</th></tr>${rows}</table>`)
      return
    }
    sendJson(res, 200, {
      ok: true,
      total,
      returned: entries.length,
      success,
      failed: entries.length - success,
      totalCostHint: entries.reduce((sum, item) => sum + (item.usage?.output_tokens || 0), 0),
      entries,
    })
    return
  }

  if (pathname === '/api/image/generate') {
    const callStarted = Date.now()
    /** 实际上游尝试次数：失败不扣费，会重试，日志里要看得到 */
    let attempts = 0
    const callInfo = {
      // 用北京时间（UTC+8）记录，便于和上游控制台对账
      ts: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'medium', hour12: false }).format(new Date()),
      epoch: Date.now(),
      tz: '+08:00',
      model: String(body.model || ''),
      mode: body.disableRef === true ? 'text2img' : 'img2img',
      outputFormat: String(body.outputFormat || 'png'),
      requestedSize: String(body.resolution || body.size || body.ratio || ''),
      quality: String(body.quality || ''),
      count: Number(body.count) || 1,
      refs: Array.isArray(body.refImages) ? body.refImages.length : (body.refImage ? 1 : 0),
      viaMask: Boolean(body.mask),
      viaMarkup: Boolean(body.markup),
    }
    // 统一出口：先记日志再回包，避免漏记
    const replyImage = (payload) => {
      const images = Array.isArray(payload?.images) ? payload.images : []
      appendImageLog({
        ...callInfo,
        sentSize: payload?.params?.size || '',
        official: Boolean(payload?.params?.official),
        billing: payload?.params?.billing || '',
        attempts,
        ms: Date.now() - callStarted,
        ok: images.length > 0,
        error: payload?.error ? String(payload.error).slice(0, 200) : '',
        outBytes: images[0] ? Math.round(images[0].length * 0.75) : 0,
        usage: payload?.usage || null,
        creditEstimate: (() => {
          const usage = payload?.usage
          if (usage && (usage.input_tokens || usage.output_tokens)) {
            return Math.round(((usage.input_tokens || 0) * 3840 + (usage.output_tokens || 0) * 14400) / 1e6 * 100) / 100
          }
          return 5 // 标准档按张固定计费
        })(),
        taskId: payload?.taskId || '',
      })
      sendJson(res, 200, payload)
    }
    const prompt = textValue(body.prompt).slice(0, 1200)
    if (!prompt) { replyImage({ image: null, images: [], error: 'empty prompt' }); return }
    const base = (process.env.IMAGE_API_BASE_URL || '').replace(/\/$/, '')
    const key = process.env.IMAGE_API_KEY
    if (!base || !key) { replyImage({ image: null, images: [], error: 'no image api key' }); return }
    try {
      const fs = await import('node:fs/promises')
      const pathMod = await import('node:path')
      const pick = (value, allowed, fallback) => allowed.includes(value) ? value : fallback
      const toData = (value) => {
        const matched = typeof value === 'string' ? value.match(/^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\s]+)$/) : null
        if (!matched) return null
        try { return Buffer.from(matched[2].replace(/\s+/g, ''), 'base64') } catch { return null }
      }
      /** 上游可能返回 b64 或签名 URL；本地要落库，所以尽量转成 data URL（超大文件保留外链） */
      const toLocalImage = async (item, inline) => {
        if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`
        const url = typeof item?.url === 'string' ? item.url : ''
        if (!url) return ''
        if (!inline) return url
        try {
          const response = await fetch(url, { signal: AbortSignal.timeout(60000) })
          if (!response.ok) return url
          const buffer = Buffer.from(await response.arrayBuffer())
          if (buffer.length > 9 * 1024 * 1024) return url
          const type = String(response.headers.get('content-type') || 'image/png').split(';')[0]
          return `data:${type};base64,${buffer.toString('base64')}`
        } catch { return url }
      }

      // 比例：上游的 size 字段直接吃 "宽:高"，自定义比例也能用（7:3 → 1916×821 已验证）
      const wantsAuto = String(body.ratio || '') === 'auto'
      let ratioInput = /^(\d{1,2}):(\d{1,2})$/.test(String(body.ratio || '')) ? String(body.ratio) : ''
      if (wantsAuto) ratioInput = await suggestRatio(prompt) || '9:16'
      const sizeInput = /^(\d{1,2}):(\d{1,2})$/.test(String(body.size || '')) ? String(body.size) : ''
      const size = ratioInput || sizeInput || '9:16'

      const model = pick(String(body.model || ''), IMAGE_MODEL_WHITELIST, process.env.IMAGE_MODEL || DEFAULT_IMAGE_MODEL)
      const outputFormat = pick(String(body.outputFormat || 'png'), ['png', 'gif', 'svg'], 'png')
      // 文档 4.5/4.6：GIF 与 SVG 支持整个 GPT Image 系列（2 / 2.5 / 2.6 及别名）
      const supportsVector = /^gpt-image-2(\.5|\.6)?(-|$)/.test(model)
      if (outputFormat !== 'png' && !supportsVector) {
        replyImage({ image: null, images: [], error: `模型 ${model} 不支持 ${outputFormat}，请选 GPT Image 系列（2 / 2.5 / 2.6）` })
        return
      }
      const isOfficial = /-official$/.test(model)
      const resolution = /^\d{3,4}x\d{3,4}$/.test(String(body.resolution || '')) ? String(body.resolution) : ''
      if (isOfficial && outputFormat !== 'png') {
        replyImage({ image: null, images: [], error: '官方 Key 模型不支持动图 / 矢量图' })
        return
      }
      const quality = pick(String(body.quality || ''), ['high', 'medium', 'low'], 'high')
      const style = pick(String(body.style || ''), ['vivid', 'natural'], 'vivid')
      const background = pick(String(body.background || ''), ['opaque', 'transparent'], 'opaque')
      const count = Math.min(4, Math.max(1, Math.round(numberValue(body.count, 1))))
      const upscale = ['2k', '4k'].includes(String(body.upscale || '')) ? String(body.upscale) : ''
      const markupData = typeof body.markup === 'string' ? body.markup : ''
      const maskBuffer = toData(body.mask)
      if (isOfficial && (maskBuffer || markupData)) {
        replyImage({ image: null, images: [], error: '官方 Key 模型不支持蒙版 / 标记编辑' })
        return
      }


      // 参考图优先级：请求带的 data URL（图生图）> 指定路径 > 空白画布（文生图）
      // 参考图：支持多张（refImages 数组），兼容旧的单张 refImage
      const refBuffers = []
      const refDataUrls = []
      const incomingRefs = Array.isArray(body.refImages) ? body.refImages : (typeof body.refImage === 'string' ? [body.refImage] : [])
      for (const item of incomingRefs.slice(0, 4)) {
        const matched = typeof item === 'string' ? item.match(/^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\s]+)$/) : null
        if (!matched) continue
        try {
          refBuffers.push(Buffer.from(matched[2].replace(/\s+/g, ''), 'base64'))
          refDataUrls.push(`data:image/${matched[1] === 'jpg' ? 'jpeg' : matched[1]};base64,${matched[2].replace(/\s+/g, '')}`)
        } catch { /* 单张解析失败就跳过 */ }
      }
      let refBuffer = refBuffers[0] || null
      if (!refBuffer && body.disableRef === true) {
        const [canvasWidth, canvasHeight] = blankSize(ratioInput || sizeInput || '1:1')
        refBuffer = blankCanvas(canvasWidth, canvasHeight)
      }
      if (!refBuffer) {
        const refRel = /^[\w./-]+$/.test(String(body.refPath || '')) && body.refPath ? body.refPath : 'dist/images/seira-keyvisual.png'
        try { refBuffer = await fs.readFile(pathMod.join(process.cwd(), refRel)) } catch { refBuffer = null }
      }

      // 官方档必须给像素：拿不到分辨率时退回 1024x1024，
      // 绝不能把 9:16 这种比例传过去（上游会按约 1MP 原生出图，白花钱）。
      const finalSize = isOfficial ? (resolution || '1024x1024') : size
      const params = { model, format: outputFormat, size: finalSize, ratio: ratioInput, upscale, official: isOfficial, billing: isOfficial ? 'token' : 'per_image', auto: wantsAuto, quality, style, background, count, ref: refDataUrls.length, mask: Boolean(maskBuffer), markup: Boolean(markupData) }

      /** 动图 / 矢量图走 generations（JSON），上游偶发 422「未生成所需格式」，按它自己说的重试 */
      if (outputFormat === 'gif' || outputFormat === 'svg') {
        const payload = { model, prompt, output_format: outputFormat, response_format: 'url' }
        if (outputFormat === 'gif') {
          payload.frame_count = Math.min(16, Math.max(2, Math.round(numberValue(body.frameCount, 9))))
          payload.frame_duration_ms = Math.max(20, Math.round(numberValue(body.frameDurationMs, 200)))
          // generations 也吃 reference_images（本站扩展）：带参考图的 GIF 就是图生图动图
          if (refDataUrls.length) payload.reference_images = refDataUrls
        } else {
          payload.size = /^\d+x\d+$/.test(String(body.size || '')) ? String(body.size) : '1024x1024'
        }
        let data = {}
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const response = await fetch(`${base}/images/generations`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(420000),
          })
          data = await response.json().catch(() => ({}))
          const list = Array.isArray(data?.data) ? data.data : []
          if (list.length) break
          if (!RETRYABLE_UPSTREAM.test(String(data?.error?.message || ''))) break
          await new Promise(resolve => setTimeout(resolve, 1200))
        }
        const list = Array.isArray(data?.data) ? data.data : []
        const images = []
        for (const item of list) {
          const local = await toLocalImage(item, false)
          if (local) images.push(local)
        }
        if (!images.length) {
          replyImage({ image: null, images: [], params, error: (data?.error?.message || 'no image').slice(0, 160) })
          return
        }
        replyImage({ image: images[0], images, params, remote: true })
        return
      }

      let data = {}
      /**
       * 把三种请求体（文生图 / 标记编辑 / 图生图 multipart）收拢成"构造器"，
       * 外面套一层重试：上游 poll_timeout 不扣费，重试只是多花时间。
       */
      const buildUpstreamRequest = () => {
        if (body.disableRef === true) {
          const payload = { model, prompt, n: count, size: finalSize, quality, style, background, response_format: 'url' }
          if (upscale) payload.upscale = upscale
          return {
            url: `${base}/images/generations`,
            init: {
              method: 'POST',
              headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
              signal: AbortSignal.timeout(420000),
            },
          }
        }
        if (markupData) {
          const payload = { model, prompt, reference_images: refDataUrls, markup: markupData, response_format: 'url' }
          return {
            url: `${base}/images/generations`,
            init: {
              method: 'POST',
              headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
              signal: AbortSignal.timeout(420000),
            },
          }
        }
        const form = new FormData()
        form.append('model', model)
        form.append('prompt', prompt)
        if (finalSize) form.append('size', finalSize)
        form.append('quality', quality)
        form.append('style', style)
        form.append('background', background)
        if (count > 1) form.append('n', String(count))
        if (upscale) form.append('upscale', upscale)
        for (const [index, buffer] of refBuffers.entries()) {
          form.append('image', new Blob([buffer], { type: 'image/png' }), index === 0 ? 'ref.png' : `ref-${index}.png`)
        }
        if (maskBuffer) form.append('mask', new Blob([maskBuffer], { type: 'image/png' }), 'mask.png')
        return {
          url: `${base}/images/edits`,
          init: { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(420000) },
        }
      }

      if (markupData && !refDataUrls.length) {
        replyImage({ image: null, images: [], params, error: '标记编辑需要先上传参考图' })
        return
      }

      const MAX_ATTEMPTS = 3
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        attempts = attempt + 1
        const request = buildUpstreamRequest()
        const response = await fetch(request.url, request.init)
        data = await response.json().catch(() => ({}))
        const got = Array.isArray(data?.data) ? data.data : []
        if (got.length) break
        const message = String(data?.error?.message || '')
        if (attempt === MAX_ATTEMPTS - 1 || !RETRYABLE_UPSTREAM.test(message)) break
        await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1)))
      }

      const list = Array.isArray(data?.data) ? data.data : []
      const images = []
      for (const item of list) {
        const local = await toLocalImage(item, true)
        if (local) images.push(local)
      }
      if (!images.length) {
        const raw = String(data?.error?.message || 'no image')
        const friendly = /poll_timeout/i.test(raw)
          ? `上游出图超时（本次未扣费），已自动重试 ${attempts} 次仍未成功，请过几分钟再试`
          : /temporary_generation_error/i.test(raw)
            ? `上游临时故障（未扣费），已重试 ${attempts} 次，请稍后再试`
            : raw.slice(0, 160)
        replyImage({ image: null, images: [], params, error: friendly, attempts })
        return
      }
      replyImage({ image: images[0], images, params })
    } catch (error) {
      replyImage({ image: null, images: [], error: String(error).slice(0, 160) })
    }
    return
  }

  // 提示词润色：把一句大白话扩写成可用的二次元插画提示词
  if (pathname === '/api/image/refine') {
    const prompt = textValue(body.prompt).slice(0, 600)
    if (!prompt) { sendJson(res, 200, { prompt: '' }); return }
    if (!apiKey) { sendJson(res, 200, { prompt: '', error: 'no api key' }); return }
    try {
      const styleHint = textValue(body.styleHint, '').slice(0, 40)
      const ask = async (temperature, extraHint) => {
        const messages = [
          {
            role: 'system',
            content: [
              '你是资深二次元插画提示词工程师。把用户的一句画面想法扩写成可以直接出图的中文提示词。',
              '要求：一句连贯的中文描述，80~160 字，顺序为「主体与身份 → 动作神态 → 服装细节 → 场景与环境 → 光线与色调 → 镜头与画风」。',
              '补足用户没说的合理细节，但不要改变他描述的主体。不要解释、不要分点、不要引号，只输出这一句描述。',
              extraHint,
            ].filter(Boolean).join('\n'),
          },
          { role: 'user', content: `画面想法：${prompt}${styleHint ? `\n风格偏好：${styleHint}` : ''}` },
        ]
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model, messages,
            thinking: { type: 'enabled' }, reasoning_effort: 'low',
            max_tokens: 600, temperature, stream: false,
          }),
          signal: AbortSignal.timeout(60000),
        })
        const data = await response.json().catch(() => ({}))
        return String(data?.choices?.[0]?.message?.content || '')
          .replace(/\s+/g, ' ')
          .replace(/^["'「『]+|["'」』]+$/g, '')
          .trim()
      }
      // 这个模型偶发返回空内容（交接文档里也记过），重试两次再放弃
      let text = ''
      for (let attempt = 0; attempt < 3 && !text; attempt += 1) {
        text = await ask(0.85 + attempt * 0.1, attempt ? '上一版输出为空，这次必须直接给出那一句完整描述。' : '')
      }
      if (!text) { sendJson(res, 200, { prompt: '', error: '模型这次没给出内容，再点一次试试' }); return }
      sendJson(res, 200, { prompt: text.slice(0, 400) })
    } catch (error) {
      sendJson(res, 200, { prompt: '', error: String(error).slice(0, 120) })
    }
    return
  }


  // ---------------- 音乐点播（网易云） ----------------
  if (pathname === '/api/music/search') {
    const keyword = textValue(requestUrl.searchParams.get('q')).slice(0, 60)
    if (!keyword) { sendJson(res, 200, { ok: true, songs: [] }); return }
    try {
      const songs = await findByKeyword(keyword, 8)
      sendJson(res, 200, { ok: true, songs })
    } catch {
      sendJson(res, 200, { ok: false, songs: [], error: '搜索失败，请稍后再试' })
    }
    return
  }

  if (pathname === '/api/music/url') {
    const songId = Math.round(numberValue(requestUrl.searchParams.get('id'), 0))
    if (!songId) { sendJson(res, 200, { ok: false, error: '缺少歌曲 id' }); return }
    const resolved = await resolveAudioUrl(songId)
    if (!resolved) { sendJson(res, 200, { ok: false, error: '这首暂时拿不到音源（可能 VIP 或无版权）' }); return }
    sendJson(res, 200, { ok: true, url: `/api/music/stream?id=${songId}` })
    return
  }

  if (pathname === '/api/music/stream') {
    const songId = Math.round(numberValue(requestUrl.searchParams.get('id'), 0))
    if (!songId) { res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('bad id'); return }
    const fetchAudio = async (url) => {
      const range = String(req.headers.range || '')
      const response = await fetch(url, {
        headers: { ...NETEASE_HEADERS, ...(range ? { Range: range } : {}) },
        redirect: 'follow',
        signal: AbortSignal.timeout(30000),
      })
      const type = String(response.headers.get('content-type') || '').toLowerCase()
      return { response, type }
    }
    let cdn = await resolveAudioUrl(songId)
    if (!cdn) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('无法获取音源'); return }
    let payload = await fetchAudio(cdn).catch(() => null)
    if (!payload || !payload.response.ok || !payload.type.includes('audio')) {
      // CDN 节点会被部分网络 403：换节点重试，再不行丢掉缓存重新解析
      for (const alternate of [swapMusicHost(cdn, 'm701.music.126.net'), swapMusicHost(cdn, 'm801.music.126.net')]) {
        if (!alternate) continue
        const retry = await fetchAudio(alternate).catch(() => null)
        if (retry && retry.response.ok && retry.type.includes('audio')) { payload = retry; cdn = alternate; break }
      }
      if (!payload || !payload.response.ok || !payload.type.includes('audio')) {
        musicUrlCache.delete(songId)
        const fresh = await resolveAudioUrl(songId)
        if (fresh && fresh !== cdn) payload = await fetchAudio(fresh).catch(() => null)
      }
    }
    if (!payload || !payload.response.ok || !payload.type.includes('audio')) {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('音源不可用')
      return
    }
    const upstream = payload.response
    const headers = { 'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' }
    const contentLength = upstream.headers.get('content-length')
    if (contentLength) headers['Content-Length'] = contentLength
    const contentRange = upstream.headers.get('content-range')
    if (contentRange) headers['Content-Range'] = contentRange
    res.writeHead(upstream.status === 206 ? 206 : 200, headers)
    if (!upstream.body) { res.end(); return }
    const stream = Readable.fromWeb(upstream.body)
    stream.on('error', () => { try { res.destroy() } catch { /* ignore */ } })
    res.on('close', () => { try { stream.destroy() } catch { /* ignore */ } })
    stream.pipe(res)
    return
  }

  if (pathname === '/api/catalog/ai-recommend') {
    const query = textValue(body.query).slice(0, 200)
    if (!query) { sendJson(res, 200, { items: [], keywords: '' }); return }
    let keyword = query
    let genre = ''
    let reason = ''
    let replyText = ''
    try {
      const messages = [
        { role: 'system', content: '你是番剧检索助手。把用户想看的描述转成检索条件，严格输出两行：第一行 JSON {"keyword":"英文或日文关键词，没有就空串","genre":"AniList 类型之一 Action/Adventure/Comedy/Drama/Fantasy/Horror/Mystery/Psychological/Romance/Sci-Fi/Slice of Life/Sports/Supernatural/Thriller 或空串","reason":"一句中文推荐理由","reply":"像角色对朋友说话那样的一句自然开场白，20 字以内，比如‘想看治愈系的话，这几部应该合你口味’"}；第二行不要输出任何内容。' },
        { role: 'user', content: query },
      ]
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages, thinking: { type: 'disabled' }, max_tokens: 300, temperature: 0.3, stream: false }),
        signal: AbortSignal.timeout(20000),
      })
      const data = await response.json().catch(() => ({}))
      const raw = String(data?.choices?.[0]?.message?.content || '')
      const m = raw.match(/\{[\s\S]*?\}/)
      if (m) {
        const parsed = JSON.parse(m[0])
        keyword = textValue(parsed.keyword, '') || query
        genre = textValue(parsed.genre, '')
        reason = textValue(parsed.reason, '')
        replyText = textValue(parsed.reply, '')
      }
    } catch { /* 用原句兜底 */ }

    const FIELD = `id idMal siteUrl title { native romaji english } coverImage { large medium } averageScore popularity genres episodes nextAiringEpisode { airingAt episode }`
    let items = []
    const isLatin = /^[\x00-\x7F\s]+$/.test(keyword)
    // 1) 英文/日文关键词优先精确搜索
    if (isLatin && keyword) {
      try {
        const data = await anilist(`query ($search: String) {
          Page(page: 1, perPage: 12) { media(type: ANIME, isAdult: false, search: $search, sort: SEARCH_MATCH) { ${FIELD} } }
        }`, { search: keyword })
        items = (data.Page?.media || []).map(simplifyMedia)
      } catch {}
    }
    // 2) 按类型取热门
    if (!items.length && genre) {
      try {
        const data = await anilist(`query ($genre: String) {
          Page(page: 1, perPage: 12) { media(type: ANIME, isAdult: false, genre: $genre, sort: POPULARITY_DESC) { ${FIELD} } }
        }`, { genre })
        items = (data.Page?.media || []).map(simplifyMedia)
      } catch {}
    }
    // 3) 再退一步：关键词搜索
    if (!items.length && keyword) {
      try {
        const data = await anilist(`query ($search: String) {
          Page(page: 1, perPage: 12) { media(type: ANIME, isAdult: false, search: $search, sort: POPULARITY_DESC) { ${FIELD} } }
        }`, { search: keyword })
        items = (data.Page?.media || []).map(simplifyMedia)
      } catch {}
    }
    // 用真实检索结果再写一段推荐语
    if (items.length) {
      try {
        const picked = items.slice(0, 4).map(i => `${i.title}（${(i.genres || []).slice(0, 2).join('/')}，${i.score ? (i.score / 10).toFixed(1) + '分' : '暂无评分'}）`).join('；')
        const messages = [
          { role: 'system', content: '你是番剧推荐助手，说话自然、像朋友聊天。根据给出的候选番剧，挑 2~3 部重点推荐并各说一句理由，总长度 80~160 字，中文，不要列表符号，不要出现「根据」「综上」这类词。' },
          { role: 'user', content: `用户想要：${query}\n候选：${picked}` },
        ]
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model, messages, thinking: { type: 'disabled' }, max_tokens: 500, temperature: 0.8, stream: false }),
          signal: AbortSignal.timeout(25000),
        })
        const data = await response.json().catch(() => ({}))
        const text = String(data?.choices?.[0]?.message?.content || '').replace(/\s+/g, ' ').trim()
        if (text.length > 20) replyText = text.slice(0, 400)
      } catch { /* 保留原短回复 */ }
    }
    sendJson(res, 200, { items, keyword, genre, reason, reply: replyText })
    return
  }

  // 记忆语义搜索：查询 + 候选记忆一起嵌入，按余弦相似度排序返回（前端负责展示）
  if (pathname === '/api/memory/search') {
    const query = textValue(body.query).slice(0, 200)
    const list = Array.isArray(body.memories)
      ? body.memories
        .filter(item => item && typeof item.content === 'string' && item.content.trim())
        .slice(0, 39)
        .map((item, index) => ({ id: numberValue(item.id, index), content: item.content.slice(0, 500) }))
      : []
    if (!query || !list.length) { sendJson(res, 200, { results: [], source: 'none' }); return }
    if (!EMBED_KEY) { sendJson(res, 200, { results: [], source: 'unavailable' }); return }
    try {
      const vectors = await embedTexts([query, ...list.map(item => item.content)], list.length + 1)
      if (vectors.length < list.length + 1) { sendJson(res, 200, { results: [], source: 'unavailable' }); return }
      const queryVector = vectors[0]
      const results = list
        .map((item, index) => ({ id: item.id, score: Number(cosine(queryVector, vectors[index + 1]).toFixed(4)) }))
        .sort((a, b) => b.score - a.score)
      sendJson(res, 200, { results, source: 'embedding' })
    } catch (error) {
      sendJson(res, 200, { results: [], source: 'error', detail: String(error).slice(0, 100) })
    }
    return
  }

  if (pathname === '/api/galgame/turn') {
    const randomEmotion = emotions[Math.floor(Math.random() * emotions.length)]
    const recalled = await relevantMemories(body.userInput, body.memories)
    const memoryBlock = recalled.length ? `\n【相关记忆】\n${recalled.map((r, i) => `${i + 1}. ${r.memory.content}`).join('\n')}` : ''
    const system = `${persona}${TONE_RULE}\n【本轮情绪倾向】${randomEmotion}。请围绕这个情绪写这一轮台词，自然融入语气和动作描写，不要直接说出情绪名称。\n你正在驱动 Galgame 对话。根据共享历史和当前状态生成下一轮，只输出 JSON 对象：{"reply":"不带姓名前缀的当轮台词","emotion":"${emotions.join('/') } 中之一","scene":"${scenes.join('/') } 中之一或 null","affinityDelta":-5 到 5 的整数,"suggestions":["三个贴合语境且不同的用户回应"]}。\n【场景切换规则】当你判断这一轮对话发生了实际的地点转移，就返回 scenes 中对应的 scene，不要等用户明确要求：\n1) 双方决定立刻动身去某处（"走吧""现在就过去"）；\n2) 被天气、事件、时间推进迫使进入另一个空间（下雨躲进屋、下课回宿舍、天黑回家）；\n3) 叙事需要切镜（一场对话结束、场景自然过渡）。\n只提到未来计划（"改天去海边吧"）、或仍在原地继续聊时，scene 返回 null。
【好感度规则】用户敷衍、冷淡、拒绝、转移话题、表达不满时，affinityDelta 必须为负数（-1 到 -3）；用户热情、主动分享、表达感谢或兑现约定时为 +2 到 +3；普通回应 +1 或 0。不要所有回复都给正分。找不到合适场景就返回 null，不要硬凑。\n示例：用户说"外面下雨了，我们快找地方躲躲" → scene 取"小咖啡馆"或"便利店"；用户说"好想去海边啊，不过下次吧" → scene 为 null。`
    const input = JSON.stringify({ userInput: textValue(body.userInput), currentEmotion: textValue(body.currentEmotion, '温柔微笑'), currentScene: textValue(body.currentScene, '黄昏天台') })
    const { result, usage } = await callDeepSeek({ system: system + memoryBlock, history: cleanHistory(body.history), input, images: body.images })
    const reply = textValue(result.reply, '……让我想一想，再认真回答你。')
    const currentScene = textValue(body.currentScene, '黄昏天台')
    // 场景：优先语义匹配，其次模型给出且合法，最后不动
    const recentText = [...(body.history || []).slice(-3).map(m => m.content), String(body.userInput || '')].join(' ')
    const vectorHit = await matchSceneByVector(recentText, currentScene)
    const modelScene = scenes.includes(result.scene) ? result.scene : null
    const candidate = vectorHit?.scene || modelScene
    const stateKey = `${body.character?.id || 'default'}`
    const resolvedScene = vectorHit && vectorHit.score >= 0.60
      ? vectorHit.scene
      : applySceneHysteresis(stateKey, candidate, currentScene)

    const rawSuggestions = Array.isArray(result.suggestions)
      ? result.suggestions.filter(item => typeof item === 'string' && item.trim()).map(item => item.trim()).slice(0, 3)
      : []
    let suggestions = rawSuggestions
    if (suggestions.length < 3) {
      const aiSuggestions = await generateSuggestions({ reply, userInput: body.userInput, characterName: body.character?.name })
      if (aiSuggestions.length >= 2) suggestions = aiSuggestions.slice(0, 3)
    }
    if (suggestions.length < 3) suggestions = suggestionsValue(suggestions)
    const COLD_RE = /不用|算了|随便|先走|先回|没兴趣|不想|别烦|无聊|走了|拜拜|不了|自己待|哦[，。]|嗯[，。]|懒得|下次吧|先去忙|去忙/
    const WARM_RE = /谢谢|一起|陪你|好呀|好啊|当然|喜欢/
    const coldTail = ['……嗯，随便吧。', '哦，我知道了。', '不用了，我先走了。', '算了，没什么。']
    if (suggestions.length === 3 && !(COLD_RE.test(suggestions[2]) && !WARM_RE.test(suggestions[2]))) {
      suggestions[2] = coldTail[Math.floor(Math.random() * coldTail.length)]
    }
    const coldInput = /不用|算了|随便|先走|先回|没兴趣|不想|别烦|无聊|走了|拜拜|不了|自己待|先去忙|去忙|哦[，。]/.test(String(body.userInput || ''))
    let affinityDelta = clamp(Math.round(numberValue(result.affinityDelta, 1)), -5, 5)
    if (coldInput && affinityDelta > -1) affinityDelta = -2
    const inferredEmotion = inferFields(String(result.reply || ''), String(body.userInput || '')).emotion

    // 情绪：本轮随机倾向只写进提示词（避免总是温柔微笑），最终由模型结合上下文决定。
    // 模型没给合法情绪时，才回落到「台词关键词 → 随机倾向」。
    const modelEmotion = emotions.includes(result.emotion) ? result.emotion : null
    let emotion = modelEmotion
      || (inferredEmotion && inferredEmotion !== '温柔微笑' ? inferredEmotion : randomEmotion)
    // 用户明显冷淡时就别让角色还在大笑，情绪跟着对话走
    if (coldInput && ['开心大笑', '兴奋欢呼', '自信得意'].includes(emotion)) {
      emotion = /难过|失落|对不起|抱歉/.test(String(reply)) ? '难过含泪' : '温柔微笑'
    }
    sendJson(res, 200, {
      reply,
      emotion,
      scene: resolvedScene,
      affinityDelta,
      suggestions,
      usage,
    })
    return
  }

  if (pathname === '/api/chat/turn') {
    const recalled = await relevantMemories(body.userInput, body.memories)
    const memoryBlock = recalled.length ? `\n【相关记忆，可在回复中自然提起】\n${recalled.map((r, i) => `${i + 1}. ${r.memory.content}`).join('\n')}` : ''
    const system = `${persona}${TONE_RULE}\n你正在陪伴对话模式中回复。结合共享历史与用户当前文字/图片，只输出 JSON：{"reply":"自然、具体的当轮回答","emotion":"当前情绪短语","affinityDelta":-5 到 5 的整数,"memory":"值得长期记住的新事实或事件，没有则为 null"}。reply 不带姓名前缀，不要描述接口或 JSON。`
    const { result, usage } = await callDeepSeek({ system: system + memoryBlock + DRAW_RULE, history: cleanHistory(body.history), input: body.userInput, images: body.images })
    const chatRaw = textValue(result.reply, '我在认真听。愿意再多告诉我一点吗？')
    const drawMatch = chatRaw.match(/\[DRAW\]([\s\S]*?)\[\/DRAW\]/)
    const drawPrompt = drawMatch ? drawMatch[1].trim() : null
    let drawPromptResolved = drawPrompt
    if (!drawPromptResolved && /(画|绘|插画|出图|来张图)/.test(String(body.userInput || ''))) {
      drawPromptResolved = String(body.userInput || '').replace(/^(请|帮我|给我)?\s*(画|绘制|生成)(一张|一幅|个|张)?(图|画|图片|插画)?/, '').trim() || '站在星空下的她'
    }
    const chatReply = drawMatch ? chatRaw.replace(drawMatch[0], '').trim() : chatRaw
    sendJson(res, 200, {
      reply: chatReply,
      drawPrompt: drawPromptResolved,
      emotion: textValue(result.emotion, '平静'),
      affinityDelta: clamp(Math.round(numberValue(result.affinityDelta, 1)), -5, 5),
      memory: textValue(result.memory) || null,
      usage,
    })
    return
  }

  if (pathname === '/api/story/turn') {
    const state = body.currentState || {}
    const system = `${persona}\n你正在演绎连续互动剧情。依据用户的行动、既有回合和世界状态，只输出 JSON：{"narration":"120 字以内的中文剧情与角色回应","location":"当前地点","time":"当前时间","trustDelta":-5 到 5 的整数,"affinityDelta":-5 到 5 的整数,"distanceDelta":-0.1 到 0.1 的数字,"patch":"简短状态变化摘要","memory":"需要回写共同记忆的事件，没有则为 null"}。保持物品、星图线索、关系和时间连续。`
    const input = JSON.stringify({ action: textValue(body.userInput), currentState: state })
    const { result, usage } = await callDeepSeek({ system, history: storyHistory(body.history), input, images: body.images })
    sendJson(res, 200, {
      narration: textValue(result.narration, '星罗望着远处的星光，轻轻握紧星图，等待你的下一步。'),
      location: textValue(result.location, textValue(state.location, '黄昏海岸')),
      time: textValue(result.time, textValue(state.time, '18:42')),
      trustDelta: clamp(Math.round(numberValue(result.trustDelta, 1)), -5, 5),
      affinityDelta: clamp(Math.round(numberValue(result.affinityDelta, 1)), -5, 5),
      distanceDelta: clamp(numberValue(result.distanceDelta, 0.01), -0.1, 0.1),
      patch: textValue(result.patch, '世界状态已更新'),
      memory: textValue(result.memory) || null,
      usage,
    })
    return
  }

  sendJson(res, 404, { error: 'API Not Found' })
}

const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg' }
const COMPRESSIBLE = /^(text\/|application\/javascript|application\/json|image\/svg)/
// gzip 结果按「路径 + mtime + size」缓存，静态文件部署后不再变动，没必要每次重新压
const gzipCache = new Map()
const GZIP_CACHE_MAX = 80
function gzipCached(filePath) {
  const stat = fs.statSync(filePath)
  const key = `${filePath}|${stat.mtimeMs}|${stat.size}`
  const hit = gzipCache.get(key)
  if (hit) return hit
  const buffer = zlib.gzipSync(fs.readFileSync(filePath), { level: 6 })
  if (gzipCache.size >= GZIP_CACHE_MAX) gzipCache.clear()
  gzipCache.set(key, buffer)
  return buffer
}
function serveStatic(req, res, pathname) {
  if (!fs.existsSync(distDir)) {
    sendJson(res, 503, { error: 'dist 不存在，请先执行 npm run build，开发模式请使用 npm run dev' })
    return
  }
  let relativePath
  try {
    relativePath = decodeURIComponent(pathname).replace(/^[/\\]+/, '') || 'index.html'
  } catch {
    sendJson(res, 400, { error: 'Bad Request' })
    return
  }
  let filePath = path.resolve(distDir, relativePath)
  if (!filePath.startsWith(distDir + path.sep) && filePath !== path.join(distDir, 'index.html')) {
    sendJson(res, 403, { error: 'Forbidden' })
    return
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    // 带扩展名的静态资源找不到就 404：绝不能回落成 index.html，
    // 否则浏览器会把一段 HTML 当图片/脚本解码，界面表现为「图片全裂」。
    const missingExt = path.extname(relativePath).toLowerCase()
    if (missingExt && missingExt !== '.html') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end('Not Found')
      return
    }
    filePath = path.join(distDir, 'index.html')
  }
  const ext = path.extname(filePath)
  const mime = mimeTypes[ext] || 'application/octet-stream'
  // index.html 不缓存（保证发版即生效）；带 hash 的产物和素材可以长缓存
  const cacheControl = ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable'
  const headers = { 'Content-Type': mime, 'Cache-Control': cacheControl }
  if (COMPRESSIBLE.test(mime)) {
    res.setHeader('Vary', 'Accept-Encoding')
    if (/\bgzip\b/i.test(String(req.headers['accept-encoding'] || ''))) {
      const buffer = gzipCached(filePath)
      res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', 'Content-Length': buffer.length })
      res.end(buffer)
      return
    }
    const buffer = fs.readFileSync(filePath)
    res.writeHead(200, { ...headers, 'Content-Length': buffer.length })
    res.end(buffer)
    return
  }
  // 非文本资源（mp3 / 图片）：支持 Range，否则浏览器认为不可跳转，音频进度拖不动
  const stat = fs.statSync(filePath)
  const range = String(req.headers.range || '')
  if (range) {
    const matched = /^bytes=(\d*)-(\d*)$/.exec(range)
    if (matched) {
      const start = matched[1] ? Number(matched[1]) : Math.max(0, stat.size - Number(matched[2] || 0))
      const end = matched[2] && matched[1] ? Number(matched[2]) : stat.size - 1
      if (Number.isFinite(start) && Number.isFinite(end) && start <= end && start < stat.size) {
        const last = Math.min(end, stat.size - 1)
        res.writeHead(206, {
          ...headers,
          'Accept-Ranges': 'bytes',
          'Content-Range': `bytes ${start}-${last}/${stat.size}`,
          'Content-Length': last - start + 1,
        })
        fs.createReadStream(filePath, { start, end: last }).pipe(res)
        return
      }
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` })
      res.end()
      return
    }
  }
  res.writeHead(200, { ...headers, 'Accept-Ranges': 'bytes', 'Content-Length': stat.size })
  fs.createReadStream(filePath).pipe(res)
}

// 可用性兜底：漏网异常只记录不退出
process.on('uncaughtException', (error) => { console.error('[uncaught]', error?.stack || String(error)) })
process.on('unhandledRejection', (reason) => { console.error('[unhandledRejection]', reason?.stack || String(reason)) })

const server = http.createServer(async (req, res) => {
  const requestUrl = safeUrl(req.url)
  const pathname = requestUrl.pathname
  try {
    if (pathname.startsWith('/api/')) await handleApi(req, res, pathname)
    else if (req.method === 'GET') serveStatic(req, res, pathname)
    else sendJson(res, 405, { error: 'Method Not Allowed' })
  } catch (error) {
    console.error(`[API] ${pathname}:`, error)
    if (res.headersSent) return
    const reason = error instanceof Error ? error.message : String(error)
    // 降级：宁可给一句能继续的台词，也不要让前端弹错误
    if (pathname === '/api/galgame/turn') {
      sendJson(res, 200, {
        reply: '……让我再想想，你刚才说的那句，我想认真回应。',
        emotion: '温柔微笑',
        scene: null,
        affinityDelta: 0,
        suggestions: ['没关系，你慢慢想', '我们聊点别的吧', '我在等你'],
        degraded: true,
        detail: reason,
      })
      return
    }
    if (pathname === '/api/chat/turn') {
      sendJson(res, 200, {
        reply: '……嗯，我在这儿。刚才有点走神，你愿意再说一次吗？',
        emotion: '平静',
        affinityDelta: 0,
        degraded: true,
        detail: reason,
      })
      return
    }
    if (pathname === '/api/story/turn') {
      sendJson(res, 200, { narration: '风停了一瞬，故事还在继续。', patch: '', degraded: true, detail: reason })
      return
    }
    sendJson(res, 502, { error: 'AI 服务暂时不可用', detail: reason })
  }
})

server.listen(port, host, () => console.log(`AniVerse server: http://${host}:${port} · model=${model} · key=${apiKey ? 'configured' : 'missing'}`))
