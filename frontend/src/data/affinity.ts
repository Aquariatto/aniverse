/**
 * 好感度 → 关系阶段。
 * 原来 character.level 是写死的字符串（永远是「亲近」），现在统一按 affinity 派生，
 * 改数值就会自动升级/降级，并给出 toast 提示。
 */
export interface AffinityLevel {
  min: number
  label: string
  hint: string
}

/** 从高到低排列，levelOf 取第一个够得着的 */
export const AFFINITY_LEVELS: AffinityLevel[] = [
  { min: 75, label: '心动', hint: '她已经开始等你的消息了' },
  { min: 50, label: '亲近', hint: '再靠近一点点，就会有新的故事' },
  { min: 25, label: '熟悉', hint: '你们正在慢慢习惯彼此的存在' },
  { min: 0, label: '陌生', hint: '第一句话，会成为第一条记忆' },
]

export const levelOf = (affinity: number): AffinityLevel => {
  const value = Number(affinity)
  return AFFINITY_LEVELS.find(level => (Number.isFinite(value) ? value : 0) >= level.min) ?? AFFINITY_LEVELS[AFFINITY_LEVELS.length - 1]
}

/** 下一个阶段（已经是最高就返回 null） */
export const nextLevelOf = (affinity: number): AffinityLevel | null => {
  const value = Number.isFinite(Number(affinity)) ? Number(affinity) : 0
  return [...AFFINITY_LEVELS].reverse().find(level => level.min > value) ?? null
}
