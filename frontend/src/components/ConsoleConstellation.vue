<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import * as THREE from 'three'

const container = ref<HTMLDivElement>()
let cleanup: (() => void) | undefined

const damp = (c: number, t: number, r: number, dt: number) => THREE.MathUtils.lerp(c, t, 1 - Math.exp(-r * dt))

/**
 * 星云贴图：把十几团随机偏移的径向渐变叠在一起，
 * 比单个高斯球更像被风吹过的云，也比程序化 noise 便宜得多。
 */
const createNebulaTexture = () => {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  for (let i = 0; i < 16; i += 1) {
    const x = size * 0.5 + (Math.random() - 0.5) * size * 0.5
    const y = size * 0.5 + (Math.random() - 0.5) * size * 0.5
    const radius = size * (0.1 + Math.random() * 0.26)
    const alpha = 0.09 + Math.random() * 0.13
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)
    gradient.addColorStop(0, `rgba(255,255,255,${alpha})`)
    gradient.addColorStop(0.55, `rgba(255,255,255,${alpha * 0.32})`)
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  }
  return new THREE.CanvasTexture(canvas)
}

interface Ring {
  geometry: THREE.BufferGeometry
  material: THREE.PointsMaterial
  points: THREE.Points
  radius: Float32Array
  angle: Float32Array
  speed: Float32Array
  offsetY: Float32Array
  depth: Float32Array
  count: number
  baseOpacity: number
}

