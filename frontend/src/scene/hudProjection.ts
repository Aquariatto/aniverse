/**
 * HUD 曲面投影（技法来源：RhineLabUI / hud-projection.ts）
 *
 * 把一组 DOM 卡片当作一块微曲的玻璃面板：
 * - 组级：整组按指针位置做极小的 rotateX / rotateY，形成"球面视差"；
 *   3D 镜头完全不动，成本只有一次 transform。
 * - 卡级：指针正对的卡片微微鼓起（scale），越远越回到 1。
 *
 * 用独立的 `scale` 属性而不是 `transform`，所以不会和 hover 的 translateY、
 * 卡片本身的磁吸 translate 打架；三者会按 translate → rotate → scale → transform 叠加。
 *
 * 指针静止后自行收敛并停止 rAF，不常驻渲染。
 */

export interface HudGroupSpec {
  /** 组选择器（相对 host 查找） */
  group: string
  /** 组内卡片选择器 */
  item: string
}

export interface HudProjectionOptions {
  /** 组最大旋转角，度 */
  maxTilt?: number
  /** 单卡最大鼓起，scale 增量 */
  maxBulge?: number
  /** 鼓起影响半径，px */
  radius?: number
  /** 透视距离，px。越小曲率越强 */
  perspective?: number
}

interface CardEntry {
  node: HTMLElement
  centerX: number
  centerY: number
  bulge: number
  target: number
}

interface GroupEntry {
  node: HTMLElement
  rect: DOMRect | null
  rx: number
  ry: number
  targetRx: number
  targetRy: number
  applied: boolean
  cards: CardEntry[]
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export const attachHudProjection = (
  host: HTMLElement,
  specs: HudGroupSpec[],
  options: HudProjectionOptions = {},
) => {
  const { maxTilt = 1, maxBulge = 0.02, radius = 430, perspective = 1300 } = options
  const noop = () => {}
  if (!host.isConnected) return noop
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return noop
  if (!window.matchMedia('(pointer: fine)').matches) return noop

  const groups: GroupEntry[] = []
  specs.forEach(({ group, item }) => {
    host.querySelectorAll<HTMLElement>(group).forEach((node) => {
      const cards = Array.from(node.querySelectorAll<HTMLElement>(item)).map<CardEntry>(card => ({
        node: card, centerX: 0, centerY: 0, bulge: 0, target: 0,
      }))
      groups.push({ node, rect: null, rx: 0, ry: 0, targetRx: 0, targetRy: 0, applied: false, cards })
    })
  })
  if (!groups.length) return noop

  let pointerX = 0
  let pointerY = 0
  let pointerInside = false
  let dirty = true
  let frame = 0

  const measure = () => {
    groups.forEach((group) => {
      group.rect = group.node.getBoundingClientRect()
      group.cards.forEach((card) => {
        const rect = card.node.getBoundingClientRect()
        card.centerX = rect.left + rect.width / 2
        card.centerY = rect.top + rect.height / 2
      })
    })
    dirty = false
  }

  const settle = (dt: number) => {
    // 指数收敛，帧率无关
    const step = 1 - Math.exp(-9 * dt)
    let moving = false
    groups.forEach((group) => {
      if (!group.rect) return
      const halfWidth = Math.max(group.rect.width / 2, 1)
      const halfHeight = Math.max(group.rect.height / 2, 1)
      if (pointerInside) {
        const nx = clamp((pointerX - group.rect.left - halfWidth) / halfWidth, -1, 1)
        const ny = clamp((pointerY - group.rect.top - halfHeight) / halfHeight, -1, 1)
        group.targetRx = -ny * maxTilt
        group.targetRy = nx * maxTilt
      } else {
        group.targetRx = 0
        group.targetRy = 0
      }
      group.rx += (group.targetRx - group.rx) * step
      group.ry += (group.targetRy - group.ry) * step
      const rotated = Math.abs(group.rx) > 0.004 || Math.abs(group.ry) > 0.004
      if (rotated || group.applied) {
        group.node.style.transform = rotated
          ? `perspective(${perspective}px) rotateX(${group.rx.toFixed(3)}deg) rotateY(${group.ry.toFixed(3)}deg)`
          : ''
        group.applied = rotated
      }
      if (rotated) moving = true

      group.cards.forEach((card) => {
        if (pointerInside) {
          const distance = Math.hypot(pointerX - card.centerX, pointerY - card.centerY)
          card.target = (1 - clamp(distance / radius, 0, 1)) * maxBulge
        } else {
          card.target = 0
        }
        card.bulge += (card.target - card.bulge) * step
        if (Math.abs(card.bulge) > 0.0004) {
          card.node.style.scale = String(1 + card.bulge)
          moving = true
        } else if (card.node.style.scale) {
          card.node.style.scale = ''
        }
      })
    })
    return moving
  }

  let last = performance.now()
  const tick = (now: number) => {
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now
    const moving = settle(dt)
    if (moving) frame = requestAnimationFrame(tick)
    else frame = 0
  }
  const wake = () => {
    if (frame) return
    last = performance.now()
    frame = requestAnimationFrame(tick)
  }

  const onPointerMove = (event: PointerEvent) => {
    pointerX = event.clientX
    pointerY = event.clientY
    pointerInside = true
    wake()
  }
  const onPointerLeave = () => {
    pointerInside = false
    wake()
  }
  const onLayout = () => {
    dirty = true
    if (pointerInside) wake()
  }

  // 指针一动就必须重新量取：滚动/布局变化后卡片中心会失效
  const onMoveMeasured = (event: PointerEvent) => {
    if (dirty) measure()
    onPointerMove(event)
  }

  window.addEventListener('pointermove', onMoveMeasured, { passive: true })
  window.addEventListener('pointerleave', onPointerLeave)
  window.addEventListener('scroll', onLayout, { passive: true })
  window.addEventListener('resize', onLayout)

  return () => {
    cancelAnimationFrame(frame)
    window.removeEventListener('pointermove', onMoveMeasured)
    window.removeEventListener('pointerleave', onPointerLeave)
    window.removeEventListener('scroll', onLayout)
    window.removeEventListener('resize', onLayout)
    groups.forEach((group) => {
      group.node.style.transform = ''
      group.cards.forEach((card) => { card.node.style.scale = '' })
    })
  }
}
