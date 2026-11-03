'use client'

/**
 * dimension-visuals.tsx — four distinct procedural R3F scenes for the
 * Four Memory Dimensions section. All geometry is generated in code.
 */

import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { makeRandom } from './shaders'

function LineNet({ pairs, color = '#5a4a9a', opacity = 0.5 }: { pairs: number[]; color?: string; opacity?: number }) {
  const geometry = useMemo(() => {
    const arr = new Float32Array(pairs.length)
    pairs.forEach((p, i) => {
      arr[i] = p
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3))
    return g
  }, [pairs])
  const material = useMemo(() => new THREE.LineBasicMaterial({ color, transparent: true, opacity }), [color, opacity])
  return <lineSegments geometry={geometry} material={material} />
}

function SpinGroup({ children, speed = 0.08 }: { children: React.ReactNode; speed?: number }) {
  const ref = useRef<THREE.Group>(null)
  useFrame((state) => {
    if (ref.current) ref.current.rotation.y = state.clock.elapsedTime * speed
  })
  return <group ref={ref}>{children}</group>
}

const CANVAS_STYLE = { width: '100%', height: '100%', display: 'block' } as const

/** Cinematic floating timeline of event fragments. */
function TimelineScene() {
  const group = useRef<THREE.Group>(null)
  useFrame((state) => {
    if (group.current) group.current.position.y = Math.sin(state.clock.elapsedTime * 0.6) * 0.15
  })
  const dots = useMemo(() => Array.from({ length: 12 }, (_, i) => i - 5.5), [])
  return (
    <group ref={group}>
      {dots.map((x) => (
        <mesh key={x} position={[x * 0.6, 0, 0]}>
          <sphereGeometry args={[0.12, 16, 16]} />
          <meshBasicMaterial color="#9cc0ff" />
        </mesh>
      ))}
    </group>
  )
}

export function EpisodicTimeline() {
  return (
    <Canvas camera={{ position: [0, 0, 9], fov: 40 }} dpr={[1, 2]} gl={{ alpha: true }} style={CANVAS_STYLE}>
      <ambientLight intensity={1.2} />
      <TimelineScene />
    </Canvas>
  )
}

/** Interconnected knowledge cluster. */
export function SemanticNodes() {
  const sats = useMemo(() => {
    const rand = makeRandom(33)
    return Array.from({ length: 16 }, (_, i) => {
      const a = (i / 16) * Math.PI * 2
      const r = 2.2 + rand() * 0.6
      return [Math.cos(a) * r, Math.sin(a) * r, 0] as [number, number, number]
    })
  }, [])
  const pairs = useMemo(() => {
    const out: number[] = []
    for (const p of sats) out.push(0, 0, 0, p[0], p[1], p[2])
    return out
  }, [sats])
  return (
    <Canvas camera={{ position: [0, 0, 7], fov: 45 }} dpr={[1, 2]} gl={{ alpha: true }} style={CANVAS_STYLE}>
      <ambientLight intensity={1.3} />
      <SpinGroup speed={0.12}>
        <mesh>
          <sphereGeometry args={[0.5, 20, 20]} />
          <meshBasicMaterial color="#8f6cff" />
        </mesh>
        {sats.map((p, i) => (
          <mesh key={i} position={[p[0], p[1], p[2]]}>
            <sphereGeometry args={[0.09, 12, 12]} />
            <meshBasicMaterial color="#7cc7ff" />
          </mesh>
        ))}
        <LineNet pairs={pairs} color="#5a4a9a" />
      </SpinGroup>
    </Canvas>
  )
}

/** Animated workflow pathway with a traveling highlight. */
function PathScene() {
  const nodes = useMemo(() => {
    const steps = 6
    const pts: number[] = []
    for (let i = 0; i <= steps; i++) {
      const x = -3 + i * (6 / steps)
      const y = i % 2 === 0 ? 0.8 : -0.8
      pts.push(x, y, 0)
    }
    return pts
  }, [])
  const dot = useRef<THREE.Mesh>(null)
  useFrame((state) => {
    if (!dot.current) return
    const t = (state.clock.elapsedTime * 0.25) % 1
    const seg = nodes.length / 3 - 1
    const f = t * seg
    const i = Math.floor(f)
    const fr = f - i
    const x = nodes[i * 3] + (nodes[(i + 1) * 3] - nodes[i * 3]) * fr
    const y = nodes[i * 3 + 1] + (nodes[(i + 1) * 3 + 1] - nodes[i * 3 + 1]) * fr
    dot.current.position.set(x, y, 0)
  })
  return (
    <SpinGroup speed={0.05}>
      <LineNet pairs={nodes} color="#6f5bd6" />
      {Array.from({ length: nodes.length / 3 }, (_, i) => (
        <mesh key={i} position={[nodes[i * 3], nodes[i * 3 + 1], nodes[i * 3 + 2]]}>
          <sphereGeometry args={[0.12, 12, 12]} />
          <meshBasicMaterial color="#c8b8ff" />
        </mesh>
      ))}
      <mesh ref={dot}>
        <sphereGeometry args={[0.18, 16, 16]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.9} />
      </mesh>
    </SpinGroup>
  )
}

export function ProceduralPath() {
  return (
    <Canvas camera={{ position: [0, 0, 8], fov: 42 }} dpr={[1, 2]} gl={{ alpha: true }} style={CANVAS_STYLE}>
      <ambientLight intensity={1.3} />
      <PathScene />
    </Canvas>
  )
}

/** Small dynamic 3D graph. */
export function AssociativeGraph() {
  const pts = useMemo(() => {
    const rand = makeRandom(77)
    return Array.from({ length: 34 }, () => [(rand() - 0.5) * 5, (rand() - 0.5) * 3.4, (rand() - 0.5) * 5] as [number, number, number])
  }, [])
  const pairs = useMemo(() => {
    const rand = makeRandom(99)
    const out: number[] = []
    for (let i = 0; i < 40; i++) {
      const a = Math.floor(rand() * pts.length)
      const b = Math.floor(rand() * pts.length)
      out.push(...pts[a], ...pts[b])
    }
    return out
  }, [pts])
  return (
    <Canvas camera={{ position: [0, 0, 8], fov: 45 }} dpr={[1, 2]} gl={{ alpha: true }} style={CANVAS_STYLE}>
      <ambientLight intensity={1.3} />
      <SpinGroup speed={0.09}>
        {pts.map((p, i) => (
          <mesh key={i} position={p}>
            <sphereGeometry args={[0.07, 10, 10]} />
            <meshBasicMaterial color="#9cc0ff" />
          </mesh>
        ))}
        <LineNet pairs={pairs} color="#4a4a7a" opacity={0.35} />
      </SpinGroup>
    </Canvas>
  )
}
