export interface CompressOptions {
  /** 输出类型：默认 JPEG；透明底的图要传 image/webp，否则 alpha 会被抹成黑底/白底 */
  mime?: 'image/jpeg' | 'image/webp'
  maxEdge?: number
  quality?: number
  /** 目标比例：出图比例和请求差超过 6% 时居中裁切到该比例 */
  ratio?: { width: number; height: number }
}

export interface CompressedImage {
  url: string
  width: number
  height: number
  /** 是否为了对齐比例做过裁切 */
  cropped?: boolean
}

/**
 * 生图接口返回的是整张 base64 PNG，常见 2~4 MB。
 * 直接塞进消息和图库，两张就能顶爆 localStorage 的 5 MB 配额，
 * 所以统一压到「长边 ≈ 1024」（一般 150~350 KB）——
 * 在对话气泡（≤180px）和灯箱（≤92vw）里看不出差别。
 * 需要保留透明通道时改用 WebP（JPEG 不支持 alpha）。
 */
export async function compressImage(source: string, options: CompressOptions = {}): Promise<CompressedImage> {
  const { mime = 'image/jpeg', maxEdge = 1024, quality = mime === 'image/webp' ? 0.92 : 0.86, ratio } = options
  if (typeof source !== 'string' || !source.startsWith('data:image/')) return { url: source, width: 0, height: 0 }
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('image decode failed'))
      element.src = source
    })
    const naturalWidth = image.naturalWidth || image.width
    const naturalHeight = image.naturalHeight || image.height
    if (!naturalWidth || !naturalHeight) return { url: source, width: 0, height: 0 }

    // 上游偶发不按请求比例出图（例如要 7:3 给了 1:1），这里统一裁切到目标比例
    let sourceX = 0
    let sourceY = 0
    let sourceWidth = naturalWidth
    let sourceHeight = naturalHeight
    if (ratio && ratio.width > 0 && ratio.height > 0) {
      const target = ratio.width / ratio.height
      const current = naturalWidth / naturalHeight
      if (Math.abs(current - target) / target > 0.06) {
        if (current > target) {
          sourceWidth = Math.max(1, Math.round(naturalHeight * target))
          sourceX = Math.round((naturalWidth - sourceWidth) / 2)
        } else {
          sourceHeight = Math.max(1, Math.round(naturalWidth / target))
          sourceY = Math.round((naturalHeight - sourceHeight) / 2)
        }
      }
    }
    const cropped = sourceWidth !== naturalWidth || sourceHeight !== naturalHeight
    const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight))
    const width = Math.max(1, Math.round(sourceWidth * scale))
    const height = Math.max(1, Math.round(sourceHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return { url: source, width: naturalWidth, height: naturalHeight }
    // JPEG 没有 alpha：透明区域不填白会变成纯黑。
    // 上游文档也建议普通参考图不要带透明通道（透明会被当成"重绘区域"）。
    if (mime !== 'image/webp') {
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, width, height)
    }
    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height)
    const url = canvas.toDataURL(mime, quality)
    // 压缩反而变大（极少见，比如本来就是小尺寸）就保留原图
    return url.length < source.length
      ? { url, width, height, cropped }
      : { url: source, width: naturalWidth, height: naturalHeight, cropped }
  } catch {
    return { url: source, width: 0, height: 0 }
  }
}
