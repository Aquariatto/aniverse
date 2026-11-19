export const galgameEmotions = [
  '开心大笑',
  '害羞脸红',
  '惊讶',
  '生气嘟嘴',
  '难过含泪',
  '面无表情',
  '困倦打哈欠',
  '自信得意',
  '兴奋欢呼',
  '温柔微笑',
] as const

export type GalgameEmotion = (typeof galgameEmotions)[number]

export const defaultEmotion: GalgameEmotion = '温柔微笑'
export const defaultScene = '黄昏天台'

export const characterImages: Record<GalgameEmotion, string> = {
  开心大笑: '/assets/character/C001.webp',
  害羞脸红: '/assets/character/C006.webp',
  惊讶: '/assets/character/C011.webp',
  生气嘟嘴: '/assets/character/C016.webp',
  难过含泪: '/assets/character/C021.webp',
  面无表情: '/assets/character/C026.webp',
  困倦打哈欠: '/assets/character/C031.webp',
  自信得意: '/assets/character/C036.webp',
  兴奋欢呼: '/assets/character/C041.webp',
  温柔微笑: '/assets/character/C046.webp',
}

export const sceneImages: Record<string, string> = {
  学校教室: '/assets/scene/S01.webp',
  现代公寓客厅: '/assets/scene/S02.webp',
  便利店: '/assets/scene/S03.webp',
  学校天台: '/assets/scene/S04.webp',
  图书馆: '/assets/scene/S05.webp',
  小咖啡馆: '/assets/scene/S06.webp',
  地铁站台: '/assets/scene/S07.webp',
  公园长椅: '/assets/scene/S08.webp',
  雨夜街道: '/assets/scene/S09.webp',
  樱花步道: '/assets/scene/S10.webp',
  海边沙滩: '/assets/scene/S11.webp',
  学校操场: '/assets/scene/S12.webp',
  走廊: '/assets/scene/S13.webp',
  黄昏天台: '/assets/scene/S14.webp',
  自助洗衣店: '/assets/scene/S15.webp',
  夜晚阳台: '/assets/scene/S16.webp',
  自习室: '/assets/scene/S17.webp',
  超市: '/assets/scene/S18.webp',
  人行天桥: '/assets/scene/S19.webp',
  河堤: '/assets/scene/S20.webp',
  游乐园: '/assets/scene/S21.webp',
  车站候车室: '/assets/scene/S22.webp',
  书店: '/assets/scene/S23.webp',
  宿舍房间: '/assets/scene/S24.webp',
  花店: '/assets/scene/S25.webp',
}

export function normalizeEmotion(value: unknown): GalgameEmotion {
  return typeof value === 'string' && (galgameEmotions as readonly string[]).includes(value)
    ? value as GalgameEmotion
    : defaultEmotion
}

export function normalizeScene(value: unknown, fallback = defaultScene): string {
  return typeof value === 'string' && sceneImages[value] ? value : fallback
}


/** 每种情绪对应 5 个姿势变体（C001~C050，按情绪×5 排列） */
export const characterVariants: Record<string, string[]> = Object.fromEntries(
  Object.keys(characterImages).map((emotion, index) => [
    emotion,
    Array.from({ length: 5 }, (_, i) => `/assets/character/C${String(index * 5 + i + 1).padStart(3, '0')}.webp`),
  ]),
)


/** 场景对应的事件 CG（每个场景 2 张，随机触发） */
export const cgImages: Record<string, string[]> = Object.fromEntries(
  Object.keys(sceneImages).map((scene, index) => {
    const code = `F${String(index + 1).padStart(2, '0')}`
    return [scene, [`/assets/cg/${code}-1.webp`, `/assets/cg/${code}-2.webp`]]
  }),
)
