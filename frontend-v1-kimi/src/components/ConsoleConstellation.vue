<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import * as THREE from 'three'

const container = ref<HTMLDivElement>()
let cleanup: (() => void) | undefined

const damp = (current: number, target: number, rate: number, dt: number) => THREE.MathUtils.lerp(current, target, 1 - Math.exp(-rate * dt))

onMounted(() => {
  const host = container.value
  const consoleSection = host?.closest('.console-section') as HTMLElement | null
  if (!host || !consoleSection) return
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' })
  } catch {
    return
  }
  renderer.setClearColor(0x000000, 0)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.domElement.className = 'console-webgl'
  host.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 40)
  camera.position.z = 7.5
  scene.add(new THREE.HemisphereLight(0xffffff, 0x74658f, 1.5))
  const light = new THREE.DirectionalLight(0xfff4ef, 2.2)
  light.position.set(3, 4, 6)
  scene.add(light)

  const root = new THREE.Group()
  scene.add(root)
  const ringMaterial = new THREE.MeshBasicMaterial({ color: '#8c76c5', transparent: true, opacity: 0.2, depthWrite: false })
  const crystalMaterial = new THREE.MeshPhysicalMaterial({ color: '#b39bde', roughness: 0.24, metalness: 0.2, clearcoat: 0.8, transparent: true, opacity: 0.55 })

  const createOrrery = (color: string, scale: number) => {
    const group = new THREE.Group()
    const localRing = ringMaterial.clone()
    localRing.color.set(color)
    for (let i = 0; i < 3; i += 1) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85 + i * 0.42, 0.008, 6, 128), localRing)
      ring.rotation.set(0.55 + i * 0.38, i * 0.42, i * 0.65)
      group.add(ring)
    }
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 2), crystalMaterial.clone())
    ;(core.material as THREE.MeshPhysicalMaterial).color.set(color)
    group.add(core)
    const shards = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.055, 0), crystalMaterial, 24)
    const dummy = new THREE.Object3D()
    for (let i = 0; i < 24; i += 1) {
      const angle = i * 2.399963
      const radius = 0.9 + (i % 5) * 0.22
      dummy.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.65, Math.sin(angle * 1.3) * 0.4)
      dummy.rotation.set(i * 0.3, i * 0.7, i * 0.2)
      dummy.scale.setScalar(0.65 + (i % 4) * 0.18)
      dummy.updateMatrix()
      shards.setMatrixAt(i, dummy.matrix)
    }
    shards.instanceMatrix.needsUpdate = true
    group.add(shards)
    group.scale.setScalar(scale)
    root.add(group)
    return group
  }

  const orreryA = createOrrery('#9a82d2', 1)
  const orreryB = createOrrery('#86b4ca', 0.72)

  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-5.5, -2.1, -2), new THREE.Vector3(-2.8, 1.3, -1.5),
    new THREE.Vector3(0.4, -0.7, -2.2), new THREE.Vector3(3.1, 1.5, -1.8), new THREE.Vector3(5.5, -1.2, -2),
  ])
  const flowMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color('#aa8ed4') } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform float uTime;uniform vec3 uColor;varying vec2 vUv;void main(){float p=pow(max(0.,sin((vUv.x-uTime*.035)*6.283)),18.);gl_FragColor=vec4(mix(uColor,vec3(1.),p*.4),.08+p*.36);}`,
    transparent: true, depthWrite: false,
  })
  const flow = new THREE.Mesh(new THREE.TubeGeometry(curve, 180, 0.009, 5, false), flowMaterial)
  root.add(flow)

  const count = 280
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = Math.sin(i * 12.37) * 5.2
    positions[i * 3 + 1] = Math.cos(i * 8.13) * 3.2
    positions[i * 3 + 2] = -1 - (i % 30) * 0.12
    const color = new THREE.Color(i % 4 === 0 ? '#d6a4b8' : i % 3 === 0 ? '#8db7ca' : '#a58bd0')
    colors.set([color.r, color.g, color.b], i * 3)
  }
  const starGeometry = new THREE.BufferGeometry()
  starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  starGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ size: 0.035, vertexColors: true, transparent: true, opacity: 0.42, depthWrite: false }))
  scene.add(stars)

  let width = 1
  let height = 1
  let frame = 0
  let visible = true
  let time = 0
  let last = performance.now()
  let scroll = 0
  let scrollTarget = 0
  let boost = 0
  let boostTarget = 0
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
  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(host)
  resize()

  const onScroll = () => {
    const rect = consoleSection.getBoundingClientRect()
    scrollTarget = THREE.MathUtils.clamp((window.innerHeight - rect.top) / (rect.height + window.innerHeight), 0, 1)
  }
  const onPointerMove = (event: PointerEvent) => {
    pointerTarget.set(event.clientX / window.innerWidth - 0.5, event.clientY / window.innerHeight - 0.5)
    const target = event.target as Element
    boostTarget = target.closest('.feature-entry,.console-stat,.character-card') ? 1 : 0
  }
  const visibilityObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting }, { rootMargin: '100px' })
  visibilityObserver.observe(consoleSection)
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  onScroll()

  const animate = (now: number) => {
    frame = requestAnimationFrame(animate)
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now
    if (!visible || document.hidden) return
    if (!reduced) time += dt
    scroll = damp(scroll, scrollTarget, 4, dt)
    boost = damp(boost, boostTarget, 6, dt)
    pointer.x = damp(pointer.x, pointerTarget.x, 4, dt)
    pointer.y = damp(pointer.y, pointerTarget.y, 4, dt)

    orreryA.position.set(3.25 + pointer.x * 0.35, 1.25 - scroll * 1.2 - pointer.y * 0.2, -1.2)
    orreryB.position.set(-3.35 - pointer.x * 0.28, -1.55 + scroll * 1.15 - pointer.y * 0.16, -1.8)
    orreryA.rotation.set(time * 0.08 + scroll * 0.7, time * 0.12 + pointer.x * 0.25, scroll * 0.5)
    orreryB.rotation.set(-time * 0.06 - scroll * 0.5, -time * 0.1 + pointer.x * 0.18, -scroll * 0.4)
    orreryA.scale.setScalar(1 + boost * 0.09)
    root.rotation.y = pointer.x * 0.08 + scroll * 0.18
    root.position.y = scroll * 0.45
    flowMaterial.uniforms.uTime.value = time
    stars.rotation.z = scroll * 0.18 + pointer.x * 0.025
    stars.position.y = scroll * 0.5 - pointer.y * 0.12
    camera.position.x = pointer.x * 0.18
    camera.position.y = -pointer.y * 0.12
    camera.lookAt(0, 0, 0)
    renderer.render(scene, camera)
  }
  frame = requestAnimationFrame(animate)

  cleanup = () => {
    cancelAnimationFrame(frame)
    resizeObserver.disconnect()
    visibilityObserver.disconnect()
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('pointermove', onPointerMove)
    scene.traverse(object => {
      const mesh = object as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
      if (mesh.material) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        materials.forEach(material => material.dispose())
      }
    })
    renderer.dispose()
    renderer.domElement.remove()
  }
})

onBeforeUnmount(() => cleanup?.())
</script>

<template><div ref="container" class="console-constellation" aria-hidden="true" /></template>

<style scoped>
.console-constellation { position: sticky; top: 0; z-index: 0; height: 100vh; margin-bottom: -100vh; overflow: hidden; pointer-events: none; }
.console-constellation :deep(.console-webgl) { position: absolute; inset: 0; display: block; width: 100%; height: 100%; }
</style>
