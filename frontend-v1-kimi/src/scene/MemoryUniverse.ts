import * as THREE from 'three'
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import type { Character, Memory } from '../data/mock'
import { createMeteorTexture, createPlanetModel, createSatelliteModel } from './CelestialElements'

interface UniverseCallbacks {
  onSelect: (memory: Memory | null) => void
  onHover: (memory: Memory | null) => void
}

interface Orbit {
  curve: THREE.CatmullRomCurve3
  material: THREE.ShaderMaterial
}

interface MemoryNode {
  memory: Memory
  group: THREE.Group
  hit: THREE.Mesh
  label: CSS2DObject
  labelElement: HTMLButtonElement
  curve: THREE.CatmullRomCurve3
  offset: number
  speed: number
  connection: THREE.Line
  pulse: THREE.Mesh
  scale: number
}

interface PlanetBody {
  root: THREE.Group
  surface: THREE.Mesh
  radiusX: number
  radiusY: number
  depth: number
  offset: number
  speed: number
  inclination: number
}

interface SatelliteBody {
  root: THREE.Group
  curve: THREE.CatmullRomCurve3
  offset: number
  speed: number
}

interface MeteorBody {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  offset: number
  speed: number
  lane: number
}

interface InteractionPulse {
  group: THREE.Group
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>
  points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>
  velocities: Float32Array
  life: number
}

const TYPE_LABEL: Record<Memory['type'], string> = {
  fact: '事实', preference: '偏好', event: '事件', relationship: '羁绊',
}

const TYPE_COLOR: Record<Memory['type'], string> = {
  fact: '#8b76e8', preference: '#e99a7e', event: '#65a9c6', relationship: '#d681a5',
}

const damp = (current: number, target: number, rate: number, dt: number) =>
  THREE.MathUtils.lerp(current, target, 1 - Math.exp(-rate * dt))

const hash = (value: string) => {
  let result = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    result ^= value.charCodeAt(i)
    result = Math.imul(result, 16777619)
  }
  return Math.abs(result)
}

const archShape = (width: number, height: number) => {
  const radius = width / 2
  const bottom = -height / 2
  const centerY = height / 2 - radius
  const shape = new THREE.Shape()
  shape.moveTo(-radius, bottom)
  shape.lineTo(radius, bottom)
  shape.lineTo(radius, centerY)
  shape.absarc(0, centerY, radius, 0, Math.PI, false)
  shape.lineTo(-radius, bottom)
  return shape
}

const archHole = (width: number, height: number) => {
  const radius = width / 2
  const bottom = -height / 2
  const centerY = height / 2 - radius
  const path = new THREE.Path()
  path.moveTo(-radius, bottom)
  path.lineTo(-radius, centerY)
  path.absarc(0, centerY, radius, Math.PI, 0, true)
  path.lineTo(radius, bottom)
  path.lineTo(-radius, bottom)
  return path
}

const quadraticPoint = (start: THREE.Vector3, control: THREE.Vector3, end: THREE.Vector3, t: number, target: THREE.Vector3) => {
  const inv = 1 - t
  return target.set(0, 0, 0)
    .addScaledVector(start, inv * inv)
    .addScaledVector(control, 2 * inv * t)
    .addScaledVector(end, t * t)
}

export class MemoryUniverse {
  private container: HTMLElement
  private callbacks: UniverseCallbacks
  private renderer: THREE.WebGLRenderer
  private composer: EffectComposer
  private bloomPass: UnrealBloomPass
  private labelRenderer: CSS2DRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private dynamicRoot = new THREE.Group()
  private coreGroup?: THREE.Group
  private atmosphereMaterial?: THREE.ShaderMaterial
  private starMaterial?: THREE.ShaderMaterial
  private stars?: THREE.Points
  private environmentTarget: THREE.WebGLRenderTarget
  private resizeObserver: ResizeObserver
  private intersectionObserver: IntersectionObserver
  private glowTexture: THREE.CanvasTexture
  private textureCache = new Map<string, THREE.Texture>()
  private textureLoader = new THREE.TextureLoader()
  private raycaster = new THREE.Raycaster()
  private pointerNdc = new THREE.Vector2(3, 3)
  private pointerTarget = new THREE.Vector2()
  private pointer = new THREE.Vector2()
  private pointerVelocity = 0
  private pointerVelocityTarget = 0
  private lastPointerClient = new THREE.Vector2(-1, -1)
  private trailGeometry?: THREE.BufferGeometry
  private trailMaterial?: THREE.ShaderMaterial
  private trailPositions = new Float32Array(220 * 3)
  private trailVelocities = new Float32Array(220 * 3)
  private trailLives = new Float32Array(220)
  private trailSizes = new Float32Array(220)
  private trailIndex = 0
  private rotationTarget = new THREE.Vector2(0.07, -0.16)
  private nodes: MemoryNode[] = []
  private hitTargets: THREE.Mesh[] = []
  private orbits: Orbit[] = []
  private planets: PlanetBody[] = []
  private satellites: SatelliteBody[] = []
  private mechanicalGears: THREE.Group[] = []
  private meteors: MeteorBody[] = []
  private interactionPulses: InteractionPulse[] = []
  private proceduralTextures: THREE.Texture[] = []
  private character: Character
  private memories: Memory[]
  private selectedId: number | null = null
  private hoveredId: number | null = null
  private dragging = false
  private dragStart = new THREE.Vector2()
  private dragRotation = new THREE.Vector2()
  private dragDistance = 0
  private angularVelocity = new THREE.Vector2()
  private dragSamples: Array<{ x: number; y: number; time: number }> = []
  private effectTime = 0
  private time = 0
  private birth = 0
  private lastTime = performance.now()
  private lastRender = 0
  private raf = 0
  private responsiveScale = 1
  private sceneOffset = 0
  private baseCameraZ = 8.4
  private cameraTargetZ = 8.4
  private scrollTarget = 0
  private scrollProgress = 0
  private isInViewport = true
  private disposed = false
  private motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  private motionEnabled = !this.motionQuery.matches
  private isCompact = false
  private tempVector = new THREE.Vector3()
  private tempStart = new THREE.Vector3()
  private tempControl = new THREE.Vector3()

