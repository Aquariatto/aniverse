/**
 * 构建内置默认歌单：抓「塞壬唱片」热门曲目 → 探测可播 → 下载 mp3 + 封面到 public/music。
 *
 *   node scripts/fetch-playlist.mjs
 *
 * 产物：
 *   public/music/msr-<id>.mp3
 *   public/music/cover-<id>.jpg
 *   public/music/playlist.json
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(ROOT, 'public', 'music')
const KEYWORD = process.env.PLAYLIST_KEYWORD || '塞壬唱片'
const TARGET = Number(process.env.PLAYLIST_COUNT || 10)

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Referer: 'https://music.163.com/',
  Origin: 'https://music.163.com',
}

const get = (url) => fetch(url, { headers: HEADERS, redirect: 'follow' })

async function searchAll(keyword, limit = 60) {
  const pages = Math.ceil(limit / 30)
  const songs = []
  for (let page = 0; page < pages; page += 1) {
    const url = `https://music.163.com/api/cloudsearch/pc?s=${encodeURIComponent(keyword)}&type=1&limit=30&offset=${page * 30}`
    const payload = await get(url).then(r => r.json()).catch(() => ({}))
    const list = payload?.result?.songs || []
    if (!list.length) break
    for (const item of list) {
      const artists = (item.ar || []).map(a => a?.name || '').filter(Boolean).join('/')
      const album = item.al || {}
      songs.push({
        id: Number(item.id),
        name: String(item.name || ''),
        artists,
        album: String(album.name || ''),
        durationMs: Number(item.dt || 0),
        fee: Number(item.fee || 0),
        pop: Number(item.pop || 0),
        cover: String(album.picUrl || ''),
      })
    }
  }
  return songs
}

async function resolveAudio(id) {
  const outer = `https://music.163.com/song/media/outer/url?id=${id}.mp3`
  try {
    const response = await get(outer)
    const type = String(response.headers.get('content-type') || '').toLowerCase()
    if (response.status === 200 && type.includes('audio')) return response.url || outer
  } catch { /* ignore */ }
  return ''
}

async function download(url, file) {
  const response = await get(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  await fs.writeFile(file, buffer)
  return buffer.length
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true })
  const all = await searchAll(KEYWORD)
  console.log(`搜索「${KEYWORD}」得到 ${all.length} 条`)

  const related = all.filter(song => /塞壬唱片|MSR/i.test(song.artists))
  console.log(`其中厂牌相关 ${related.length} 条`)

  // 热度优先 → 可播性（fee 0/8 更可能能放）→ 时长（挡住试听片段）
  const ranked = related
    .filter(song => song.durationMs > 60000 && song.durationMs < 600000)
    .sort((a, b) => (b.pop - a.pop) || ((a.fee === 1 ? 1 : 0) - (b.fee === 1 ? 1 : 0)) || (b.durationMs - a.durationMs))

  const picked = []
  const seenNames = new Set()
  for (const song of ranked) {
    if (picked.length >= TARGET) break
    const key = song.name.trim().toLowerCase()
    if (seenNames.has(key)) continue
    const audio = await resolveAudio(song.id)
    if (!audio) { console.log(`  ✗ 不可播: ${song.name} - ${song.artists}`); continue }
    seenNames.add(key)
    picked.push({ ...song, audio })
    console.log(`  ✓ ${picked.length}/${TARGET} ${song.name} - ${song.artists} (${Math.round(song.durationMs / 1000)}s)`)
  }

  const playlist = []
  for (const song of picked) {
    const audioFile = `msr-${song.id}.mp3`
    const coverFile = `cover-${song.id}.jpg`
    const audioSize = await download(song.audio, path.join(OUT_DIR, audioFile)).catch(err => {
      console.log(`  下载失败 ${song.name}: ${err.message}`)
      return 0
    })
    if (!audioSize) continue
    let coverSrc = ''
    if (song.cover) {
      const coverUrl = `${song.cover}?param=300y300`
      const ok = await download(coverUrl, path.join(OUT_DIR, coverFile)).then(size => size > 500).catch(() => false)
      if (ok) coverSrc = `/music/${coverFile}`
    }
    console.log(`  ↓ ${audioFile} ${(audioSize / 1048576).toFixed(1)}MB`)
    playlist.push({
      id: song.id,
      name: song.name,
      artists: song.artists,
      album: song.album,
      durationMs: song.durationMs,
      cover: coverSrc,
      src: `/music/${audioFile}`,
      fee: song.fee,
      playable: true,
    })
  }

  await fs.writeFile(path.join(OUT_DIR, 'playlist.json'), `${JSON.stringify({ title: '塞壬唱片 · 精选', songs: playlist }, null, 2)}\n`, 'utf8')
  const total = (await Promise.all(playlist.map(song => fs.stat(path.join(OUT_DIR, path.basename(song.src))).then(stat => stat.size))))
    .reduce((sum, size) => sum + size, 0)
  console.log(`\n完成：${playlist.length} 首，合计 ${(total / 1048576).toFixed(1)}MB → public/music/`)
}

main().catch(error => { console.error(error); process.exit(1) })
