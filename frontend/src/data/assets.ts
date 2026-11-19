/**
 * 素材地址工具。
 *
 * `scripts/build-images.py` 会为每张原始 PNG 生成两档 WebP：
 *   <name>.webp       大图（长边 1600，q92，视觉无损）
 *   <name>-640.webp   缩略（长边 640，q86，约 40~80KB）
 *
 * 这里做三件事：
 *   1. 老地址纠正：素材已从 PNG 换成 WebP，但 localStorage 里可能还存着
 *      /images/xxx.png —— 统一改写成 .webp。否则请求会落到 SPA fallback
 *      拿回一段 HTML，浏览器当图片解码失败，界面表现就是「图片全裂」。
 *   2. 缩略图：头像、卡片、列表统一取 -640 版本。
 *   3. 版本号：本地图片带 ?v=… 查询串，换版本即换 URL，可绕开坏缓存。
 *
 * data URL（上传/生图）、远程地址、svg 原样返回。
 */
const ASSET_VERSION = '4'

const LOCAL_ASSET = /^\/(assets|images)\//
const LEGACY_PNG = /\.png$/i

/** 老 PNG 地址 → WebP（只处理站内相对路径） */
function normalizeLegacy(url: string): string {
  if (typeof url !== 'string' || !url) return url
  if (!url.startsWith('/') || !LOCAL_ASSET.test(url)) return url
  const [path, query = ''] = url.split('?')
  const fixed = LEGACY_PNG.test(path) ? path.replace(LEGACY_PNG, '.webp') : path
  return query ? `${fixed}?${query}` : fixed
}

export function assetUrl(url: string): string {
  const normalized = normalizeLegacy(url)
  if (typeof normalized !== 'string' || !normalized) return normalized
  if (!normalized.startsWith('/')) return normalized       // data: / http(s):
  if (!LOCAL_ASSET.test(normalized)) return normalized     // /music 等不动
  if (normalized.includes('?v=')) return normalized
  const [path] = normalized.split('?')
  return `${path}?v=${ASSET_VERSION}`
}

export function thumbUrl(url: string): string {
  const normalized = normalizeLegacy(url)
  if (typeof normalized !== 'string' || !normalized) return normalized
  let next = normalized
  if (next.endsWith('.webp') && !next.includes('-640.webp')) {
    next = next.replace(/\.webp$/, '-640.webp')
  }
  return assetUrl(next)
}
