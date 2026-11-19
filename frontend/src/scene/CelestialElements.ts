import * as THREE from 'three'

export interface PlanetModel {
  root: THREE.Group
  surface: THREE.Mesh
  textures: THREE.Texture[]
}

const randomFactory = (seedValue: number) => {
  let seed = seedValue || 1
  return () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
}

const createSurfaceTexture = (primary: string, secondary: string, variant: number) => {
  const canvas = document.createElement('canvas')
  canvas.width = 768
  canvas.height = 384
  const context = canvas.getContext('2d')!
  const random = randomFactory(variant * 971 + 37)
  const base = context.createLinearGradient(0, 0, 0, canvas.height)
  base.addColorStop(0, secondary)
  base.addColorStop(0.42, primary)
  base.addColorStop(0.72, secondary)
  base.addColorStop(1, primary)
  context.fillStyle = base
  context.fillRect(0, 0, canvas.width, canvas.height)

  if (variant % 2 === 0) {
    for (let band = 0; band < 74; band += 1) {
      const y = (band / 74) * canvas.height
      const height = 2 + random() * 10
      context.beginPath()
      context.moveTo(0, y)
      for (let x = 0; x <= canvas.width; x += 12) {
        context.lineTo(x, y + Math.sin(x * 0.022 + band * 1.7) * (2 + random() * 3))
      }
      context.lineTo(canvas.width, y + height)
      context.lineTo(0, y + height)
      context.closePath()
      context.fillStyle = band % 3 === 0 ? `rgba(255,255,255,${0.035 + random() * 0.1})` : `rgba(55,35,90,${0.018 + random() * 0.055})`
      context.fill()
    }
    for (let storm = 0; storm < 12; storm += 1) {
      const x = random() * canvas.width
      const y = random() * canvas.height
      const radius = 5 + random() * 18
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius)
      gradient.addColorStop(0, 'rgba(255,255,255,.2)')
      gradient.addColorStop(0.5, 'rgba(255,255,255,.06)')
      gradient.addColorStop(1, 'rgba(255,255,255,0)')
      context.fillStyle = gradient
      context.beginPath()
      context.ellipse(x, y, radius * 1.8, radius * 0.55, random(), 0, Math.PI * 2)
      context.fill()
    }
  } else {
    for (let crater = 0; crater < 190; crater += 1) {
      const x = random() * canvas.width
      const y = random() * canvas.height
      const radius = 1 + random() * 10
      const gradient = context.createRadialGradient(x - radius * 0.25, y - radius * 0.25, 0, x, y, radius)
      gradient.addColorStop(0, `rgba(255,255,255,${0.05 + random() * 0.12})`)
      gradient.addColorStop(0.62, 'rgba(70,50,100,.035)')
      gradient.addColorStop(1, 'rgba(40,25,70,0)')
      context.fillStyle = gradient
      context.beginPath()
      context.arc(x, y, radius, 0, Math.PI * 2)
      context.fill()
    }
    context.globalCompositeOperation = 'soft-light'
    for (let ridge = 0; ridge < 35; ridge += 1) {
      context.strokeStyle = `rgba(255,255,255,${0.05 + random() * 0.08})`
      context.lineWidth = 1 + random() * 2
      context.beginPath()
      const y = random() * canvas.height
      context.moveTo(0, y)
      for (let x = 0; x <= canvas.width; x += 18) context.lineTo(x, y + Math.sin(x * 0.025 + ridge) * (3 + random() * 5))
      context.stroke()
    }
    context.globalCompositeOperation = 'source-over'
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.anisotropy = 4
  return texture
}

const createAtmosphere = (radius: number, color: string) => {
  const material = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) } },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.6);
        gl_FragColor = vec4(mix(uColor, vec3(1.0), .28), rim * .48);
      }
    `,
    transparent: true,
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
  })
  return new THREE.Mesh(new THREE.SphereGeometry(radius * 1.075, 48, 32), material)
}

const createRing = (radius: number, color: string) => {
  const material = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) } },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `
      uniform vec3 uColor; varying vec2 vUv;
      void main(){
        float r = length(vUv - .5) * 2.0;
        float bands = .45 + .55 * sin(r * 175.0);
        float fine = .72 + .28 * sin(r * 510.0);
        gl_FragColor = vec4(mix(uColor, vec3(1.0), bands * .25), (.1 + bands * .2) * fine);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
  })
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 1.35, radius * 2.05, 160, 1), material)
  ring.rotation.x = 1.18
  ring.rotation.y = 0.25
  return ring
}