  constructor(container: HTMLElement, character: Character, memories: Memory[], callbacks: UniverseCallbacks) {
    this.container = container
    this.callbacks = callbacks
    this.character = character
    this.memories = memories
    this.isCompact = container.clientWidth < 560

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.isCompact ? 1.5 : 2))
    this.renderer.setClearColor(0x03040c, 1)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.92
    this.renderer.domElement.className = 'memory-webgl'
    this.renderer.domElement.setAttribute('aria-label', `${character.name}的交互式记忆星轨，拖动旋转，点击记忆节点查看详情`)
    this.container.appendChild(this.renderer.domElement)

    this.labelRenderer = new CSS2DRenderer()
    this.labelRenderer.domElement.className = 'memory-label-layer'
    this.container.appendChild(this.labelRenderer.domElement)

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60)
    this.camera.position.set(0, 0.12, this.baseCameraZ)
    this.scene.background = new THREE.Color('#03040c')
    this.scene.fog = new THREE.FogExp2('#050714', 0.028)

    const renderTarget = new THREE.WebGLRenderTarget(Math.max(container.clientWidth, 1), Math.max(container.clientHeight, 1), { type: THREE.HalfFloatType })
    this.composer = new EffectComposer(this.renderer, renderTarget)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(container.clientWidth, container.clientHeight), this.isCompact ? 0.26 : 0.36, 0.52, 0.9)
    this.composer.addPass(this.bloomPass)
    this.composer.addPass(new OutputPass())

    const pmrem = new THREE.PMREMGenerator(this.renderer)
    const room = new RoomEnvironment()
    this.environmentTarget = pmrem.fromScene(room, 0.04)
    this.scene.environment = this.environmentTarget.texture
    this.scene.environmentIntensity = 0.55
    room.dispose()
    pmrem.dispose()

    const hemisphere = new THREE.HemisphereLight(0xcbd5ff, 0x160f2d, 0.72)
    this.scene.add(hemisphere)
    const key = new THREE.DirectionalLight(0xfff0df, 3.1)
    key.position.set(4, 5, 7)
    this.scene.add(key)
    const fill = new THREE.DirectionalLight(0x829cff, 1.8)
    fill.position.set(-5, 1, 4)
    this.scene.add(fill)
    const violetRim = new THREE.PointLight(0x8b5cff, 9, 18, 2)
    violetRim.position.set(3.5, 1.5, 3)
    this.scene.add(violetRim)
    const warmRim = new THREE.PointLight(0xff9c7a, 7, 16, 2)
    warmRim.position.set(-3.5, -1.5, 2.5)
    this.scene.add(warmRim)

    this.glowTexture = this.createGlowTexture()
    this.createAtmosphere()
    this.createPointerTrail()
    this.createCelestialBodies()
    this.buildDynamicScene()
    this.bindEvents()

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(this.container)
    this.intersectionObserver = new IntersectionObserver(([entry]) => {
      this.isInViewport = entry.isIntersecting
    }, { rootMargin: '120px' })
    this.intersectionObserver.observe(this.container)
    this.resize()
    this.raf = requestAnimationFrame(this.animate)
  }

  setCharacter(character: Character, memories: Memory[]) {
    if (this.disposed) return
    this.character = character
    this.memories = memories
    this.selectedId = null
    this.hoveredId = null
    this.buildDynamicScene()
  }

  setMemories(memories: Memory[]) {
    if (this.disposed) return
    this.memories = memories
    this.buildDynamicScene()
  }

  setSelected(id: number | null) {
    this.selectedId = id
    this.cameraTargetZ = id === null ? this.baseCameraZ : this.baseCameraZ - 0.48
  }

  setMotion(enabled: boolean) {
    this.motionEnabled = enabled
  }

  setScrollProgress(progress: number) {
    this.scrollTarget = THREE.MathUtils.clamp(progress, 0, 1)
  }

  resetView(notify = true) {
    this.rotationTarget.set(0.07, -0.16)
    this.angularVelocity.set(0, 0)
    this.pointerTarget.set(0, 0)
    this.setSelected(null)
    if (notify) this.callbacks.onSelect(null)
  }

  private createGlowTexture() {
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const context = canvas.getContext('2d')!
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64)
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(0.18, 'rgba(255,255,255,.72)')
    gradient.addColorStop(0.5, 'rgba(255,255,255,.16)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 128, 128)
    return new THREE.CanvasTexture(canvas)
  }

  private createAtmosphere() {
    this.atmosphereMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColorA: { value: new THREE.Color(this.character.color) },
        uColorB: { value: new THREE.Color('#efae96') },
        uPointer: { value: new THREE.Vector2() },
        uVelocity: { value: 0 },
        uAspect: { value: 1 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        uniform vec2 uPointer;
        uniform float uVelocity;
        uniform float uAspect;
        varying vec2 vUv;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y);
        }
        float fbm(vec2 p) {
          float value = 0.; float amp = .5;
          for (int i = 0; i < 4; i++) { value += amp * noise(p); p = p * 2.03 + 7.1; amp *= .5; }
          return value;
        }
        void main() {
          vec2 p = vUv - .5;
          float radial = 1.0 - smoothstep(.08, .66, length(p * vec2(1.05, 1.35)));
          float cloud = fbm(vUv * 3.2 + vec2(uTime * .008, -uTime * .005));
          vec3 color = mix(uColorA, uColorB, smoothstep(.25, .85, cloud));
          vec2 mouseDelta = (vUv - (uPointer + .5)) * vec2(uAspect, 1.0);
          float mouseDistance = length(mouseDelta);
          float ripple = sin(mouseDistance * 44.0 - uTime * 4.2) * exp(-mouseDistance * 9.0) * uVelocity;
          color = mix(color, vec3(.62, .76, 1.0), ripple * .32);
          gl_FragColor = vec4(color, radial * (.075 + cloud * .2 + abs(ripple) * .075));
        }
      `,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    })
    const atmosphere = new THREE.Mesh(new THREE.PlaneGeometry(18, 12), this.atmosphereMaterial)
    atmosphere.position.z = -4
    this.scene.add(atmosphere)

    const count = this.isCompact ? 360 : 950
    const positions = new Float32Array(count * 3)
    const sizes = new Float32Array(count)
    const phases = new Float32Array(count)
    const seed = hash(this.character.id)
    for (let i = 0; i < count; i += 1) {
      const angle = (i * 2.399963 + seed * 0.001) % (Math.PI * 2)
      const radius = 1.8 + ((i * 37) % 100) / 100 * 4.6
      positions[i * 3] = Math.cos(angle) * radius
      positions[i * 3 + 1] = Math.sin(angle * 1.13) * (1.2 + ((i * 17) % 100) / 45)
      positions[i * 3 + 2] = -1.2 - ((i * 29) % 100) / 24
      sizes[i] = 1.4 + (i % 7) * 0.42
      phases[i] = (i % 31) / 31 * Math.PI * 2
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
    this.starMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDpr: { value: this.renderer.getPixelRatio() },
        uColor: { value: new THREE.Color(this.character.color) },
        uPointer: { value: new THREE.Vector2() },
        uScroll: { value: 0 },
      },
      vertexShader: `
        attribute float aSize;
        attribute float aPhase;
        uniform float uTime;
        uniform float uDpr;
        uniform vec2 uPointer;
        uniform float uScroll;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          p.x += sin(uTime * .11 + aPhase) * .055 + uPointer.x * (.14 + position.z * .018);
          p.y += cos(uTime * .09 + aPhase * 1.7) * .045 + uPointer.y * .1 + uScroll * position.x * .08;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uDpr * (10.0 / -mv.z);
          vAlpha = .42 + .34 * sin(uTime * .7 + aPhase);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - .5);
          float alpha = (1.0 - smoothstep(.08, .5, d)) * vAlpha;
          gl_FragColor = vec4(mix(uColor, vec3(1.), .38), alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    })
    this.stars = new THREE.Points(geometry, this.starMaterial)
    this.scene.add(this.stars)

    const meteorTexture = createMeteorTexture()
    this.proceduralTextures.push(meteorTexture)
    const meteorCount = this.isCompact ? 4 : 9
    for (let i = 0; i < meteorCount; i += 1) {
      const material = new THREE.MeshBasicMaterial({
        map: meteorTexture, color: i % 3 === 0 ? '#e8b4a4' : '#b6a2e5',
        transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
      })
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.9 + (i % 3) * 0.25, 0.026), material)
      mesh.rotation.z = -0.48
      mesh.position.z = -2.5 - (i % 3)
      this.scene.add(mesh)
      this.meteors.push({ mesh, offset: i / meteorCount, speed: 0.022 + (i % 4) * 0.005, lane: i % 5 })
    }
  }

  private createPointerTrail() {
    this.trailGeometry = new THREE.BufferGeometry()
    this.trailGeometry.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3).setUsage(THREE.DynamicDrawUsage))
    this.trailGeometry.setAttribute('aLife', new THREE.BufferAttribute(this.trailLives, 1).setUsage(THREE.DynamicDrawUsage))
    this.trailGeometry.setAttribute('aSize', new THREE.BufferAttribute(this.trailSizes, 1).setUsage(THREE.DynamicDrawUsage))
    this.trailMaterial = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(this.character.color) }, uDpr: { value: this.renderer.getPixelRatio() } },
      vertexShader: `
        attribute float aLife; attribute float aSize; uniform float uDpr; varying float vLife;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uDpr * (10.0 / -mv.z) * smoothstep(0.0, .18, aLife);
          vLife = aLife;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor; varying float vLife;
        void main(){
          float d = length(gl_PointCoord - .5);
          float alpha = (1.0 - smoothstep(.06, .5, d)) * pow(max(vLife, 0.0), 1.35) * .82;
          gl_FragColor = vec4(mix(uColor, vec3(1.0), .42), alpha);
        }
      `,
      transparent: true, depthWrite: false, toneMapped: false,
    })
    const trail = new THREE.Points(this.trailGeometry, this.trailMaterial)
    trail.frustumCulled = false
    this.scene.add(trail)
  }

  private spawnPointerTrail(event: PointerEvent, dx: number, dy: number, speed: number) {
    if (!this.trailGeometry || speed < 0.015) return
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointerNdc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(this.pointerNdc, this.camera)
    const point = new THREE.Vector3()
    if (!this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0.12), point)) return
    const emissions = Math.min(4, 1 + Math.floor(speed * 4))
    for (let emission = 0; emission < emissions; emission += 1) {
      const index = this.trailIndex
      this.trailIndex = (this.trailIndex + 1) % this.trailLives.length
      const angle = index * 2.399963 + this.time
      const jitter = 0.025 + speed * 0.045
      this.trailPositions[index * 3] = point.x + Math.cos(angle) * jitter
      this.trailPositions[index * 3 + 1] = point.y + Math.sin(angle) * jitter
      this.trailPositions[index * 3 + 2] = point.z + Math.sin(angle * 1.7) * jitter
      this.trailVelocities[index * 3] = dx * 0.0025 + Math.cos(angle) * speed * 0.12
      this.trailVelocities[index * 3 + 1] = -dy * 0.0025 + Math.sin(angle) * speed * 0.12
      this.trailVelocities[index * 3 + 2] = Math.sin(angle * 1.3) * speed * 0.08
      this.trailLives[index] = 1
      this.trailSizes[index] = 2.5 + (index % 6) * 0.75 + speed * 2.2
    }
  }

  private updatePointerTrail(dt: number) {
    if (!this.trailGeometry) return
    const drag = Math.exp(-dt * 2.4)
    for (let i = 0; i < this.trailLives.length; i += 1) {
      if (this.trailLives[i] <= 0) continue
      this.trailLives[i] = Math.max(0, this.trailLives[i] - dt * 0.72)
      this.trailPositions[i * 3] += this.trailVelocities[i * 3] * dt
      this.trailPositions[i * 3 + 1] += this.trailVelocities[i * 3 + 1] * dt
      this.trailPositions[i * 3 + 2] += this.trailVelocities[i * 3 + 2] * dt
      this.trailVelocities[i * 3] *= drag
      this.trailVelocities[i * 3 + 1] *= drag
      this.trailVelocities[i * 3 + 2] *= drag
    }
    this.trailGeometry.getAttribute('position').needsUpdate = true
    this.trailGeometry.getAttribute('aLife').needsUpdate = true
    this.trailGeometry.getAttribute('aSize').needsUpdate = true
  }

  private createCelestialBodies() {
    const configurations = [
      { radius: 0.54, primary: '#9b86d5', secondary: '#e2d8f4', variant: 2, ringed: true, radiusX: 4.6, radiusY: 1.72, depth: -2.8, offset: 0.12, speed: 0.017, inclination: 0.22 },
      { radius: 0.4, primary: '#e5a18c', secondary: '#f7d7bd', variant: 4, ringed: true, radiusX: 4.35, radiusY: 2.05, depth: -2.25, offset: 2.25, speed: -0.013, inclination: -0.28 },
      { radius: 0.24, primary: '#75b7ca', secondary: '#d2edf1', variant: 3, ringed: false, radiusX: 5.05, radiusY: 2.35, depth: -3.6, offset: 4.1, speed: 0.021, inclination: 0.34 },
      { radius: 0.3, primary: '#83baa5', secondary: '#d9eee0', variant: 5, ringed: false, radiusX: 3.95, radiusY: 2.7, depth: -3.1, offset: 1.28, speed: -0.011, inclination: -0.18 },
      { radius: 0.16, primary: '#d9b77e', secondary: '#fff0c9', variant: 6, ringed: false, radiusX: 3.45, radiusY: 1.18, depth: -1.85, offset: 5.2, speed: 0.027, inclination: 0.15 },
    ]
    configurations.forEach((config, index) => {
      const model = createPlanetModel(config.radius, config.primary, config.secondary, config.variant, config.ringed)
      this.proceduralTextures.push(...model.textures)
      model.root.rotation.set(config.inclination, index * 0.35, -0.18 + index * 0.1)
      const angle = config.offset
      model.root.position.set(Math.cos(angle) * config.radiusX, Math.sin(angle) * config.radiusY, config.depth + Math.sin(angle * 0.7) * 0.35)
      const moon = new THREE.Mesh(
        new THREE.SphereGeometry(config.radius * 0.13, 16, 16),
        new THREE.MeshPhysicalMaterial({ color: '#fffafd', roughness: 0.38, clearcoat: 0.4 }),
      )
      moon.position.set(config.radius * 2.25, config.radius * 0.4, 0)
      model.root.add(moon)
      this.scene.add(model.root)
      this.planets.push({ root: model.root, surface: model.surface, radiusX: config.radiusX, radiusY: config.radiusY, depth: config.depth, offset: config.offset, speed: config.speed, inclination: config.inclination })
    })

    const distantArc = new THREE.Mesh(
      new THREE.TorusGeometry(4.9, 0.006, 5, 240, Math.PI * 1.45),
      new THREE.MeshBasicMaterial({ color: '#a999d4', transparent: true, opacity: 0.075, depthWrite: false }),
    )
    distantArc.position.set(0.4, -0.3, -3.6)
    distantArc.rotation.set(1.12, 0.18, -0.55)
    this.scene.add(distantArc)
  }

  private buildDynamicScene() {
    this.scene.remove(this.dynamicRoot)
    this.disposeObject(this.dynamicRoot)
    this.dynamicRoot = new THREE.Group()
    this.scene.add(this.dynamicRoot)
    this.nodes = []
    this.hitTargets = []
    this.orbits = []
    this.satellites = []
    this.mechanicalGears = []
    this.birth = 0

    if (this.atmosphereMaterial) {
      this.atmosphereMaterial.uniforms.uColorA.value.set(this.character.color)
      this.atmosphereMaterial.uniforms.uColorB.value.set(this.character.id === 'mio' ? '#efbd91' : this.character.id === 'nana' ? '#8fc6a5' : '#efae96')
    }
    if (this.starMaterial) this.starMaterial.uniforms.uColor.value.set(this.character.color)
    if (this.trailMaterial) this.trailMaterial.uniforms.uColor.value.set(this.character.color)

    this.createCore()
    this.createOrbits()
    this.createSatellites()
    this.createFragments()
    this.createMemoryNodes()
    this.renderer.domElement.setAttribute('aria-label', `${this.character.name}的交互式记忆星轨，拖动旋转，点击记忆节点查看详情`)
  }

  private createCore() {
    const color = new THREE.Color(this.character.color)
    const core = new THREE.Group()
    this.coreGroup = core
    this.dynamicRoot.add(core)

    const aura = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTexture, color, transparent: true, opacity: 0.48, depthWrite: false,
    }))
    aura.scale.set(4.6, 4.6, 1)
    aura.position.z = -0.65
    core.add(aura)

    const halo = new THREE.Mesh(
      new THREE.RingGeometry(1.48, 1.495, 128),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false }),
    )
    halo.position.z = -0.35
    core.add(halo)

    const backplate = new THREE.Mesh(
      new THREE.ShapeGeometry(archShape(1.9, 2.8), 48),
      new THREE.MeshPhysicalMaterial({ color: color.clone().lerp(new THREE.Color('#171327'), 0.52), roughness: 0.28, metalness: 0.28, transparent: true, opacity: 0.42 }),
    )
    backplate.position.z = -0.11
    core.add(backplate)

    const portraitShape = archShape(1.54, 2.4)
    const portraitGeometry = new THREE.ShapeGeometry(portraitShape, 48)
    const position = portraitGeometry.getAttribute('position')
    const uv = portraitGeometry.getAttribute('uv')
    for (let i = 0; i < position.count; i += 1) {
      uv.setXY(i, (position.getX(i) + 0.77) / 1.54, (position.getY(i) + 1.2) / 2.4)
    }
    uv.needsUpdate = true
    const portraitMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, toneMapped: false })
    const portrait = new THREE.Mesh(portraitGeometry, portraitMaterial)
    portrait.position.z = 0.015
    core.add(portrait)
    this.loadPortrait(this.character.avatar, portraitMaterial)

    const frameShape = archShape(1.82, 2.7)
    frameShape.holes.push(archHole(1.54, 2.4))
    const frameGeometry = new THREE.ExtrudeGeometry(frameShape, {
      depth: 0.11, bevelEnabled: true, bevelSegments: 4, steps: 1, bevelSize: 0.035, bevelThickness: 0.035, curveSegments: 48,
    })
    const frameMaterial = new THREE.MeshPhysicalMaterial({
      color: color.clone().lerp(new THREE.Color('#f4efff'), 0.5),
      roughness: 0.17, metalness: 0.38, clearcoat: 1, clearcoatRoughness: 0.1,
      iridescence: 0.58, iridescenceIOR: 1.35,
    })
    const frame = new THREE.Mesh(frameGeometry, frameMaterial)
    frame.position.z = 0.03
    core.add(frame)

    const frameEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(frameGeometry, 24),
      new THREE.LineBasicMaterial({ color: '#f7f1ff', transparent: true, opacity: 0.28 }),
    )
    frameEdges.position.z = 0.035
    core.add(frameEdges)

    const trimMaterial = new THREE.MeshPhysicalMaterial({ color: '#d9c4a0', roughness: 0.2, metalness: 0.82, clearcoat: 0.55 })
    for (const side of [-1, 1]) {
      for (let flute = 0; flute < 3; flute += 1) {
        const column = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1.5, 8), trimMaterial)
        column.position.set(side * (0.81 + flute * 0.035), -0.43, 0.19)
        core.add(column)
      }
    }
    const rivetCount = 18
    const rivets = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.024, 12, 12),
      new THREE.MeshPhysicalMaterial({ color: '#f1ddbd', emissive: color, emissiveIntensity: 0.16, roughness: 0.16, metalness: 0.72, clearcoat: 0.7 }),
      rivetCount,
    )
    const rivet = new THREE.Object3D()
    for (let i = 0; i < rivetCount; i += 1) {
      if (i < 13) {
        const angle = (i / 12) * Math.PI
        rivet.position.set(Math.cos(angle) * 0.9, 0.44 + Math.sin(angle) * 0.9, 0.205)
      } else {
        const side = i % 2 ? -1 : 1
        rivet.position.set(side * 0.9, -0.25 - Math.floor((i - 13) / 2) * 0.72, 0.205)
      }
      rivet.updateMatrix()
      rivets.setMatrixAt(i, rivet.matrix)
    }
    rivets.instanceMatrix.needsUpdate = true
    core.add(rivets)

    const innerLine = new THREE.Mesh(
      new THREE.TorusGeometry(0.81, 0.008, 6, 96, Math.PI),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.72 }),
    )
    innerLine.position.set(0, 0.43, 0.19)
    core.add(innerLine)

    const pedestalPoints = [
      new THREE.Vector2(0, 0), new THREE.Vector2(0.62, 0), new THREE.Vector2(0.7, 0.035),
      new THREE.Vector2(0.7, 0.08), new THREE.Vector2(0.57, 0.13), new THREE.Vector2(0.42, 0.2),
      new THREE.Vector2(0.34, 0.27), new THREE.Vector2(0, 0.29),
    ]
    const pedestal = new THREE.Mesh(
      new THREE.LatheGeometry(pedestalPoints, 64),
      new THREE.MeshPhysicalMaterial({ color: color.clone().lerp(new THREE.Color('#d8d0ef'), 0.42), roughness: 0.2, metalness: 0.48, clearcoat: 0.9 }),
    )
    pedestal.scale.set(1, 0.75, 0.62)
    pedestal.position.set(0, -1.58, -0.02)
    core.add(pedestal)

    const lowerPedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.82, 0.9, 0.11, 72, 2),
      new THREE.MeshPhysicalMaterial({ color: '#242033', roughness: 0.22, metalness: 0.72, clearcoat: 0.65 }),
    )
    lowerPedestal.scale.z = 0.62
    lowerPedestal.position.set(0, -1.72, -0.02)
    core.add(lowerPedestal)
    const lowerTrim = new THREE.Mesh(new THREE.TorusGeometry(0.81, 0.014, 8, 96), trimMaterial)
    lowerTrim.rotation.x = Math.PI / 2
    lowerTrim.scale.y = 0.62
    lowerTrim.position.set(0, -1.665, -0.02)
    core.add(lowerTrim)

    const baseRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.56, 0.012, 8, 96),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.25, roughness: 0.28, transparent: true, opacity: 0.72 }),
    )
    baseRing.rotation.x = Math.PI / 2
    baseRing.position.set(0, -1.36, 0)
    core.add(baseRing)
    this.createPrecisionDetails(core, color, trimMaterial)

    const affinity = this.character.affinity / 100
    for (let i = 0; i < 5; i += 1) {
      const angle = (i / 5) * Math.PI * 2 + affinity
      const pearl = new THREE.Mesh(
        new THREE.SphereGeometry(0.025 + affinity * 0.018, 12, 12),
        new THREE.MeshPhysicalMaterial({ color: i % 2 ? color : new THREE.Color('#f2b29c'), roughness: 0.15, clearcoat: 1 }),
      )
      pearl.position.set(Math.cos(angle) * 1.5, Math.sin(angle) * 1.5, -0.25 + Math.sin(angle) * 0.15)
      core.add(pearl)
    }
  }

  private createPrecisionDetails(core: THREE.Group, color: THREE.Color, trimMaterial: THREE.MeshPhysicalMaterial) {
    const darkMetal = new THREE.MeshPhysicalMaterial({ color: '#252032', roughness: 0.2, metalness: 0.78, clearcoat: 0.6 })
    const gemMaterial = new THREE.MeshPhysicalMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.06, metalness: 0.08, clearcoat: 1, transmission: 0.22, thickness: 0.1, transparent: true, opacity: 0.88 })
    const shadow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTexture, color: '#03020a', transparent: true, opacity: 0.42, depthWrite: false }))
    shadow.scale.set(2.7, 1.25, 1)
    shadow.position.set(0, -1.72, -0.48)
    core.add(shadow)

    for (const side of [-1, 1]) {
      const pillar = new THREE.Group()
      pillar.position.set(side * 1.01, -0.42, 0.02)
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.058, 1.5, 32, 3), darkMetal)
      pillar.add(shaft)
      const lightChannel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 1.16, 12),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.1, roughness: 0.3 }),
      )
      lightChannel.position.z = 0.047
      pillar.add(lightChannel)
      for (const y of [-0.77, 0.77]) {
        const cap = new THREE.Mesh(new RoundedBoxGeometry(0.19, 0.1, 0.19, 4, 0.022), trimMaterial)
        cap.position.y = y
        pillar.add(cap)
        const collar = new THREE.Mesh(new THREE.TorusGeometry(0.067, 0.012, 8, 32), trimMaterial)
        collar.rotation.x = Math.PI / 2
        collar.position.y = y * 0.88
        pillar.add(collar)
      }
      const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 1), gemMaterial)
      finial.position.y = 0.91
      pillar.add(finial)
      core.add(pillar)
    }

    const tickCount = 72
    const ticks = new THREE.InstancedMesh(new RoundedBoxGeometry(0.014, 0.06, 0.025, 2, 0.004), trimMaterial, tickCount)
    const tick = new THREE.Object3D()
    for (let i = 0; i < tickCount; i += 1) {
      const angle = i / tickCount * Math.PI * 2
      tick.position.set(Math.cos(angle) * 1.13, 0.28 + Math.sin(angle) * 1.43, -0.06)
      tick.rotation.set(0, 0, angle - Math.PI / 2)
      tick.scale.set(1, i % 6 === 0 ? 1.75 : 0.82, 1)
      tick.updateMatrix()
      ticks.setMatrixAt(i, tick.matrix)
    }
    ticks.instanceMatrix.needsUpdate = true
    core.add(ticks)

    for (const side of [-1, 1]) {
      const gear = new THREE.Group()
      gear.position.set(side * 1.13, -0.2, 0.13)
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.026, 10, 40), darkMetal)
      gear.add(ring)
      const teeth = new THREE.InstancedMesh(new RoundedBoxGeometry(0.04, 0.034, 0.05, 2, 0.006), trimMaterial, 14)
      const tooth = new THREE.Object3D()
      for (let i = 0; i < 14; i += 1) {
        const angle = i / 14 * Math.PI * 2
        tooth.position.set(Math.cos(angle) * 0.16, Math.sin(angle) * 0.16, 0)
        tooth.rotation.z = angle
        tooth.updateMatrix()
        teeth.setMatrixAt(i, tooth.matrix)
      }
      teeth.instanceMatrix.needsUpdate = true
      gear.add(teeth)
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.065, 1), gemMaterial)
      gem.position.z = 0.025
      gear.add(gem)
      core.add(gear)
      this.mechanicalGears.push(gear)
    }

    for (let i = 0; i < 7; i += 1) {
      const angle = i / 6 * Math.PI
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.042 + (i % 2) * 0.012, 1), gemMaterial)
      gem.position.set(Math.cos(angle) * 0.98, 0.44 + Math.sin(angle) * 0.98, 0.19)
      gem.rotation.set(i * 0.4, i * 0.7, i * 0.2)
      core.add(gem)
    }

    const ribs = new THREE.InstancedMesh(new RoundedBoxGeometry(0.04, 0.065, 0.18, 2, 0.008), darkMetal, 28)
    const rib = new THREE.Object3D()
    for (let i = 0; i < 28; i += 1) {
      const angle = i / 28 * Math.PI * 2
      rib.position.set(Math.cos(angle) * 0.72, -1.72, Math.sin(angle) * 0.44)
      rib.rotation.y = -angle
      rib.updateMatrix()
      ribs.setMatrixAt(i, rib.matrix)
    }
    ribs.instanceMatrix.needsUpdate = true
    core.add(ribs)

    const opticalRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.25, 0.022, 12, 128),
      new THREE.MeshPhysicalMaterial({ color: '#c8b8ff', roughness: 0.08, metalness: 0.05, transmission: 0.62, thickness: 0.12, transparent: true, opacity: 0.38, clearcoat: 1 }),
    )
    opticalRing.position.z = -0.16
    opticalRing.rotation.x = 0.16
    core.add(opticalRing)
  }

  private loadPortrait(url: string, material: THREE.MeshBasicMaterial) {
    const cached = this.textureCache.get(url)
    if (cached) {
      material.map = cached
      material.needsUpdate = true
      return
    }
    this.textureLoader.load(url, (texture) => {
      if (this.disposed) {
        texture.dispose()
        return
      }
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy())
      this.textureCache.set(url, texture)
      material.map = texture
      material.needsUpdate = true
    }, undefined, () => {
      material.color.set(this.character.color)
    })
  }

  private createOrbits() {
    const seed = hash(this.character.id)
    const presets = [
      { a: 2.28, b: 1.35, depth: 0.68, tiltX: 0.22, tiltY: -0.2, phase: 0.2 },
      { a: 2.72, b: 1.72, depth: 0.9, tiltX: -0.3, tiltY: 0.28, phase: 1.7 },
      { a: 3.03, b: 1.18, depth: 1.12, tiltX: 0.5, tiltY: 0.12, phase: 3.1 },
    ]
    presets.forEach((preset, orbitIndex) => {
      const points: THREE.Vector3[] = []
      for (let i = 0; i < 16; i += 1) {
        const angle = (i / 16) * Math.PI * 2
        const point = new THREE.Vector3(
          Math.cos(angle) * preset.a,
          Math.sin(angle) * preset.b + Math.sin(angle * 3 + seed) * 0.055,
          Math.sin(angle + preset.phase) * preset.depth,
        )
        point.applyEuler(new THREE.Euler(preset.tiltX, preset.tiltY, orbitIndex * 0.16 - 0.15))
        points.push(point)
      }
      const curve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.45)
      const material = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: new THREE.Color(orbitIndex === 1 ? '#e7a58e' : this.character.color).lerp(new THREE.Color('#ffffff'), orbitIndex * 0.08) },
          uSpeed: { value: 0.025 + orbitIndex * 0.012 },
          uOffset: { value: orbitIndex * 0.31 },
          uEffectTime: { value: 0 },
          uPulseStart: { value: -100 },
          uPulseOrigin: { value: 0 },
        },
        vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
        fragmentShader: `
          uniform float uTime; uniform float uSpeed; uniform float uOffset; uniform float uEffectTime; uniform float uPulseStart; uniform float uPulseOrigin; uniform vec3 uColor; varying vec2 vUv;
          void main(){
            float wave = sin((vUv.x - uTime * uSpeed + uOffset) * 6.2831853);
            float pulse = pow(max(0., wave), 22.);
            float fine = .55 + .45 * sin(vUv.x * 150.);
            float age = max(0., uEffectTime - uPulseStart);
            float front = fract(uPulseOrigin + age * .24);
            float distanceToFront = abs(fract(vUv.x - front + .5) - .5);
            float interaction = exp(-distanceToFront * distanceToFront * 620.) * exp(-age * 1.25) * (1.0 - smoothstep(2.0, 2.6, age));
            vec3 color = mix(uColor, vec3(1.), pulse * .62 + interaction * .72);
            gl_FragColor = vec4(color, .15 + fine * .035 + pulse * .58 + interaction * .72);
          }
        `,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      })
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 220, 0.009 + orbitIndex * 0.0015, 5, true), material)
      this.dynamicRoot.add(tube)
      this.orbits.push({ curve, material })

      if (orbitIndex === 1) {
        const ribbon = new THREE.Mesh(
          this.createRibbonGeometry(curve, 0.055),
          new THREE.MeshPhysicalMaterial({ color: this.character.color, transparent: true, opacity: 0.065, roughness: 0.25, metalness: 0.05, side: THREE.DoubleSide, depthWrite: false }),
        )
        this.dynamicRoot.add(ribbon)
      }
    })
  }

  private createRibbonGeometry(curve: THREE.CatmullRomCurve3, width: number) {
    const segments = 180
    const positions = new Float32Array((segments + 1) * 2 * 3)
    const uvs = new Float32Array((segments + 1) * 2 * 2)
    const indices: number[] = []
    const zAxis = new THREE.Vector3(0, 0, 1)
    for (let i = 0; i <= segments; i += 1) {
      const t = i / segments
      const point = curve.getPointAt(t)
      const tangent = curve.getTangentAt(t)
      const side = new THREE.Vector3().crossVectors(tangent, zAxis).normalize().multiplyScalar(width * (0.7 + Math.sin(t * Math.PI * 6) * 0.3))
      const left = point.clone().add(side)
      const right = point.clone().sub(side)
      positions.set([left.x, left.y, left.z, right.x, right.y, right.z], i * 6)
      uvs.set([t, 0, t, 1], i * 4)
      if (i < segments) {
        const a = i * 2
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    return geometry
  }

  private createSatellites() {
    const count = this.isCompact ? 1 : 2
    for (let i = 0; i < count; i += 1) {
      const root = createSatelliteModel(i === 0 ? this.character.color : '#7fb7c7')
      const curve = this.orbits[i === 0 ? 0 : 2].curve
      const offset = 0.18 + i * 0.47
      root.position.copy(curve.getPointAt(offset))
      this.dynamicRoot.add(root)
      this.satellites.push({ root, curve, offset, speed: i === 0 ? 0.018 : -0.013 })
    }
  }

  private createFragments() {
    const count = this.isCompact ? 30 : 72
    const geometry = new THREE.OctahedronGeometry(0.042, 0)
    const material = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.18, metalness: 0.08, clearcoat: 1, transparent: true, opacity: 0.64 })
    const fragments = new THREE.InstancedMesh(geometry, material, count)
    const dummy = new THREE.Object3D()
    const seed = hash(this.character.id)
    for (let i = 0; i < count; i += 1) {
      const orbit = this.orbits[i % this.orbits.length]
      const t = ((i * 0.618033 + seed * 0.0001) % 1 + 1) % 1
      dummy.position.copy(orbit.curve.getPointAt(t))
      dummy.position.multiplyScalar(0.98 + (i % 5) * 0.012)
      dummy.rotation.set(i * 0.71, i * 1.13, i * 0.37)
      const scale = 0.5 + (i % 6) * 0.16
      dummy.scale.set(scale, scale * (1 + (i % 3) * 0.6), scale)
      dummy.updateMatrix()
      fragments.setMatrixAt(i, dummy.matrix)
      fragments.setColorAt(i, new THREE.Color(i % 4 === 0 ? '#e8a48e' : this.character.color).lerp(new THREE.Color('#ffffff'), (i % 5) * 0.1))
    }
    fragments.instanceMatrix.needsUpdate = true
    if (fragments.instanceColor) fragments.instanceColor.needsUpdate = true
    this.dynamicRoot.add(fragments)

    const dustCount = this.isCompact ? 260 : 760
    const dustPositions = new Float32Array(dustCount * 3)
    const dustColors = new Float32Array(dustCount * 3)
    for (let i = 0; i < dustCount; i += 1) {
      const orbit = this.orbits[i % this.orbits.length]
      const t = (i * 0.6180339887 + seed * 0.00003) % 1
      const point = orbit.curve.getPointAt(t)
      const spread = 0.025 + (i % 9) * 0.009
      point.x += Math.sin(i * 12.37) * spread
      point.y += Math.cos(i * 8.21) * spread
      point.z += Math.sin(i * 5.73) * spread
      dustPositions.set([point.x, point.y, point.z], i * 3)
      const color = new THREE.Color(i % 5 === 0 ? '#efb19a' : this.character.color).lerp(new THREE.Color('#ffffff'), 0.25 + (i % 4) * 0.14)
      dustColors.set([color.r, color.g, color.b], i * 3)
    }
    const dustGeometry = new THREE.BufferGeometry()
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3))
    dustGeometry.setAttribute('color', new THREE.BufferAttribute(dustColors, 3))
    const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({
      size: 0.024, vertexColors: true, transparent: true, opacity: 0.62,
      sizeAttenuation: true, depthWrite: false,
    }))
    this.dynamicRoot.add(dust)
  }

  private createMemoryNodes() {
    const memories = this.memories.slice(0, 7)
    memories.forEach((memory, index) => {
      const orbit = this.orbits[index % this.orbits.length]
      const color = new THREE.Color(TYPE_COLOR[memory.type])
      const group = new THREE.Group()
      const importanceScale = 0.82 + memory.importance * 0.38

      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTexture, color, transparent: true, opacity: 0.78, depthWrite: false }))
      glow.scale.set(0.62, 0.62, 1)
      group.add(glow)

      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.072 * importanceScale, 20, 20),
        new THREE.MeshPhysicalMaterial({ color, emissive: color, emissiveIntensity: 0.72, roughness: 0.14, metalness: 0.04, clearcoat: 1 }),
      )
      group.add(sphere)

      const shell = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.12 * importanceScale, 1),
        new THREE.MeshBasicMaterial({ color: color.clone().lerp(new THREE.Color('#ffffff'), 0.35), wireframe: true, transparent: true, opacity: 0.3 }),
      )
      group.add(shell)

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.155 * importanceScale, 0.006, 6, 40),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.46, depthWrite: false }),
      )
      group.add(ring)

      const hit = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 8, 8),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
      )
      hit.userData.memoryId = memory.id
      group.add(hit)
      this.hitTargets.push(hit)

      const labelElement = document.createElement('button')
      labelElement.type = 'button'
      labelElement.className = `memory-node-label ${memory.type}`
      labelElement.setAttribute('aria-label', `查看${TYPE_LABEL[memory.type]}记忆：${memory.content}`)
      const labelTitle = document.createElement('span')
      labelTitle.className = 'memory-label-title'
      const dot = document.createElement('i')
      dot.style.backgroundColor = TYPE_COLOR[memory.type]
      const title = document.createElement('span')
      title.textContent = `${TYPE_LABEL[memory.type]} · ${String(index + 1).padStart(2, '0')}`
      labelTitle.append(dot, title)
      const preview = document.createElement('span')
      preview.className = 'memory-label-preview'
      preview.textContent = memory.content
      labelElement.append(labelTitle, preview)
      labelElement.addEventListener('click', (event) => {
        event.stopPropagation()
        this.selectMemory(memory.id)
      })
      labelElement.addEventListener('pointerenter', () => this.setHovered(memory.id))
      labelElement.addEventListener('pointerleave', () => this.setHovered(null))
      const label = new CSS2DObject(labelElement)
      label.position.set(0, 0.22, 0)
      group.add(label)

      const connectionGeometry = new THREE.BufferGeometry()
      connectionGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(25 * 3), 3))
      const connection = new THREE.Line(
        connectionGeometry,
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.1, depthWrite: false }),
      )
      this.dynamicRoot.add(connection)

      const pulse = new THREE.Mesh(
        new THREE.SphereGeometry(0.023, 10, 10),
        new THREE.MeshBasicMaterial({ color: color.clone().lerp(new THREE.Color('#ffffff'), 0.6), transparent: true, opacity: 0.9 }),
      )
      this.dynamicRoot.add(pulse)
      this.dynamicRoot.add(group)

      this.nodes.push({
        memory, group, hit, label, labelElement, curve: orbit.curve,
        offset: (index / Math.max(memories.length, 1) + (hash(this.character.id) % 17) * 0.013 + (index % 3) * 0.07) % 1,
        speed: (index % 2 ? -1 : 1) * (0.004 + (index % 3) * 0.0015),
        connection, pulse, scale: 1,
      })
    })
  }

  private updateNode(node: MemoryNode, dt: number) {
    const t = ((node.offset + this.time * node.speed) % 1 + 1) % 1
    const position = node.curve.getPointAt(t)
    node.group.position.copy(position)
    node.group.lookAt(this.camera.position)
    const targetScale = this.selectedId === node.memory.id ? 1.52 : this.hoveredId === node.memory.id ? 1.3 : 1
    node.scale = damp(node.scale, targetScale, 10, dt)
    node.group.scale.setScalar(node.scale)
    node.labelElement.classList.toggle('selected', this.selectedId === node.memory.id)
    node.labelElement.classList.toggle('hovered', this.hoveredId === node.memory.id)

    this.tempStart.copy(position).multiplyScalar(0.16)
    this.tempControl.copy(position).multiplyScalar(0.54)
    this.tempControl.y += Math.sin(t * Math.PI * 2) * 0.22
    const attribute = node.connection.geometry.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < 25; i += 1) {
      quadraticPoint(this.tempStart, this.tempControl, position, i / 24, this.tempVector)
      attribute.setXYZ(i, this.tempVector.x, this.tempVector.y, this.tempVector.z)
    }
    attribute.needsUpdate = true
    const lineMaterial = node.connection.material as THREE.LineBasicMaterial
    lineMaterial.opacity = this.selectedId === node.memory.id ? 0.34 : this.hoveredId === node.memory.id ? 0.24 : 0.075

    const pulseT = (this.time * 0.11 + node.offset * 2) % 1
    quadraticPoint(this.tempStart, this.tempControl, position, pulseT, node.pulse.position)
    node.pulse.scale.setScalar(0.65 + Math.sin(pulseT * Math.PI) * 0.75)
  }

  private spawnInteractionPulse(event: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointerNdc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(this.pointerNdc, this.camera)
    const point = new THREE.Vector3()
    if (!this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), point)) return

    const group = new THREE.Group()
    group.position.copy(point)
    const color = new THREE.Color(this.character.color)
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.075, 0.092, 64),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false }),
    )
    group.add(ring)

    const count = this.isCompact ? 24 : 46
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const velocities = new Float32Array(count * 3)
    for (let i = 0; i < count; i += 1) {
      const angle = i * 2.399963 + this.time
      const speed = 0.35 + (i % 9) * 0.065
      velocities[i * 3] = Math.cos(angle) * speed
      velocities[i * 3 + 1] = Math.sin(angle) * speed
      velocities[i * 3 + 2] = Math.sin(i * 1.7) * speed * 0.35
      const particleColor = i % 4 === 0 ? new THREE.Color('#efad96') : color.clone().lerp(new THREE.Color('#ffffff'), (i % 5) * 0.1)
      colors.set([particleColor.r, particleColor.g, particleColor.b], i * 3)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({
      size: 0.045, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false,
    }))
    group.add(points)
    this.scene.add(group)
    this.interactionPulses.push({ group, ring, points, velocities, life: 0 })
    if (this.interactionPulses.length > 5) {
      const oldest = this.interactionPulses.shift()!
      this.scene.remove(oldest.group)
      this.disposeObject(oldest.group)
    }
  }

  private updateInteractionPulses(dt: number) {
    for (let index = this.interactionPulses.length - 1; index >= 0; index -= 1) {
      const pulse = this.interactionPulses[index]
      pulse.life += dt
      const progress = pulse.life / 1.15
      pulse.ring.scale.setScalar(1 + progress * 7)
      pulse.ring.material.opacity = Math.max(0, (1 - progress) * 0.62)
      pulse.points.material.opacity = Math.max(0, (1 - progress) * 0.85)
      const attribute = pulse.points.geometry.getAttribute('position') as THREE.BufferAttribute
      for (let i = 0; i < attribute.count; i += 1) {
        attribute.setXYZ(i,
          attribute.getX(i) + pulse.velocities[i * 3] * dt,
          attribute.getY(i) + pulse.velocities[i * 3 + 1] * dt,
          attribute.getZ(i) + pulse.velocities[i * 3 + 2] * dt,
        )
      }
      attribute.needsUpdate = true
      if (progress >= 1) {
        this.scene.remove(pulse.group)
        this.disposeObject(pulse.group)
        this.interactionPulses.splice(index, 1)
      }
    }
  }

  private emitOrbitPulse(origin: number) {
    this.orbits.forEach((orbit, index) => {
      orbit.material.uniforms.uPulseStart.value = this.effectTime
      orbit.material.uniforms.uPulseOrigin.value = (origin + index * 0.17) % 1
    })
  }

  private selectMemory(id: number) {
    const next = this.selectedId === id ? null : id
    this.setSelected(next)
    const node = this.nodes.find(item => item.memory.id === id)
    if (node) this.emitOrbitPulse(((node.offset + this.time * node.speed) % 1 + 1) % 1)
    this.callbacks.onSelect(this.memories.find(memory => memory.id === next) ?? null)
  }

  private setHovered(id: number | null) {
    if (this.hoveredId === id) return
    this.hoveredId = id
    this.renderer.domElement.classList.toggle('is-hovering', id !== null)
    this.callbacks.onHover(this.memories.find(memory => memory.id === id) ?? null)
  }

  private updateRaycast(event: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointerNdc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    this.scene.updateMatrixWorld()
    this.raycaster.setFromCamera(this.pointerNdc, this.camera)
    const hit = this.raycaster.intersectObjects(this.hitTargets, false)[0]
    this.setHovered(hit ? hit.object.userData.memoryId as number : null)
  }

  private onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return
    this.dragging = true
    this.dragDistance = 0
    this.angularVelocity.set(0, 0)
    this.dragSamples = [{ x: this.rotationTarget.x, y: this.rotationTarget.y, time: performance.now() }]
    this.dragStart.set(event.clientX, event.clientY)
    this.dragRotation.copy(this.rotationTarget)
    this.renderer.domElement.setPointerCapture(event.pointerId)
    this.renderer.domElement.classList.add('is-dragging')
  }

  private onPointerMove = (event: PointerEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointerTarget.set((event.clientX - rect.left) / rect.width - 0.5, (event.clientY - rect.top) / rect.height - 0.5)
    const dx = this.lastPointerClient.x < 0 ? 0 : event.clientX - this.lastPointerClient.x
    const dy = this.lastPointerClient.y < 0 ? 0 : event.clientY - this.lastPointerClient.y
    const speed = Math.min(1, Math.hypot(dx, dy) / 18)
    this.pointerVelocityTarget = Math.max(this.pointerVelocityTarget, speed)
    this.lastPointerClient.set(event.clientX, event.clientY)
    this.spawnPointerTrail(event, dx, dy, speed)
    if (this.dragging) {
      const dx = event.clientX - this.dragStart.x
      const dy = event.clientY - this.dragStart.y
      this.dragDistance = Math.max(this.dragDistance, Math.hypot(dx, dy))
      this.rotationTarget.y = this.dragRotation.y + dx * 0.0055
      this.rotationTarget.x = THREE.MathUtils.clamp(this.dragRotation.x + dy * 0.0038, -0.34, 0.34)
      this.dragSamples.push({ x: this.rotationTarget.x, y: this.rotationTarget.y, time: performance.now() })
      this.dragSamples = this.dragSamples.filter(sample => performance.now() - sample.time <= 120).slice(-32)
      this.setHovered(null)
    } else {
      this.updateRaycast(event)
    }
  }

  private onPointerUp = (event: PointerEvent) => {
    if (!this.dragging) return
    if (this.dragDistance < 6) {
      this.updateRaycast(event)
      if (this.hoveredId !== null) this.selectMemory(this.hoveredId)
      else {
        this.spawnInteractionPulse(event)
        this.emitOrbitPulse((this.pointerNdc.x + 1) * 0.5)
      }
    } else {
      const first = this.dragSamples[0]
      const last = this.dragSamples.at(-1)
      const duration = first && last ? last.time - first.time : 0
      if (first && last && duration > 8 && performance.now() - last.time < 80 && !this.motionQuery.matches) {
        this.angularVelocity.set((last.x - first.x) * 1000 / duration, (last.y - first.y) * 1000 / duration).clampLength(0, 3.2)
      }
    }
    this.dragging = false
    this.renderer.domElement.classList.remove('is-dragging')
    if (this.renderer.domElement.hasPointerCapture(event.pointerId)) this.renderer.domElement.releasePointerCapture(event.pointerId)
  }

  private onPointerLeave = () => {
    if (!this.dragging) {
      this.pointerTarget.set(0, 0)
      this.lastPointerClient.set(-1, -1)
      this.setHovered(null)
    }
  }

  private onPointerCancel = () => {
    this.dragging = false
    this.renderer.domElement.classList.remove('is-dragging')
  }

  private onMotionPreference = (event: MediaQueryListEvent) => {
    this.motionEnabled = !event.matches
  }

  private bindEvents() {
    const canvas = this.renderer.domElement
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('pointerleave', this.onPointerLeave)
    canvas.addEventListener('pointercancel', this.onPointerCancel)
    this.motionQuery.addEventListener('change', this.onMotionPreference)
  }

  private resize() {
    const width = this.container.clientWidth
    const height = this.container.clientHeight
    if (!width || !height) return
    this.isCompact = width < 560
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.isCompact ? 1.5 : 2))
    this.renderer.setSize(width, height)
    this.composer.setPixelRatio(this.renderer.getPixelRatio())
    this.composer.setSize(width, height)
    this.bloomPass.strength = this.isCompact ? 0.26 : 0.36
    this.labelRenderer.setSize(width, height)
    this.responsiveScale = this.camera.aspect < 0.95 ? 0.8 : this.camera.aspect < 1.2 ? 0.94 : this.camera.aspect > 1.5 ? 1.2 : 1.12
    this.sceneOffset = this.camera.aspect > 1.25 ? Math.min(1.7, (this.camera.aspect - 1.05) * 1.85) : 0
    this.baseCameraZ = this.camera.aspect < 0.95 ? 9.15 : 8.4
    if (this.selectedId === null) this.cameraTargetZ = this.baseCameraZ
    if (this.starMaterial) this.starMaterial.uniforms.uDpr.value = this.renderer.getPixelRatio()
    if (this.trailMaterial) this.trailMaterial.uniforms.uDpr.value = this.renderer.getPixelRatio()
    if (this.atmosphereMaterial) this.atmosphereMaterial.uniforms.uAspect.value = this.camera.aspect
  }

  private animate = (now: number) => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.animate)
    const dt = Math.min((now - this.lastTime) / 1000, 0.05)
    this.lastTime = now
    if (document.hidden || !this.isInViewport) return
    if (!this.motionEnabled && now - this.lastRender < 1000 / 30) return
    this.lastRender = now
    this.effectTime += dt
    if (this.motionEnabled) this.time += dt

    this.pointer.x = damp(this.pointer.x, this.pointerTarget.x, 5, dt)
    this.pointer.y = damp(this.pointer.y, this.pointerTarget.y, 5, dt)
    this.pointerVelocityTarget *= Math.exp(-dt * 7)
    this.pointerVelocity = damp(this.pointerVelocity, this.pointerVelocityTarget, 9, dt)
    this.scrollProgress = damp(this.scrollProgress, this.scrollTarget, 4.5, dt)
    this.birth = damp(this.birth, 1, 4.5, dt)
    if (!this.dragging && this.angularVelocity.lengthSq() > 0.000001) {
      this.rotationTarget.addScaledVector(this.angularVelocity, dt)
      this.rotationTarget.x = THREE.MathUtils.clamp(this.rotationTarget.x, -0.34, 0.34)
      this.angularVelocity.multiplyScalar(Math.exp(-2.4 * dt))
      if (this.angularVelocity.length() < 0.18) {
        const snap = Math.PI / 12
        this.rotationTarget.y = Math.round(this.rotationTarget.y / snap) * snap
        this.rotationTarget.x = THREE.MathUtils.clamp(Math.round(this.rotationTarget.x / (snap / 2)) * (snap / 2), -0.34, 0.34)
        this.angularVelocity.multiplyScalar(Math.exp(-10 * dt))
      }
    }
    const autoRotation = Math.sin(this.time * 0.09) * 0.1
    this.dynamicRoot.rotation.y = damp(this.dynamicRoot.rotation.y, this.rotationTarget.y + autoRotation + this.pointer.x * 0.22 + this.scrollProgress * 0.62, 5, dt)
    this.dynamicRoot.rotation.x = damp(this.dynamicRoot.rotation.x, this.rotationTarget.x + this.pointer.y * 0.1 + this.scrollProgress * 0.28, 5, dt)
    this.dynamicRoot.rotation.z = damp(this.dynamicRoot.rotation.z, this.pointer.x * this.pointerVelocity * 0.09, 7, dt)
    const scale = this.responsiveScale * (0.9 + this.birth * 0.1) * (1 - this.scrollProgress * 0.12)
    this.dynamicRoot.scale.setScalar(scale)
    this.dynamicRoot.position.x = damp(this.dynamicRoot.position.x, this.sceneOffset + this.scrollProgress * 0.35, 4, dt)
    this.dynamicRoot.position.y = Math.sin(this.time * 0.45) * 0.025 - this.scrollProgress * 0.2

    this.camera.position.x = damp(this.camera.position.x, this.pointer.x * 0.42, 4, dt)
    this.camera.position.y = damp(this.camera.position.y, 0.12 - this.pointer.y * 0.2 + this.scrollProgress * 0.25, 4, dt)
    this.camera.position.z = damp(this.camera.position.z, this.cameraTargetZ + this.scrollProgress * 2.4, 4, dt)
    this.camera.lookAt(0, 0, 0)

    if (this.coreGroup) this.coreGroup.position.y = Math.sin(this.time * 0.55) * 0.035
    if (this.stars) this.stars.rotation.z = this.time * 0.0025 + this.scrollProgress * 0.08
    if (this.atmosphereMaterial) {
      this.atmosphereMaterial.uniforms.uTime.value = this.time
      this.atmosphereMaterial.uniforms.uPointer.value.copy(this.pointer)
      this.atmosphereMaterial.uniforms.uVelocity.value = this.pointerVelocity
    }
    if (this.starMaterial) {
      this.starMaterial.uniforms.uTime.value = this.time
      this.starMaterial.uniforms.uPointer.value.copy(this.pointer)
      this.starMaterial.uniforms.uScroll.value = this.scrollProgress
    }
    this.orbits.forEach(orbit => {
      orbit.material.uniforms.uTime.value = this.time
      orbit.material.uniforms.uEffectTime.value = this.effectTime
    })
    this.planets.forEach((planet, index) => {
      const angle = planet.offset + this.time * planet.speed + this.scrollProgress * 0.34 * (index % 2 ? -1 : 1)
      planet.root.position.set(
        Math.cos(angle) * planet.radiusX + this.pointer.x * (0.08 + index * 0.025),
        Math.sin(angle) * planet.radiusY - this.scrollProgress * 0.3 - this.pointer.y * (0.06 + index * 0.018),
        planet.depth + Math.sin(angle * 0.7) * 0.35,
      )
      planet.surface.rotation.y = this.time * (0.09 + Math.abs(planet.speed) * 2)
      planet.root.rotation.z = Math.sin(this.time * 0.08 + planet.offset) * 0.08
    })
    this.satellites.forEach(satellite => {
      const t = ((satellite.offset + this.time * satellite.speed) % 1 + 1) % 1
      satellite.root.position.copy(satellite.curve.getPointAt(t))
      satellite.root.quaternion.setFromUnitVectors(this.tempVector.set(0, 0, 1), satellite.curve.getTangentAt(t).normalize())
    })
    this.mechanicalGears.forEach((gear, index) => { gear.rotation.z = this.time * (index % 2 ? -0.38 : 0.38) })
    this.meteors.forEach(meteor => {
      const progress = (this.time * meteor.speed + meteor.offset) % 1
      meteor.mesh.position.set(6.8 - progress * 13.6, 3.7 - meteor.lane * 0.72 - progress * 3.4, -2.5 - meteor.lane * 0.35)
      meteor.mesh.material.opacity = Math.pow(Math.sin(progress * Math.PI), 2) * 0.46
    })
    this.updatePointerTrail(dt)
    this.nodes.forEach(node => this.updateNode(node, dt))
    this.updateInteractionPulses(dt)

    this.composer.render()
    this.labelRenderer.render(this.scene, this.camera)
  }

  private disposeObject(root: THREE.Object3D) {
    root.traverse((object) => {
      if (object instanceof CSS2DObject) object.element.remove()
      const mesh = object as THREE.Mesh
      if (mesh.geometry && !(object instanceof THREE.Sprite)) mesh.geometry.dispose()
      if (mesh.material) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        materials.forEach(material => material.dispose())
      }
    })
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.resizeObserver.disconnect()
    this.intersectionObserver.disconnect()
    const canvas = this.renderer.domElement
    canvas.removeEventListener('pointerdown', this.onPointerDown)
    canvas.removeEventListener('pointermove', this.onPointerMove)
    canvas.removeEventListener('pointerup', this.onPointerUp)
    canvas.removeEventListener('pointerleave', this.onPointerLeave)
    canvas.removeEventListener('pointercancel', this.onPointerCancel)
    this.motionQuery.removeEventListener('change', this.onMotionPreference)
    this.disposeObject(this.scene)
    this.textureCache.forEach(texture => texture.dispose())
    this.textureCache.clear()
    this.proceduralTextures.forEach(texture => texture.dispose())
    this.proceduralTextures = []
    this.glowTexture.dispose()
    this.environmentTarget.dispose()
    this.labelRenderer.domElement.remove()
    this.composer.passes.forEach(pass => pass.dispose())
    this.composer.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
