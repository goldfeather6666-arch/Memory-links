'use client'

import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { createNodeField, createNodeGlowMaterial, makeRandom } from './shaders'

gsap.registerPlugin(ScrollTrigger)

const NODE_COUNT = 130
const RING_RADIUS = 7

/* ---------------- floating memory nodes ---------------- */

function MemoryNodes() {
  const mesh = useRef<THREE.InstancedMesh>(null!)
  const material = useMemo(
    () => createNodeGlowMaterial({ base: '#8a5cf6', rim: '#c8b0ff', power: 2.2, rimStrength: 0.9, alpha: 0.42 }),
    [],
  )
  const geometry = useMemo(() => new THREE.SphereGeometry(0.18, 14, 14), [])
  const positions = useMemo(
    () => createNodeField(NODE_COUNT, { radius: RING_RADIUS, seed: 41, yScale: 0.85 }),
    [],
  )

  useEffect(() => {
    const dummy = new THREE.Object3D()
    for (let i = 0; i < NODE_COUNT; i++) {
      dummy.position.copy(positions[i])
      dummy.scale.setScalar(0.55 + ((i % 13) / 12) * 1.25)
      dummy.updateMatrix()
      mesh.current.setMatrixAt(i, dummy.matrix)
    }
    mesh.current.instanceMatrix.needsUpdate = true
    return () => {
      geometry.dispose()
      material.dispose()
    }
  }, [positions, geometry, material])

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime
  })

  return <instancedMesh ref={mesh} args={[geometry, material, NODE_COUNT]} frustumCulled={false} />
}

/* ---------------- scroll-drawn connecting paths ---------------- */

const PATH_VERTEX = `
  attribute float aProgress;
  varying float vProgress;
  void main() {
    vProgress = aProgress;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`

const PATH_FRAGMENT = `
  uniform vec3 uColor;
  uniform float uProgress;
  uniform float uTime;
  varying float vProgress;
  void main() {
    float draw = smoothstep(uProgress - 0.06, uProgress + 0.04, vProgress);
    float flow = 0.25 + 0.5 * (0.5 + 0.5 * sin(vProgress * 40.0 - uTime * 2.0));
    float a = draw * flow;
    a *= smoothstep(0.0, 0.06, vProgress) * smoothstep(1.0, 0.94, vProgress);
    gl_FragColor = vec4(uColor, a);
  }
`

function ScrollPaths() {
  const ref = useRef<THREE.LineSegments>(null!)
  const progress = useRef({ value: 0 })
  const { geometry, material } = useMemo(() => {
    const positions = createNodeField(NODE_COUNT, { radius: RING_RADIUS, seed: 41, yScale: 0.85 })
    const rand = makeRandom(71)
    const p: number[] = []
    const g: number[] = []
    for (let i = 0; i < positions.length; i++) {
      const links = 1 + Math.floor(rand() * 3)
      for (let k = 0; k < links; k++) {
        const j = Math.floor(rand() * positions.length)
        if (j === i) continue
        p.push(positions[i].x, positions[i].y, positions[i].z, positions[j].x, positions[j].y, positions[j].z)
        g.push(0, 1)
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
    geometry.setAttribute('aProgress', new THREE.Float32BufferAttribute(g, 1))
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color('#a88bff') },
        uProgress: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: PATH_VERTEX,
      fragmentShader: PATH_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    return { geometry, material }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      progress.current.value = 1
      return undefined
    }
    const st = ScrollTrigger.create({
      trigger: '#solution',
      start: 'top 80%',
      end: 'bottom 35%',
      scrub: true,
      onUpdate: (self) => {
        progress.current.value = self.progress
      },
    })
    return () => st.kill()
  }, [])

  useFrame((state) => {
    material.uniforms.uProgress.value = progress.current.value
    material.uniforms.uTime.value = state.clock.elapsedTime
  })

  useEffect(() => () => {
    geometry.dispose()
    material.dispose()
  }, [geometry, material])

  return <lineSegments ref={ref} geometry={geometry} material={material} />
}

/* ---------------- timeline + document representations ---------------- */

