'use client'

import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import {
  createConnectionLineGeometry,
  createFlowLineMaterial,
  createNodeField,
  createNodeGlowMaterial,
  createPointGlowMaterial,
} from './shaders'

gsap.registerPlugin(ScrollTrigger)

const NODE_COUNT = 88
const DUST_COUNT = 1400
const FIELD_RADIUS = 8.5

/* ------------------------------------------------------------------ *
 * Dust field — 1400 instances in a single draw call.
 * ------------------------------------------------------------------ */

function Dust() {
  const mesh = useRef<THREE.InstancedMesh>(null!)
  const { geometry, material } = useMemo(() => {
    const geometry = new THREE.SphereGeometry(0.035, 5, 5)
    const material = createPointGlowMaterial({ color: '#7aa2ff', intensity: 0.85, size: 1 })
    return { geometry, material }
  }, [])

  useEffect(() => {
    const nodeField = createNodeField(DUST_COUNT, {
      radius: FIELD_RADIUS * 1.7,
      seed: 21,
      yScale: 0.72,
    })
    const dummy = new THREE.Object3D()
    for (let i = 0; i < DUST_COUNT; i++) {
      const p = nodeField[i]
      dummy.position.copy(p)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.setScalar(0.5 + ((i % 17) / 17) * 1.6)
      dummy.updateMatrix()
      mesh.current.setMatrixAt(i, dummy.matrix)
    }
    mesh.current.instanceMatrix.needsUpdate = true
    return () => {
      geometry.dispose()
      material.dispose()
    }
  }, [geometry, material])

  return <instancedMesh ref={mesh} args={[geometry, material, DUST_COUNT]} frustumCulled={false} />
}

/* ------------------------------------------------------------------ *
 * Luminous nodes — instanced additive-glow spheres (rim fresnel).
 * ------------------------------------------------------------------ */

const NODE_GLOW_MATERIAL = createNodeGlowMaterial({
  base: '#1f5ac2',
  rim: '#aad4ff',
  power: 2.4,
  rimStrength: 0.9,
  alpha: 0.4,
})

const FLOW_LINE_MATERIAL = createFlowLineMaterial({ color: '#7fb0ff', speed: 0.14 })

function LuminousNodes() {
  const mesh = useRef<THREE.InstancedMesh>(null!)
  const geometry = useMemo(() => new THREE.SphereGeometry(0.24, 16, 16), [])
  const positions = useMemo(
    () => createNodeField(NODE_COUNT, { radius: FIELD_RADIUS, seed: 11, yScale: 0.7 }),
    [],
  )

  useEffect(() => {
    const dummy = new THREE.Object3D()
    for (let i = 0; i < NODE_COUNT; i++) {
      dummy.position.copy(positions[i])
      dummy.rotation.set(0, 0, 0)
      const s = 0.6 + ((i % 11) / 10) * 1.1
      dummy.scale.setScalar(s)
      dummy.updateMatrix()
      mesh.current.setMatrixAt(i, dummy.matrix)
    }
    mesh.current.instanceMatrix.needsUpdate = true
    return () => {
      geometry.dispose()
    }
  }, [positions, geometry])

  useFrame((state) => {
    NODE_GLOW_MATERIAL.uniforms.uTime.value = state.clock.elapsedTime
  })

  return <instancedMesh ref={mesh} args={[geometry, NODE_GLOW_MATERIAL, NODE_COUNT]} frustumCulled={false} />
}

/* ------------------------------------------------------------------ *
 * Connection lines — LineSegments with flowing shader.
 * ------------------------------------------------------------------ */

function Connections() {
  const ref = useRef<THREE.LineSegments>(null!)
  const geometry = useMemo(() => {
    const positions = createNodeField(NODE_COUNT, { radius: FIELD_RADIUS, seed: 11, yScale: 0.7 })
    return createConnectionLineGeometry(positions, { maxLinks: 3, range: 5.2, seed: 31 })
  }, [])

  useFrame((state) => {
    FLOW_LINE_MATERIAL.uniforms.uTime.value = state.clock.elapsedTime
  })

  useEffect(() => () => {
    geometry.dispose()
  }, [geometry])

  return <lineSegments ref={ref} geometry={geometry} material={FLOW_LINE_MATERIAL} />
}

/* ------------------------------------------------------------------ *
 * Glass rings + stars.
 * ------------------------------------------------------------------ */

