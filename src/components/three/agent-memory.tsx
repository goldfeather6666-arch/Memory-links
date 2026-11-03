'use client';

/**
 * agent-memory.tsx — procedural R3F scene for the Universal Agent section.
 *
 * A central glowing memory core with an orchestrated set of agent nodes
 * (coding, browser, research, personal, creative) connected by pulsing shader
 * lines that carry data toward the core. Fully procedural — no external assets.
 */

import { Canvas, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

type Vec3 = [number, number, number];

interface AgentDef {
  id: string;
  label: string;
  color: string;
  position: Vec3;
}

const AGENTS: AgentDef[] = [
  { id: 'coding', label: 'Coding', color: '#7C6FF0', position: [2.6, 0.9, 0.6] },
  { id: 'browser', label: 'Browser', color: '#38BDF8', position: [-2.2, 1.2, -1.0] },
  { id: 'research', label: 'Research', color: '#E3C98D', position: [-1.6, -1.4, 1.6] },
  { id: 'personal', label: 'Personal', color: '#8B5CF6', position: [2.0, -1.1, -1.4] },
  { id: 'creative', label: 'Creative', color: '#F5F1EA', position: [0.2, 1.6, -2.4] },
];

const PULSE_VERT = /* glsl */ `
varying float vProgress;
void main() {
  vProgress = aProgress;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const PULSE_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform float uOpacity;
varying float vProgress;
void main() {
  float pulse = fract(vProgress - uTime * 0.3);
  float band = pow(clamp(1.0 - abs(pulse - 0.5) * 2.0, 0.0, 1.0), 6.0);
  vec3 col = uColor * (0.35 + band * 1.6);
  float alpha = (0.22 + band * 0.85) * uOpacity;
  gl_FragColor = vec4(col, alpha);
}
`;

const CORE_VERT = /* glsl */ `
varying vec3 vNormal;
varying vec3 vPos;
void main() {
  vNormal = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vPos = mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const CORE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
varying vec3 vNormal;
varying vec3 vPos;
void main() {
  vec3 viewDir = normalize(-vPos);
  float fres = pow(1.0 - max(dot(normalize(vNormal), viewDir), 0.0), 2.5);
  float pulse = 0.8 + 0.2 * sin(uTime * 2.2);
  vec3 col = uColor * (0.35 + fres * 2.4) * pulse;
  gl_FragColor = vec4(col, 0.95);
}
`;

const PULSE_MATERIAL = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexColors: true,
  uniforms: {
    uTime: { value: 0 },
    uOpacity: { value: 0.9 },
  },
  vertexShader: PULSE_VERT,
  fragmentShader: PULSE_FRAG,
});

const CORE_MATERIAL = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: {
    uColor: { value: new THREE.Color('#8b7bff') },
    uTime: { value: 0 },
  },
  vertexShader: CORE_VERT,
  fragmentShader: CORE_FRAG,
});

function AgentLines() {
  const geometry = useMemo(() => {
    const positions: number[] = [];
    const progress: number[] = [];
    const colors: number[] = [];

    for (const agent of AGENTS) {
      const [ax, ay, az] = agent.position;
      const color = new THREE.Color(agent.color);
      // one segment from agent -> core (two vertices)
      positions.push(ax, ay, az, 0, 0, 0);
      progress.push(0, 1);
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aProgress', new THREE.Float32BufferAttribute(progress, 1));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    return geometry;
  }, []);

  useEffect(
    () => () => {
      geometry.dispose();
    },
    [geometry],
  );

  useFrame(({ clock }) => {
    PULSE_MATERIAL.uniforms.uTime.value = clock.elapsedTime;
  });

  return <lineSegments geometry={geometry} material={PULSE_MATERIAL} />;
}

function MemoryCore() {
  const geometry = useMemo(() => new THREE.SphereGeometry(0.62, 48, 48), []);

  useEffect(
    () => () => {
      geometry.dispose();
    },
    [geometry],
  );

  useFrame(({ clock }) => {
    CORE_MATERIAL.uniforms.uTime.value = clock.elapsedTime;
  });

  return <mesh geometry={geometry} material={CORE_MATERIAL} />;
}

function AgentNode({ agent }: { agent: AgentDef }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const origin = useMemo(() => new THREE.Vector3(...agent.position), [agent]);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = clock.elapsedTime;
    // gentle floating + slow rotation
    mesh.position.set(origin.x, origin.y + Math.sin(t * 0.8) * 0.12, origin.z);
    mesh.rotation.y += 0.004;
  });

  return (
    <group>
      <mesh ref={meshRef} position={agent.position}>
        <icosahedronGeometry args={[0.32, 1]} />
        <meshBasicMaterial color={agent.color} />
      </mesh>
      <Html center position={[agent.position[0], agent.position[1] - 0.65, agent.position[2]]} zIndexRange={[10, 0]}>
        <div
          style={{
            color: '#e8e4f8',
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.04em',
            whiteSpace: 'nowrap',
            textShadow: '0 1px 8px rgba(0,0,0,0.6)',
            pointerEvents: 'none',
          }}
        >
          {agent.label}
        </div>
      </Html>
    </group>
  );
}

function SceneContent() {
  const pivotRef = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (pivotRef.current) pivotRef.current.rotation.y += delta * 0.04;
  });

  return (
    <group ref={pivotRef}>
      <MemoryCore />
      <AgentLines />
      {AGENTS.map((agent) => (
        <AgentNode key={agent.id} agent={agent} />
      ))}
    </group>
  );
}

export default function AgentMemory() {
  return (
    <Canvas
      camera={{ position: [0, 0.6, 7.6], fov: 50 }}
      gl={{ antialias: true, alpha: true }}
      dpr={[1, 2]}
      style={{ width: '100%', height: '100%', display: 'block' }}
    >
      <SceneContent />
    </Canvas>
  );
}