onMounted(() => {
  const host = container.value
  const section = host?.closest('.console-section') as HTMLElement | null
  if (!host || !section) return
  // 被媒体查询隐藏 / 没有布局尺寸时不要白开一个 WebGL 上下文
  if (host.clientWidth < 40 || host.clientHeight < 40) return

  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' })
  } catch { return }

  renderer.setClearColor(0x000000, 0)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.domElement.className = 'console-webgl'
  host.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60)
  camera.position.set(0, 0.1, 1.9)
  camera.lookAt(0, 0.15, -4.2)

  const root = new THREE.Group()
  scene.add(root)

  // 扁平椭圆盘：正面看是一团被压扁的星尘，越靠内转得越快
  const RING_Y = 0.44
  const RING_SQUASH = 0.22
  const RING_Z = -4.2
  const palette = ['#b49bff', '#8fd8ea', '#f0b2c8', '#ffffff', '#ffffff', '#ffffff']

  const createRing = (count: number, minRadius: number, maxRadius: number, size: number, opacity: number, spread: number) => {
    const position = new Float32Array(count * 3)
    const color = new Float32Array(count * 3)
    const radius = new Float32Array(count)
    const angle = new Float32Array(count)
    const speed = new Float32Array(count)
    const offsetY = new Float32Array(count)
    const depth = new Float32Array(count)

    for (let i = 0; i < count; i += 1) {
      // 半径用 0.7 次方分布：中心密、外圈稀，看起来像旋涡而不是一个空心环
      radius[i] = minRadius + (maxRadius - minRadius) * Math.random() ** 0.7
      angle[i] = Math.random() * Math.PI * 2
      // 差速旋转：内圈快、外圈慢
      speed[i] = 0.055 / (0.35 + radius[i] * 0.28)
      offsetY[i] = (Math.random() - 0.5) * spread
      depth[i] = (Math.random() - 0.5) * 1.2
      const tint = new THREE.Color(palette[Math.floor(Math.random() * palette.length)])
      color.set([tint.r, tint.g, tint.b], i * 3)
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(color, 3))
    const material = new THREE.PointsMaterial({
      size, vertexColors: true, transparent: true, opacity,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    })
    const points = new THREE.Points(geometry, material)
    root.add(points)
    return { geometry, material, points, radius, angle, speed, offsetY, depth, count, baseOpacity: opacity }
  }

  const rings: Ring[] = [
    createRing(420, 1.1, 6.9, 0.032, 0.72, 0.16),
    createRing(120, 1.4, 6.6, 0.07, 0.85, 0.5),
    // 盘外的稀薄浮尘，把整条带子填满，不至于只有中间一圈
    createRing(200, 3.4, 11.5, 0.03, 0.5, 1.9),
  ]

  // 星云：几团很淡的彩色云，压在星尘后面，负责色温。
  // 刻意往两侧铺，别都堆在正中 —— 堆中间会变成一块糊掉的紫色光斑。
  const nebulaTexture = createNebulaTexture()
  const nebulaSpec = [
    { color: '#6f4ad0', x: -6.2, y: 0.5, z: -9.4, scale: [12, 6.2] as const, opacity: 0.26 },
    { color: '#b9679f', x: 5.9, y: 0.2, z: -8.8, scale: [11, 5.4] as const, opacity: 0.22 },
    { color: '#4b93bd', x: -2.6, y: 0.9, z: -10.4, scale: [13, 5.6] as const, opacity: 0.18 },
    { color: '#9469e2', x: 2.4, y: 1.1, z: -11, scale: [12, 5] as const, opacity: 0.15 },
  ]
  const nebulae = nebulaSpec.map((spec) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: nebulaTexture, color: new THREE.Color(spec.color), transparent: true,
      opacity: spec.opacity, depthWrite: false, blending: THREE.AdditiveBlending,
    }))
    sprite.position.set(spec.x, spec.y, spec.z)
    sprite.scale.set(spec.scale[0], spec.scale[1], 1)
    scene.add(sprite)
    return { sprite, baseX: spec.x, baseY: spec.y, baseOpacity: spec.opacity, seed: Math.random() * 10 }
  })

  /**
   * 两组用细线连起来的星点 —— 让 "FROM COSMOS TO CONNECTION" 这句话有个对应的形状，
   * 不然整片只是随机亮点。每组的点和线都装在自己的 Group 里，动的时候只转 Group，
   * 不需要每帧改顶点。
   */
  const createConstellation = (center: THREE.Vector3, spread: number, count: number, tint: string, opacity: number) => {
    const group = new THREE.Group()
    group.position.copy(center)
    const nodes: THREE.Vector3[] = []
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2
      const radius = spread * Math.sqrt(Math.random()) * 0.9 + spread * 0.18
      nodes.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.58, 0))
    }
    // 按"最近邻"串成一条折线：比按角度顺序连更像真的星座，不会连成一个规整多边形
    const path: THREE.Vector3[] = [nodes[0]]
    const rest = nodes.slice(1)
    while (rest.length) {
      const last = path[path.length - 1]
      let nearest = 0
      let best = Infinity
      rest.forEach((node, index) => {
        const distance = node.distanceToSquared(last)
        if (distance < best) { best = distance; nearest = index }
      })
      path.push(rest.splice(nearest, 1)[0])
    }

    const pointGeometry = new THREE.BufferGeometry().setFromPoints(nodes)
    const pointMaterial = new THREE.PointsMaterial({
      color: new THREE.Color(tint), size: 0.062, transparent: true, opacity,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    })
    group.add(new THREE.Points(pointGeometry, pointMaterial))

    const lineGeometry = new THREE.BufferGeometry().setFromPoints(path)
    const lineMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color(tint), transparent: true, opacity: opacity * 0.3,
      depthWrite: false, blending: THREE.AdditiveBlending,
    })
    group.add(new THREE.Line(lineGeometry, lineMaterial))

    scene.add(group)
    return {
      group, pointGeometry, pointMaterial, lineGeometry, lineMaterial,
      baseY: center.y,
      basePointOpacity: opacity,
      baseLineOpacity: opacity * 0.3,
      speed: 0.028 + Math.random() * 0.022,
      seed: Math.random() * 10,
    }
  }

  const constellations = [
    createConstellation(new THREE.Vector3(-4.3, 1.35, -4.8), 1.15, 5, '#c7b6ff', 0.46),
    createConstellation(new THREE.Vector3(4.6, 0.95, -5.2), 0.95, 4, '#9fd4e8', 0.38),
  ]

  let width = 1, height = 1
  let frame = 0, time = 0, last = performance.now()
  let scroll = 0, scrollTarget = 0
  let visible = true
  const pointer = new THREE.Vector2()
  const pointerTarget = new THREE.Vector2()
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const resize = () => {
    width = Math.max(host.clientWidth, 1)
    height = Math.max(host.clientHeight, 1)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height)
  }
  const ro = new ResizeObserver(resize)
  ro.observe(host)
  resize()

  const onScroll = () => {
    const rect = section.getBoundingClientRect()
    scrollTarget = THREE.MathUtils.clamp((window.innerHeight - rect.top) / (rect.height + window.innerHeight * 0.6), 0, 1)
  }
  const onPointer = (e: PointerEvent) => {
    pointerTarget.set(e.clientX / window.innerWidth - 0.5, e.clientY / window.innerHeight - 0.5)
  }
  const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting }, { rootMargin: '120px' })
  io.observe(section)
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('pointermove', onPointer, { passive: true })
  onScroll()

  const animate = (now: number) => {
    frame = requestAnimationFrame(animate)
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now
    if (!visible || document.hidden) return
    if (!reduced) time += dt

    scroll = damp(scroll, scrollTarget, 3.4, dt)
    pointer.x = damp(pointer.x, pointerTarget.x, 3, dt)
    pointer.y = damp(pointer.y, pointerTarget.y, 3, dt)

    rings.forEach((ring) => {
      const position = (ring.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array
      for (let i = 0; i < ring.count; i += 1) {
        ring.angle[i] += ring.speed[i] * dt
        const radius = ring.radius[i]
        const angle = ring.angle[i]
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        position[i * 3] = cos * radius
        position[i * 3 + 1] = RING_Y + sin * radius * RING_SQUASH + ring.offsetY[i]
        position[i * 3 + 2] = RING_Z + sin * radius * 0.42 + ring.depth[i]
      }
      ;(ring.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
    })

    nebulae.forEach((cloud) => {
      cloud.sprite.position.x = cloud.baseX + Math.sin(time * 0.08 + cloud.seed) * 0.9 - pointer.x * 0.6
      cloud.sprite.position.y = cloud.baseY + Math.cos(time * 0.06 + cloud.seed) * 0.32 - pointer.y * 0.4 - scroll * 0.3
      cloud.sprite.material.opacity = cloud.baseOpacity * (0.78 + 0.22 * Math.sin(time * 0.24 + cloud.seed))
    })

    root.position.x = pointer.x * 0.42
    root.position.y = -pointer.y * 0.26 - scroll * 0.35
    root.rotation.z = Math.sin(time * 0.05) * 0.02 + pointer.x * 0.02

    // 极轻的整体呼吸，避免一整片死掉的亮点
    rings.forEach((ring, index) => {
      ring.material.opacity = ring.baseOpacity * (0.88 + 0.12 * Math.sin(time * 0.5 + index * 2.1))
    })

    constellations.forEach((item) => {
      item.group.rotation.z = time * item.speed + item.seed
      // 只在这里做小幅的上下浮动，基准值另存，避免逐帧累加漂走
      item.group.position.y = item.baseY + Math.sin(time * 0.28 + item.seed) * 0.07
      const breathe = 0.72 + 0.28 * Math.sin(time * 0.55 + item.seed)
      item.pointMaterial.opacity = item.basePointOpacity * breathe
      item.lineMaterial.opacity = item.baseLineOpacity * breathe
    })

    renderer.render(scene, camera)
  }
  frame = requestAnimationFrame(animate)

  cleanup = () => {
    cancelAnimationFrame(frame)
    ro.disconnect()
    io.disconnect()
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('pointermove', onPointer)
    rings.forEach((ring) => {
      ring.geometry.dispose()
      ring.material.dispose()
    })
    nebulae.forEach((cloud) => cloud.sprite.material.dispose())
    constellations.forEach((item) => {
      item.pointGeometry.dispose()
      item.pointMaterial.dispose()
      item.lineGeometry.dispose()
      item.lineMaterial.dispose()
    })
    // 四团星云共用同一张贴图，这里统一释放一次
    nebulaTexture.dispose()
    renderer.dispose()
    renderer.domElement.remove()
  }
})

onBeforeUnmount(() => cleanup?.())
</script>

<template><div ref="container" class="console-constellation" aria-hidden="true" /></template>

<style scoped>
/* 控制台顶部的一条横幅（不是整屏背景）：绝对定位、固定高度，
   永远不会被下面的不透明卡片裁成"幽灵矩形"。 */
.console-constellation {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 0;
  height: 336px;
  overflow: hidden;
  pointer-events: none;
  -webkit-mask-image: radial-gradient(ellipse 66% 122% at 50% 42%, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, .8) 44%, rgba(0, 0, 0, .22) 76%, transparent 94%);
  mask-image: radial-gradient(ellipse 66% 122% at 50% 42%, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, .8) 44%, rgba(0, 0, 0, .22) 76%, transparent 94%);
}
.console-constellation :deep(.console-webgl) { position: absolute; inset: 0; display: block; width: 100%; height: 100%; }
/* 手机上这一层得不偿失：首屏已经有一个 WebGL 场景，控制台横幅点不到也看不清 */
@media (max-width: 900px) {
  .console-constellation { display: none; }
}
</style>