function GlassRings() {
  const group = useRef<THREE.Group>(null!)
  const shared = useMemo(
    () => ({
      transparent: true,
      roughness: 0.15,
      metalness: 0.05,
      transmission: 0.82,
      thickness: 0.6,
      ior: 1.35,
      attenuationColor: new THREE.Color('#8fb6ff'),
      attenuationDistance: 4,
      envMapIntensity: 0.6,
    }),
    [],
  )
  return (
    <group ref={group}>
      <mesh rotation={[1.15, 0.35, 0]}>
        <torusGeometry args={[5.6, 0.035, 16, 128]} />
        <meshPhysicalMaterial color="#9cc0ff" {...shared} />
      </mesh>
      <mesh rotation={[1.4, -0.5, 0.3]}>
        <torusGeometry args={[7.2, 0.028, 16, 128]} />
        <meshPhysicalMaterial color="#c9b8ff" {...shared} />
      </mesh>
      <mesh rotation={[0.9, 0.9, -0.2]}>
        <torusGeometry args={[4.2, 0.022, 16, 128]} />
        <meshPhysicalMaterial color="#7fd4e8" {...shared} />
      </mesh>
    </group>
  )
}

function StarField() {
  const points = useRef<THREE.Points>(null!)
  const { geometry, material } = useMemo(() => {
    const rand = (seed: number) => {
      let s = seed
      return () => {
        s = (s * 16807) % 2147483647
        return (s - 1) / 2147483646
      }
    }
    const r = rand(97)
    const positions = new Float32Array(2200 * 3)
    for (let i = 0; i < positions.length; i += 3) {
      const rad = 30 + r() * 60
      const theta = r() * Math.PI * 2
      const phi = Math.acos(2 * r() - 1)
      positions[i] = rad * Math.sin(phi) * Math.cos(theta)
      positions[i + 1] = rad * Math.cos(phi) * 0.7
      positions[i + 2] = rad * Math.sin(phi) * Math.sin(theta)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const material = new THREE.PointsMaterial({
      color: '#bcd0ff',
      size: 0.06,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    })
    return { geometry, material }
  }, [])

  useEffect(() => () => {
    geometry.dispose()
    material.dispose()
  }, [geometry, material])

  return <points ref={points} geometry={geometry} material={material} />
}

/* ------------------------------------------------------------------ *
 * Camera rig — slow auto-rotation + pointer parallax + scroll scrub.
 * ------------------------------------------------------------------ */

function Rig({ children }: { children: React.ReactNode }) {
  const group = useRef<THREE.Group>(null!)
  const target = useRef({ scroll: 0, px: 0, py: 0 })

  useEffect(() => {
    if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return undefined
    }
    const trigger = document.querySelector('#hero')
    const st = ScrollTrigger.create({
      trigger: trigger ?? document.body,
      start: 'top top',
      end: 'bottom 35%',
      scrub: true,
      onUpdate: (self) => {
        target.current.scroll = self.progress
      },
    })
    const onMove = (e: PointerEvent) => {
      target.current.px = e.clientX / window.innerWidth - 0.5
      target.current.py = e.clientY / window.innerHeight - 0.5
    }
    window.addEventListener('pointermove', onMove)
    return () => {
      st.kill()
      window.removeEventListener('pointermove', onMove)
    }
  }, [])

  useFrame((state, dt) => {
    const g = group.current
    if (!g) return
    const t = state.clock.elapsedTime
    const damp = Math.min(1, dt * 2.6)
    const baseY = t * 0.04
    const targetRotY = baseY + target.current.scroll * 0.85 + target.current.px * 0.16
    const targetRotX = -target.current.py * 0.1 + target.current.scroll * 0.12
    g.rotation.y += (targetRotY - g.rotation.y) * damp
    g.rotation.x += (targetRotX - g.rotation.x) * damp
    g.position.x += (target.current.px * 0.7 - g.position.x) * damp
    g.position.y += (target.current.py * -0.35 - g.position.y) * damp
    g.position.z += (target.current.scroll * 2.4 - g.position.z) * damp
  })

  return <group ref={group}>{children}</group>
}

/* ------------------------------------------------------------------ *
 * Scene root.
 * ------------------------------------------------------------------ */

export function MemoryScene() {
  return (
    <Rig>
      <Dust />
      <LuminousNodes />
      <Connections />
      <GlassRings />
      <StarField />
    </Rig>
  )
}

export default function MemoryUniverse() {
  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance', alpha: true }}
      camera={{ fov: 60, near: 0.1, far: 120, position: [0, 0, 15] }}
      onCreated={({ gl }) => {
        gl.setClearColor('#050510', 1)
      }}
    >
      <fog attach="fog" args={['#050510', 9, 34]} />
      <ambientLight intensity={0.35} />
      <pointLight position={[8, 6, 8]} intensity={40} color="#9cc0ff" />
      <pointLight position={[-8, -4, -6]} intensity={26} color="#7c3aed" />
      <Suspense fallback={null}>
        <MemoryScene />
      </Suspense>
      <EffectComposer>
        <Bloom intensity={0.85} luminanceThreshold={0.2} luminanceSmoothing={0.6} mipmapBlur radius={0.7} />
      </EffectComposer>
    </Canvas>
  )
}