export const createPlanetModel = (radius: number, primary: string, secondary: string, variant: number, ringed = false): PlanetModel => {
  const root = new THREE.Group()
  const texture = createSurfaceTexture(primary, secondary, variant)
  const surfaceGeometry = new THREE.SphereGeometry(radius, 96, 64)
  if (variant % 2 !== 0) {
    const positions = surfaceGeometry.getAttribute('position')
    const normal = new THREE.Vector3()
    for (let i = 0; i < positions.count; i += 1) {
      normal.set(positions.getX(i), positions.getY(i), positions.getZ(i)).normalize()
      const elevation = (
        Math.sin(normal.x * 9 + variant) * Math.cos(normal.y * 11 - variant) +
        Math.sin(normal.z * 19 + normal.x * 7) * 0.45 +
        Math.cos(normal.y * 33 + normal.z * 13) * 0.18
      ) / 1.63
      const displacement = radius * 0.032 * elevation
      positions.setXYZ(i, positions.getX(i) + normal.x * displacement, positions.getY(i) + normal.y * displacement, positions.getZ(i) + normal.z * displacement)
    }
    positions.needsUpdate = true
    surfaceGeometry.computeVertexNormals()
  }
  const surface = new THREE.Mesh(
    surfaceGeometry,
    new THREE.MeshPhysicalMaterial({
      color: '#d0cbdc', map: texture, bumpMap: texture, bumpScale: radius * 0.055,
      roughness: variant % 2 === 0 ? 0.5 : 0.72, metalness: 0.02,
      clearcoat: variant % 2 === 0 ? 0.38 : 0.12, clearcoatRoughness: 0.5,
    }),
  )
  surface.rotation.z = 0.18 + variant * 0.07
  root.add(surface)
  if (variant % 2 === 0) {
    const clouds = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.018, 64, 48),
      new THREE.MeshPhysicalMaterial({ map: texture, transparent: true, opacity: 0.13, roughness: 0.82, depthWrite: false }),
    )
    clouds.rotation.y = 0.35
    root.add(clouds)
  }
  root.add(createAtmosphere(radius, secondary))
  if (ringed) {
    const ring = createRing(radius, secondary)
    root.add(ring)
    const debris = new THREE.InstancedMesh(
      new THREE.TetrahedronGeometry(radius * 0.026, 0),
      new THREE.MeshPhysicalMaterial({ color: secondary, roughness: 0.42, metalness: 0.18, transparent: true, opacity: 0.65 }),
      220,
    )
    const dummy = new THREE.Object3D()
    for (let i = 0; i < 220; i += 1) {
      const angle = i * 2.399963
      const distance = radius * (1.36 + (i % 37) / 37 * 0.68)
      dummy.position.set(Math.cos(angle) * distance, Math.sin(angle) * distance, Math.sin(i * 1.7) * radius * 0.018)
      dummy.rotation.set(i * 0.7, i * 1.1, i * 0.37)
      dummy.scale.setScalar(0.55 + (i % 5) * 0.16)
      dummy.updateMatrix()
      debris.setMatrixAt(i, dummy.matrix)
    }
    debris.instanceMatrix.needsUpdate = true
    debris.rotation.copy(ring.rotation)
    root.add(debris)
  }
  return { root, surface, textures: [texture] }
}

export const createSatelliteModel = (color: string) => {
  const root = new THREE.Group()
  const metal = new THREE.MeshPhysicalMaterial({ color: '#cdc6dd', roughness: 0.32, metalness: 0.6, clearcoat: 0.5 })
  const gold = new THREE.MeshPhysicalMaterial({ color: '#c9ab80', roughness: 0.34, metalness: 0.7 })
  const panel = new THREE.MeshPhysicalMaterial({ color, roughness: 0.26, metalness: 0.42, clearcoat: 0.75, emissive: color, emissiveIntensity: 0.05 })
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.13, 0.24, 2, 2, 2), metal)
  root.add(body)
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.055, 20), gold)
  collar.rotation.x = Math.PI / 2
  collar.position.z = 0.14
  root.add(collar)
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.18, 8), gold)
    arm.rotation.z = Math.PI / 2
    arm.position.x = side * 0.16
    root.add(arm)
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.018, 0.18), panel)
    wing.position.x = side * 0.35
    root.add(wing)
    for (let line = -1; line <= 1; line += 1) {
      const grid = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.02, 0.17), gold)
      grid.position.set(side * 0.35 + line * 0.075, 0, 0)
      root.add(grid)
    }
  }
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 8), gold)
  antenna.position.y = 0.15
  root.add(antenna)
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 12), new THREE.MeshBasicMaterial({ color: '#fff2df' }))
  beacon.position.y = 0.26
  root.add(beacon)
  root.scale.setScalar(0.58)
  return root
}

export const createMeteorTexture = () => {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 16
  const context = canvas.getContext('2d')!
  const gradient = context.createLinearGradient(0, 0, 256, 0)
  gradient.addColorStop(0, 'rgba(255,255,255,0)')
  gradient.addColorStop(0.65, 'rgba(255,255,255,.12)')
  gradient.addColorStop(0.92, 'rgba(255,255,255,.75)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 256, 16)
  return new THREE.CanvasTexture(canvas)
}