function Timeline() {
  const rand = useMemo(() => makeRandom(19), [])
  const items = useMemo(() => {
    const arr: { x: number; s: number }[] = []
    for (let i = 0; i < 7; i++) {
      arr.push({ x: -4.2 + i * 1.4, s: 0.6 + rand() * 0.8 })
    }
    return arr
  }, [rand])

  const glass = useMemo(
    () => ({
      transparent: true,
      opacity: 0.5,
      roughness: 0.18,
      metalness: 0.04,
      transmission: 0.7,
      thickness: 0.4,
      ior: 1.35,
      attenuationColor: new THREE.Color('#a6c0ff'),
      attenuationDistance: 3,
    }),
    [],
  )

  return (
    <group position={[0, -1.4, -2]}>
      {items.map((item, i) => (
        <mesh key={i} position={[item.x, 0, 0]} rotation={[0, 0, i % 2 === 0 ? 0.12 : -0.12]} scale={[item.s, 0.16, 1]}>
          <boxGeometry args={[0.85, 0.5, 0.12]} />
          <meshPhysicalMaterial color="#c6d6ff" {...glass} />
        </mesh>
      ))}
      {items.map((item, i) => (
        <mesh key={`dot-${i}`} position={[item.x, -0.55, 0]}>
          <sphereGeometry args={[0.05, 10, 10]} />
          <meshBasicMaterial color="#9cc0ff" />
        </mesh>
      ))}
    </group>
  )
}

function Documents() {
  const rand = useMemo(() => makeRandom(83), [])
  const docs = useMemo(() => {
    const arr: { p: [number, number, number]; r: [number, number, number]; s: number }[] = []
    for (let i = 0; i < 26; i++) {
      const theta = rand() * Math.PI * 2
      const r = 2 + rand() * 4.5
      arr.push({
        p: [Math.cos(theta) * r, (rand() - 0.5) * 3.4, Math.sin(theta) * r],
        r: [rand() * Math.PI, rand() * Math.PI, rand() * Math.PI],
        s: 0.7 + rand() * 1.1,
      })
    }
    return arr
  }, [rand])

  const glass = useMemo(
    () => ({
      transparent: true,
      opacity: 0.42,
      roughness: 0.2,
      metalness: 0.03,
      transmission: 0.65,
      thickness: 0.5,
      ior: 1.33,
      attenuationColor: new THREE.Color('#bcd0ff'),
      attenuationDistance: 4,
    }),
    [],
  )

  return (
    <group>
      {docs.map((d, i) => (
        <mesh key={i} position={d.p} rotation={d.r} scale={d.s}>
          <boxGeometry args={[1.1, 1.5, 0.06]} />
          <meshPhysicalMaterial color="#dbe6ff" {...glass} />
        </mesh>
      ))}
    </group>
  )
}

function Rig({ children }: { children: React.ReactNode }) {
  const group = useRef<THREE.Group>(null!)
  const target = useRef({ px: 0, py: 0 })

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      target.current.px = e.clientX / window.innerWidth - 0.5
      target.current.py = e.clientY / window.innerHeight - 0.5
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  useFrame((state, dt) => {
    const g = group.current
    if (!g) return
    const damp = Math.min(1, dt * 2.4)
    g.rotation.y += (state.clock.elapsedTime * 0.025 + target.current.px * 0.14 - g.rotation.y) * damp
    g.rotation.x += (-target.current.py * 0.08 - g.rotation.x) * damp
    g.position.y += (target.current.py * 0.3 - g.position.y) * damp
  })

  return <group ref={group}>{children}</group>
}

interface KnowledgeUniverseProps {
  children?: React.ReactNode
}

export default function KnowledgeUniverse({ children }: KnowledgeUniverseProps) {
  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      camera={{ fov: 55, near: 0.1, far: 100, position: [0, 0.5, 13] }}
      onCreated={({ gl }) => gl.setClearColor('#070714', 1)}
    >
      <fog attach="fog" args={['#070714', 8, 30]} />
      <ambientLight intensity={0.4} />
      <pointLight position={[6, 6, 6]} intensity={30} color="#8f6cff" />
      <pointLight position={[-6, -3, -5]} intensity={20} color="#3aa0ff" />
      <Suspense fallback={null}>
        <Rig>
          <MemoryNodes />
          <ScrollPaths />
          <Timeline />
          <Documents />
          {children}
        </Rig>
      </Suspense>
      <EffectComposer>
        <Bloom intensity={0.7} luminanceThreshold={0.25} luminanceSmoothing={0.7} mipmapBlur radius={0.7} />
      </EffectComposer>
    </Canvas>
  )
}
